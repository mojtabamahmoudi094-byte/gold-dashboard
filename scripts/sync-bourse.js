#!/usr/bin/env node
/**
 * sync-bourse.js
 *
 * بورس سنج — بروزرسانی صندوق‌های بورسی (اهرمی/بخشی/سهامی) از BrsAPI Nav.php
 * روی سرور ایرانی اجرا شود (نیاز به IP ایران)
 *
 * راه‌اندازی:
 *   1. اول یک بار seed-bourse-assets.js را اجرا کنید تا نمادها در assets ثبت شوند
 *   2. با --probe اجرا کنید تا فرمت پاسخ Nav.php را ببینید:
 *      node scripts/sync-bourse.js --probe
 *   3. crontab -e و مشابه sync-funds.js زمان‌بندی کنید (بازار بورس: ۹:۰۰–۱۵:۰۵)
 *
 * متغیرهای لازم: مثل sync-funds.js (.env.sync یا .env.local)
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

const BRSAPI_KEY   = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PROBE = process.argv.includes('--probe')
const FORCE = process.argv.includes('--force')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[sync-bourse] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')

// Node.js < 22 lacks native WebSocket — pass ws package explicitly
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ fine without it */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY,
  wsTransport ? { realtime: { transport: wsTransport } } : {})

const ALL_NAMES = Object.values(BOURSE_SYMBOLS).flat()

// ── ساعت بازار بورس تهران: شنبه–چهارشنبه ۹:۰۰–۱۲:۳۵ ─────────────────────────
// getDay(): 0=یکشنبه ... 6=شنبه → شنبه تا چهارشنبه یعنی 6 یا 0..3
function isMarketOpen() {
  const tehran = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  const day = tehran.getDay()
  const timeMin = tehran.getHours() * 60 + tehran.getMinutes()
  return (day === 6 || day <= 3) && timeMin >= 9 * 60 && timeMin <= 12 * 60 + 35
}

// ── تاریخ شمسی ───────────────────────────────────────────────────────────────
function toJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  const gy2 = gm > 2 ? gy + 1 : gy
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1]
  let jy = -1595 + 33 * Math.floor(days / 12053)
  days %= 12053
  jy += 4 * Math.floor(days / 1461)
  days %= 1461
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365 }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30)
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30)
  return [jy, jm, jd]
}

function todayShamsi() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  const [y, m, d] = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`
}

// ── fetch با retry ───────────────────────────────────────────────────────────
async function fetchJson(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (i === retries) throw e
      await new Promise(r => setTimeout(r, 1500 * (i + 1)))
    }
  }
}

function navUrl(name) {
  return `https://Api.BrsApi.ir/Tsetmc/Nav.php?key=${BRSAPI_KEY}&l18=${encodeURIComponent(name)}`
}

// ── Field mapper ─────────────────────────────────────────────────────────────
// Nav.php فقط NAV می‌دهد: psubtran=NAV صدور، predtran=NAV ابطال + date/time
// موقت: NAV در ستون‌های قیمت ذخیره می‌شود تا endpoint قیمت لحظه‌ای اضافه شود
//   price_close ← predtran (NAV ابطال)   price_last ← psubtran (NAV صدور)
function num(v) {
  const x = parseFloat(String(v ?? '').replace(/,/g, ''))
  return isNaN(x) ? null : x
}

// تاریخ پاسخ API به شکل «1405-04-10» → «1405/04/10» (فرمت جدول)
function itemDate(item, fallback) {
  const m = String(item.date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : fallback
}

function mapRow(item, assetId, shamsiDate) {
  return {
    asset_id:          assetId,
    trade_date_shamsi: itemDate(item, shamsiDate),
    price_close:       num(item.predtran),
    price_last:        num(item.psubtran),
    trade_value:       0, // NOT NULL column — Nav.php ارزش معاملات ندارد
  }
}

// ── اجرای موازی محدود (رعایت rate limit) ─────────────────────────────────────
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
    const name = ALL_NAMES[0]
    console.log(`═══ RAW Nav.php RESPONSE برای «${name}» ═══`)
    const data = await fetchJson(navUrl(name))
    console.log(JSON.stringify(data, null, 2))
    console.log('\n═══ کلیدها ═══')
    console.log(Object.keys(data || {}).join(', '))
    console.log('\n✅ اگر نام کلیدها با FIELD نمی‌خواند، pick()ها را تنظیم کنید')
    return
  }

  if (!FORCE && !isMarketOpen()) {
    console.log('[sync-bourse] خارج از ساعت بازار — برای اجرای اجباری از --force استفاده کنید')
    return
  }

  // نگاشت name → asset_id برای صندوق‌های بورسی
  const { data: assets, error } = await sb
    .from('assets')
    .select('id, name, category')
    .in('category', Object.keys(BOURSE_SYMBOLS))
  if (error) { console.error('[sync-bourse] خطا در دریافت assets:', error.message); process.exit(1) }
  if (!assets || assets.length === 0) {
    console.error('[sync-bourse] هیچ صندوق بورسی در assets نیست — اول seed-bourse-assets.js را اجرا کنید')
    process.exit(1)
  }

  const idMap = {}
  assets.forEach(a => { idMap[a.name] = a.id })

  const date = todayShamsi()
  console.log(`[sync-bourse] ${assets.length} صندوق، تاریخ: ${date}`)

  const results = await mapLimit(assets, 4, async a => {
    try {
      const data = await fetchJson(navUrl(a.name))
      const item = Array.isArray(data) ? data[0] : (data?.data?.[0] ?? data)
      if (!item || typeof item !== 'object') return { name: a.name, row: null }
      const row = mapRow(item, a.id, date)
      // رکورد بدون هیچ قیمتی بی‌ارزش است
      if (row.price_close === null && row.price_last === null) return { name: a.name, row: null }
      return { name: a.name, row }
    } catch (e) {
      return { name: a.name, row: null, err: e.message }
    }
  })

  const rows = results.filter(r => r.row).map(r => r.row)
  const failed = results.filter(r => !r.row).map(r => r.name)
  if (failed.length > 0) {
    console.warn(`[sync-bourse] ${failed.length} نماد بدون داده:`, failed.slice(0, 10).join(', '))
  }
  if (rows.length === 0) {
    console.error('[sync-bourse] هیچ داده‌ای دریافت نشد — با --probe فرمت پاسخ را بررسی کنید')
    process.exit(1)
  }

  // حذف رکوردهای همان تاریخ برای همین صندوق‌ها و درج دوباره
  // (تاریخ از پاسخ API می‌آید و ممکن است بین صندوق‌ها متفاوت باشد)
  const dates = [...new Set(rows.map(r => r.trade_date_shamsi))]
  for (const d of dates) {
    const ids = rows.filter(r => r.trade_date_shamsi === d).map(r => r.asset_id)
    const { error: delErr } = await sb
      .from('gold_funds')
      .delete()
      .eq('trade_date_shamsi', d)
      .in('asset_id', ids)
    if (delErr) console.warn(`[sync-bourse] خطا در حذف رکوردهای قبلی (${d}):`, delErr.message)
  }

  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error: insErr } = await sb.from('gold_funds').insert(batch)
    if (insErr) console.error(`[sync-bourse] خطا در batch ${i / BATCH + 1}:`, insErr.message)
    else inserted += batch.length
  }
  console.log(`[sync-bourse] ✅ ${inserted}/${rows.length} رکورد ذخیره شد (تاریخ: ${date})`)
}

main().catch(e => { console.error(e); process.exit(1) })
