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
const CHANNEL_TAG = '@bourssanjj'
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
// مقصد پست‌های عمومی، کانال است — نه چت شخصی/ادمین که TELEGRAM_CHAT_ID برای هشدار خطا استفاده می‌شود
const CHAT_ID = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID
const FRESH_ONLY = process.env.REPORT_FRESH_ONLY === '1'
const { renderMarketCardHtml, screenshotCard } = require('./telegram-card')

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

// ردیف‌های امروزِ market_watch را از API عمومی می‌گیرد (کل روز، برای چارت‌ها)
// fetch today's market_watch rows from the public API (full day, for charts)
async function fetchDay(cat) {
  try {
    const res = await fetch(`${SITE}/api/market-watch?cat=${encodeURIComponent(cat)}`, {
      headers: { 'cache-control': 'no-store' },
      signal: AbortSignal.timeout(90_000), // کلد-استارت Render
    })
    if (!res.ok) return null
    const data = await res.json()
    const rows = Array.isArray(data.rows) ? data.rows : []
    return { date: data.date, rows, last: rows.length ? rows[rows.length - 1] : null }
  } catch (e) {
    console.error(`[report] fetch data failed (${cat}):`, e.message)
    return null
  }
}

// حداکثر این‌قدر نقطه رو رو چارت نشون می‌دیم — ردیف‌های ۵ دقیقه‌ای رو یکنواخت نمونه‌برداری می‌کنیم
// so the chart stays readable regardless of the row cadence (5-min stocks vs sparser fund rows)
const MAX_CHART_POINTS = 10
function sampleRows(rows) {
  if (rows.length <= MAX_CHART_POINTS) return rows
  const n = MAX_CHART_POINTS
  const idx = Array.from({ length: n }, (_, i) => Math.round((i * (rows.length - 1)) / (n - 1)))
  return [...new Set(idx)].map((i) => rows[i])
}

