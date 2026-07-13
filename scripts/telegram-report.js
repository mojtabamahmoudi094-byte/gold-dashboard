#!/usr/bin/env node
/**
 * گزارش تصویری + متنی «رصد لحظه‌ای» به تلگرام — بورس سنج
 * Live-watch screenshot + smart caption reporter → Telegram
 *
 * اجرا | Usage:
 *   node scripts/telegram-report.js stocks     # صفحه رصد لحظه‌ای بازار سهام
 *   node scripts/telegram-report.js funds      # صندوق‌های طلا، نقره، زعفران
 *
 * متغیرهای محیطی لازم | Required env (روی سرور | on the server):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 * اختیاری | Optional:
 *   SITE_URL   (پیش‌فرض | default: https://bourssanj.ir)
 *   REPORT_FRESH_ONLY=1  → فقط وقتی داده مربوط به امروزِ تهران است بفرست
 *                          only send when data belongs to today (Tehran)
 */

const path = require('path')
const os = require('os')
const fs = require('fs')

// ── تنظیمات | config ────────────────────────────────────────────────
const SITE = (process.env.SITE_URL || 'https://bourssanj.ir').replace(/\/$/, '')
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID
const FRESH_ONLY = process.env.REPORT_FRESH_ONLY === '1'

// نگاشت دسته → عنوان، ایموجی، مسیر مانیتور
// category → title, emoji, monitor path
const CATS = {
  stocks:  { emoji: '📊', title: 'رصد لحظه‌ای بازار سهام', path: '/monitor/stocks' },
  gold:    { emoji: '🥇', title: 'رصد لحظه‌ای صندوق‌های طلا', path: '/monitor/gold' },
  silver:  { emoji: '🥈', title: 'رصد لحظه‌ای صندوق‌های نقره', path: '/monitor/silver' },
  saffron: { emoji: '🌸', title: 'رصد لحظه‌ای صندوق‌های زعفران', path: '/monitor/saffron' },
}

// دسته‌بندی هر «کار» cron | which cats each cron job sends
const JOBS = {
  stocks: ['stocks'],
  funds:  ['gold', 'silver', 'saffron'],
}

// ── کمکی‌ها | helpers ───────────────────────────────────────────────
const faDate = () =>
  new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())
const faTime = () =>
  new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }).format(new Date())
const tehranDay = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })

