#!/usr/bin/env node
/**
 * sync-bourse.js
 *
 * بورس سنج — بروزرسانی صندوق‌های بورسی (اهرمی/بخشی/سهامی) از BrsAPI AllSymbols.php
 * (دیتای جامع همه نمادها در یک درخواست: قیمت، حجم، ارزش، حقیقی/حقوقی)
 * روی سرور ایرانی اجرا شود (نیاز به IP ایران)
 *
 * راه‌اندازی:
 *   1. اول یک بار seed-bourse-assets.js را اجرا کنید تا نمادها در assets ثبت شوند
 *   2. با --probe اجرا کنید تا فرمت پاسخ AllSymbols.php را ببینید:
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

const BRSAPI_KEY   = process.env.BRSAPI_KEY
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

// همه نمادها در یک درخواست — به‌جای ۱۴۲ درخواست جداگانه Symbol.php
const ALL_SYMBOLS_URL = `https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${BRSAPI_KEY}`

// AllSymbols فیلد date ندارد — تاریخ واقعی داده از Symbol.php یک نماد مرجع
async function fetchDataDate(fallback) {
  try {
    const d = await fetchJson(`https://Api.BrsApi.ir/Tsetmc/Symbol.php?key=${BRSAPI_KEY}&l18=${encodeURIComponent('اهرم')}`)
    const m = String(d?.date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m) return `${m[1]}/${m[2]}/${m[3]}`
  } catch { /* fallback پایین */ }
  return fallback
}

// نرمال‌سازی نام نماد برای تطبیق (ي/ك عربی → ی/ک فارسی، فاصله‌های تکراری)
function normName(s) {
  return String(s ?? '')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')   // نیم‌فاصله → فاصله
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Field mapper ─────────────────────────────────────────────────────────────
// کلیدها طبق جدول راهنمای «دیتای جامع نماد بورس Tsetmc» (BrsAPI Symbol.php):
//   قیمت:    pl=آخرین، pc=پایانی، pcp=درصد تغییر پایانی
//   معاملات: tvol=حجم، tval=ارزش، mv=ارزش بازار
//   حقیقی:   Buy_I_Volume، Sell_I_Volume، Buy_CountI، Sell_CountI
//   date=تاریخ آخرین اطلاعات قیمت (شمسی با خط تیره)
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
    price_close:       num(item.pc),
    price_last:        num(item.pl),
    price_change_pct:  num(item.pcp),
    trade_value:       num(item.tval) ?? 0, // NOT NULL column
    volume:            num(item.tvol),
    market_value:      num(item.mv),
    buy_i_volume:      num(item.Buy_I_Volume),
    sell_i_volume:     num(item.Sell_I_Volume),
    buy_count_i:       num(item.Buy_CountI),
    sell_count_i:      num(item.Sell_CountI),
  }
}

// دریافت همه نمادها و ساخت نگاشت نام نرمال‌شده → آیتم
async function fetchAllSymbols() {
  const data = await fetchJson(ALL_SYMBOLS_URL)
  const arr = Array.isArray(data) ? data : (data?.data ?? data?.symbols ?? [])
  if (!Array.isArray(arr)) throw new Error('فرمت پاسخ AllSymbols آرایه نیست')
  const byName = new Map()
  for (const it of arr) {
    const key = normName(it?.l18)
    if (key && !byName.has(key)) byName.set(key, it)
  }
  return { arr, byName }
}

async function main() {
  if (PROBE) {
    console.log('═══ RAW AllSymbols.php RESPONSE (آیتم اول + نمونه صندوق) ═══')
    const { arr, byName } = await fetchAllSymbols()
    console.log(`تعداد کل نمادها: ${arr.length}`)
    console.log('کلیدهای آیتم اول:', Object.keys(arr[0] || {}).join(', '))
    const sample = byName.get(normName('اهرم'))
    console.log('نمونه «اهرم»:', JSON.stringify(sample, null, 2))
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

  const date = await fetchDataDate(todayShamsi())
  console.log(`[sync-bourse] ${assets.length} صندوق، تاریخ داده: ${date}`)

  const { byName } = await fetchAllSymbols()
  console.log(`[sync-bourse] ${byName.size} نماد از AllSymbols دریافت شد`)

  const rows = []
  const failed = []
  for (const a of assets) {
    const item = byName.get(normName(a.name))
    if (!item) { failed.push(a.name); continue }
    const row = mapRow(item, a.id, date)
    // رکورد بدون هیچ قیمتی بی‌ارزش است
    if (row.price_close === null && row.price_last === null) { failed.push(a.name); continue }
    rows.push(row)
  }
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
  console.log(`[sync-bourse] ✅ ${inserted}/${rows.length} رکورد ذخیره شد (تاریخ داده: ${dates.join(', ')})`)
}

main().catch(e => { console.error(e); process.exit(1) })
