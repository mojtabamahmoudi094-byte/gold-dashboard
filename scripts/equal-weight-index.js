#!/usr/bin/env node
/**
 * equal-weight-index.js — شاخص هم‌وزن صندوق‌های طلا و شاخص هم‌وزن صندوق‌های نقره‌ی بورس‌سنج
 * (فیچر اختصاصی — رقبا شاخص مشابه ندارند). هر روز میانگین ساده‌ی درصد تغییر قیمت همه‌ی
 * صندوق‌های همان دسته که آن روز داده داشتند را می‌گیرد و یک شاخص هم‌وزن (پایه ۱۰۰) می‌سازد.
 *
 * فقط از gold_funds/assets موجود در Supabase می‌خواند — تماس زنده با BrsApi ندارد،
 * پس روی هر سروری قابل اجراست.
 *
 * usage:
 *   node scripts/equal-weight-index.js            # فقط روزهای جدید (ادامه از آخرین مقدار ذخیره‌شده)
 *   node scripts/equal-weight-index.js --backfill  # کل تاریخچه را از پایه ۱۰۰ بازسازی می‌کند
 *
 * crontab (UTC! نه تهران) — ۱۹:۵۰ تهران، بعد از fund-bubble-daily:
 *   20 16 * * 0-4 node scripts/equal-weight-index.js >> /var/log/equal-weight-index.log 2>&1
 */

'use strict'

const path = require('path')
const fs = require('fs')

function loadEnv(file) {
  const p = path.resolve(__dirname, file)
  if (!fs.existsSync(p)) return
  fs.readFileSync(p, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  })
}
loadEnv('../.env.local')
loadEnv('.env.sync')

const { createClient } = require('@supabase/supabase-js')
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ SUPABASE_URL/SUPABASE_KEY تنظیم نشده'); process.exit(1) }
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})

const BACKFILL = process.argv.includes('--backfill')
const CATEGORIES = ['طلا', 'نقره']

// شمسی «YYYY/MM/DD» → عدد قابل‌مقایسه، برای سورت درست تاریخی
const toSortable = (s) => s.split('/').map(x => x.padStart(2, '0')).join('')

async function computeCategory(category) {
  const { data: assets, error: aErr } = await sb.from('assets').select('id, name').eq('category', category)
  if (aErr) { console.error(`[equal-weight-index] assets(${category}):`, aErr.message); return }
  if (!assets || assets.length === 0) { console.log(`[equal-weight-index] صندوقی برای دسته ${category} پیدا نشد`); return }
  const ids = assets.map(a => a.id)

  const { data: rows, error } = await sb.from('gold_funds')
    .select('trade_date_shamsi, price_change_pct')
    .in('asset_id', ids)
    .not('price_change_pct', 'is', null)
  if (error) { console.error(`[equal-weight-index] gold_funds(${category}):`, error.message); return }

  const byDate = new Map() // date → { sum, count }
  for (const r of rows || []) {
    let e = byDate.get(r.trade_date_shamsi)
    if (!e) { e = { sum: 0, count: 0 }; byDate.set(r.trade_date_shamsi, e) }
    e.sum += Number(r.price_change_pct) || 0
    e.count++
  }
  const dates = [...byDate.keys()].sort((a, b) => toSortable(a).localeCompare(toSortable(b)))
  if (dates.length === 0) { console.log(`[equal-weight-index] داده‌ای برای ${category} نیست`); return }

  let startIdx = 0
  let indexValue = 100

  if (!BACKFILL) {
    const { data: last } = await sb.from('equal_weight_index').select('trade_date_shamsi, index_value')
      .eq('category', category).order('trade_date_shamsi', { ascending: false }).limit(1)
    if (last && last[0]) {
      const lastDate = last[0].trade_date_shamsi
      indexValue = Number(last[0].index_value)
      const idx = dates.indexOf(lastDate)
      startIdx = idx === -1 ? 0 : idx + 1
      if (startIdx >= dates.length) { console.log(`[equal-weight-index] ${category}: روز جدیدی نیست`); return }
    }
  }

  // indexValue همین الان یا ۱۰۰ (backfill) یا آخرین مقدار ذخیره‌شده است — هر روز
  // فقط بازده همان روز رویش اعمال می‌شود: index[t] = index[t-1] × (۱ + بازده[t]/۱۰۰)
  const upserts = []
  for (let i = startIdx; i < dates.length; i++) {
    const date = dates[i]
    const e = byDate.get(date)
    const avgPct = e.sum / e.count
    indexValue = indexValue * (1 + avgPct / 100)
    upserts.push({
      category, trade_date_shamsi: date, index_value: Math.round(indexValue * 100) / 100,
      daily_return_pct: Math.round(avgPct * 100) / 100, fund_count: e.count,
      updated: new Date().toISOString(),
    })
  }

  const { error: upErr } = await sb.from('equal_weight_index').upsert(upserts, { onConflict: 'category,trade_date_shamsi' })
  if (upErr) { console.error(`[equal-weight-index] upsert(${category}):`, upErr.message); return }
  console.log(`✅ ${category}: ${upserts.length} روز ذخیره شد (آخرین مقدار شاخص: ${upserts[upserts.length - 1].index_value})`)
}

async function main() {
  for (const c of CATEGORIES) await computeCategory(c)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