const num = (v, dec = 0) =>
  v == null || Number.isNaN(Number(v))
    ? '—'
    : Number(v).toLocaleString('fa-IR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// آخرین ردیف market_watch را از API عمومی می‌گیرد
// fetch latest market_watch row from the public API
async function fetchLatest(cat) {
  try {
    const res = await fetch(`${SITE}/api/market-watch?cat=${encodeURIComponent(cat)}`, {
      headers: { 'cache-control': 'no-store' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const rows = Array.isArray(data.rows) ? data.rows : []
    if (!rows.length) return { date: data.date, last: null }
    return { date: data.date, last: rows[rows.length - 1] }
  } catch (e) {
    console.error(`[report] fetch data failed (${cat}):`, e.message)
    return null
  }
}

// تلگرام کپشن عکس را حداکثر ۱۰۲۴ کاراکتر می‌پذیرد (نه ۴۰۹۶ مثل پیام متنی معمولی)
// Telegram photo captions are capped at 1024 chars (unlike the 4096 limit for text messages)
const CAPTION_LIMIT = 1024
const capCaption = (s) => (s.length > CAPTION_LIMIT ? s.slice(0, CAPTION_LIMIT - 1) + '…' : s)

// روایت روان Gemini روی همان اعداد قاعده‌محور — از endpoint موجود سایت
// اگر شکست بخورد، کپشن قاعده‌محور خام بدون تغییر ارسال می‌شود
async function narrate(title, facts) {
  try {
    const res = await fetch(`${SITE}/api/signal-narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: title, reason: facts }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json()
    if (data.ok && data.text) return data.text
  } catch (e) { console.error(`[report] narrate failed: ${e.message}`) }
  return null
}

// ساخت کپشن هوشمند از آخرین سنجه‌ها
// build a smart caption from the latest metrics
async function buildCaption(cat, snap) {
  const c = CATS[cat]
  const head = `${c.emoji} ${c.title} — بورس سنج`
  const when = `🕘 ${faTime()} — ${faDate()}`
  const facts = []

  const d = snap && snap.last
  if (d) {
    // فیلدهای خام market_watch → واحدهای صفحه مانیتور
    // raw market_watch fields → monitor-page units (see app/monitor/[cat]/page.tsx)
    if (d.money_in != null) {
      const flow = Number(d.money_in) / 1e10 // میلیارد تومان
      facts.push(`${flow >= 0 ? '💚' : '❤️'} ورود پول حقیقی: ${num(flow, 1)} میلیارد تومان`)
    }
    if (d.buyq != null || d.sellq != null)
      facts.push(`🟢 صف خرید: ${num(d.buyq)}   🔴 صف فروش: ${num(d.sellq)}`)
    if (d.sym_pos != null || d.sym_neg != null)
      facts.push(`📈 نماد مثبت: ${num(d.sym_pos)}   📉 منفی: ${num(d.sym_neg)}`)
    if (d.tval_total != null)
      facts.push(`💰 ارزش کل معاملات: ${num(Number(d.tval_total) / 1e10)} میلیارد تومان`)
    if (d.ind_buy_pc != null || d.ind_sell_pc != null)
      facts.push(`👤 سرانه خرید/فروش حقیقی: ${num(Number(d.ind_buy_pc) / 1e7, 1)} / ${num(Number(d.ind_sell_pc) / 1e7, 1)} م.ت`)
  } else {
    facts.push('— داده لحظه‌ای در دسترس نیست —')
  }

  const lines = [head, when, '']
  if (d && facts.length) {
    const narrated = await narrate(c.title, facts.join('\n'))
    if (narrated) lines.push(narrated, '')
  }
  lines.push(...facts, '', `${SITE}${c.path}`)
  return capCaption(lines.join('\n'))
}

// عکس صفحه با puppeteer | screenshot a page via puppeteer
async function screenshot(browser, url) {
  const page = await browser.newPage()
  await page.setViewport({ width: 900, height: 1400, deviceScaleFactor: 2 })
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 })
  // مهلت برای رندر نمودارها | let charts render
  await sleep(5000)
  const buf = await page.screenshot({ fullPage: true, type: 'png' })
  await page.close()
  return buf
}

// ارسال عکس به تلگرام | send a photo to Telegram
async function sendPhoto(buf, caption) {
  const form = new FormData()
  form.append('chat_id', CHAT_ID)
  form.append('caption', caption)
  form.append('photo', new Blob([buf], { type: 'image/png' }), 'report.png')
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: 'POST', body: form })
  const data = await res.json()
  if (!data.ok) throw new Error(data.description || 'sendPhoto failed')
}

// ── اجرای اصلی | main ───────────────────────────────────────────────
async function main() {
  const job = process.argv[2]
  if (!JOBS[job]) {
    console.error(`استفاده | usage: node telegram-report.js <${Object.keys(JOBS).join('|')}>`)
    process.exit(1)
  }
  if (!TOKEN || !CHAT_ID) {
    console.error('❌ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID تنظیم نشده')
    process.exit(1)
  }

  const cats = JOBS[job]
  const today = tehranDay()

  const puppeteer = require('puppeteer')
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  let sent = 0
  try {
    for (const cat of cats) {
      const c = CATS[cat]
      const snap = await fetchLatest(cat)

      // نگهبان تازگی داده | freshness guard
      if (FRESH_ONLY && snap && snap.date && snap.date !== today) {
        console.log(`[report] skip ${cat}: داده مربوط به ${snap.date} است، نه امروز`)
        continue
      }

      const buf = await screenshot(browser, `${SITE}${c.path}`)
      await sendPhoto(buf, await buildCaption(cat, snap))
      console.log(`[report] ✅ sent ${cat}`)
      sent++
      if (cats.length > 1) await sleep(1500) // فاصله بین ارسال‌ها | throttle
    }
  } finally {
    await browser.close()
  }
  console.log(`[report] done — ${sent}/${cats.length}`)
}

main().catch((e) => {
  console.error('[report] fatal:', e)
  process.exit(1)
})
