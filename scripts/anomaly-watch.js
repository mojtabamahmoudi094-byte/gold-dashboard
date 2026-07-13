#!/usr/bin/env node
/**
 * anomaly-watch.js
 *
 * بورس سنج — رصدگر نوسان غیرعادی لحظه‌ای. هر بار اجرا می‌شود (کنار cron ۵ دقیقه‌ای stocks-industries):
 *   ۱) آخرین اسنپ‌شات /api/stocks-industries را می‌خواند
 *   ۲) نمادهایی که به سقف/کف دامنه نوسان نزدیک شده‌اند یا نسبت گردش معاملات به ارزش بازارشان غیرعادی است را پیدا می‌کند
 *   ۳) برای هر نامزد (یک‌بار در روز): عکس چارت + کپشن (خلاصهٔ Gemini روی همان اعداد، بدون عدد اختراعی) به تلگرام می‌فرستد
 *
 * اجرا | usage:
 *   node scripts/anomaly-watch.js            # اجرای واقعی
 *   node scripts/anomaly-watch.js --dry      # فقط گزارش کن، چیزی نساز/نفرست
 *
 * متغیرهای محیطی (از .env.sync یا .env.local خوانده می‌شود، یا در محیط cron):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SITE_URL (پیش‌فرض https://bourssanj.ir)
 *   ANOMALY_PCP_THRESHOLD (پیش‌فرض ۴.۷ — درصد فاصله تا دامنه نوسان معمول)
 *   ANOMALY_TURNOVER_THRESHOLD (پیش‌فرض ۰.۰۵ — نسبت ارزش معاملات به ارزش بازار)
 *   ANOMALY_MAX_PER_RUN (پیش‌فرض ۴)
 *
 * وضعیت در anomaly-watch-state.json نگه داشته می‌شود تا هر نماد فقط یک‌بار در روز برای هر دلیل هشدار بگیرد.
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

const SITE = (process.env.SITE_URL || 'https://bourssanj.ir').replace(/\/$/, '')
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
// مقصد پست‌های عمومی، کانال است — نه چت شخصی/ادمین که TELEGRAM_CHAT_ID برای هشدار خطا استفاده می‌شود
const CHAT_ID = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID
const DRY = process.argv.includes('--dry')
const FORCE = process.argv.includes('--force')

// ساعت بازار تهران — فقط سهام ۹:۰۰–۱۲:۳۵، شنبه تا چهارشنبه (همان گارد stocks-industries.js)
function tehranClock() {
  const tehran = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  return { day: tehran.getDay(), mins: tehran.getHours() * 60 + tehran.getMinutes() }
}
function isMarketOpen() {
  const { day, mins } = tehranClock()
  return [6, 0, 1, 2, 3].includes(day) && mins >= 9 * 60 && mins <= 12 * 60 + 35
}

const PCP_THRESHOLD = Number(process.env.ANOMALY_PCP_THRESHOLD || 4.7)
const TURNOVER_THRESHOLD = Number(process.env.ANOMALY_TURNOVER_THRESHOLD || 0.05)
const MAX_PER_RUN = Number(process.env.ANOMALY_MAX_PER_RUN || 4)

const STATE_FILE = path.join(__dirname, 'anomaly-watch-state.json')
const LOG_FILE = path.join(__dirname, 'anomaly-watch.log')

// تلگرام کپشن عکس را حداکثر ۱۰۲۴ کاراکتر می‌پذیرد (نه ۴۰۹۶ مثل پیام متنی معمولی)
const CAPTION_LIMIT = 1024
const capCaption = (s) => (s.length > CAPTION_LIMIT ? s.slice(0, CAPTION_LIMIT - 1) + '…' : s)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try { fs.appendFileSync(LOG_FILE, line) } catch {}
  process.stdout.write(line)
}

const faNum = (v, dec = 0) =>
  v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('fa-IR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const toman = (rial) => (rial == null ? '—' : faNum(rial / 1e10, 1)) // ریال → میلیارد تومان
const tehranDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })
const faTime = () => new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }).format(new Date())

// ── ۱) اسنپ‌شات لحظه‌ای را می‌گیرد و نامزدهای غیرعادی را استخراج می‌کند ──
async function fetchCandidates() {
  const res = await fetch(`${SITE}/api/stocks-industries`, { headers: { 'cache-control': 'no-store' }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const industries = Array.isArray(data.industries) ? data.industries : []

  const out = []
  for (const ind of industries) {
    for (const s of ind.symbols || []) {
      if (!s.l18 || s.pcp == null) continue
      const turnover = s.tval != null && s.mv ? s.tval / s.mv : null

      if (Math.abs(s.pcp) >= PCP_THRESHOLD) {
        out.push({ symbol: s.l18, name: s.l30, reasonTag: 'band', s, score: Math.abs(s.pcp), turnover })
      } else if (turnover != null && turnover >= TURNOVER_THRESHOLD) {
        out.push({ symbol: s.l18, name: s.l30, reasonTag: 'turnover', s, score: turnover * 20, turnover })
      }
    }
  }
  out.sort((a, b) => b.score - a.score)
  return out
}

// ── ۲) کپشن قاعده‌محور (اعداد تضمیناً درست) ──
function buildFacts(c) {
  const { s, turnover } = c
  const lines = []
  lines.push(`نماد: ${c.symbol}${c.name ? ` (${c.name})` : ''}`)
  lines.push(`قیمت پایانی: ${faNum(s.pc)} ریال — تغییر: ${s.pcp >= 0 ? '+' : ''}${faNum(s.pcp, 1)}٪`)
  if (s.tval != null) lines.push(`ارزش معاملات: ${toman(s.tval)} میلیارد تومان`)
  if (turnover != null) lines.push(`نسبت ارزش معاملات به ارزش بازار: ${faNum(turnover * 100, 1)}٪`)
  if (c.reasonTag === 'band') lines.push('علت هشدار: نزدیک/برخورد به سقف یا کف دامنهٔ نوسان روزانه')
  else lines.push('علت هشدار: حجم معاملات نسبت به ارزش بازار غیرعادی است')
  return lines.join('\n')
}

// ── ۳) روایت Gemini روی همان اعداد (از endpoint موجود سایت — بدون کلید جدا) ──
async function narrate(c, facts) {
  try {
    const res = await fetch(`${SITE}/api/signal-narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'رصد لحظه‌ای نوسان غیرعادی', symbol: c.symbol, reason: facts }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json()
    if (data.ok && data.text) return data.text
  } catch (e) { log(`⚠️ ${c.symbol}: روایت Gemini شکست خورد — ${e.message}`) }
  return null
}

const { renderCardHtml, screenshotCard } = require('./telegram-card')

// ── کارت گرافیکی از رو همون اعداد (نه اسکرین‌شات از سایت) ──
function buildCardHtml(c) {
  const { s, turnover } = c
  const up = s.pcp >= 0
  return renderCardHtml({
    emoji: '🚨',
    title: `${c.symbol}${c.name ? ` — ${c.name}` : ''}`,
    subtitle: c.reasonTag === 'band' ? 'نزدیک سقف/کف دامنهٔ نوسان' : 'حجم معاملات غیرعادی',
    bigStat: { value: `${up ? '+' : ''}${faNum(s.pcp, 1)}٪`, label: `قیمت پایانی ${faNum(s.pc)} ریال`, tone: up ? 'up' : 'down' },
    rows: [
      s.tval != null ? { label: 'ارزش معاملات', value: `${toman(s.tval)} میلیارد تومان` } : null,
      turnover != null ? { label: 'نسبت معاملات به ارزش بازار', value: `${faNum(turnover * 100, 1)}٪` } : null,
    ].filter(Boolean),
    footer: `${faTime()} — رصد لحظه‌ای بورس سنج`,
  })
}

// api.telegram.org از داخل ایران فیلتر است — اول مستقیم، بعد از راه رلهٔ سایت (خارج از ایران)
async function sendPhoto(buf, caption) {
  try {
    const form = new FormData()
    form.append('chat_id', CHAT_ID)
    form.append('caption', caption)
    form.append('photo', new Blob([buf], { type: 'image/jpeg' }), 'anomaly.jpg')
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
  log(`▶ رصدگر نوسان غیرعادی — pcp≥${PCP_THRESHOLD}٪ | turnover≥${(TURNOVER_THRESHOLD * 100).toFixed(0)}٪${DRY ? ' (dry run)' : ''}`)

  if (!FORCE && !isMarketOpen()) {
    log('بازار سهام باز نیست — رد شد (--force برای دور زدن)')
    return
  }

  if (!DRY && (!TOKEN || !CHAT_ID)) {
    log('❌ TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID تنظیم نشده')
    process.exit(1)
  }

  const st = loadState()
  const seen = new Set(st.day === today ? st.seen : []) // روز عوض شد → ریست

  const all = await fetchCandidates()
  const fresh = all.filter((c) => !seen.has(`${c.symbol}|${c.reasonTag}`)).slice(0, MAX_PER_RUN)

  log(`${all.length} نامزد یافت شد، ${fresh.length} مورد تازه (سقف ${MAX_PER_RUN} در هر اجرا)`)
  for (const c of fresh) log(`  • ${c.symbol} [${c.reasonTag}] pcp=${c.s.pcp} score=${c.score.toFixed(2)}`)

  if (DRY || fresh.length === 0) {
    saveState({ day: today, seen: [...seen] })
    return
  }

  const puppeteer = require('puppeteer')
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  let sent = 0
  try {
    for (const c of fresh) {
      try {
        const facts = buildFacts(c)
        const narrative = await narrate(c, facts)
        const head = `🚨 رصد لحظه‌ای — ${c.symbol} — بورس سنج`
        const when = `🕘 ${faTime()}`
        const lines = [head, when, '']
        if (narrative) lines.push(narrative, '', facts) // روایت + اعداد خام برای صحت‌سنجی
        else lines.push(facts) // روایت نبود، فقط اعداد قاعده‌محور
        lines.push(
          '',
          `#${c.symbol.replace(/\s+/g, '_')}`,
          `${SITE}/stock/${encodeURIComponent(c.symbol)}`,
          '⚠️ صرفاً اطلاع‌رسانی است، توصیه مالی نیست.',
        )
        const caption = capCaption(lines.join('\n'))

        const buf = await screenshotCard(browser, buildCardHtml(c))
        await sendPhoto(buf, caption)
        seen.add(`${c.symbol}|${c.reasonTag}`)
        sent++
        log(`✅ ${c.symbol} ارسال شد`)
      } catch (e) {
        log(`❌ ${c.symbol}: ${e.message}`)
      }
      await sleep(2000)
    }
  } finally {
    await browser.close()
  }

  saveState({ day: today, seen: [...seen] })
  log(`✔ تمام شد — ✅${sent}/${fresh.length}`)
}

main().catch((e) => { log(`FATAL ${(e && e.stack) || e}`); process.exit(1) })
