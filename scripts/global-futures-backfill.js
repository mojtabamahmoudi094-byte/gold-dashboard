#!/usr/bin/env node
/**
 * global-futures-backfill.js
 *
 * بورس سنج — بک‌فیل یک‌باره تاریخچهٔ چندسالهٔ قراردادهای آتی پیوسته جهانی
 * (طلا/نقره/نفت/مس/گاز — GLOBAL_FUTURES_SYMBOLS در futures-lib.js)
 *
 * منبع: Yahoo Finance chart API — رایگان، بدون کلید، بدون محدودیت سهمیهٔ BrsApi.
 * برخلاف tsetmc نیازی به سرور ایرانی ندارد؛ هرجا اجرا شود جواب می‌دهد.
 *
 *   node global-futures-backfill.js            → همهٔ نمادها، ۱۰ سال
 *   node global-futures-backfill.js --range=5y  → بازهٔ دیگر
 */

'use strict'

const path = require('path')
const fs = require('fs')
const { gregorianToShamsi } = require('./candles-lib')
const { GLOBAL_FUTURES_SYMBOLS, fetchYahooCandles, upsertBatches } = require('./futures-lib')

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
const RANGE = (process.argv.find(x => x.startsWith('--range=')) || '').split('=')[1] || '10y'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[global-futures-backfill] SUPABASE_URL و SUPABASE_KEY (service-role) تنظیم نشده‌اند')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ بدون ws هم کار می‌کند */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})

async function main() {
  let total = 0
  for (const symbol of Object.keys(GLOBAL_FUTURES_SYMBOLS)) {
    try {
      const rows = await fetchYahooCandles(symbol, RANGE, { gregorianToShamsi })
      const payload = rows.map(r => ({ symbol, ...r }))
      const ok = await upsertBatches(sb, 'global_futures_candles', payload, 'symbol,trade_date', 'global-futures-backfill')
      total += ok
      console.log(`[global-futures-backfill] ${symbol} (${GLOBAL_FUTURES_SYMBOLS[symbol]}): ${ok}/${rows.length} کندل`)
    } catch (e) {
      console.error(`[global-futures-backfill] ${symbol} ناموفق: ${e.message}`)
    }
  }
  console.log(`[global-futures-backfill] ✅ مجموعاً ${total} کندل ثبت شد`)
  if (total === 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
