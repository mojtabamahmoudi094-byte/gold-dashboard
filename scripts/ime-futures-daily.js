#!/usr/bin/env node
/**
 * ime-futures-daily.js
 *
 * بورس سنج — آرشیو روزانهٔ بازار آتی بورس کالا (سکه/زعفران و…)
 * cron — نزدیک بسته‌شدن جلسهٔ آتی (پیشنهاد ۱۹:۰۰ تهران)
 *
 * منبع: BrsApi IME/Futures.php — فقط اسنپ‌شات لحظه‌ای می‌دهد (بدون تاریخچه)، به همین دلیل
 * از تاریخ نصب این کرون به بعد در ime_futures_candles جمع می‌شود؛ بک‌فیل ممکن نیست.
 * فیلدهای py/pf/pl/pmax/pmin/tvol آماری کل جلسه‌اند (مثل AllSymbols سهام) — یک درخواست
 * نزدیک بسته‌شدن بازار یعنی کندل کامل روز.
 *
 *   node ime-futures-daily.js --probe   → نمایش فرمت خام
 */

'use strict'

const path = require('path')
const fs = require('fs')
const { tehranToday, clean, num, fetchJson } = require('./candles-lib')
const { upsertBatches } = require('./futures-lib')

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

const BRSAPI_KEY   = process.env.BRSAPI_KEY
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const PROBE = process.argv.includes('--probe')

if (!PROBE && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('[ime-futures-daily] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ بدون ws هم کار می‌کند */ }
const sb = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})
  : null

const futuresUrl = () => `https://Api.BrsApi.ir/IME/Futures.php?key=${BRSAPI_KEY}`

async function main() {
  const data = await fetchJson(futuresUrl(), { timeout: 60_000 })
  const arr = Array.isArray(data) ? data : (data?.ime_futures_data ?? data?.data ?? data?.futures ?? [])
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('پاسخ IME/Futures.php خالی یا فرمت ناشناخته است')

  if (PROBE) {
    console.log(`═══ نمونه آیتم IME/Futures.php (${arr.length} قرارداد) ═══`)
    console.log(JSON.stringify(arr[0], null, 2))
    return
  }

  const today = tehranToday()
  const rows = []
  for (const it of arr) {
    const code = clean(it.contract_code ?? it.symbol ?? '')
    const close = num(it.py ?? it.pls)
    if (!code || close === null) continue
    rows.push({
      contract_code: code,
      contract_description: it.contract_description ?? it.name ?? null,
      trade_date: today.gregorian,
      trade_date_shamsi: today.shamsi,
      open: num(it.pf),
      high: num(it.pmax),
      low: num(it.pmin),
      close,
      volume: num(it.tvol),
      value: num(it.tval),
      open_interest: num(it.interest_open),
      day_remain: it.day_remain != null ? Math.trunc(num(it.day_remain) ?? 0) : null,
    })
  }
  if (rows.length === 0) throw new Error('هیچ قرارداد معتبری از پاسخ استخراج نشد — probe کن')

  const ok = await upsertBatches(sb, 'ime_futures_candles', rows, 'contract_code,trade_date', 'ime-futures-daily')
  console.log(`[ime-futures-daily] ✅ ${ok}/${rows.length} قرارداد برای ${today.shamsi} ثبت شد`)
  if (ok === 0) process.exit(1) // برای run-with-alert
}

main().catch(e => { console.error(e); process.exit(1) })
