#!/usr/bin/env node
/**
 * backtest-signals.js
 *
 * بورس سنج — بازده تاریخی سیگنال‌های stock_screener: برای هر رخداد تاریخی سیگنال
 * (کراس طلایی/مرگ، RSI اشباع، کراس مکدی، حجم مشکوک، سقف/کف ۵۲هفته، ۱۹ الگوی کندلی)
 * روی کل تاریخچه ۳ساله stock_candles، بازده ۵/۱۰/۲۰ روز بعد را حساب و در
 * signal_backtest_stats تجمیع می‌کند (نرخ برد، میانگین/میانه بازده).
 * cron هفتگی روی سرور ایرانی، پنجشنبه (بازار تعطیل).
 * فقط با سوپابیس کار می‌کند — درخواستی به BrsApi/tsetmc نمی‌زند.
 * فهرست نمادها از آخرین روز معاملاتی گرفته می‌شود، سپس هر نماد جدا (با
 * CONCURRENCY=8) fetch می‌شود — نه یک کوئری سراسری روی ۵۹۰هزار+ ردیف، چون
 * OFFSET عمیق روی جدول بزرگ به statement timeout سوپابیس می‌خورد.
 *
 *   node backtest-signals.js --probe            → ۵ سیگنال پرتکرار، بدون نوشتن
 *   node backtest-signals.js --probe --limit=30  → فقط ۳۰ نماد اول (تست سریع)
 *
 * سیگنال‌های SMC (smc_bos/smc_choch/smc_fvg/smc_ob) هم پوشش داده می‌شوند —
 * swingHighsLows/bosChoch/orderBlocks/fvg هرکدام یک‌بار روی کل تاریخچهٔ هر نماد
 * محاسبه می‌شوند (نه به‌ازای هر ایندکس)، سپس رخداد هرکدام با ایندکس تاییدشان
 * (brokenIndex برای بوس/چوچ، confirmedIndex برای اردربلاک، i+1 برای گپ) به سیگنال‌های
 * همان روز اضافه می‌شود.
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
const LIMIT = (() => {
  const a = process.argv.find(x => x.startsWith('--limit='))
  return a ? parseInt(a.split('=')[1], 10) : Infinity
})()

const { sma, rsi, macdHist } = require('./screener-daily')
const { detectCandlePattern } = require('./candle-patterns')
const { swingHighsLows, fvg, bosChoch, orderBlocks } = require('./smc-lib')

let sb = null
function initClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[backtest] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
    process.exit(1)
  }
  const { createClient } = require('@supabase/supabase-js')
  let wsTransport
  try { wsTransport = require('ws') } catch { /* Node 22+ */ }
  sb = createClient(SUPABASE_URL, SUPABASE_KEY,
    wsTransport ? { realtime: { transport: wsTransport } } : {})
}

const HORIZONS = [5, 10, 20]
const LOOKBACK = 260 // برای SMA200 + پنجره ۵۲هفته (۲۵۲ روز)
const MIN_ROWS = LOOKBACK + Math.max(...HORIZONS) + 10

// ───────────────────── بک‌تست یک نماد — تجمیع در acc (Map مشترک بین همه نمادها) ─────────────────────

