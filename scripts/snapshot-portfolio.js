#!/usr/bin/env node
/**
 * snapshot-portfolio.js
 *
 * بورس سنج — ثبت روزانه‌ی ارزش پورتفوی هر کاربر
 * برای «عملکرد دوره‌ای» و چارت «روند واقعی ارزش پورتفو» در app/portfolio/page.tsx
 *
 * راه‌اندازی:
 *   1. اجرای scripts/sql/portfolio-daily-snapshot.sql در Supabase SQL Editor (یک‌بار)
 *   2. متغیرهای محیطی را در .env.sync تنظیم کنید
 *   3. crontab -e  (بعد از بسته‌شدن آخرین بازار — صندوق‌ها تا ۱۸:۰۰ تهران):
 *      TZ=Asia/Tehran
 *      15 18 * * 6,0-3 /usr/bin/node /path/to/snapshot-portfolio.js >> /var/log/snapshot-portfolio.log 2>&1
 *      (روزهای 6,0-3 = شنبه تا چهارشنبه؛ اگر سرور TZ را نادیده گرفت، معادل UTC را دستی حساب کنید)
 *
 * متغیرهای لازم (.env.sync):
 *   SITE_URL                    (پیش‌فرض https://bourssanj.ir) — قیمت لحظه‌ای سهام/صندوق/فیزیکی از API عمومی سایت
 *   SUPABASE_URL یا NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_KEY (یا SUPABASE_SERVICE_ROLE_KEY) — باید service_role باشد (نه anon)؛ چون باید تراکنش‌های همه‌ی کاربران خوانده شود
 *                                 و RLS جدول portfolio_transactions هر کاربر را فقط به خودش محدود می‌کند.
 *
 * محدودیت شناخته‌شده: قیمت دستیِ کاربر برای نمادهای بدون قیمت آنلاین (مثلاً نماد متوقف) فقط در
 * localStorage مرورگر ذخیره می‌شود، نه دیتابیس — این اسکریپت به آن دسترسی ندارد. برای چنین کاربری
 * در آن روز snapshot ثبت نمی‌شود (به‌جای ثبت عدد نادرست).
 */

'use strict'

const path = require('path')
const fs = require('fs')

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

const SITE = (process.env.SITE_URL || 'https://bourssanj.ir').replace(/\/$/, '')
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[snapshot-portfolio] SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY تنظیم نشده‌اند')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
// Node 20 فاقد WebSocket بومی است — بدون این، ساخت کلاینت realtime کرش می‌کند (Node 22+ نیازی ندارد)
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})

const { computeHoldings, fetchPriceMap } = require('../lib/portfolioValuation')

const todayShamsi = () =>
  new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' })
    .format(new Date())

async function main() {
  const priceMap = await fetchPriceMap(SITE)
  const date = todayShamsi()

  const { data: txs, error } = await sb
    .from('portfolio_transactions')
    .select('user_id, symbol, side, quantity, price, commission')
  if (error) {
    console.error('[snapshot-portfolio] خطا در خواندن تراکنش‌ها:', error.message)
    process.exit(1)
  }

  const byUser = new Map()
  for (const tx of txs ?? []) {
    if (!byUser.has(tx.user_id)) byUser.set(tx.user_id, [])
    byUser.get(tx.user_id).push(tx)
  }

  const rows = []
  for (const [userId, userTxs] of byUser) {
    const holdings = computeHoldings(userTxs).filter(h => h.qty > 0)
    if (holdings.length === 0) continue
    let totalValue = 0, investedCapital = 0, priced = true
    for (const h of holdings) {
      investedCapital += h.totalCost
      const px = priceMap.get(h.symbol)
      if (px && px > 0) totalValue += h.qty * px
      else priced = false
    }
    // فقط snapshot کامل ثبت می‌شود — جلوگیری از ثبت ارزش ناقص وقتی قیمت یک دارایی در دسترس نیست
    if (priced) rows.push({ user_id: userId, snap_date: date, total_value: totalValue, invested_capital: investedCapital })
  }

  if (rows.length === 0) {
    console.log('[snapshot-portfolio] هیچ snapshot کاملی برای ثبت وجود نداشت')
    return
  }

  const { error: upErr } = await sb
    .from('portfolio_daily_snapshot')
    .upsert(rows, { onConflict: 'user_id,snap_date' })
  if (upErr) {
    console.error('[snapshot-portfolio] خطا در ثبت:', upErr.message)
    process.exit(1)
  }
  console.log(`[snapshot-portfolio] ${rows.length} کاربر ثبت شد — ${date}`)
}

main()
