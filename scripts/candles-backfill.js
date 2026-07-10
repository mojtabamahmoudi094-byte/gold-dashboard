#!/usr/bin/env node
/**
 * candles-backfill.js
 *
 * بورس سنج — بک‌فیل یک‌باره کندل‌های ۳ سال اخیر همه نمادها + تاریخچه شاخص‌ها
 * روی سرور ایرانی اجرا شود (BrsApi و tsetmc فقط به IP ایران جواب می‌دهند)
 *
 *   node candles-backfill.js --probe          → فرمت خام History.php برای یک نماد
 *   node candles-backfill.js --probe-index    → فرمت خام تاریخچه شاخص کل از tsetmc
 *   node candles-backfill.js --indices-only   → فقط شاخص‌ها
 *   node candles-backfill.js --limit=200      → حداکثر ۲۰۰ نماد در این اجرا (بودجه API)
 *   node candles-backfill.js                  → همه نمادها + شاخص‌ها
 *
 * بودجه BrsApi ‏۱۰۰۰ درخواست/روز است و هر نماد یک درخواست History.php می‌خواهد؛
 * پیشرفت در .candles-backfill-progress.json ذخیره می‌شود — اجرای دوباره از همان‌جا
 * ادامه می‌دهد، پس اگر نمادها بیش از بودجه بود در دو روز اجرا کنید.
 *
 * فیلدهای History.php (راهنمای رسمی): date, time, tno, tvol, tval,
 *   pmin, pmax, py, pf, pl, plc, plp, pc, pcc, pcp
 */

'use strict'

const path = require('path')
const fs = require('fs')
const {
  shamsiToGregorian, gregorianToShamsi, tehranToday,
  clean, num, fetchJson, mapLimit,
  INDEX_CODES, normalizeIndexName, isCandleSymbol,
} = require('./candles-lib')

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

const BRSAPI_KEY   = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

const PROBE        = process.argv.includes('--probe')
const PROBE_INDEX  = process.argv.includes('--probe-index')
const INDICES_ONLY = process.argv.includes('--indices-only')
const LIMIT        = (() => {
  const a = process.argv.find(x => x.startsWith('--limit='))
  return a ? parseInt(a.split('=')[1], 10) : Infinity
})()

const YEARS = 3
const PROGRESS_FILE = path.resolve(__dirname, '.candles-backfill-progress.json')

if (!PROBE && !PROBE_INDEX && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('[candles-backfill] SUPABASE_URL و SUPABASE_KEY (service-role) تنظیم نشده‌اند')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
const sb = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

const historyUrl = (l18) =>
  `https://Api.BrsApi.ir/Tsetmc/History.php?key=${BRSAPI_KEY}&type=0&l18=${encodeURIComponent(l18)}`
const allSymbolsUrl = () =>
  `https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${BRSAPI_KEY}`
const indexHistoryUrl = (code) =>
  `https://cdn.tsetmc.com/api/Index/GetIndexB2History/${code}`

// حد پایین تاریخ: امروز شمسی منهای ۳ سال — مقایسه lexicographic روی فرمت صفر-پد
function shamsiCutoff() {
  const { shamsi } = tehranToday()
  const [jy, jm, jd] = shamsi.split('/')
  return `${+jy - YEARS}/${jm}/${jd}`
}

// «1403-08-08» یا «1403/08/08» → «1403/08/08» صفر-پد
function normShamsi(v) {
  const m = String(v ?? '').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  return m ? `${m[1]}/${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}` : null
}

function mapCandle(item, symbol) {
  const shamsi = normShamsi(item.date)
  if (!shamsi) return null
  const greg = shamsiToGregorian(shamsi)
  if (!greg) return null
  const close = num(item.pc)
  if (close === null || close === 0) return null
  return {
    symbol,
    trade_date: greg,
    trade_date_shamsi: shamsi,
    open: num(item.pf),
    high: num(item.pmax),
    low: num(item.pmin),
    close,
    last: num(item.pl),
    yesterday: num(item.py),
    change_pct: num(item.pcp),
    volume: num(item.tvol),
    value: num(item.tval),
    trades: num(item.tno),
  }
}

function loadProgress() {
  try { return new Set(JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))) }
  catch { return new Set() }
}
function saveProgress(done) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...done]))
}

async function upsertBatches(table, rows, conflict) {
  const BATCH = 500
  let ok = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await sb.from(table).upsert(batch, { onConflict: conflict })
    if (error) console.error(`[candles-backfill] خطا در batch ${table} #${i / BATCH + 1}:`, error.message)
    else ok += batch.length
  }
  return ok
}

// ───────────────────────── شاخص‌ها (tsetmc — بدون key و بدون بودجه) ─────────────────────────

// GetIndexB2History: [{insCode, dEven: 20241029, xNivInuClMresIbs: مقدار پایانی, ...}]
function pickIndexValue(it) {
  // فیلد پایانی با نام xNivInuCl… — دفاعی: اگر نبود، هر فیلد xNiv عددی
  for (const k of Object.keys(it)) {
    if (/^xNivInuCl/i.test(k) && num(it[k]) !== null) return num(it[k])
  }
  for (const k of Object.keys(it)) {
    if (/^xNiv/i.test(k) && num(it[k]) !== null) return num(it[k])
  }
  return null
}