// ردیف‌های روز → سری زمانی هر سنجه، برای چارت‌های کارت
// day rows → per-metric time series, for the card charts
function computeSeries(rows) {
  const sampled = sampleRows(rows)
  const times = sampled.map((r) =>
    new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }).format(new Date(r.ts))
  )
  const pick = (fn) => sampled.map((r) => { const v = fn(r); return v == null || Number.isNaN(Number(v)) ? 0 : Number(v) })
  return {
    times,
    flow: pick((r) => r.money_in != null ? Number(r.money_in) / 1e10 : null),
    tval: pick((r) => r.tval_total != null ? Number(r.tval_total) / 1e10 : null),
    queue: { buy: pick((r) => r.buyq), sell: pick((r) => r.sellq) },
    sym: { pos: pick((r) => r.sym_pos), neg: pick((r) => r.sym_neg) },
    pc: { buy: pick((r) => r.ind_buy_pc != null ? Number(r.ind_buy_pc) / 1e7 : null), sell: pick((r) => r.ind_sell_pc != null ? Number(r.ind_sell_pc) / 1e7 : null) },
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

const signed = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${num(v)}`)

// تغییر یک سنجه نسبت به گزارش (ردیف) قبلی — null اگر یکی از دو مقدار موجود نباشد
const deltaOf = (prev, cur) => (prev == null || cur == null ? null : Number(cur) - Number(prev))

// اعداد خام market_watch → کارت/کپشن (یک‌بار محاسبه، هم برای عکس هم برای متن)
// raw market_watch fields → card highlight + rows / caption facts (computed once, used by both the image and the text)
// rows: همهٔ ردیف‌های امروز — آخری برای اعداد لحظه‌ای، یکی‌مانده‌به‌آخر برای «تغییر نسبت به گزارش قبلی»
function computeFacts(rows) {
  const empty = { highlight: null, rows: [], deltas: null }
  if (!rows || !rows.length) return empty
  const d = rows[rows.length - 1]
  const out = { highlight: null, rows: [], deltas: null }
  // فیلدهای خام market_watch → واحدهای صفحه مانیتور (see app/monitor/[cat]/page.tsx)
  if (d.money_in != null) {
    const flow = Number(d.money_in) / 1e10 // میلیارد تومان
    out.highlight = { label: 'ورود / خروج پول حقیقی (میلیارد تومان)', value: `${flow >= 0 ? '+' : ''}${num(flow, 1)}`, tone: flow >= 0 ? 'up' : 'down' }
  }
  if (d.buyq != null || d.sellq != null)
    out.rows.push({ label: 'صف خرید / فروش', value: `${num(d.buyq)} / ${num(d.sellq)}` })
  if (d.sym_pos != null || d.sym_neg != null)
    out.rows.push({ label: 'نماد مثبت / منفی', value: `${num(d.sym_pos)} / ${num(d.sym_neg)}` })
  if (d.tval_total != null)
    out.rows.push({ label: 'ارزش کل معاملات', value: `${num(Number(d.tval_total) / 1e10)} میلیارد تومان` })
  if (d.ind_buy_pc != null || d.ind_sell_pc != null)
    out.rows.push({ label: 'سرانه خرید/فروش حقیقی', value: `${num(Number(d.ind_buy_pc) / 1e7, 1)} / ${num(Number(d.ind_sell_pc) / 1e7, 1)} م.ت` })

  if (rows.length >= 2) {
    const p = rows[rows.length - 2]
    out.deltas = {
      buyq: deltaOf(p.buyq, d.buyq),
      sellq: deltaOf(p.sellq, d.sellq),
      sym_pos: deltaOf(p.sym_pos, d.sym_pos),
      sym_neg: deltaOf(p.sym_neg, d.sym_neg),
    }
  }
  return out
}

// ساخت کپشن هوشمند از آخرین سنجه‌ها
// build a smart caption from the latest metrics
async function buildCaption(cat, facts) {
  const c = CATS[cat]
  const head = `${c.emoji} ${c.title} — بورس سنج`
  const when = `🕘 ${faTime()} — ${faDate()}`
  const allRows = facts.highlight ? [{ label: 'ورود / خروج پول حقیقی', value: `${facts.highlight.value} میلیارد تومان` }, ...facts.rows] : facts.rows
  const factLines = allRows.length ? allRows.map(r => `• ${r.label}: ${r.value}`) : ['— داده لحظه‌ای در دسترس نیست —']

  const lines = [head, when, '']
  if (allRows.length) {
    const narrated = await narrate(c.title, factLines.join('\n'))
    if (narrated) lines.push(narrated, '')
  }
  lines.push(...factLines)

  const dl = facts.deltas
  if (dl && (dl.buyq != null || dl.sellq != null || dl.sym_pos != null || dl.sym_neg != null)) {
    lines.push('', '🔄 تغییرات نسبت به گزارش قبلی:')
    if (dl.buyq != null || dl.sellq != null)
      lines.push(`• صف خرید / فروش: ${signed(dl.buyq)} / ${signed(dl.sellq)}`)
    if (dl.sym_pos != null || dl.sym_neg != null)
      lines.push(`• نماد مثبت / منفی: ${signed(dl.sym_pos)} / ${signed(dl.sym_neg)}`)
  }

  lines.push('', CHANNEL_TAG, SITE)
  return capCaption(lines.join('\n'))
}

// کارت گرافیکی چارت‌دار از رو سری زمانی امروز (نه اسکرین‌شات از سایت)
function buildCardHtml(cat, series) {
  const c = CATS[cat]
  return renderMarketCardHtml({
    emoji: c.emoji,
    title: c.title,
    subtitle: null,
    times: series.times,
    flow: series.flow,
    tval: series.tval,
    queue: series.queue,
    sym: series.sym,
    pc: series.pc,
    footer: `${faTime()} — ${faDate()}`,
  })
}

// ارسال عکس به تلگرام | send a photo to Telegram
// api.telegram.org از داخل ایران فیلتر است — اول مستقیم، بعد از راه رلهٔ سایت (خارج از ایران)
async function sendPhoto(buf, caption) {
  try {
    const form = new FormData()
    form.append('chat_id', CHAT_ID)
    form.append('caption', caption)
    form.append('photo', new Blob([buf], { type: 'image/jpeg' }), 'report.jpg')
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(15_000) })
    const data = await res.json()
    if (data.ok) return
    throw new Error(data.description || 'sendPhoto failed')
  } catch (e) {
    console.error(`[report] ارسال مستقیم عکس ناموفق (${e.message}) — تلاش از راه رله`)
  }

  const res = await fetch(`${SITE}/api/telegram-relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, chat_id: CHAT_ID, photo: buf.toString('base64'), caption }),
    signal: AbortSignal.timeout(90_000), // کلد-استارت Render
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error || `relay HTTP ${res.status}`)
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
      const snap = await fetchDay(cat)

      // نگهبان تازگی داده | freshness guard
      if (FRESH_ONLY && snap && snap.date && snap.date !== today) {
        console.log(`[report] skip ${cat}: داده مربوط به ${snap.date} است، نه امروز`)
        continue
      }

      // اگر fetch شکست خورد یا هیچ ردیفی نبود، گزارش خالی نفرست — ساکت رد شو
      // if the fetch failed or there are zero rows, don't send a hollow report — skip silently
      if (!snap || !snap.rows.length) {
        console.log(`[report] skip ${cat}: هیچ دادهٔ لحظه‌ای در دسترس نیست`)
        continue
      }

      const facts = computeFacts(snap.rows)
      const series = computeSeries(snap.rows)
      const buf = await screenshotCard(browser, buildCardHtml(cat, series))
      await sendPhoto(buf, await buildCaption(cat, facts))
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
