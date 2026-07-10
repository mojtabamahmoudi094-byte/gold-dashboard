#!/usr/bin/env node
/**
 * screener-daily.js
 *
 * بورس سنج — دیده‌بان تکنیکال: محاسبه سیگنال‌های همه نمادها از stock_candles
 * و upsert در جدول stock_screener (یک ردیف به‌ازای هر نماد).
 * cron شبانه روی سرور ایرانی، بعد از candles-daily.js (۱۸:۱۵ تهران = ۱۴:۴۵ UTC).
 * فقط با سوپابیس کار می‌کند — درخواستی به BrsApi نمی‌زند.
 *
 *   node screener-daily.js --probe   → سیگنال ۵ نماد اول، بدون نوشتن
 *
 * فرمول‌ها همان lib/indicators.ts سایت است (RSI وایلدر، MACD 12/26/9).
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
    console.error('[screener] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
    process.exit(1)
  }
  const { createClient } = require('@supabase/supabase-js')
  let wsTransport
  try { wsTransport = require('ws') } catch { /* Node 22+ */ }
  sb = createClient(SUPABASE_URL, SUPABASE_KEY,
    wsTransport ? { realtime: { transport: wsTransport } } : {})
}

// ───────────────────── اندیکاتورها (همان فرمول‌های lib/indicators.ts) ─────────────────────

function sma(values, period) {
  const out = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

function ema(values, period) {
  const out = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null)
  if (closes.length <= period) return out
  let gain = 0, loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gain += d
    else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

function macdHist(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const ef = ema(closes, fast)
  const es = ema(closes, slow)
  const macdLine = closes.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i] - es[i] : null))
  const firstIdx = macdLine.findIndex(v => v !== null)
  const out = new Array(closes.length).fill(null)
  if (firstIdx === -1) return out
  const valid = macdLine.slice(firstIdx)
  const sig = ema(valid, signalPeriod)
  for (let i = 0; i < valid.length; i++) {
    if (sig[i] !== null) out[firstIdx + i] = valid[i] - sig[i]
  }
  return out
}

// ───────────────────── محاسبه سیگنال یک نماد ─────────────────────

function computeRow(symbol, rows) {
  // rows: صعودی بر اساس تاریخ — {trade_date, trade_date_shamsi, close, high, low, volume, change_pct}
  const n = rows.length
  if (n < 60) return null
  const closes = rows.map(r => Number(r.close))
  const vols = rows.map(r => Number(r.volume) || 0)
  const last = rows[n - 1]

  const r = rsi(closes)
  const lastRsi = r[n - 1]

  const s50 = sma(closes, 50)
  const s200 = sma(closes, 200)
  let golden = false, death = false, trend = null
  if (s200[n - 1] !== null) {
    trend = closes[n - 1] > s50[n - 1] && s50[n - 1] > s200[n - 1] ? 'up'
      : closes[n - 1] < s50[n - 1] && s50[n - 1] < s200[n - 1] ? 'down' : 'side'
    for (let i = Math.max(1, n - 5); i < n; i++) {
      if (s200[i - 1] === null) continue
      if (s50[i] > s200[i] && s50[i - 1] <= s200[i - 1]) golden = true
      if (s50[i] < s200[i] && s50[i - 1] >= s200[i - 1]) death = true
    }
  }

  const hist = macdHist(closes)
  let macdUp = false, macdDown = false
  for (let i = Math.max(1, n - 3); i < n; i++) {
    if (hist[i] === null || hist[i - 1] === null) continue
    if (hist[i] > 0 && hist[i - 1] <= 0) macdUp = true
    if (hist[i] < 0 && hist[i - 1] >= 0) macdDown = true
  }

  const window = rows.slice(-252)
  const maxClose = Math.max(...window.slice(0, -1).map(x => Number(x.close)))
  const minClose = Math.min(...window.slice(0, -1).map(x => Number(x.close)))
  const lastClose = closes[n - 1]

  const avgVol20 = vols.length >= 21
    ? vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20
    : null
  const volRatio = avgVol20 && avgVol20 > 0 ? vols[n - 1] / avgVol20 : null

  return {
    symbol,
    trade_date: last.trade_date,
    trade_date_shamsi: last.trade_date_shamsi,
    close: lastClose,
    change_pct: last.change_pct !== null && last.change_pct !== undefined ? Number(last.change_pct) : null,
    rsi: lastRsi !== null ? +lastRsi.toFixed(2) : null,
    vol_ratio: volRatio !== null ? +volRatio.toFixed(2) : null,
    trend,
    rsi_oversold: lastRsi !== null && lastRsi <= 30,
    rsi_overbought: lastRsi !== null && lastRsi >= 70,
    golden_cross: golden,
    death_cross: death,
    macd_cross_up: macdUp,
    macd_cross_down: macdDown,
    near_high_52w: lastClose >= maxClose * 0.95,
    near_low_52w: lastClose <= minClose * 1.05,
    new_high_52w: lastClose > maxClose,
    new_low_52w: lastClose < minClose,
    vol_spike: volRatio !== null && volRatio >= 2.5,
    updated: new Date().toISOString(),
  }
}