async function backfillIndices() {
  const cutoffGreg = shamsiToGregorian(shamsiCutoff())
  let total = 0
  for (const [name, code] of Object.entries(INDEX_CODES)) {
    try {
      const data = await fetchJson(indexHistoryUrl(code), { timeout: 60_000 })
      const arr = data?.indexB2 ?? data?.data ?? (Array.isArray(data) ? data : [])
      if (!Array.isArray(arr) || arr.length === 0) {
        console.warn(`[candles-backfill] تاریخچه شاخص «${name}» خالی بود`)
        continue
      }
      const rows = []
      let prev = null
      // dEven صعودی مرتب کنیم تا درصد تغییر از روز قبل درست حساب شود
      const sorted = [...arr].sort((a, b) => (a.dEven ?? 0) - (b.dEven ?? 0))
      for (const it of sorted) {
        const greg = String(it.dEven ?? '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(greg)) continue
        const value = pickIndexValue(it)
        if (value === null) continue
        const change_pct = prev ? +(((value - prev) / prev) * 100).toFixed(2) : null
        prev = value
        if (greg < cutoffGreg) continue
        rows.push({
          index_name: name,
          trade_date: greg,
          trade_date_shamsi: gregorianToShamsi(greg),
          value,
          change_pct,
        })
      }
      const ok = await upsertBatches('index_candles', rows, 'index_name,trade_date')
      total += ok
      console.log(`[candles-backfill] شاخص «${name}»: ${ok} رکورد`)
    } catch (e) {
      console.error(`[candles-backfill] شاخص «${name}» ناموفق: ${e.message}`)
    }
  }
  console.log(`[candles-backfill] ✅ شاخص‌ها: ${total} رکورد`)
}

// ───────────────────────── نمادها ─────────────────────────

async function backfillSymbols() {
  console.log('[candles-backfill] دریافت فهرست نمادها از AllSymbols…')
  const data = await fetchJson(allSymbolsUrl(), { timeout: 120_000 })
  const arr = Array.isArray(data) ? data : (data?.symbols ?? data?.data ?? [])
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('پاسخ AllSymbols خالی است')

  const allL18 = new Set(arr.map(it => clean(it.l18)))
  const symbols = [...new Set(arr.filter(it => isCandleSymbol(it, allL18)).map(it => clean(it.l18)))]
  console.log(`[candles-backfill] ${arr.length} نماد خام → ${symbols.length} نماد قابل‌تحلیل`)

  const done = loadProgress()
  const todo = symbols.filter(s => !done.has(s)).slice(0, LIMIT)
  console.log(`[candles-backfill] ${done.size} نماد قبلاً انجام شده، ${todo.length} نماد در این اجرا (بودجه: ~${todo.length + 1} درخواست BrsApi)`)
  if (todo.length === 0) { console.log('[candles-backfill] چیزی برای انجام نیست'); return }

  const cutoff = shamsiCutoff()
  let inserted = 0
  const failed = []

  await mapLimit(todo, 3, async (symbol, i) => {
    try {
      const data = await fetchJson(historyUrl(symbol), { timeout: 30_000 })
      const items = Array.isArray(data) ? data : (data?.data ?? [])
      const rows = []
      for (const it of items) {
        const row = mapCandle(it, symbol)
        if (row && row.trade_date_shamsi >= cutoff) rows.push(row)
      }
      if (rows.length > 0) inserted += await upsertBatches('stock_candles', rows, 'symbol,trade_date')
      done.add(symbol)
      if ((i + 1) % 25 === 0) {
        saveProgress(done)
        console.log(`[candles-backfill] ${i + 1}/${todo.length} نماد… (${inserted} رکورد)`)
      }
    } catch (e) {
      failed.push(`${symbol} (${e.message})`)
    }
  })

  saveProgress(done)
  if (failed.length > 0) {
    console.warn(`[candles-backfill] ${failed.length} نماد ناموفق:`, failed.slice(0, 10).join('، '))
  }
  console.log(`[candles-backfill] ✅ ${inserted} کندل درج/به‌روز شد — ${done.size}/${symbols.length} نماد کامل`)
  if (done.size < symbols.length) {
    console.log('[candles-backfill] برای ادامه (نمادهای باقی‌مانده)، فردا دوباره اجرا کنید — بودجه BrsApi روزانه است')
  }
}

// ───────────────────────── main ─────────────────────────

async function main() {
  if (PROBE) {
    console.log('═══ RAW History.php برای «فولاد» ═══')
    const data = await fetchJson(historyUrl('فولاد'))
    const arr = Array.isArray(data) ? data : (data?.data ?? data)
    console.log(JSON.stringify(Array.isArray(arr) ? arr.slice(0, 3) : arr, null, 2))
    console.log(`\nتعداد رکوردها: ${Array.isArray(arr) ? arr.length : '؟'}`)
    if (Array.isArray(arr) && arr.length > 0) {
      const dates = arr.map(x => normShamsi(x.date)).filter(Boolean).sort()
      console.log(`بازه تاریخ: ${dates[0]} تا ${dates[dates.length - 1]} — cutoff ما: ${shamsiCutoff()}`)
    }
    return
  }
  if (PROBE_INDEX) {
    console.log('═══ RAW GetIndexB2History برای شاخص کل ═══')
    const data = await fetchJson(indexHistoryUrl(INDEX_CODES['شاخص کل']), { timeout: 60_000 })
    const arr = data?.indexB2 ?? data?.data ?? (Array.isArray(data) ? data : data)
    console.log(JSON.stringify(Array.isArray(arr) ? arr.slice(0, 3) : arr, null, 2))
    console.log(`\nتعداد رکوردها: ${Array.isArray(arr) ? arr.length : '؟'}`)
    return
  }

  await backfillIndices()
  if (!INDICES_ONLY) await backfillSymbols()
}

main().catch(e => { console.error(e); process.exit(1) })
