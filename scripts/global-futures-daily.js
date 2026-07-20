#!/usr/bin/env node
/**
 * global-futures-daily.js
 *
 * بورس سنج — به‌روزرسانی روزانهٔ کندل آتی پیوسته جهانی (Yahoo Finance، بدون کلید).
 * cron — هر زمانی (بازارهای جهانی تقریباً ۲۴ساعته‌اند)، پیشنهاد صبح تهران بعد از بسته‌شدن نیویورک.
 *
 *   node global-futures-daily.js   → ۵ روز آخر هر نماد (برای پر کردن جاافتادگی احتمالی)
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
const PROBE = process.argv.includes('--probe')

if (!PROBE && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('[global-futures-daily] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ بدون ws هم کار می‌کند */ }
const sb = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})
  : null

async function main() {
  let total = 0
  for (const symbol of Object.keys(GLOBAL_FUTURES_SYMBOLS)) {
    try {
      const rows = await fetchYahooCandles(symbol, '5d', { gregorianToShamsi })
      if (PROBE) {
        console.log(`═══ ${symbol} (${GLOBAL_FUTURES_SYMBOLS[symbol]}) ═══`)
        console.log(JSON.stringify(rows, null, 2))
        continue
      }
      const payload = rows.map(r => ({ symbol, ...r }))
      const ok = await upsertBatches(sb, 'global_futures_candles', payload, 'symbol,trade_date', 'global-futures-daily')
      total += ok
    } catch (e) {
      console.error(`[global-futures-daily] ${symbol} ناموفق: ${e.message}`)
    }
  }
  if (PROBE) return
  console.log(`[global-futures-daily] ✅ ${total} کندل به‌روز شد`)
  if (total === 0) process.exit(1) // برای run-with-alert
}

main().catch(e => { console.error(e); process.exit(1) })
