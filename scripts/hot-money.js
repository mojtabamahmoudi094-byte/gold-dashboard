#!/usr/bin/env node
/**
 * hot-money.js
 *
 * بورس سنج — معاملات سنگین/میلیاردی تکی امروز، برای فیلتر «پول داغ» → «خرید و فروش‌های درشت و گروهی»
 *
 * ریزمعاملات (BrsApi Transaction.php) فقط قیمت/حجم/زمان می‌دهد — نه کد خریدار/فروشنده.
 * جهت معامله با «قانون تیک» تخمین زده می‌شود: قیمت بالاتر از معامله قبلی = خرید تهاجمی، پایین‌تر = فروش تهاجمی،
 * مساوی = همان جهت معامله قبلی. ریزمعاملات هم‌زمان و هم‌قیمت پشت‌سرهم یک معامله واحد ادغام‌شده حساب می‌شوند
 * (tick_count = تعداد ردیف ادغام‌شده)، چون معمولاً یک سفارش بزرگ در برابر چند سفارش مقابل جفت شده است.
 *
 * فقط ~۱۵۰ نماد پرارزش‌ترین امروز پردازش می‌شود (نه کل بازار) — هر نماد یک فراخوانی جدا برای ریزمعاملات لازم دارد.
 *
 * روی سرور ایرانی (BrsAPI فقط IP ایران):
 *   node hot-money.js
 *
 * خروجی به جدول hot_trades در Supabase upsert می‌شود (سایت /vip/hot-money از آن می‌خواند)
 * cron: هر ۵ دقیقه، ساعت بازار سهام (نصب در scripts/install-cron.sh)
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

const KEY = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const FORCE = process.argv.includes('--force')
const TOP_N = 150
const HEAVY_TOMAN = 1_000_000_000 // آستانه «سنگین و میلیاردی»: ۱ میلیارد تومان

function tehranClock() {
  const tehran = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  return { day: tehran.getDay(), mins: tehran.getHours() * 60 + tehran.getMinutes() }
}
const STOCKS_OPEN = 9 * 60, STOCKS_CLOSE = 12 * 60 + 30
const isMarketDay = (day) => [6, 0, 1, 2, 3].includes(day)

// تاریخ امروز جلالی (YYYY-MM-DD) — Transaction.php فقط این فرمت را قبول می‌کند
function jalaliDateStr() {
  const fmt = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const parts = fmt.formatToParts(new Date())
  const get = (t) => parts.find((p) => p.type === t).value
  return `${get('year')}-${get('month')}-${get('day')}`
}
function tehranDateStr() {
  const tehran = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  return `${tehran.getFullYear()}-${String(tehran.getMonth() + 1).padStart(2, '0')}-${String(tehran.getDate()).padStart(2, '0')}`
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const clean = (s) => String(s || '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[‌‎‏‪-‮]/g, ' ')
  .replace(/\s+/g, ' ').trim()
const NOT_STOCK_CS = /صندوق|اوراق|تسهیلات|صکوک|اسناد|اختیار|آتی|سپرده|امتیاز|مشارکت|اجاره|مرابحه|خزانه/
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ریزمعاملات یک نماد را به معاملات ادغام‌شده (هم‌زمان+هم‌قیمت پشت‌سرهم) با جهت تخمینی تبدیل می‌کند
function buildHeavyTrades(ticks, prevClose) {
  const rows = (Array.isArray(ticks) ? ticks : []).filter((t) => !t.canceled)
  const groups = []
  for (const t of rows) {
    const price = num(t.price), volume = num(t.volume)
    if (price == null || volume == null) continue
    const last = groups[groups.length - 1]
    if (last && last.time === t.time && last.price === price) {
      last.volume += volume; last.tick_count++
    } else {
      groups.push({ time: t.time, price, volume, tick_count: 1 })
    }
  }

  const out = []
  let prevPrice = prevClose, lastDir = 'buy'
  for (const g of groups) {
    const dir = prevPrice == null ? lastDir : g.price > prevPrice ? 'buy' : g.price < prevPrice ? 'sell' : lastDir
    prevPrice = g.price; lastDir = dir
    const valueToman = (g.volume * g.price) / 10
    if (valueToman >= HEAVY_TOMAN) {
      out.push({ direction: dir, trade_time: g.time, price: g.price, volume: g.volume, value: Math.round(valueToman), tick_count: g.tick_count })
    }
  }
  return out
}

async function main() {
  const { day, mins } = tehranClock()
  const inWindow = isMarketDay(day) && mins >= STOCKS_OPEN && mins <= STOCKS_CLOSE
  if (!FORCE && !inWindow) {
    console.log('[hot-money] خارج از ساعت بازار سهام (شنبه–چهارشنبه ۹:۰۰–۱۲:۳۰ تهران) — رد شد. با --force اجباری کنید.')
    return
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[hot-money] SUPABASE_URL/KEY تنظیم نشده — رد شد')
    return
  }

  const listUrl = `https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${KEY}`
  const listRes = await fetch(listUrl, { signal: AbortSignal.timeout(120_000) })
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} (AllSymbols)`)
  const listData = await listRes.json()
  const arr = Array.isArray(listData) ? listData : (listData?.symbols ?? listData?.data ?? [])
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('پاسخ AllSymbols خالی است')

  const allL18 = new Set(arr.map((it) => clean(it.l18)))
  const isStock = (it) => {
    const cs = clean(it.cs), l18 = clean(it.l18), l30 = clean(it.l30)
    if (!l18) return false
    if (cs && NOT_STOCK_CS.test(cs)) return false
    if (/[0-9۰-۹]/.test(l18)) return false
    if (/حق تقدم|حق‌تقدم/.test(l30)) return false
    if (l18.endsWith('ح') && allL18.has(l18.slice(0, -1))) return false
    return true
  }

  const ranked = arr.filter(isStock)
    .map((it) => ({ sym: clean(it.l18), tval: num(it.tval) ?? 0, pc: num(it.pc) }))
    .sort((a, b) => b.tval - a.tval)
    .slice(0, TOP_N)

  console.log(`${ranked.length} نماد پرارزش‌ترین — دریافت ریزمعاملات یکی‌یکی…`)

  const jDate = jalaliDateStr()
  const today = tehranDateStr()
  const rows = []
  for (const { sym, pc } of ranked) {
    try {
      const url = `https://Api.BrsApi.ir/Tsetmc/Transaction.php?key=${KEY}&l18=${encodeURIComponent(sym)}&date=${jDate}`
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      if (!res.ok) { console.error(`  ${sym}: HTTP ${res.status}`); continue }
      const ticks = await res.json()
      if (!Array.isArray(ticks)) continue // پاسخ خطا (مثلاً {successful:false}) — رد می‌شود
      const heavy = buildHeavyTrades(ticks, pc)
      for (const h of heavy) {
        rows.push({ symbol: sym, trade_date: today, updated: new Date().toISOString(), ...h })
      }
    } catch (e) {
      console.error(`  ${sym}: ${e.message}`)
    }
    await sleep(150) // ملایم روی API — فراخوانی تک‌به‌تک است
  }
  // دو گروه غیرمتوالی ممکن است هم‌زمان و هم‌قیمت و هم‌جهت باشند (کلید یکسان) — ادغام قبل از upsert
  // وگرنه Postgres با «ON CONFLICT DO UPDATE command cannot affect row a second time» خطا می‌دهد
  const dedup = new Map()
  for (const r of rows) {
    const k = `${r.symbol}|${r.trade_date}|${r.trade_time}|${r.price}|${r.direction}`
    const ex = dedup.get(k)
    if (ex) { ex.volume += r.volume; ex.value += r.value; ex.tick_count += r.tick_count; ex.updated = r.updated }
    else dedup.set(k, r)
  }
  const dedupedRows = [...dedup.values()]
  console.log(`${dedupedRows.length} معامله سنگین/میلیاردی یکتا (≥۱ میلیارد تومان) پیدا شد`)

  if (dedupedRows.length === 0) return
  const { createClient } = require('@supabase/supabase-js')
  let wsTransport
  try { wsTransport = require('ws') } catch { /* Node 22+ نیازی ندارد */ }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY,
    wsTransport ? { realtime: { transport: wsTransport } } : {})

  for (let i = 0; i < dedupedRows.length; i += 500) {
    const chunk = dedupedRows.slice(i, i + 500)
    const { error } = await sb.from('hot_trades').upsert(chunk, { onConflict: 'symbol,trade_date,trade_time,price,direction' })
    if (error) throw new Error(`Supabase upsert: ${error.message}`)
  }
  console.log('✅ Supabase (hot_trades) بروز شد')
}

main().catch((e) => { console.error(e); process.exit(1) })
