#!/usr/bin/env node
/**
 * candles-daily.js
 *
 * بورس سنج — به‌روزرسانی روزانه کندل امروزِ همه نمادها + شاخص‌ها
 * cron روی سرور ایرانی، بعد از بسته‌شدن بازار (۱۷:۴۵ تهران = ۱۴:۱۵ UTC)
 *
 * فقط ۳ درخواست BrsApi مصرف می‌کند:
 *   ۱× AllSymbols.php  → کندل امروز همه نمادها (pf/pmax/pmin/pc/…)
 *   ۱× Index.php?type=3 → شاخص‌های منتخب بورس
 *   ۱× Index.php?type=2 → شاخص کل فرابورس
 *
 *   node candles-daily.js --probe   → نمایش فرمت خام یک نماد و شاخص‌ها
 *   node candles-daily.js --force   → اجرا حتی روز تعطیل (پنجشنبه/جمعه)
 */

'use strict'

const path = require('path')
const fs = require('fs')
const {
  tehranToday, tehranDay,
  clean, num, fetchJson,
  normalizeIndexName, isCandleSymbol,
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
const PROBE = process.argv.includes('--probe')
const FORCE = process.argv.includes('--force')

if (!PROBE && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('[candles-daily] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
const sb = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

const allSymbolsUrl = () => `https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${BRSAPI_KEY}`
const indexUrl = (type) => `https://Api.BrsApi.ir/Tsetmc/Index.php?key=${BRSAPI_KEY}&type=${type}`

async function upsertBatches(table, rows, conflict) {
  const BATCH = 500
  let ok = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await sb.from(table).upsert(batch, { onConflict: conflict })
    if (error) console.error(`[candles-daily] خطا در batch ${table} #${i / BATCH + 1}:`, error.message)
    else ok += batch.length
  }
  return ok
}

async function main() {
  const day = tehranDay()
  if (!FORCE && !PROBE && (day === 4 || day === 5)) { // پنجشنبه=4، جمعه=5
    console.log('[candles-daily] روز تعطیل بازار — رد شد. با --force اجباری کنید.')
    return
  }

  const today = tehranToday()

  // ── کندل امروز همه نمادها — یک درخواست
  const data = await fetchJson(allSymbolsUrl(), { timeout: 120_000 })
  const arr = Array.isArray(data) ? data : (data?.symbols ?? data?.data ?? [])
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('پاسخ AllSymbols خالی است')

  if (PROBE) {
    console.log('═══ نمونه آیتم AllSymbols ═══')
    console.log(JSON.stringify(arr.find(it => clean(it.l18) === 'فولاد') ?? arr[0], null, 2))
  }

  const allL18 = new Set(arr.map(it => clean(it.l18)))
  const rows = []
  for (const it of arr) {
    if (!isCandleSymbol(it, allL18)) continue
    const close = num(it.pc)
    const tvol = num(it.tvol)
    if (close === null || close === 0) continue
    if (tvol === null || tvol === 0) continue // امروز معامله نشده — کندل جعلی نساز
    rows.push({
      symbol: clean(it.l18),
      trade_date: today.gregorian,
      trade_date_shamsi: today.shamsi,
      open: num(it.pf),
      high: num(it.pmax),
      low: num(it.pmin),
      close,
      last: num(it.pl),
      yesterday: num(it.py),
      change_pct: num(it.pcp),
      volume: tvol,
      value: num(it.tval),
      trades: num(it.tno),
    })
  }

  // ── شاخص‌ها — دو درخواست
  const idxRows = []
  try {
    const [sel, fara] = await Promise.allSettled([
      fetchJson(indexUrl(3), { timeout: 30_000 }),
      fetchJson(indexUrl(2), { timeout: 30_000 }),
    ])
    if (sel.status === 'fulfilled') {
      const items = Array.isArray(sel.value) ? sel.value : (sel.value?.data ?? [sel.value])
      if (PROBE) { console.log('═══ Index.php type=3 ═══'); console.log(JSON.stringify(items, null, 2)) }
      for (const it of items) {
        const value = num(it?.index)
        if (value === null) continue
        idxRows.push({
          index_name: normalizeIndexName(it?.name ?? 'شاخص کل'),
          trade_date: today.gregorian,
          trade_date_shamsi: today.shamsi,
          value,
          change_pct: num(it?.index_change_percent),
        })
      }
    }
    if (fara.status === 'fulfilled') {
      const o = Array.isArray(fara.value) ? fara.value[0] : fara.value
      if (PROBE) { console.log('═══ Index.php type=2 ═══'); console.log(JSON.stringify(o, null, 2)) }
      const value = num(o?.index)
      if (value !== null) {
        idxRows.push({
          index_name: 'شاخص کل فرابورس',
          trade_date: today.gregorian,
          trade_date_shamsi: today.shamsi,
          value,
          change_pct: num(o?.index_change_percent),
        })
      }
    }
  } catch (e) {
    console.error('[candles-daily] دریافت شاخص‌ها ناموفق:', e.message)
  }

  if (PROBE) {
    console.log(`\nنمادهای امروز: ${rows.length} — شاخص‌ها: ${idxRows.length} (${today.shamsi})`)
    return
  }

  const okSymbols = rows.length > 0 ? await upsertBatches('stock_candles', rows, 'symbol,trade_date') : 0
  const okIdx = idxRows.length > 0 ? await upsertBatches('index_candles', idxRows, 'index_name,trade_date') : 0
  console.log(`[candles-daily] ✅ ${okSymbols} کندل نماد + ${okIdx} شاخص برای ${today.shamsi} ثبت شد`)

  if (okSymbols === 0) {
    console.error('[candles-daily] هشدار: هیچ کندلی ثبت نشد — خروجی AllSymbols را بررسی کنید')
    process.exit(1) // تا run-with-alert.sh هشدار تلگرام بفرستد
  }
}

main().catch(e => { console.error(e); process.exit(1) })