// ───────────────────── main ─────────────────────

async function main() {
  initClient()
  // کندل‌های ~۴۲۰ روز اخیر همه نمادها — صفحه‌به‌صفحه
  const since = new Date(Date.now() - 420 * 86_400_000).toISOString().slice(0, 10)
  console.log(`[screener] خواندن کندل‌ها از ${since}…`)
  // سقف هر درخواست سوپابیس ۱۰۰۰ ردیف است — صفحه‌بندی با گام ۱۰۰۰
  const bySymbol = new Map()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('stock_candles')
      .select('symbol, trade_date, trade_date_shamsi, close, volume, change_pct')
      .gte('trade_date', since)
      .order('symbol', { ascending: true })
      .order('trade_date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) { console.error('[screener] خطا در خواندن کندل‌ها:', error.message); process.exit(1) }
    for (const r of data ?? []) {
      const arr = bySymbol.get(r.symbol)
      if (arr) arr.push(r)
      else bySymbol.set(r.symbol, [r])
    }
    if (from % 20000 === 0 && from > 0) console.log(`[screener] …${from} ردیف`)
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  console.log(`[screener] ${bySymbol.size} نماد`)

  const out = []
  for (const [symbol, rows] of bySymbol) {
    try {
      const row = computeRow(symbol, rows)
      if (row) out.push(row)
    } catch (e) {
      console.warn(`[screener] ${symbol} ناموفق: ${e.message}`)
    }
  }
  console.log(`[screener] ${out.length} نماد سیگنال دارد`)

  if (PROBE) {
    console.log(JSON.stringify(out.slice(0, 5), null, 2))
    const stats = {
      'اشباع فروش': out.filter(x => x.rsi_oversold).length,
      'اشباع خرید': out.filter(x => x.rsi_overbought).length,
      'کراس طلایی': out.filter(x => x.golden_cross).length,
      'سقف ۵۲ هفته': out.filter(x => x.new_high_52w).length,
      'حجم مشکوک': out.filter(x => x.vol_spike).length,
    }
    console.log(stats)
    return
  }

  const BATCH = 500
  let ok = 0
  for (let i = 0; i < out.length; i += BATCH) {
    const batch = out.slice(i, i + BATCH)
    const { error } = await sb.from('stock_screener').upsert(batch, { onConflict: 'symbol' })
    if (error) console.error(`[screener] خطا در batch #${i / BATCH + 1}:`, error.message)
    else ok += batch.length
  }
  console.log(`[screener] ✅ ${ok}/${out.length} ردیف upsert شد`)
  if (ok === 0) process.exit(1) // هشدار تلگرام از طریق run-with-alert.sh
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1) })
}

module.exports = { computeRow, sma, ema, rsi, macdHist }