function backtestSymbol(rows, acc) {
  const n = rows.length
  if (n < MIN_ROWS) return

  const closes = rows.map(r => Number(r.close))
  const vols = rows.map(r => Number(r.volume) || 0)
  const adjCloses = rows.map(r => (r.adj_close != null && Number(r.adj_close) > 0) ? Number(r.adj_close) : Number(r.close))

  const s50 = sma(closes, 50)
  const s200 = sma(closes, 200)
  const rArr = rsi(closes)
  const hist = macdHist(closes)
  const smcEvents = buildSmcEvents(rows)
  const maxHorizon = Math.max(...HORIZONS)

  for (let i = LOOKBACK; i < n - maxHorizon; i++) {
    const signals = []

    if (s50[i] !== null && s50[i - 1] !== null && s200[i] !== null && s200[i - 1] !== null) {
      if (s50[i] > s200[i] && s50[i - 1] <= s200[i - 1]) signals.push({ key: 'golden_cross', bias: 'bull' })
      if (s50[i] < s200[i] && s50[i - 1] >= s200[i - 1]) signals.push({ key: 'death_cross', bias: 'bear' })
    }
    if (rArr[i] !== null) {
      if (rArr[i] <= 30) signals.push({ key: 'rsi_oversold', bias: 'bull' })
      if (rArr[i] >= 70) signals.push({ key: 'rsi_overbought', bias: 'bear' })
    }
    if (hist[i] !== null && hist[i - 1] !== null) {
      if (hist[i] > 0 && hist[i - 1] <= 0) signals.push({ key: 'macd_cross_up', bias: 'bull' })
      if (hist[i] < 0 && hist[i - 1] >= 0) signals.push({ key: 'macd_cross_down', bias: 'bear' })
    }
    if (i >= 20) {
      let sum = 0
      for (let j = i - 20; j < i; j++) sum += vols[j]
      const avg20 = sum / 20
      if (avg20 > 0 && vols[i] / avg20 >= 2.5) {
        // حجم مشکوک خودش صعودی/نزولی نیست — بایاس از جهت تغییر قیمت همان روز گرفته می‌شود
        signals.push({ key: 'vol_spike', bias: closes[i] >= closes[i - 1] ? 'bull' : 'bear' })
      }
    }
    {
      const from = Math.max(0, i - 252 + 1)
      let maxClose = -Infinity, minClose = Infinity
      for (let j = from; j < i; j++) {
        if (closes[j] > maxClose) maxClose = closes[j]
        if (closes[j] < minClose) minClose = closes[j]
      }
      if (maxClose > -Infinity) {
        if (closes[i] > maxClose) signals.push({ key: 'new_high_52w', bias: 'bull' })
        if (closes[i] < minClose) signals.push({ key: 'new_low_52w', bias: 'bear' })
      }
    }
    const cp = detectCandlePattern(rows.slice(Math.max(0, i - 11), i + 1))
    if (cp && cp.bias) signals.push({ key: `candle_${cp.key}`, bias: cp.bias })

    const smcHere = smcEvents.get(i)
    if (smcHere) for (const s of smcHere) signals.push(s)

    if (signals.length === 0) continue
    const entry = adjCloses[i]
    if (!(entry > 0)) continue

    for (const sig of signals) {
      for (const h of HORIZONS) {
        const exit = adjCloses[i + h]
        if (!(exit > 0)) continue
        const ret = (exit - entry) / entry * 100
        const win = sig.bias === 'bull' ? ret > 0 : ret < 0
        const accKey = `${sig.key}|${h}`
        let a = acc.get(accKey)
        if (!a) { a = { signal_key: sig.key, horizon_days: h, bias: sig.bias, count: 0, winCount: 0, sumReturn: 0, returns: [] }; acc.set(accKey, a) }
        a.count++
        if (win) a.winCount++
        a.sumReturn += ret
        a.returns.push(ret)
      }
    }
  }
}

// یک‌بار روی کل تاریخچهٔ نماد اجرا می‌شود (نه به‌ازای هر ایندکس) — هر رخداد با
// ایندکس تاییدش (نه ایندکس تاریخی الگو) map می‌شود تا در بک‌تست lookahead بایاس ایجاد نشود
function buildSmcEvents(rows) {
  const n = rows.length
  const events = new Map() // index → [{key,bias}]
  const add = (idx, key, bias) => {
    if (idx == null || Number.isNaN(idx) || idx < 0 || idx >= n) return
    let arr = events.get(idx)
    if (!arr) { arr = []; events.set(idx, arr) }
    arr.push({ key, bias })
  }
  try {
    const candles = rows.map(r => ({
      open: Number(r.open ?? r.close), high: Number(r.high ?? r.close),
      low: Number(r.low ?? r.close), close: Number(r.close), volume: Number(r.volume) || 0,
    }))
    const swings = swingHighsLows(candles, 10)

    // شکست ساختار — تایید در brokenIndex (اولین کندلی که واقعاً قیمت را رد کرد)
    const bc = bosChoch(candles, swings)
    for (let i = 0; i < n; i++) {
      const br = bc.brokenIndex[i]
      if (Number.isNaN(br)) continue
      if (!Number.isNaN(bc.bos[i])) add(br, 'smc_bos', bc.bos[i] === 1 ? 'bull' : 'bear')
      else if (!Number.isNaN(bc.choch[i])) add(br, 'smc_choch', bc.choch[i] === 1 ? 'bull' : 'bear')
    }

    // اردر بلاک — تایید در confirmedIndex (کندلی که سوئینگ را شکست و OB را فعال کرد)
    const ob = orderBlocks(candles, swings)
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(ob.ob[i])) continue
      add(ob.confirmedIndex[i], 'smc_ob', ob.ob[i] === 1 ? 'bull' : 'bear')
    }

    // گپ ارزش منصفانه — تایید در i+1 (گپ فقط با بسته‌شدن کندل بعدی قطعی می‌شود)
    const f = fvg(candles)
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(f.fvg[i])) continue
      add(i + 1, 'smc_fvg', f.fvg[i] === 1 ? 'bull' : 'bear')
    }
  } catch { /* SMC اختیاری است — خطای آن نباید کل نماد را متوقف کند */ }
  return events
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ───────────────────── main ─────────────────────

