#!/usr/bin/env node
/**
 * chip-distribution-daily.js
 *
 * بورس سنج — توزیع چیپ: از ۲۱۰ کندل روزانه اخیر هر نماد (stock_candles)
 * محاسبه می‌کند حجم معاملات روی چه بازه قیمتی متمرکز شده (میانگین بهای تمام‌شده،
 * درصد حامل‌های سودده، تمرکز چیپ) و در stock_chip_distribution upsert می‌کند
 * (یک ردیف به‌ازای هر نماد، مثل stock_screener).
 * cron شبانه روی سرور ایرانی، بعد از candles-adjusted.js (۱۹:۱۵ تهران = ۱۵:۴۵ UTC).
 * فقط با سوپابیس کار می‌کند — درخواستی به BrsApi/tsetmc نمی‌زند.
 *
 *   node chip-distribution-daily.js --probe   → توزیع ۵ نماد اول، بدون نوشتن
 *
 * تقریب: چون daily float outstanding نداریم، decay واقعی مبتنی بر turnover رو
 * با decay نمایی بر اساس فاصله زمانی (half-life ۹۰ روز معاملاتی) تقریب می‌زنیم.
 * قیمت هر روز به‌صورت مثلثی (peak روی close) روی بازه [low, high] آن روز پخش می‌شود.
 */

'use strict'

const path = require('path')
const fs = require('fs')

function loadEnv(file) {
  const p = path.resolve(__dirname, file)
  if (!fs.existsSync(p)) return
  fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] = m[2].trim()
  })
}
loadEnv('../.env.local')
loadEnv('.env.sync')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const PROBE = process.argv.includes('--probe')

let sb = null
function initClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[chip-distribution] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
    process.exit(1)
  }
  const { createClient } = require('@supabase/supabase-js')
  let wsTransport
  try { wsTransport = require('ws') } catch { /* Node 22+ */ }
  sb = createClient(SUPABASE_URL, SUPABASE_KEY,
    wsTransport ? { realtime: { transport: wsTransport } } : {})
}

// ───────────────────── محاسبه توزیع چیپ یک نماد ─────────────────────

const WINDOW_DAYS = 210
const MIN_DAYS = 60
const HALF_LIFE = 90 // روز معاملاتی
const BINS = 50
const TARGET_COVERAGE = 0.9

function computeChipRow(symbol, rows) {
  // rows: صعودی بر اساس تاریخ
  const window = rows.slice(-WINDOW_DAYS)
  const px = window
    .map(r => {
      const low = (r.adj_low != null && r.adj_low > 0) ? Number(r.adj_low) : Number(r.low)
      const high = (r.adj_high != null && r.adj_high > 0) ? Number(r.adj_high) : Number(r.high)
      const close = (r.adj_close != null && r.adj_close > 0) ? Number(r.adj_close) : Number(r.close)
      return { low, high, close, volume: Number(r.volume) || 0 }
    })
    .filter(r => r.low > 0 && r.high > 0 && r.close > 0 && r.high >= r.low)
  if (px.length < MIN_DAYS) return null

  const minP = Math.min(...px.map(r => r.low))
  const maxP = Math.max(...px.map(r => r.high))
  if (!(maxP > minP)) return null
  const binWidth = (maxP - minP) / BINS
  const binWeights = new Array(BINS).fill(0)
  const m = px.length

  for (let i = 0; i < m; i++) {
    const { low, high, close, volume } = px[i]
    if (volume <= 0) continue
    const daysAgo = m - 1 - i
    const dayWeight = volume * Math.pow(0.5, daysAgo / HALF_LIFE)

    const binStart = Math.max(0, Math.floor((low - minP) / binWidth))
    const binEnd = Math.min(BINS - 1, Math.floor((high - minP) / binWidth))
    const lastBin = Math.max(binStart, binEnd)
    const leftSpan = Math.max(close - low, 1e-9)
    const rightSpan = Math.max(high - close, 1e-9)

    const raw = []
    let rawSum = 0
    for (let b = binStart; b <= lastBin; b++) {
      const mid = minP + (b + 0.5) * binWidth
      const w = mid <= close ? Math.max(0, 1 - (close - mid) / leftSpan) : Math.max(0, 1 - (mid - close) / rightSpan)
      raw.push(w)
      rawSum += w
    }
    if (rawSum <= 0) {
      const cnt = lastBin - binStart + 1
      for (let b = binStart; b <= lastBin; b++) binWeights[b] += dayWeight / cnt
    } else {
      for (let b = binStart, idx = 0; b <= lastBin; b++, idx++) binWeights[b] += dayWeight * raw[idx] / rawSum
    }
  }

  const total = binWeights.reduce((a, b) => a + b, 0)
  if (total <= 0) return null
  const weights = binWeights.map(w => w / total)
  const prices = weights.map((_, b) => minP + (b + 0.5) * binWidth)

  const avgCost = weights.reduce((s, w, i) => s + w * prices[i], 0)

  // باریک‌ترین بازه پیوسته حاوی ≥۹۰٪ وزن — دو اشاره‌گر روی bins مرتب بر اساس قیمت
  let lo = 0, acc = 0, bestWidth = Infinity, bestLo = 0, bestHi = 0
  for (let hi = 0; hi < BINS; hi++) {
    acc += weights[hi]
    while (lo < hi && acc - weights[lo] >= TARGET_COVERAGE) { acc -= weights[lo]; lo++ }
    if (acc >= TARGET_COVERAGE) {
      const width = prices[hi] - prices[lo]
      if (width < bestWidth) { bestWidth = width; bestLo = lo; bestHi = hi }
    }
  }
  if (bestWidth === Infinity) return null
  void bestLo; void bestHi
  const concentrationPct = (bestWidth / avgCost) * 100

  const last = window[window.length - 1]
  const currentClose = px[px.length - 1].close
  let profitWeight = 0
  for (let b = 0; b < BINS; b++) if (prices[b] < currentClose) profitWeight += weights[b]

  return {
    symbol,
    trade_date: last.trade_date,
    trade_date_shamsi: last.trade_date_shamsi,
    bins: prices.map((price, i) => ({ price: Math.round(price), weight: +weights[i].toFixed(6) })),
    avg_cost: Math.round(avgCost),
    concentration_pct: +concentrationPct.toFixed(2),
    profit_ratio: +(profitWeight * 100).toFixed(2),
    current_close: Math.round(currentClose),
  }
}

