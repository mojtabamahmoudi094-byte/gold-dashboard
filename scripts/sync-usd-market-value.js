#!/usr/bin/env node
/**
 * sync-usd-market-value.js
 *
 * بورس سنج — محاسبه و ذخیره «ارزش بازار به دلار» برای همه نمادها و صندوق‌ها
 * هر روز ساعت ۱۳:۰۰ تهران، با قیمت پایانی همان روز و نرخ لحظه‌ای دلار (BrsAPI)
 *
 * روی سرور ایرانی (BrsAPI فقط IP ایران):
 *   node sync-usd-market-value.js            → اجرای عادی (فقط شنبه–چهارشنبه)
 *   node sync-usd-market-value.js --force     → اجرای اجباری خارج از روز/ساعت
 *
 * خروجی‌ها:
 *   - stock_industries.data: هر سهم/صندوق سهامی → symbols[].mv_usd ، هر صنعت → mv_usd
 *   - gold_funds: ردیف امروز هر صندوق کالایی → market_value_usd
 *
 * پیش‌نیاز SQL: scripts/sql/gold-funds-market-value-usd.sql (ستون market_value_usd)
 *
 * crontab -e:
 *   30 9 * * 6,0-3 /usr/bin/node /path/to/sync-usd-market-value.js >> /var/log/sync-usd-market-value.log 2>&1
 *   (۰۹:۳۰ UTC = ۱۳:۰۰ تهران؛ کرون دبیان TZ= را نادیده می‌گیرد — ساعت‌ها را UTC بنویسید)
 */

'use strict'

const path = require('path')
const fs   = require('fs')

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

const BRSAPI_KEY   = process.env.BRSAPI_KEY   || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const GOLD_PRO_URL = `https://Api.BrsApi.ir/Market/Gold_Currency_Pro.php?key=${BRSAPI_KEY}&section=currency`
const FORCE = process.argv.includes('--force')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[sync-usd-market-value] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
  process.exit(1)
}

let _sb = null
function sb() {
  if (_sb) return _sb
  const { createClient } = require('@supabase/supabase-js')
  let wsTransport
  try { wsTransport = require('ws') } catch { /* Node 22+ نیازی ندارد */ }
  _sb = createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})
  return _sb
}

// شنبه تا چهارشنبه، وقت تهران
function isTradingDay() {
  const tehran = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  return [6, 0, 1, 2, 3].includes(tehran.getDay())
}

