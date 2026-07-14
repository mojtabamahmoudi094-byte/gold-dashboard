#!/usr/bin/env node
/**
 * stock-shareholders.js
 *
 * بورس سنج — سهامداران عمده هر نماد، از BrsAPI Shareholder.php
 * (before_trade/after_trade امروز → تغییر درصد مالکیت سهامداران عمده در طول روز)
 *
 * روی سرور ایرانی (BrsAPI فقط IP ایران)، روزی یک‌بار بعد از بسته‌شدن بازار:
 *   node stock-shareholders.js
 *
 * راه‌اندازی:
 *   1. اجرای scripts/sql/stock-shareholders.sql در Supabase SQL Editor (یک‌بار)
 *   2. crontab -e  (بعد از ۱۲:۳۵ تهران، هر روز بازار):
 *      TZ=Asia/Tehran
 *      50 12 * * 6,0-3 /usr/bin/node /opt/stock-shareholders.js >> /var/log/stock-shareholders.log 2>&1
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

const KEY = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const FORCE = process.argv.includes('--force')
const ONLY = process.argv.find(a => a.startsWith('--only='))?.slice('--only='.length)

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[stock-shareholders] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
  process.exit(1)
}

// ── تاریخ شمسی (همان الگوریتم sync-bourse.js) ──────────────────────────────
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
function todayShamsiDash() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  const [y, m, d] = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// شنبه–چهارشنبه ۹:۰۰–۱۸:۰۰ تهران — سایر روزها/ساعات معامله‌ای برای مقایسه ثبت نشده
function tehranClock() {
  const tehran = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  return { day: tehran.getDay(), mins: tehran.getHours() * 60 + tehran.getMinutes() }
}
const isMarketDay = (day) => [6, 0, 1, 2, 3].includes(day)

async function main() {
  const { day, mins } = tehranClock()
  if (!FORCE && !(isMarketDay(day) && mins >= 12 * 60 + 30)) {
    console.log('[stock-shareholders] خارج از پنجره اجرا (بعد از ۱۲:۳۰ شنبه–چهارشنبه) — رد شد. با --force اجباری کنید.')
    return
  }

  const { createClient } = require('@supabase/supabase-js')
  let wsTransport
  try { wsTransport = require('ws') } catch { /* Node 22+ */ }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})

  const { data: indRow, error: indErr } = await sb.from('stock_industries').select('data').eq('id', 1).maybeSingle()
  if (indErr || !indRow?.data?.industries) {
    console.error('[stock-shareholders] خواندن stock_industries ناموفق:', indErr?.message)
    process.exit(1)
  }
  let symbols = [...new Set(
    indRow.data.industries.flatMap((ind) => (ind.symbols || []).map((s) => s.l18)).filter(Boolean)
  )]
  if (ONLY) symbols = symbols.filter(s => s === ONLY)
  console.log(`[stock-shareholders] ${symbols.length} نماد`)

  const date = todayShamsiDash()
  let ok = 0, empty = 0, failed = 0

  for (const l18 of symbols) {
    try {
      const url = `https://Api.BrsApi.ir/Tsetmc/Shareholder.php?key=${KEY}&l18=${encodeURIComponent(l18)}&date=${date}`
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      const json = await res.json()
      const before = json?.before_trade?.shareholder
      const after = json?.after_trade?.shareholder
      if (!Array.isArray(before) || !Array.isArray(after) || before.length === 0) {
        empty++
        continue
      }
      const beforeById = new Map(before.map((h) => [h.id, h]))
      const afterById = new Map(after.map((h) => [h.id, h]))
      const ids = new Set([...beforeById.keys(), ...afterById.keys()])
      const holders = [...ids].map((id) => {
        const b = beforeById.get(id), a = afterById.get(id)
        return {
          id,
          name: (a || b).name,
          percent: a ? a.percent : 0,
          percentChange: (a ? a.percent : 0) - (b ? b.percent : 0),
          status: !b ? 'in' : !a ? 'out' : 'hold',   // in=سهامدار تازه, out=خروج کامل امروز, hold=قبلا هم بوده
        }
      }).sort((x, y) => y.percent - x.percent)

      const { error: upErr } = await sb.from('stock_shareholders').upsert({
        symbol: l18,
        data: { date, holders },
        updated: new Date().toISOString(),
      })
      if (upErr) { console.error(`[stock-shareholders] ${l18}: ${upErr.message}`); failed++ }
      else ok++
    } catch (e) {
      failed++
      if (failed <= 5) console.error(`[stock-shareholders] ${l18}: ${e.message}`)
    }
    // سقف نرخ BrsAPI: ۱۰۰۰ درخواست/۵دقیقه — با فاصله ۴۰۰ms خیلی زیر سقف می‌مانیم
    await sleep(400)
  }

  console.log(`[stock-shareholders] پایان — ${ok} ثبت شد، ${empty} بدون داده، ${failed} خطا`)
}

main().catch(e => { console.error(e); process.exit(1) })