// ───────────────────── main ─────────────────────

async function main() {
  initClient()
  // کندل‌های ~۴۲۰ روز اخیر همه نمادها (بافر کافی برای ۲۱۰ روز معاملاتی) — صفحه‌به‌صفحه
  const since = new Date(Date.now() - 420 * 86_400_000).toISOString().slice(0, 10)
  console.log(`[chip-distribution] خواندن کندل‌ها از ${since}…`)
  const bySymbol = new Map()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('stock_candles')
      .select('symbol, trade_date, trade_date_shamsi, low, high, close, adj_low, adj_high, adj_close, volume')
      .gte('trade_date', since)
      .order('symbol', { ascending: true })
      .order('trade_date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) { console.error('[chip-distribution] خطا در خواندن کندل‌ها:', error.message); process.exit(1) }
    for (const r of data ?? []) {
      const arr = bySymbol.get(r.symbol)
      if (arr) arr.push(r)
      else bySymbol.set(r.symbol, [r])
    }
    if (from % 20000 === 0 && from > 0) console.log(`[chip-distribution] …${from} ردیف`)
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  console.log(`[chip-distribution] ${bySymbol.size} نماد`)

  const out = []
  for (const [symbol, rows] of bySymbol) {
    try {
      const row = computeChipRow(symbol, rows)
      if (row) out.push(row)
    } catch (e) {
      console.warn(`[chip-distribution] ${symbol} ناموفق: ${e.message}`)
    }
  }
  console.log(`[chip-distribution] ${out.length} نماد توزیع دارد`)

  if (PROBE) {
    console.log(JSON.stringify(out.slice(0, 5).map(r => ({
      symbol: r.symbol, avg_cost: r.avg_cost, concentration_pct: r.concentration_pct,
      profit_ratio: r.profit_ratio, current_close: r.current_close, bins: r.bins.length,
    })), null, 2))
    return
  }

  const BATCH = 500
  let ok = 0
  for (let i = 0; i < out.length; i += BATCH) {
    const batch = out.slice(i, i + BATCH)
    const { error } = await sb.from('stock_chip_distribution').upsert(batch, { onConflict: 'symbol,trade_date' })
    if (error) console.error(`[chip-distribution] خطا در batch #${i / BATCH + 1}:`, error.message)
    else ok += batch.length
  }
  console.log(`[chip-distribution] ✅ ${ok}/${out.length} ردیف upsert شد`)
  if (ok === 0) process.exit(1) // هشدار تلگرام از طریق run-with-alert.sh
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1) })
}

module.exports = { computeChipRow }
