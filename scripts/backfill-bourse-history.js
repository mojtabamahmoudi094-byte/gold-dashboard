#!/usr/bin/env node
/**
 * backfill-bourse-history.js
 *
 * بورس سنج — دریافت یک‌باره تاریخچه ۴۴ روز اخیر صندوق‌های بورسی از BrsAPI History.php
 * روی سرور ایرانی اجرا شود (نیاز به IP ایران)
 *
 *   node backfill-bourse-history.js --probe   → نمایش فرمت خام پاسخ برای یک نماد
 *   node backfill-bourse-history.js           → دریافت و درج تاریخچه همه صندوق‌ها
 *
 * رکوردهایی که از قبل موجودند (مثلاً رکوردهای cron با دیتای حقیقی/حقوقی)
 * دست‌نخورده می‌مانند — فقط تاریخ‌های جاافتاده درج می‌شوند.
 *
 * فیلدهای History.php (راهنمای رسمی): date, time, tno, tvol, tval,
 *   pmin, pmax, py, pf, pl, plc, plp, pc, pcc, pcp
 */

'use strict'

const path = require('path')
const fs   = require('fs')
const { BOURSE_SYMBOLS } = require('./bourse-symbols')

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
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PROBE = process.argv.includes('--probe')
const DAYS  = 44   // تعداد روزهای معاملاتی اخیر

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[backfill] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')

// Node.js < 22 lacks native WebSocket — pass ws package explicitly
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ fine without it */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY,
  wsTransport ? { realtime: { transport: wsTransport } } : {})

function historyUrl(name) {
  return `https://Api.BrsApi.ir/Tsetmc/History.php?key=${BRSAPI_KEY}&type=0&l18=${encodeURIComponent(name)}`
}

async function fetchJson(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (i === retries) throw e
      await new Promise(r => setTimeout(r, 1500 * (i + 1)))
    }
  }
}

function num(v) {
  const x = parseFloat(String(v ?? '').replace(/,/g, ''))
  return isNaN(x) ? null : x
}

// «1403-08-08» → «1403/08/08»
function toSlashDate(v) {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : null
}

function mapRow(item, assetId) {
  const date = toSlashDate(item.date)
  if (!date) return null
  return {
    asset_id:          assetId,
    trade_date_shamsi: date,
    price_close:       num(item.pc),
    price_last:        num(item.pl),
    price_change_pct:  num(item.pcp),
    trade_value:       num(item.tval) ?? 0, // NOT NULL column
    volume:            num(item.tvol),
  }
}

async function mapLimit(items, limit, fn) {
  const out = []
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function main() {
  if (PROBE) {
    const name = Object.values(BOURSE_SYMBOLS).flat()[0]
    console.log(`═══ RAW History.php RESPONSE برای «${name}» ═══`)
    const data = await fetchJson(historyUrl(name))
    const arr = Array.isArray(data) ? data : (data?.data ?? data)
    console.log(JSON.stringify(Array.isArray(arr) ? arr.slice(0, 3) : arr, null, 2))
    console.log(`\nتعداد رکوردها: ${Array.isArray(arr) ? arr.length : '؟ (آرایه نیست)'}`)
    return
  }

  const { data: assets, error } = await sb
    .from('assets')
    .select('id, name, category')
    .in('category', Object.keys(BOURSE_SYMBOLS))
  if (error) { console.error('[backfill] خطا در دریافت assets:', error.message); process.exit(1) }
  if (!assets || assets.length === 0) {
    console.error('[backfill] هیچ صندوق بورسی در assets نیست — اول seed-bourse-assets.js را اجرا کنید')
    process.exit(1)
  }
  console.log(`[backfill] ${assets.length} صندوق، ${DAYS} روز معاملاتی اخیر`)

  // تاریخ‌های موجود هر دارایی — این‌ها درج نمی‌شوند (paginate تا سقف supabase)
  const existing = new Set()
  const assetIds = assets.map(a => a.id)
  for (let from = 0; ; from += 1000) {
    const { data: page, error: exErr } = await sb
      .from('gold_funds')
      .select('asset_id, trade_date_shamsi')
      .in('asset_id', assetIds)
      .range(from, from + 999)
    if (exErr) { console.error('[backfill] خطا در خواندن رکوردهای موجود:', exErr.message); process.exit(1) }
    (page || []).forEach(r => existing.add(`${r.asset_id}|${r.trade_date_shamsi}`))
    if (!page || page.length < 1000) break
  }
  console.log(`[backfill] ${existing.size} رکورد از قبل موجود است`)

  let fetched = 0, skippedDup = 0
  const failed = []
  const results = await mapLimit(assets, 4, async a => {
    try {
      const data = await fetchJson(historyUrl(a.name))
      const arr = Array.isArray(data) ? data : (data?.data ?? [])
      if (!Array.isArray(arr) || arr.length === 0) { failed.push(a.name); return [] }
      // جدیدترین ۴۴ رکورد (مرتب‌سازی نزولی بر اساس تاریخ برای اطمینان)
      const recent = [...arr]
        .filter(it => toSlashDate(it.date))
        .sort((x, y) => String(y.date).localeCompare(String(x.date)))
        .slice(0, DAYS)
      fetched += recent.length
      const rows = []
      for (const it of recent) {
        const row = mapRow(it, a.id)
        if (!row || (row.price_close === null && row.price_last === null)) continue
        if (existing.has(`${a.id}|${row.trade_date_shamsi}`)) { skippedDup++; continue }
        rows.push(row)
      }
      return rows
    } catch (e) {
      failed.push(`${a.name} (${e.message})`)
      return []
    }
  })

  const rows = results.flat()
  if (failed.length > 0) {
    console.warn(`[backfill] ${failed.length} نماد ناموفق:`, failed.slice(0, 10).join(', '))
  }
  console.log(`[backfill] ${fetched} رکورد دریافت شد، ${skippedDup} تکراری رد شد، ${rows.length} برای درج`)
  if (rows.length === 0) { console.log('[backfill] چیزی برای درج نیست'); return }

  const BATCH = 200
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error: insErr } = await sb.from('gold_funds').insert(batch)
    if (insErr) console.error(`[backfill] خطا در batch ${i / BATCH + 1}:`, insErr.message)
    else inserted += batch.length
  }
  console.log(`[backfill] ✅ ${inserted}/${rows.length} رکورد تاریخی درج شد`)
}

main().catch(e => { console.error(e); process.exit(1) })
