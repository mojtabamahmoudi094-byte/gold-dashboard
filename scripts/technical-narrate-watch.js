#!/usr/bin/env node
/**
 * technical-narrate-watch.js
 *
 * بورس سنج — پست روزانه تحلیل تکنیکال تصویری (P2، الگوی AI-Kline):
 *   ۱) از /api/stocks-industries نمادهای پرنوسان امروز را پیدا می‌کند (سه صعودی‌ترین + سه نزولی‌ترین)
 *   ۲) برای هر نماد، آخرین ۶۰ کندل روزانه را از stock_candles می‌خواند و کارت چارت می‌سازد
 *   ۳) عکس چارت را به Gemini می‌دهد (/api/chart-narrative) تا تفسیر فنی فارسی بنویسد
 *   ۴) عکس + کپشن را به تلگرام می‌فرستد (مستقیم، با fallback به رلهٔ سایت)
 *
 * اجرا | usage:
 *   node technical-narrate-watch.js            # اجرای واقعی، یک‌بار در روز (بعد از بسته‌شدن بازار)
 *   node technical-narrate-watch.js --dry      # فقط گزارش کن، چیزی نساز/نفرست
 *   node technical-narrate-watch.js --force    # بدون گارد ساعت بازار
 *
 * متغیرهای محیطی: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID (یا TELEGRAM_CHAT_ID)، SITE_URL
 * وضعیت در technical-narrate-watch-state.json — هر نماد فقط یک‌بار در روز پست می‌شود.
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

const { sbClient } = require('./codal-company-reports.js')
const { buildTechnicalChartData, renderTechnicalChartCardHtml, screenshotTechnicalChartCard } = require('./technical-chart-card.js')

const SITE = (process.env.SITE_URL || 'https://bourssanj.ir').replace(/\/$/, '')
const CHANNEL_TAG = '@bourssanjj'
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
// مقصد پست‌های عمومی، کانال است — نه چت شخصی/ادمین که TELEGRAM_CHAT_ID برای هشدار خطا استفاده می‌شود
const CHAT_ID = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID
const DRY = process.argv.includes('--dry')
const FORCE = process.argv.includes('--force')

const MAX_PER_RUN = Number(process.env.TECHNICAL_NARRATE_MAX_PER_RUN || 6)
const STATE_FILE = path.join(__dirname, 'technical-narrate-watch-state.json')
const LOG_FILE = path.join(__dirname, 'technical-narrate-watch.log')
const CAPTION_LIMIT = 1024 // محدودیت تلگرام برای کپشن عکس
const capCaption = (s) => (s.length > CAPTION_LIMIT ? s.slice(0, CAPTION_LIMIT - 1) + '…' : s)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try { fs.appendFileSync(LOG_FILE, line) } catch {}
  process.stdout.write(line)
}
const tehranDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })
const faTime = () => new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }).format(new Date())

// فقط بعد از بسته‌شدن بازار سهام (بعد از ۱۲:۳۵ تهران) — تا قیمت پایانی نهایی باشد
function tehranClock() {
  const tehran = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  return { day: tehran.getDay(), mins: tehran.getHours() * 60 + tehran.getMinutes() }
}
function isAfterMarketClose() {
  const { day, mins } = tehranClock()
  return [6, 0, 1, 2, 3].includes(day) && mins > 12 * 60 + 35
}

// ── ۱) صعودی‌ترین + نزولی‌ترین امروز — تعداد از NARRATE_PER_SIDE (پیش‌فرض ۱+۱=۲، quota رایگان Gemini تنگ است) ──
const PER_SIDE = Number(process.env.NARRATE_PER_SIDE || 1)
async function fetchTopMovers() {
  const res = await fetch(`${SITE}/api/stocks-industries`, { headers: { 'cache-control': 'no-store' }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const industries = Array.isArray(data.industries) ? data.industries : []

  const raw = []
  for (const ind of industries) for (const s of ind.symbols || []) {
    if (!s.l18 || s.pcp == null) continue
    raw.push(s)
  }
  // حق تقدم (مثل «دپارسح») رفتار قیمتی سهم پایه را ندارد — نوسان طبیعی/موقتی است، نه الگوی فنی
  // معنادار؛ همان تشخیص isCandleSymbol در candles-lib.js / stocks-industries.js
  const allL18 = new Set(raw.map(s => s.l18))
  const isRightsShare = (s) => /حق تقدم|حق‌تقدم/.test(s.l30 || '') || (s.l18.endsWith('ح') && allL18.has(s.l18.slice(0, -1)))
  const all = raw.filter(s => !isRightsShare(s)).map(s => ({ symbol: s.l18, name: s.l30, pcp: s.pcp, price: s.pl }))
  all.sort((a, b) => b.pcp - a.pcp)
  const gainers = all.slice(0, PER_SIDE)
  const losers = all.slice(-PER_SIDE).reverse()
  return [...gainers, ...losers]
}

// قیمت تعدیل‌شده (adj_*) را ترجیح می‌دهیم — خام با افزایش سرمایه/تقسیم سود یک پرش کاذب نشان می‌دهد
// (همان الگوی candlesAdj در app/technical/[symbol]/page.tsx)
function useAdjusted(rows) {
  return (rows || [])
    .filter(r => r.close != null && r.close > 0)
    .map(r => {
      const c = (r.adj_close != null && r.adj_close > 0) ? r.adj_close : r.close
      return {
        trade_date: r.trade_date, trade_date_shamsi: r.trade_date_shamsi,
        open: r.adj_open ?? r.open ?? c,
        high: r.adj_high ?? r.high ?? c,
        low: r.adj_low ?? r.low ?? c,
        close: c,
        volume: r.volume ?? 0,
      }
    })
}

async function fetchCandles(sb, symbol) {
  const { data, error } = await sb
    .from('stock_candles')
    .select('trade_date, trade_date_shamsi, open, high, low, close, volume, adj_open, adj_high, adj_low, adj_close')
    .eq('symbol', symbol)
    .order('trade_date', { ascending: true })
    .limit(400)
  if (error) throw new Error(`stock_candles «${symbol}»: ${error.message}`)
  return useAdjusted(data)
}

// ── ۲) روایت Gemini از روی عکس چارت ──
// کلید Gemini پروژه رایگان و بدون billing است، بین چند فیچر مشترک (signal-narrative، anomaly-watch،
// چت bourse-analyst) — quota لحظه‌ای گاهی حتی روی اولین درخواست روز پر است (رقابت بیرونی، نه حجم
// خودمان)، پس چند تلاش با تأخیر پیشنهادی خود Gemini لازم است، نه فقط یک بار
const NARRATE_MAX_ATTEMPTS = 4
async function callNarrate(symbol, imageBuf, stats) {
  const res = await fetch(`${SITE}/api/chart-narrative`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, imageBase64: imageBuf.toString('base64'), mimeType: 'image/jpeg', stats }),
    signal: AbortSignal.timeout(60_000),
  })
  return res.json()
}

async function narrateChart(symbol, imageBuf, stats) {
  for (let attempt = 1; attempt <= NARRATE_MAX_ATTEMPTS; attempt++) {
    try {
      const data = await callNarrate(symbol, imageBuf, stats)
      if (data.ok && data.text) return data
      const retryMatch = /retry in ([\d.]+)s/i.exec(data.error || '')
      if (retryMatch && attempt < NARRATE_MAX_ATTEMPTS) {
        const wait = Math.ceil(Number(retryMatch[1])) + 3
        log(`⏳ ${symbol}: quota Gemini پر است (تلاش ${attempt}/${NARRATE_MAX_ATTEMPTS}) — ${wait}ثانیه صبر`)
        await sleep(wait * 1000)
        continue
      }
      log(`⚠️ ${symbol}: روایت Gemini ناموفق — ${data.error || 'پاسخ ناقص'}`)
    } catch (e) { log(`⚠️ ${symbol}: روایت Gemini شکست خورد — ${e.message}`) }
    return null
  }
  return null
}

// api.telegram.org از داخل ایران فیلتر است — اول مستقیم، بعد از راه رلهٔ سایت (خارج از ایران)
async function sendPhoto(buf, caption) {
  try {
    const form = new FormData()
    form.append('chat_id', CHAT_ID)
    form.append('caption', caption)
    form.append('photo', new Blob([buf], { type: 'image/jpeg' }), 'technical.jpg')
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(15_000) })
    const data = await res.json()
    if (data.ok) return
    throw new Error(data.description || 'sendPhoto failed')
  } catch (e) {
    log(`⚠️ ارسال مستقیم عکس ناموفق (${e.message}) — تلاش از راه رله`)
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

const loadState = () => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return { day: null, seen: [] } }
}
const saveState = (st) => fs.writeFileSync(STATE_FILE, JSON.stringify(st))

async function main() {
  const today = tehranDay()
  log(`▶ تحلیل تکنیکال تصویری — چارت‌بین Gemini${DRY ? ' (dry run)' : ''}`)

  if (!FORCE && !isAfterMarketClose()) {
    log('بازار هنوز باز است — بعد از بسته‌شدن بازار اجرا کن (--force برای دور زدن)')
    return
  }
  if (!DRY && (!TOKEN || !CHAT_ID)) {
    log('❌ TELEGRAM_BOT_TOKEN/TELEGRAM_CHANNEL_ID تنظیم نشده')
    process.exit(1)
  }

  const sb = sbClient()
  if (!sb) { log('❌ SUPABASE_URL/SUPABASE_KEY تنظیم نشده'); process.exit(1) }

  const st = loadState()
  const seen = new Set(st.day === today ? st.seen : []) // روز عوض شد → ریست

  const movers = await fetchTopMovers()
  const fresh = movers.filter((m) => !seen.has(m.symbol)).slice(0, MAX_PER_RUN)
  log(`${movers.length} نامزد (۳ صعودی + ۳ نزولی)، ${fresh.length} مورد تازه`)
  for (const m of fresh) log(`  • ${m.symbol} pcp=${m.pcp}`)

  if (DRY || fresh.length === 0) {
    saveState({ day: today, seen: [...seen] })
    return
  }

  const puppeteer = require('puppeteer')
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  let sent = 0
  try {
    for (const m of fresh) {
      try {
        const candles = await fetchCandles(sb, m.symbol)
        const chartData = buildTechnicalChartData(candles)
        if (!chartData) { log(`⏭ ${m.symbol}: کندل کافی نیست`); continue }

        const html = renderTechnicalChartCardHtml(chartData, m.name || m.symbol)
        const buf = await screenshotTechnicalChartCard(browser, html)

        const narrative = await narrateChart(m.symbol, buf, chartData.stats)
        const head = `📊 تحلیل تکنیکال — ${m.symbol}${m.name ? ` (${m.name})` : ''} — بورس سنج`
        const when = `🕐 ${faTime()}`
        const lines = [head, when, '']
        if (narrative?.text) lines.push(narrative.text)
        lines.push(
          '',
          `قیمت پایانی: ${m.price ?? '—'} ریال — تغییر: ${m.pcp >= 0 ? '+' : ''}${m.pcp?.toFixed(1)}٪`,
          '',
          CHANNEL_TAG,
          SITE,
          '⚠️ صرفاً اطلاع‌رسانی است، توصیه مالی نیست.',
        )
        const caption = capCaption(lines.join('\n'))

        await sendPhoto(buf, caption)
        seen.add(m.symbol)
        sent++
        log(`✅ ${m.symbol} ارسال شد`)
      } catch (e) {
        log(`❌ ${m.symbol}: ${e.message}`)
      }
      await sleep(10_000) // فاصله بین نمادها برای کم‌کردن فشار روی quota رایگان Gemini
    }
  } finally {
    await browser.close()
  }

  saveState({ day: today, seen: [...seen] })
  log(`✔ تمام شد — ${sent} پست ارسال شد`)
}

main().catch((e) => { log(`❌ خطای کلی: ${e.message}`); process.exit(1) })