const CANDLE_COLS = 'symbol, trade_date, trade_date_shamsi, open, high, low, close, volume, adj_close'
const PAGE = 1000
const CONCURRENCY = 8

// یک نماد کمتر از هزار ردیف در سه سال دارد، پس تقریباً همیشه یک صفحه است — offset
// کوچک می‌ماند و به مشکل کندشدن OFFSET عمیق پستگرس روی جدول بزرگ برنمی‌خوریم
async function fetchSymbolCandles(symbol) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('stock_candles')
      .select(CANDLE_COLS)
      .eq('symbol', symbol)
      .order('trade_date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return rows
}

async function fetchSymbolList() {
  const { data: latest, error: e1 } = await sb
    .from('stock_candles').select('trade_date').order('trade_date', { ascending: false }).limit(1)
  if (e1) throw new Error(e1.message)
  const latestDate = latest?.[0]?.trade_date
  if (!latestDate) return []
  const { data, error: e2 } = await sb
    .from('stock_candles').select('symbol').eq('trade_date', latestDate)
  if (e2) throw new Error(e2.message)
  return [...new Set((data ?? []).map(r => r.symbol))]
}

async function main() {
  initClient()
  console.log('[backtest] گرفتن فهرست نمادها (آخرین روز معاملاتی)…')
  const allSymbols = await fetchSymbolList()
  const symbols = allSymbols.slice(0, LIMIT)
  console.log(`[backtest] ${allSymbols.length} نماد یافت شد — ${symbols.length} نماد پردازش می‌شود`)

  const acc = new Map()
  const t0 = Date.now()
  let done = 0
  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const batch = symbols.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(async symbol => {
      try {
        const rows = await fetchSymbolCandles(symbol)
        backtestSymbol(rows, acc)
      } catch (e) { console.warn(`[backtest] ${symbol} ناموفق: ${e.message}`) }
    }))
    done += batch.length
    if (done % 80 === 0 || done === symbols.length) console.log(`[backtest] …${done}/${symbols.length} نماد`)
  }
  console.log(`[backtest] ${symbols.length} نماد پردازش شد در ${((Date.now() - t0) / 1000).toFixed(1)} ثانیه — ${acc.size} ترکیب سیگنال/افق`)

  const out = [...acc.values()].map(a => ({
    signal_key: a.signal_key,
    horizon_days: a.horizon_days,
    bias: a.bias,
    sample_count: a.count,
    win_rate: +(a.winCount / a.count * 100).toFixed(2),
    avg_return_pct: +(a.sumReturn / a.count).toFixed(3),
    median_return_pct: +median(a.returns).toFixed(3),
  }))

  if (PROBE) {
    const top = out.filter(r => r.horizon_days === 10).sort((a, b) => b.sample_count - a.sample_count).slice(0, 10)
    console.log(JSON.stringify(top, null, 2))
    return
  }

  const BATCH = 500
  let ok = 0
  for (let i = 0; i < out.length; i += BATCH) {
    const batch = out.slice(i, i + BATCH)
    const { error } = await sb.from('signal_backtest_stats').upsert(batch, { onConflict: 'signal_key,horizon_days' })
    if (error) console.error(`[backtest] خطا در batch #${i / BATCH + 1}:`, error.message)
    else ok += batch.length
  }
  console.log(`[backtest] ✅ ${ok}/${out.length} ردیف upsert شد`)
  if (ok === 0) process.exit(1)
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1) })
}

module.exports = { backtestSymbol, median }
