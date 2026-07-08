#!/usr/bin/env node
/**
 * snapshot-stock-signal-prices.js
 *
 * بورس سنج — ثبت روزانه‌ی قیمت پایانی نمادهایی که سیگنال سهام برایشان صادر شده
 * (برای محاسبه‌ی «نتیجه N روزه» سیگنال سهام در app/signals/page.tsx — چون تاریخچه‌ی
 * قیمت سهام جای دیگری ذخیره نمی‌شود، این کرون تنها منبع آن است و از امروز به بعد جمع می‌شود)
 *
 * راه‌اندازی:
 *   1. اجرای scripts/sql/stock-signal-prices.sql در Supabase SQL Editor (یک‌بار)
 *   2. متغیرهای محیطی را در .env.sync تنظیم کنید
 *   3. crontab -e  (بعد از بسته‌شدن بازار سهام — ۱۲:۳۰ تهران):
 *      TZ=Asia/Tehran
 *      45 12 * * 6,0-3 /usr/bin/node /path/to/snapshot-stock-signal-prices.js >> /var/log/snapshot-stock-signal-prices.log 2>&1
 *
 * متغیرهای لازم (.env.sync):
 *   SITE_URL                    (پیش‌فرض https://bourssanj.ir)
 *   SUPABASE_URL یا NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   — یا anon کافی است چون این جدول برای کاربر خاصی نیست، ولی service-role مطمئن‌تر است
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
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[snapshot-stock-signal-prices] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

const safe = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

const todayShamsi = () =>
  new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' })
    .format(new Date())

async function main() {
  // فقط نمادهایی که تا امروز حداقل یک سیگنال «سهام» داشته‌اند
  const { data: sigs, error: sigErr } = await sb
    .from('signals')
    .select('symbol')
    .eq('category', 'stock')
    .not('symbol', 'is', null)
  if (sigErr) {
    console.error('[snapshot-stock-signal-prices] خطا در خواندن سیگنال‌ها:', sigErr.message)
    process.exit(1)
  }
  const symbols = [...new Set((sigs ?? []).map(s => s.symbol))]
  if (symbols.length === 0) {
    console.log('[snapshot-stock-signal-prices] هنوز هیچ سیگنال سهامی ثبت نشده')
    return
  }

  const res = await fetch(`${SITE}/api/stocks-industries`)
  const data = await res.json()
  const priceMap = new Map()
  for (const ind of data.industries ?? []) {
    for (const s of ind.symbols ?? []) priceMap.set(s.l18, safe(s.pc || s.pl))
  }

  const date = todayShamsi()
  const rows = symbols
    .filter(sym => (priceMap.get(sym) ?? 0) > 0)
    .map(sym => ({ symbol: sym, snap_date: date, price: priceMap.get(sym) }))

  if (rows.length === 0) {
    console.log('[snapshot-stock-signal-prices] قیمت روز هیچ‌کدام از نمادهای سیگنال‌دار در دسترس نبود')
    return
  }

  const { error: upErr } = await sb
    .from('stock_signal_prices')
    .upsert(rows, { onConflict: 'symbol,snap_date' })
  if (upErr) {
    console.error('[snapshot-stock-signal-prices] خطا در ثبت:', upErr.message)
    process.exit(1)
  }
  console.log(`[snapshot-stock-signal-prices] ${rows.length} نماد ثبت شد — ${date}`)
}

main()