// ── Jalali date (همان الگوی sync-funds.js) ──────────────────────────────────
function toJalali(gy, gm, gd) {
  const g_y = gy - 1600
  const g_m = gm - 1
  const g_d = gd - 1
  const isLeap = g_y % 4 === 0 && (g_y % 100 !== 0 || g_y % 400 === 0)
  const g_days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let g_day_no = 365 * g_y + Math.floor((g_y + 3) / 4) - Math.floor((g_y + 99) / 100) + Math.floor((g_y + 399) / 400)
  for (let i = 0; i < g_m; i++) g_day_no += g_days[i]
  g_day_no += g_d
  let j_day_no = g_day_no - 79
  const j_np = Math.floor(j_day_no / 12053)
  j_day_no %= 12053
  let jy = 979 + 33 * j_np + 4 * Math.floor(j_day_no / 1461)
  j_day_no %= 1461
  if (j_day_no >= 366) {
    jy += Math.floor((j_day_no - 1) / 365)
    j_day_no = (j_day_no - 1) % 365
  }
  const j_days = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29]
  let jm = 0
  for (jm = 0; jm < 11; jm++) {
    if (j_day_no < j_days[jm]) break
    j_day_no -= j_days[jm]
  }
  return [jy, jm + 1, j_day_no + 1]
}
function todayShamsi() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  const [y, m, d] = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`
}

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      console.warn(`[sync-usd-market-value] تلاش ${i + 1}/${retries} ناموفق:`, e.message)
      if (i < retries - 1) await new Promise(r => setTimeout(r, 3000 * (i + 1)))
    }
  }
  throw new Error('دریافت نرخ دلار ناموفق بود')
}

// نرخ دلار آزاد (ریال) از BrsAPI
async function fetchUsdRateRial() {
  const raw = await fetchJson(GOLD_PRO_URL)
  const usd = (raw?.currency?.free ?? []).find(x => x.symbol === 'USD')
  const rate = Number(usd?.price)
  if (!rate || !Number.isFinite(rate) || rate <= 0) throw new Error('نرخ دلار در پاسخ BrsAPI پیدا نشد')
  return rate
}

// ── سهام و صندوق‌های سهامی/اهرمی/بخشی (jsonb در stock_industries) ───────────
async function updateStockIndustriesUsd(rate) {
  const { data: row, error } = await sb().from('stock_industries').select('data').eq('id', 1).single()
  if (error) { console.warn('[sync-usd-market-value] خواندن stock_industries ناموفق:', error.message); return }
  if (!row?.data?.industries) { console.warn('[sync-usd-market-value] stock_industries خالی است'); return }

  const data = row.data
  let symbolCount = 0
  for (const ind of data.industries) {
    let mvUsdSum = 0
    for (const s of ind.symbols) {
      if (s.mv != null) {
        s.mv_usd = Math.round(s.mv / rate)
        mvUsdSum += s.mv_usd
        symbolCount++
      } else {
        s.mv_usd = null
      }
    }
    ind.mv_usd = mvUsdSum
  }
  data.usdRate = rate
  data.usdUpdated = new Date().toISOString()

  const { error: upErr } = await sb().from('stock_industries').update({ data }).eq('id', 1)
  if (upErr) console.error('[sync-usd-market-value] نوشتن stock_industries ناموفق:', upErr.message)
  else console.log(`[sync-usd-market-value] ✅ ${symbolCount} نماد/صندوق سهامی به‌روز شد (نرخ دلار: ${rate.toLocaleString('fa-IR')} ریال)`)
}

// ── صندوق‌های کالایی (طلا/نقره/زعفران) در gold_funds ─────────────────────────
async function updateGoldFundsUsd(rate, date) {
  const { data: rows, error } = await sb()
    .from('gold_funds')
    .select('id, market_value')
    .eq('trade_date_shamsi', date)
    .not('market_value', 'is', null)

  if (error) { console.warn('[sync-usd-market-value] خواندن gold_funds ناموفق:', error.message); return }
  if (!rows || rows.length === 0) { console.warn(`[sync-usd-market-value] هیچ ردیف gold_funds با market_value برای ${date} پیدا نشد`); return }

  let updated = 0
  for (const r of rows) {
    const usd = Math.round(r.market_value / rate)
    const { error: upErr } = await sb().from('gold_funds').update({ market_value_usd: usd }).eq('id', r.id)
    if (upErr) console.error(`[sync-usd-market-value] خطا در ردیف ${r.id}:`, upErr.message)
    else updated++
  }
  console.log(`[sync-usd-market-value] ✅ ${updated}/${rows.length} ردیف gold_funds (${date}) به‌روز شد`)
}

async function main() {
  const ts = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })
  console.log(`\n[${ts}] sync-usd-market-value شروع شد`)

  if (!FORCE && !isTradingDay()) {
    console.log('[sync-usd-market-value] خارج از روز معاملاتی (شنبه–چهارشنبه) — پایان (--force برای اجرای اجباری)')
    return
  }

  const rate = await fetchUsdRateRial()
  const date = todayShamsi()
  console.log(`[sync-usd-market-value] نرخ دلار: ${rate.toLocaleString('fa-IR')} ریال — تاریخ: ${date}`)

  await updateStockIndustriesUsd(rate)
  await updateGoldFundsUsd(rate, date)
}

main().catch(e => {
  console.error('[sync-usd-market-value] خطای بحرانی:', e.message)
  process.exit(1)
})
