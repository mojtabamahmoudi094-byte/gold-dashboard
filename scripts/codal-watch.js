#!/usr/bin/env node
/**
 * codal-watch.js
 *
 * بورس سنج — دیده‌بان کدال. هر بار که اجرا می‌شود:
 *   ۱) اطلاعیه‌های تازهٔ کدال را می‌گیرد (گزارش فعالیت ماهانه / صورت‌های مالی)
 *   ۲) نمادهایی که اطلاعیهٔ جدید دارند را جدا می‌کند (نه همهٔ ۶۷۵ نماد)
 *   ۳) فقط همان‌ها را دوباره پارس و در جدول stock_reports سوپابیس upsert می‌کند
 *
 * سایت از /api/stock-reports/<نماد> می‌خواند ⇒ بدون rebuild و بدون commit به‌روز می‌شود.
 *
 * روی سرور ایرانی (کرون هر ۳۰ دقیقه در ساعات باز بودن کدال):
 *   node codal-watch.js                 → اطلاعیه‌های ۳۶ ساعت اخیر
 *   node codal-watch.js --hours 72      → بازهٔ بلندتر (جبران قطعی)
 *   node codal-watch.js --dry           → فقط گزارش کن، چیزی نساز
 *
 * حالت خام (کرون جدا هر ۲ دقیقه) — هر اطلاعیهٔ هر نمادی را بدون فیلتر دسته و
 * بدون پارس مالی فوری به تلگرام فوروارد می‌کند (برای مصرف سریع ایجنت بیرونی):
 *   node codal-watch.js --raw           → اطلاعیه‌های ۳ ساعت اخیر، فقط forward
 *
 * وضعیت در codal-watch-state.json نگه داشته می‌شود تا یک اطلاعیه دوبار پردازش نشود
 * (seen برای حالت عادی، seenRaw جدا برای حالت خام).
 */

'use strict'

const path = require('path')
const fs   = require('fs')

const { buildSymbol, sbClient, OUT_DIR, faDate } = require('./codal-company-reports.js')
const { fetchAuditLetter } = require('./codal-letter-extract.js')
const { buildMonthlyReportData, renderMonthlyReportCardHtml, screenshotMonthlyReportCard } = require('./monthly-report-card.js')
const { buildQuarterlyReportData, renderQuarterlyReportCardHtml, screenshotQuarterlyReportCard } = require('./quarterly-report-card.js')
const { TELEGRAM_CHANNEL } = require('./brand-assets.js')

const KEY = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
// مقصد پست‌های عمومی، کانال است — نه چت شخصی/ادمین که TELEGRAM_CHAT_ID برای هشدار خطا استفاده می‌شود
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID
// مقصد هشدارهای عملیاتی (صف پرحجم و…) — چت خام ادمین، نه کانال عمومی
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const SITE = process.env.SITE_URL || 'https://bourssanj.ir'
const DRY = process.argv.includes('--dry')
const RAW = process.argv.includes('--raw')
const hoursIdx = process.argv.indexOf('--hours')
const HOURS = hoursIdx !== -1 ? Number(process.argv[hoursIdx + 1]) : (RAW ? 3 : 36)

const STATE_FILE = path.join(__dirname, 'codal-watch-state.json')
const LOG_FILE   = path.join(__dirname, 'codal-watch.log')
const SEEN_CAP   = 5000
const SEEN_RAW_CAP = 8000

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try { fs.appendFileSync(LOG_FILE, line) } catch {}
  process.stdout.write(line)
}

const norm = (s) => String(s || '')
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/ۀ|ة/g, 'ه')
  .replace(/[‌‎‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim()

// همان فیلترهای codal-company-reports.js — فقط گزارش‌هایی که واقعاً پارس می‌کنیم
const isMonthlyTitle   = (t) => /گزارش فعالیت ماهانه/.test(t)
const isQuarterlyTitle = (t) =>
  (/میاندوره|میان دوره/.test(t.replace(/‌/g, '')) && /دوره (۳|۶|۹|3|6|9) ماهه/.test(t)) ||
  /^صورت های مالی(\s+تلفیقی)?\s+سال مالی منتهی به/.test(t.replace(/‌/g, ' '))
const isInteresting = (title) => {
  const t = norm(title)
  return isMonthlyTitle(t) || isQuarterlyTitle(t)
}

// اصلاحیه = عنوان صریحاً «اصلاحیه» دارد (کدال برای هر تصحیح گزارش قبلی همین کلمه را می‌گذارد)
const isAmendmentTitle = (t) => /اصلاحیه/.test(norm(t))

// اعداد کلیدی برای مقایسهٔ نسخهٔ قبل/بعدِ اصلاحیه — فقط همان‌هایی که در متن پیام/کارت ظاهر می‌شوند
function monthMetrics(m) {
  if (!m) return null
  if (m.kind === 'portfolio') return { totalMv: m.totalMv, gain: m.gain }
  if (m.kind === 'bank') return { month: m.month, expense_m: m.expense_m }
  return { month: m.month, cum: m.cum }
}
function quarterMetrics(q) {
  if (!q) return null
  return { revenue: q.revenue, net: q.net, eps: q.eps, gross: q.gross, op: q.op }
}

// تغییر بزرگ‌تر از ۱٪ در هر یک از اعداد کلیدی = اصلاحیهٔ واقعی؛ نبود نسخهٔ قبلی برای مقایسه هم محافظه‌کارانه «بزرگ» فرض می‌شود
const AMENDMENT_SIG_THRESHOLD = 0.01
function isSignificantChange(prevM, curM) {
  if (!prevM || !curM) return true
  const keys = new Set([...Object.keys(prevM), ...Object.keys(curM)])
  for (const k of keys) {
    const a = prevM[k], b = curM[k]
    if (a == null && b == null) continue
    if (a == null || b == null) return true
    if (a === 0 && b === 0) continue
    const denom = Math.max(Math.abs(a), Math.abs(b), 1)
    if (Math.abs(a - b) / denom > AMENDMENT_SIG_THRESHOLD) return true
  }
  return false
}

// آیا این اطلاعیه واقعاً در payload نشسته؟ رکورد همان دوره باید publish ≥ انتشار اطلاعیه داشته باشد.
// اگر نه (اکسل نسخهٔ جدید هنوز روی کدال نیامده و پارسر به نسخهٔ قدیمی برگشته)، false برمی‌گردد
// تا اطلاعیه seen نشود و اجرای بعدی دوباره تلاش کند — وگرنه نسخهٔ حسابرسی‌شده/اصلاحیه برای همیشه
// گم می‌شود و کارت/سایت روی دادهٔ کهنه می‌ماند (اتفاق کفرا، سالانهٔ ۱۴۰۴).
function isIngested(a, payload) {
  const t = norm(a.title)
  const period = faDate(t)
  const pubDate = faDate(a.publish)
  if (!period || !pubDate) return true   // قابل سنجش نیست — مثل رفتار قبلی
  const arr = isMonthlyTitle(t) ? payload.months : isQuarterlyTitle(t) ? payload.quarters : null
  if (!arr) return true
  return arr.some(x => x.period === period && x.publish && x.publish >= pubDate)
}

// ═══ خلاصهٔ نکات مهم برای تلگرام — فقط از همان اعداد پارس‌شده، بدون LLM ═══
const faNumFmt = (v, dec = 0) =>
  v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('fa-IR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const pctChange = (cur, prev) => (cur == null || prev == null || prev === 0) ? null : ((cur - prev) / Math.abs(prev)) * 100

const J_MONTHS = ['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const periodParts = (p) => { const m = String(p || '').match(/^(\d{4})\/(\d{2})/); return m ? { y: +m[1], mo: +m[2] } : null }
const monthName = (p) => { const pp = periodParts(p); return pp ? J_MONTHS[pp.mo] : p }
// میلیون ریال → میلیارد تومان (÷۱۰٬۰۰۰)
const toman = (v) => v == null ? '—' : faNumFmt(v / 1e4, Math.abs(v / 1e4) < 100 ? 1 : 0)

// فید BrsAPI (stocks-industries.json — هر ۵ دقیقه در ساعات بازار تازه می‌شود): P/E، آخرین قیمت، ارزش بازار، میانگین P/E صنعت
let _stockMap = null   // symbol → {pe, pl, mv, industryId}
let _groupPeAvg = null // industryId → میانگین pe صنعت (فقط نمادهای pe مثبت)
function loadStockInfo() {
  if (_stockMap) return
  _stockMap = new Map()
  _groupPeAvg = new Map()
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'stocks-industries.json'), 'utf8'))
    for (const ind of data.industries) {
      const pes = []
      for (const s of ind.symbols) {
        _stockMap.set(s.l18, { pe: s.pe ?? null, pl: s.pl ?? null, mv: s.mv ?? null, industryId: ind.id })
        if (s.pe != null && s.pe > 0) pes.push(s.pe)
      }
      _groupPeAvg.set(ind.id, pes.length ? pes.reduce((a, b) => a + b, 0) / pes.length : null)
    }
  } catch {}
}
function peOf(symbol) { loadStockInfo(); return _stockMap.get(symbol)?.pe ?? null }
// {pe, groupPe, mv (ریال), shares} یا null اگر نماد تو فید نبود
function stockInfo(symbol) {
  loadStockInfo()
  const s = _stockMap.get(symbol)
  if (!s) return null
  const groupPe = _groupPeAvg.get(s.industryId) ?? null
  const shares = s.mv != null && s.pl ? Math.round(s.mv / s.pl) : null
  return { pe: s.pe, groupPe, mv: s.mv, shares }
}

// ورودی ماه قبلِ تقویمی (نه صرفاً عنصر قبلی آرایه)
function prevMonthEntry(months, cur) {
  const c = periodParts(cur.period)
  if (!c) return null
  const want = c.mo === 1 ? { y: c.y - 1, mo: 12 } : { y: c.y, mo: c.mo - 1 }
  return months.find(m => { const p = periodParts(m.period); return p && p.y === want.y && p.mo === want.mo }) || null
}

// رشد فروشِ خودِ ماه نسبت به ماه مشابه سال قبل:
//   اول سال مالی (cum == month): «تجمعی مشابه سال قبل» خودش همان یک ماه است
//   وسط سال: تفاضل «تجمعی مشابه سال قبل» این ماه و ماه قبل = فروش ماه مشابه سال قبل
function monthYoY(months, m, prev) {
  if (m.month == null) return null
  if (m.lastYearCum != null) {
    if (m.cum != null && Math.abs(m.cum - m.month) <= Math.abs(m.cum) * 0.005) return pctChange(m.month, m.lastYearCum)
    if (prev && prev.lastYearCum != null) {
      const lastYearMonth = m.lastYearCum - prev.lastYearCum
      if (lastYearMonth > 0) return pctChange(m.month, lastYearMonth)
    }
    return null
  }
  // فرم بانک/خدماتی ستون سال قبل ندارد — همان ماه در سال قبل را از سری خودمان برمی‌داریم
  const p = periodParts(m.period)
  if (!p) return null
  const ly = months.find(x => { const q = periodParts(x.period); return q && q.y === p.y - 1 && q.mo === p.mo })
  return ly ? pctChange(m.month, ly.month) : null
}

// برچسب rule-based — فقط از روی رشد واقعی فروش، بدون قضاوت LLM
function verdict(yoy, isRecord) {
  if (yoy == null) return null
  if (yoy >= 100) return { head: '🌟 رشد چشمگیر فروش نسبت به سال قبل', tail: 'گزارش عالی' }
  if (yoy >= 50) return { head: null, tail: 'گزارش خیلی خوب' }
  if (yoy >= 20) return { head: null, tail: 'گزارش خوب' }
  if (yoy >= 0) return { head: null, tail: 'گزارش متوسط' }
  return { head: null, tail: 'گزارش ضعیف' }
}

function summarizeMonth(symbol, months, m, opts = {}) {
  const tag = `#گزارش_عملکرد_${monthName(m.period)}_${periodParts(m.period)?.y ?? ''}${opts.amendment ? '_اصلاحیه' : ''}`
  const lines = []

  if (m.kind === 'portfolio') {
    lines.push(`✅ ارزش پرتفوی: ${toman(m.totalMv)} میلیارد تومان`)
    if (m.gain != null) lines.push(`${m.gain >= 0 ? '📈 سود' : '📉 زیان'} انباشته پرتفوی: ${toman(Math.abs(m.gain))} میلیارد تومان`)
  } else if (m.kind === 'bank') {
    const prev = prevMonthEntry(months, m)
    const yoy = monthYoY(months, m, prev)
    const mom = prev ? pctChange(m.month, prev.month) : null
    lines.push(`✅ درآمد محقق‌شده ${monthName(m.period)}: ${toman(m.month)} میلیارد تومان`)
    if (m.expense_m != null) {
      lines.push(`💸 هزینه محقق‌شده ماه: ${toman(m.expense_m)} میلیارد تومان`)
      const net = m.month - m.expense_m
      lines.push(`${net >= 0 ? '💰' : '🔻'} تراز درآمد منهای هزینه: ${toman(Math.abs(net))} میلیارد تومان${net < 0 ? ' (منفی)' : ''}`)
      if (m.month > 0) lines.push(`⚖️ نسبت هزینه به درآمد: ${faNumFmt((m.expense_m / m.month) * 100, 0)}٪`)
    }
    const facil = (m.products || []).find(p => /تسهیلات/.test(p.name))
    if (facil?.amount_m != null && m.month > 0) lines.push(`🏦 سهم درآمد تسهیلات: ${faNumFmt((facil.amount_m / m.month) * 100, 0)}٪`)
    if (yoy != null) lines.push(`🔝 رشد درآمد نسبت به ماه مشابه سال قبل: ${faNumFmt(yoy, 0)}٪`)
    if (mom != null) lines.push(`⬆️ رشد درآمد نسبت به ماه قبل: ${faNumFmt(mom, 0)}٪`)
    const pe = peOf(symbol)
    if (pe != null) lines.push(`🔴 P/E ttm: ${faNumFmt(pe, 1)}`)
    const v = verdict(yoy, false)
    if (v?.tail) lines.push('', v.tail)
  } else {
    // خدماتی/پیمانکاری/انبوه‌سازی «درآمد» گزارش می‌کنند و ستون دوره مشابه سال قبل ندارند
    const noun = m.kind === 'service' ? 'درآمد' : 'فروش'
    const prev = prevMonthEntry(months, m)
    const yoy = monthYoY(months, m, prev)
    const mom = prev ? pctChange(m.month, prev.month) : null
    const withMonth = months.filter(x => x.month != null)
    const isRecord = withMonth.length >= 4 && m.month != null && m.month >= Math.max(...withMonth.map(x => x.month))
    const v = verdict(yoy, isRecord)

    if (v?.head) lines.push(v.head, '')
    if (isRecord) lines.push(`✅ بیشترین ${noun} ماهانه در بین ${faNumFmt(withMonth.length)} ماه اخیر`, '')
    lines.push(`✅ مبلغ ${noun} ${monthName(m.period)}: ${toman(m.month)} میلیارد تومان`)
    if (yoy != null) lines.push(`🔝 رشد ${noun} نسبت به ماه مشابه سال قبل: ${faNumFmt(yoy, 0)}٪`)
    else {
      const cumYoY = pctChange(m.cum, m.lastYearCum)
      if (cumYoY != null) lines.push(`🔝 رشد ${noun} تجمعی نسبت به سال قبل: ${faNumFmt(cumYoY, 0)}٪`)
    }
    if (mom != null) lines.push(`⬆️ رشد ${noun} نسبت به ماه قبل: ${faNumFmt(mom, 0)}٪`)
    const pe = peOf(symbol)
    if (pe != null) lines.push(`🔴 P/E ttm: ${faNumFmt(pe, 1)}`)
    if (v?.tail) lines.push('', v.tail)
  }
  return { tag, body: lines.join('\n') }
}

function summarizeQuarter(symbol, q, opts = {}) {
  const tag = `#صورت_مالی_${faNumFmt(q.months)}ماهه_${periodParts(q.period)?.y ?? ''}${q.audited ? '_حسابرسی‌شده' : ''}${opts.amendment ? '_اصلاحیه' : ''}`
  const lines = []
  if (q.revenue != null) lines.push(`✅ درآمد عملیاتی: ${toman(q.revenue)} میلیارد تومان`)
  const pct = pctChange(q.net, q.net_ly)
  if (q.net != null) lines.push(`${q.net >= 0 ? '💰 سود' : '🔻 زیان'} خالص: ${toman(Math.abs(q.net))} میلیارد تومان${pct == null ? '' : ` (${pct >= 0 ? 'رشد' : 'کاهش'} ${faNumFmt(Math.abs(pct), 0)}٪ نسبت به دورهٔ مشابه)`}`)
  if (q.eps != null) lines.push(`📌 سود هر سهم دوره: ${faNumFmt(q.eps)} ریال`)
  const pe = peOf(symbol)
  if (pe != null) lines.push(`🔴 P/E ttm: ${faNumFmt(pe, 1)}`)
  const v = verdict(pct, false)
  if (v?.tail) lines.push('', v.tail)
  return { tag, body: lines.join('\n') }
}

// هشتگ نماد + لینک سایت/کانال — همیشه قطعی و کد اضافه می‌شود، نه از Gemini خواسته می‌شود
// (تا لینک/هشتگ هرگز اشتباه یا نصفه از مدل درنیاید). routeها خودشان html را تا ۴۰۹۶ کاراکتر
// کوتاه می‌کنند غافل از این فوتر اضافه — پس اینجا دوباره کل پیام را به سقف تلگرام محدود می‌کنیم.
function deepPostFooter(symbol, html) {
  const tag = `#${symbol.replace(/\s+/g, '_')}`
  const link = `${SITE}/stock/${encodeURIComponent(symbol)}\n${TELEGRAM_CHANNEL}`
  const LIMIT = 4096
  const reserved = tag.length + link.length + 4 // دو جفت \n\n اطراف html
  let body = html
  if (tag.length + body.length + link.length + 4 > LIMIT) {
    const cut = body.slice(0, LIMIT - reserved)
    const lastBreak = cut.lastIndexOf('\n')
    body = (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).trim()
  }
  return [tag, body, link].join('\n\n')
}

// symbol, و عناوین اطلاعیه‌هایی که برای همین اجرا «تازه» تشخیص داده شدند (تعیین می‌کند ماهانه/فصلی کدام‌یک واقعاً جدیدند)
function buildKeyPoints(symbol, payload, freshTitles, opts = {}) {
  const hasMonthly   = freshTitles.some(isMonthlyTitle) && !opts.skipMonthly
  const hasQuarterly = freshTitles.some(isQuarterlyTitle) && !opts.skipQuarterly
  const parts = []
  if (hasMonthly && payload.months.length) parts.push(summarizeMonth(symbol, payload.months, payload.months[payload.months.length - 1], { amendment: opts.monthlyAmendment }))
  if (hasQuarterly && payload.quarters.length) parts.push(summarizeQuarter(symbol, payload.quarters[payload.quarters.length - 1], { amendment: opts.quarterlyAmendment }))
  if (!parts.length) return null

  const hashtags = [`#${symbol.replace(/\s+/g, '_')}`, ...parts.map(p => p.tag)].join('\n')
  const facts = parts.map(p => p.body).join('\n\n')
  return {
    facts,
    text: [
      hashtags,
      facts,
      `${SITE}/stock/${encodeURIComponent(symbol)}`,
      '⚠️ صرفاً اطلاع‌رسانی است، توصیه مالی نیست.',
    ].join('\n\n'),
  }
}

// روایت روان Gemini روی همان اعداد قاعده‌محور — از endpoint موجود سایت (بدون کلید جدا اینجا)
// اگر شکست بخورد، پیام قاعده‌محور خام بدون تغییر ارسال می‌شود
async function narrate(symbol, facts) {
  try {
    const res = await fetch(`${SITE}/api/signal-narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'گزارش عملکرد/صورت مالی نماد', symbol, reason: facts }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json()
    if (data.ok && data.text) return data.text
  } catch (e) { log(`⚠️ ${symbol}: روایت Gemini شکست خورد — ${e.message}`) }
  return null
}

// تلگرام روی تگ ناقص/غیرمجاز کل پیام را با خطای ۴۰۰ رد می‌کند، بدون partial-send —
// فقط تگ‌های مجاز HTML تلگرام باقی می‌مانند، بقیه حذف می‌شوند (متن داخلشان می‌ماند)
function sanitizeTelegramHtml(html) {
  let out = String(html || '').replace(/<br\s*\/?>/gi, '\n')
  out = out.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (m, tag, attrs) => {
    const t = tag.toLowerCase()
    if (!['b', 'i', 'u', 's', 'code', 'pre', 'a'].includes(t)) return ''
    if (t === 'a') {
      if (m.startsWith('</')) return '</a>'
      const hrefM = attrs.match(/href\s*=\s*"([^"]*)"/i)
      return hrefM ? `<a href="${hrefM[1]}">` : ''
    }
    return m.startsWith('</') ? `</${t}>` : `<${t}>`
  })
  return out
}

// پست تحلیل عمیق سالانهٔ حسابرسی‌شده — فقط فیلدهای از قبل استخراج/محاسبه‌شده به Gemini می‌رود
// (هرگز متن خام نامهٔ حسابرس). اگر Gemini شکست بخورد، بر خلاف narrate() به متن خام fallback
// نمی‌کند — یه تحلیل ساختاریافتهٔ شکسته بدتر از هیچی‌نفرستادنه، فقط رد می‌شود.
async function buildDeepAnalysisText(symbol, q, extracted) {
  try {
    const res = await fetch(`${SITE}/api/annual-audit-narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        period: q.period,
        opinionType: extracted.opinionType,
        ratios: q.ratios,
        revenueYoY: pctChange(q.revenue, q.revenue_ly),
        netProfitYoY: pctChange(q.net, q.net_ly),
        cashFlow: q.cash_flow,
        redFlagSnippets: {
          basisForQualified: extracted.basisForQualified,
          notableClauses: extracted.notableClauses,
          legalComplianceNotes: extracted.legalComplianceNotes,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    })
    const data = await res.json()
    if (data.ok && data.html) return sanitizeTelegramHtml(data.html)
    log(`⚠️ ${symbol}: تحلیل عمیق سالانه پاسخ نامعتبر — ${data.error || 'نامشخص'}`)
  } catch (e) { log(`⚠️ ${symbol}: تحلیل عمیق سالانه Gemini شکست خورد — ${e.message}`) }
  return null
}

// پست تحلیل عمیق میاندوره‌ای (۳/۶/۹ ماهه، حسابرسی‌شده یا نشده) — همون الگوی buildDeepAnalysisText
// ولی بدون نامهٔ حسابرس (فقط اعداد صورت‌های مالی که parser از قبل استخراج/محاسبه کرده)
async function buildDeepQuarterlyText(symbol, q) {
  try {
    const res = await fetch(`${SITE}/api/quarterly-deep-narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        period: q.period,
        months: q.months,
        audited: !!q.audited,
        revenue: q.revenue, revenueYoY: pctChange(q.revenue, q.revenue_ly),
        gross: q.gross, grossYoY: pctChange(q.gross, q.gross_ly),
        op: q.op, opYoY: pctChange(q.op, q.op_ly),
        net: q.net, netYoY: pctChange(q.net, q.net_ly),
        eps: q.eps,
        finCost: q.fin_cost, finCostYoY: pctChange(q.fin_cost, q.fin_cost_ly),
        ratios: q.ratios,
        cashFlow: q.cash_flow,
        workingCapital: {
          receivablesChange: pctChange(q.receivables, q.receivables_prev),
          inventoryChange: pctChange(q.inventory, q.inventory_prev),
        },
      }),
      signal: AbortSignal.timeout(60_000),
    })
    const data = await res.json()
    if (data.ok && data.html) return sanitizeTelegramHtml(data.html)
    log(`⚠️ ${symbol}: تحلیل عمیق میاندوره‌ای پاسخ نامعتبر — ${data.error || 'نامشخص'}`)
  } catch (e) { log(`⚠️ ${symbol}: تحلیل عمیق میاندوره‌ای Gemini شکست خورد — ${e.message}`) }
  return null
}

// ادعای ارسال از دیتابیس — تنها منبع حقیقت مشترک بین همهٔ پروسه‌ها (زامبی/overlap/کرش/باگ‌های
// کشف‌نشده). فایل JSON محلی (seen) فقط تو حافظهٔ همون پروسه‌ست و با کرش گم می‌شه؛ این جدول نه.
// درست قبل از هر ارسال واقعی صدا زده می‌شه — اگه کلید از قبل claim شده، اصلاً ارسال انجام نمی‌شه.
async function claimSend(key) {
  const sb = sbClient()
  if (!sb) return true // بدون SUPABASE_KEY (لوکال) گارد غیرفعاله، رفتار قبلی حفظ می‌شه
  const { error } = await sb.from('codal_watch_sent').insert({ key })
  if (!error) return true
  if (error.code === '23505') { log(`⏭️ قبلاً واقعاً به تلگرام پست شده (DB claim) — رد شد: ${key}`); return false }
  // fail-closed: اگه نشد چک کنیم، فرض می‌کنیم شاید قبلاً پست شده — دوباره‌ارسال بدتر از یه‌بار جاافتادنه
  log(`⚠️ claimSend خطا داد (${error.message}) — برای امنیت رد شد: ${key}`)
  return false
}

async function sendTelegram(text, opts = {}) {
  const chatId = opts.chatId || TELEGRAM_CHAT_ID
  if (!TELEGRAM_BOT_TOKEN || !chatId) { log('⚠️ TELEGRAM_BOT_TOKEN/CHAT_ID تنظیم نشده — اعلان ارسال نشد'); return }
  const parseModeField = opts.html ? { parse_mode: 'HTML' } : {}
  // مستقیم — از داخل ایران معمولاً فیلتر است، ولی اگر باز بود سریع‌ترین راه است
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...parseModeField }),
      signal: AbortSignal.timeout(20_000),
    })
    const data = await res.json()
    if (data.ok) return
    log(`⚠️ ارسال مستقیم تلگرام ناموفق: ${data.description || 'نامشخص'} — تلاش از راه رله`)
  } catch (e) { log(`⚠️ ارسال مستقیم تلگرام خطا داد (${e.message}) — تلاش از راه رله`) }

  // رلهٔ سایت (Render — خارج از ایران): /api/telegram-relay
  try {
    const res = await fetch(`${SITE}/api/telegram-relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TELEGRAM_BOT_TOKEN, chat_id: chatId, text, ...parseModeField }),
      signal: AbortSignal.timeout(90_000), // کلد-استارت Render
    })
    const data = await res.json()
    if (!data.ok) log(`⚠️ رله تلگرام هم ناموفق: ${data.error || res.status}`)
  } catch (e) { log(`⚠️ رله تلگرام هم خطا داد: ${e.message}`) }
}

// هشدار عملیاتی به ادمین (نه کانال عمومی) — صف پرحجم زیر بار سنگین، تا قبل از اینکه کاربر
// خودش متوجه جاماندن گزارش بشه، خبردار بشیم. شکستش نباید اجرای اصلی رو متوقف کنه.
async function sendAdminAlert(text) {
  if (!ADMIN_CHAT_ID) return
  try { await sendTelegram(text, { chatId: ADMIN_CHAT_ID }) } catch {}
}

// تلگرام کپشن عکس را حداکثر ۱۰۲۴ کاراکتر می‌پذیرد (نه ۴۰۹۶ مثل پیام متنی معمولی)
const CAPTION_LIMIT = 1024
const capCaption = (s) => (s.length > CAPTION_LIMIT ? s.slice(0, CAPTION_LIMIT - 1) + '…' : s)

// api.telegram.org از داخل ایران فیلتر است — اول مستقیم، بعد از راه رلهٔ سایت (همون الگوی telegram-report.js)
async function sendPhoto(buf, caption) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) { log('⚠️ TELEGRAM_BOT_TOKEN/CHAT_ID تنظیم نشده — عکس ارسال نشد'); return }
  try {
    const form = new FormData()
    form.append('chat_id', TELEGRAM_CHAT_ID)
    form.append('caption', caption)
    form.append('photo', new Blob([buf], { type: 'image/jpeg' }), 'report.jpg')
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(15_000) })
    const data = await res.json()
    if (data.ok) return
    log(`⚠️ ارسال مستقیم عکس ناموفق: ${data.description || 'نامشخص'} — تلاش از راه رله`)
  } catch (e) { log(`⚠️ ارسال مستقیم عکس خطا داد (${e.message}) — تلاش از راه رله`) }

  try {
    const res = await fetch(`${SITE}/api/telegram-relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TELEGRAM_BOT_TOKEN, chat_id: TELEGRAM_CHAT_ID, photo: buf.toString('base64'), caption }),
      signal: AbortSignal.timeout(90_000), // کلد-استارت Render
    })
    const data = await res.json()
    if (!data.ok) log(`⚠️ رلهٔ عکس هم ناموفق: ${data.error || res.status}`)
  } catch (e) { log(`⚠️ رلهٔ عکس هم خطا داد: ${e.message}`) }
}

// مرورگر مشترک puppeteer — فقط وقتی واقعاً یه گزارش تولیدی برای کارت‌سازی داریم راه‌اندازی می‌شه (نه هر اجرا)
let _browser = null
async function getBrowser() {
  if (_browser) return _browser
  const puppeteer = require('puppeteer')
  _browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  return _browser
}
async function closeBrowser() { if (_browser) { await _browser.close(); _browser = null } }

// گزارش فعالیت ماهانهٔ تولیدی → کارت عکسی (نمودار+جدول)، نه متن خام
async function sendMonthlyPhoto(symbol, payload, monthEntry, opts = {}) {
  if (!(await claimSend(`monthly|${symbol}|${monthEntry.period}|${opts.amendment ? 'amend' : 'orig'}`))) return false
  const data = buildMonthlyReportData(payload)
  if (!data) return false
  const summary = summarizeMonth(symbol, payload.months, monthEntry, opts)
  const narrated = await narrate(symbol, summary.body)
  const caption = capCaption([
    `#${symbol.replace(/\s+/g, '_')}`,
    summary.tag,
    narrated || summary.body,
    `${SITE}/stock/${encodeURIComponent(symbol)}`,
    '⚠️ صرفاً اطلاع‌رسانی است، توصیه مالی نیست.',
    TELEGRAM_CHANNEL,
  ].join('\n\n'))
  const browser = await getBrowser()
  const html = renderMonthlyReportCardHtml(data, symbol)
  const buf = await screenshotMonthlyReportCard(browser, html)
  await sendPhoto(buf, caption)
  return true
}

// صورت مالی میاندوره‌ای/سالانه → کارت عکسی (روند سود+آمار)، نه متن خام
async function sendQuarterlyPhoto(symbol, payload, quarterEntry, opts = {}) {
  if (!(await claimSend(`quarterly|${symbol}|${quarterEntry.period}|${opts.amendment ? 'amend' : 'orig'}`))) return false
  const info = stockInfo(symbol)
  const data = buildQuarterlyReportData(payload, info)
  if (!data) return false
  const summary = summarizeQuarter(symbol, quarterEntry, opts)
  const narrated = await narrate(symbol, summary.body)
  const caption = capCaption([
    `#${symbol.replace(/\s+/g, '_')}`,
    summary.tag,
    narrated || summary.body,
    `${SITE}/stock/${encodeURIComponent(symbol)}`,
    '⚠️ صرفاً اطلاع‌رسانی است، توصیه مالی نیست.',
    TELEGRAM_CHANNEL,
  ].join('\n\n'))
  const browser = await getBrowser()
  const html = renderQuarterlyReportCardHtml(data, symbol)
  const buf = await screenshotQuarterlyReportCard(browser, html)
  await sendPhoto(buf, caption)
  return true
}

const toLatin = (s) => String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
// «۱۴۰۵/۰۴/۱۹ ۱۱:۴۰:۳۰» → «1405/04/19 11:40:30» — عرض ثابت، پس مقایسهٔ رشته‌ای = مقایسهٔ زمانی
const pdt = (s) => toLatin(s).replace(/\s+/g, ' ').trim()

// تاریخ‌ساعت شمسی تهران با همان قالب کدال
function jNow(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Tehran',
  }).formatToParts(d)
  const g = (t) => p.find(x => x.type === t).value
  return `${g('year')}/${g('month')}/${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`
}
// فرمت YYYY-MM-DD برای date_start/date_end در BrsAPI
const jDate = (d = new Date()) => jNow(d).slice(0, 10).replace(/\//g, '-')

// ═══ منبع اصلی: API عمومی کدال (بدون auth، صفحه‌بندی دارد) ═══
// نزولی بر اساس زمان انتشار؛ تا رسیدن به cutoff صفحه می‌زنیم.
// اجرای موازی محدود — سرور ~۹۶۰MB رم دارد، پس همه‌چیز را با هم شروع نمی‌کنیم؛ فقط N نماد هم‌زمان.
// پیش‌تر این حلقه کاملاً سریال بود (هر نماد fetch+puppeteer+چند کال Gemini، ۱۰ تا ۹۰ ثانیه)، پس
// در فصل گزارش‌دهی با ۳۰-۵۰+ نماد هم‌زمان از سقف واچ‌داگ ۲۰دقیقه‌ای رد می‌شد و نمادهای باقی‌مانده
// به اجرای بعدی می‌افتاد — چون قفل overlap اجازهٔ هم‌پوشانی نمی‌داد، صف زیر بار پیوسته انباشته می‌شد.
async function runPool(items, limit, worker) {
  let i = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx], idx)
    }
  })
  await Promise.all(lanes)
}
const CONCURRENCY = Math.max(1, Number(process.env.CODAL_WATCH_CONCURRENCY) || 2)
// اگه صف یک اجرا از این تعداد نماد بیشتر شد، به ادمین هشدار بده — نشونهٔ اینه که ورودی گزارش
// از ظرفیت پردازش جلو زده و ریسک جاماندن/تأخیر چندساعته هست
const BACKLOG_ALERT_THRESHOLD = Math.max(1, Number(process.env.CODAL_WATCH_BACKLOG_ALERT) || 15)

const MAX_PAGES = 40 // ۸۰۰ اطلاعیه — بیش از هر روز شلوغ کدال
async function fromCodal(since) {
  const out = []
  for (let p = 1; p <= MAX_PAGES; p++) {
    const url = 'https://search.codal.ir/api/search/v2/q'
      + '?Audited=true&AuditorRef=-1&Category=-1&Childs=false&CompanyState=-1&CompanyType=-1'
      + '&Consolidatable=true&IsNotAudited=false&Length=-1&LetterType=-1&Mains=true'
      + '&NotAudited=true&NotConsolidatable=true&Publisher=false&TracingNo=-1&search=true'
      + `&PageNumber=${p}`
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const letters = (await res.json())?.Letters ?? []
    if (!letters.length) break

    let reachedCutoff = false
    for (const l of letters) {
      const publish = pdt(l.PublishDateTime ?? l.SentDateTime)
      if (publish && publish < since) { reachedCutoff = true; continue }
      out.push({
        symbol: l.Symbol,
        title: l.Title,
        publish,
        url: l.Url ? `https://codal.ir${l.Url}` : null,
        // کلید عمداً از symbol|title|publish ساخته می‌شود، نه TracingNo خام —
        // چون فرمت/مقدار tracing no بین کدال و پشتیبان BrsApi یکی نیست و باعث
        // پست دوباره‌ی همان اطلاعیه موقع سوییچ منبع می‌شد (باگ غمینو ۲۰۲۶-۰۷-۱۹).
        key: `${l.Symbol}|${l.Title}|${publish}`,
      })
    }
    if (reachedCutoff) break
    await sleep(1200)
  }
  return out
}

// ═══ پشتیبان: BrsAPI بدون l18 — سقف ۲۰ ردیف دارد، پس فقط وقتی کدال نمی‌آید ═══
async function fromBrsApi(ds, de) {
  const url = `https://Api.BrsApi.ir/Codal/Announcement.php?key=${KEY}&date_start=${ds}&date_end=${de}`
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const list = Array.isArray(data) ? data : (data?.announcement ?? [])
  return list.map(a => {
    const publish = pdt(a.date_publish ?? a.date_send)
    return {
      symbol: a.l18,
      title: a.title,
      publish,
      // همان الگوی کلید fromCodal — یکسان‌سازی بین دو منبع، نه tracing_no خام.
      key: `${a.l18}|${a.title}|${publish}`,
    }
  })
}

async function fetchRecent() {
  const since = jNow(new Date(Date.now() - HOURS * 3_600_000))
  try {
    const list = await fromCodal(since)
    if (list.length) { log(`منبع: search.codal.ir — ${list.length} اطلاعیه از ${since}`); return list }
    log('کدال چیزی برنگرداند — پشتیبان BrsApi')
  } catch (e) { log(`کدال ناموفق (${e.message}) — پشتیبان BrsApi`) }

  const days = Math.max(1, Math.ceil(HOURS / 24))
  const list = await fromBrsApi(jDate(new Date(Date.now() - days * 86_400_000)), jDate())
  log(`منبع: BrsApi (سقف ۲۰ ردیف) — ${list.length} اطلاعیه`)
  return list
}

const loadState = () => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }
  catch { return { seen: [], lastRun: null } }
}
const saveState = (st) => fs.writeFileSync(STATE_FILE, JSON.stringify(st))

function universe() {
  const file = path.join(__dirname, 'stocks-industries.json')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const set = new Set()
  for (const ind of data.industries) for (const s of ind.symbols) set.add(s.l18)
  return set
}

// حالت خام: هر اطلاعیهٔ هر نمادی، بدون فیلتر دسته و بدون پارس مالی — فقط forward سریع
// مستقیم به سشن هرمس (ایجنت بیرونی، سرور خارج IP). کرون هر ۲ دقیقه.
// بدون لینک کدال — سرور هرمس خارجه و کدال IP خارجی رو بلاک می‌کنه، لینک به کارش نمیاد.
function formatRawAnnouncement(a) {
  return [
    `📢 #${a.symbol.replace(/\s+/g, '_')}`,
    a.title,
    a.publish,
  ].filter(Boolean).join('\n')
}

// ═══ ارسال به سشن هرمس (Hermes WebUI) — لاگین رمز → کوکی + CSRF → /api/chat/start ═══
const HERMES_URL        = process.env.HERMES_URL
const HERMES_PASSWORD   = process.env.HERMES_PASSWORD
const HERMES_SESSION_ID = process.env.HERMES_SESSION_ID
const HERMES_MODEL          = process.env.HERMES_MODEL || 'buy'
const HERMES_MODEL_PROVIDER = process.env.HERMES_MODEL_PROVIDER || 'custom:buy'
const HERMES_WORKSPACE      = process.env.HERMES_WORKSPACE || '/root/workspace'
const HERMES_PROFILE        = process.env.HERMES_PROFILE || 'default'

let _hermesAuth = null // { cookie, csrf } — یک‌بار در طول اجرا گرفته می‌شود
async function hermesLogin() {
  if (_hermesAuth) return _hermesAuth
  const loginRes = await fetch(`${HERMES_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: HERMES_PASSWORD }),
    signal: AbortSignal.timeout(20_000),
  })
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0]
  const loginData = await loginRes.json()
  if (!loginData.ok || !cookie) throw new Error(`لاگین هرمس ناموفق: ${loginData.error || loginRes.status}`)

  const pageRes = await fetch(`${HERMES_URL}/session/${HERMES_SESSION_ID}`, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(20_000),
  })
  const html = await pageRes.text()
  const m = html.match(/csrfToken:"([a-f0-9]+)"/)
  if (!m) throw new Error('توکن CSRF هرمس پیدا نشد')

  _hermesAuth = { cookie, csrf: m[1] }
  return _hermesAuth
}

async function sendHermes(text) {
  if (!HERMES_URL || !HERMES_PASSWORD || !HERMES_SESSION_ID) { log('⚠️ HERMES_URL/HERMES_PASSWORD/HERMES_SESSION_ID تنظیم نشده — پیام هرمس ارسال نشد'); return }
  const { cookie, csrf } = await hermesLogin()
  const res = await fetch(`${HERMES_URL}/api/chat/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Hermes-CSRF-Token': csrf },
    body: JSON.stringify({
      session_id: HERMES_SESSION_ID,
      message: text,
      model: HERMES_MODEL,
      model_provider: HERMES_MODEL_PROVIDER,
      workspace: HERMES_WORKSPACE,
      profile: HERMES_PROFILE,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`ارسال به هرمس ناموفق: HTTP ${res.status}`)
}

async function runRaw() {
  log(`▶ دیده‌بان خام کدال — بازهٔ ${HOURS} ساعت`)
  const uni = universe()
  const st = loadState()
  const seenRaw = new Set(st.seenRaw || [])

  const all = await fetchRecent()
  const fresh = all.filter(a => a.symbol && uni.has(a.symbol) && !seenRaw.has(a.key))

  if (fresh.length === 0) { log('هیچ اطلاعیهٔ تازه‌ای نیست.'); return }
  log(`${fresh.length} اطلاعیهٔ تازه (خام) در ${new Set(fresh.map(a => a.symbol)).size} نماد`)

  if (DRY) { for (const a of fresh) log(`  • ${a.symbol} — ${a.title}`); log('dry run — چیزی ارسال نشد'); return }

  // قدیمی‌ترین اول، تا ترتیب انتشار برای هرمس حفظ شود
  for (const a of [...fresh].reverse()) {
    try { await sendHermes(formatRawAnnouncement(a)) }
    catch (e) { log(`⚠️ ${a.symbol}: ارسال به هرمس شکست خورد — ${e.message}`) }
    seenRaw.add(a.key)
    await sleep(600)
  }

  st.seenRaw = [...seenRaw].slice(-SEEN_RAW_CAP)
  saveState(st)
  log(`✔ خام تمام شد. ${fresh.length} اطلاعیه فوروارد شد.`)
}

// قفل اجرای هم‌زمان — با ۵۰+ نماد در یک روز شلوغ، یک اجرا گاهی از ۳۰ دقیقه (فاصلهٔ cron) بیشتر
// طول می‌کشد (یا OOM سرور ۱GB رمی chrome-headless را کشت و پروسه معلق ماند)؛ بدون قفل، اجرای
// بعدی هم‌زمان شروع می‌شد و همان اطلاعیه‌ها را دوباره پست می‌کرد (باگ ارسال چندباره ۲۰۲۶-۰۷-۲۰).
const LOCK_FILE = path.join(__dirname, 'codal-watch.lock')
function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    const pid = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim())
    let alive = false
    try { process.kill(pid, 0); alive = true } catch {}
    if (alive) return false
    log(`⚠️ لاک قدیمی از pid=${pid} (دیگر زنده نیست، احتمالاً OOM/کرش) — آزاد شد`)
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid))
  return true
}
function releaseLock() {
  try { if (Number(fs.readFileSync(LOCK_FILE, 'utf8').trim()) === process.pid) fs.unlinkSync(LOCK_FILE) } catch {}
}

// واچ‌داگ سخت — سرور فقط ~۹۶۰MB رم دارد و puppeteer زیر فشار حافظه گاهی برای همیشه گیر می‌کند
// (نه واقعاً بی‌نهایت‌حلقه، فقط thrashing بدون swap). یه اجرای گیرکرده که کل کرون بعدی رو هم
// اشغال کنه، بدتر از یه اجرای ناموفقه — پس بعد از ۲۰ دقیقه (کمتر از فاصلهٔ ۳۰دقیقه‌ای cron)
// خودش رو با process.exit می‌کشه؛ یعنی هیچ‌وقت وارد بازهٔ اجرای بعدی نمی‌شه.
const WATCHDOG_MS = 20 * 60 * 1000

async function main() {
  if (RAW) return runRaw()

  if (!acquireLock()) { log('⏭️ اجرای قبلی هنوز در حال اجراست — رد شد (بدون قفل دوباره‌پست می‌کرد)'); return }
  const watchdog = setTimeout(() => {
    log(`⏰ واچ‌داگ: اجرا بیش از ${WATCHDOG_MS / 60000} دقیقه طول کشید — کشته شد تا با اجرای بعدی تداخل نکند`)
    releaseLock()
    process.exit(1)
  }, WATCHDOG_MS)
  watchdog.unref()
  try { return await run() } finally { clearTimeout(watchdog); releaseLock() }
}

async function run() {
  log(`▶ دیده‌بان کدال — بازهٔ ${HOURS} ساعت${DRY ? ' (dry run)' : ''}`)
  if (!sbClient()) log('⚠️ SUPABASE_URL/SUPABASE_KEY تنظیم نشده — خروجی فقط روی فایل می‌رود، سایت به‌روز نمی‌شود')

  const uni = universe()
  const st = loadState()
  const seen = new Set(st.seen)

  const all = await fetchRecent()
  const fresh = all.filter(a => a.symbol && uni.has(a.symbol) && isInteresting(a.title) && !seen.has(a.key))

  if (fresh.length === 0) {
    log('هیچ گزارش تازه‌ای نیست.')
    st.lastRun = new Date().toISOString()
    saveState(st)
    return
  }

  const symbols = [...new Set(fresh.map(a => a.symbol))]
  log(`${fresh.length} اطلاعیهٔ تازه در ${symbols.length} نماد: ${symbols.join('، ')}`)
  for (const a of fresh) log(`  • ${a.symbol} — ${a.title}`)

  if (DRY) { log('dry run — چیزی ساخته نشد'); return }

  if (symbols.length > BACKLOG_ALERT_THRESHOLD) {
    log(`⚠️ صف بزرگ: ${symbols.length} نماد در این اجرا (آستانهٔ هشدار ${BACKLOG_ALERT_THRESHOLD})`)
    sendAdminAlert(`⚠️ کدال-واچ: ${symbols.length} نماد هم‌زمان در صف این اجرا — بیش از آستانهٔ ${BACKLOG_ALERT_THRESHOLD}. ریسک جاماندن گزارش زیر بار سنگین.`)
  }

  let fail = 0
  const built = new Set()
  const pendingKeys = new Set()   // اطلاعیه‌هایی که هنوز ingest نشده‌اند — seen نمی‌شوند تا retry شوند
  async function processSymbol(s) {
    try {
      // اسنپ‌شات نسخهٔ قبلِ payload — قبل از overwrite شدن توسط buildSymbol، تا اصلاحیه با «قبل از خودش» مقایسه شود
      const outFile = path.join(OUT_DIR, `${s.replace(/\s+/g, '-')}.json`)
      let prevPayload = null
      try { prevPayload = JSON.parse(fs.readFileSync(outFile, 'utf8')) } catch {}

      const status = await buildSymbol(s, { force: true })
      if (status === 'ok') {
        built.add(s)
        try {
          const payload = JSON.parse(fs.readFileSync(outFile, 'utf8'))
          const mine = fresh.filter(a => a.symbol === s)
          const pending = mine.filter(a => !isIngested(a, payload))
          for (const a of pending) {
            pendingKeys.add(a.key)
            log(`⏳ ${s}: «${norm(a.title)}» هنوز ingest نشده (اکسل نیامده؟) — اجرای بعدی دوباره تلاش می‌شود`)
          }

          // اصلاحیه‌هایی که در اعداد کلیدی تغییر معناداری ایجاد نکرده‌اند پست نمی‌شوند (seen می‌مانند، چون واقعاً ingest شده‌اند)؛
          // اصلاحیهٔ با تغییر بزرگ پست می‌شود ولی با هشتگ #اصلاحیه علامت‌گذاری می‌شود
          const minorAmendmentKeys = new Set()
          let monthlyAmendment = false
          let quarterlyAmendment = false
          for (const a of mine) {
            if (pendingKeys.has(a.key)) continue
            const t = norm(a.title)
            if (!isAmendmentTitle(t)) continue
            const period = faDate(t)
            if (isMonthlyTitle(t)) {
              const curM = payload.months.find(x => x.period === period)
              const prevM = prevPayload?.months?.find(x => x.period === period)
              if (isSignificantChange(monthMetrics(prevM), monthMetrics(curM))) monthlyAmendment = true
              else minorAmendmentKeys.add(a.key)
            } else if (isQuarterlyTitle(t)) {
              const curQ = payload.quarters.find(x => x.period === period)
              const prevQ = prevPayload?.quarters?.find(x => x.period === period)
              if (isSignificantChange(quarterMetrics(prevQ), quarterMetrics(curQ))) quarterlyAmendment = true
              else minorAmendmentKeys.add(a.key)
            }
          }
          for (const a of mine) if (minorAmendmentKeys.has(a.key)) log(`ℹ️ ${s}: اصلاحیهٔ «${norm(a.title)}» بدون تغییر معنادار در اعداد — پست تلگرام نشد`)

          // کارت/متن فقط برای اطلاعیه‌هایی که واقعاً در داده نشسته‌اند و اصلاحیهٔ بی‌اثر نیستند
          const freshTitles = mine.filter(a => !pendingKeys.has(a.key) && !minorAmendmentKeys.has(a.key)).map(a => norm(a.title))
          if (freshTitles.length) {
            // ماهانهٔ تولیدی (فرم «نام محصول») و صورت مالی فصلی/سالانه → کارت عکسی؛ بقیهٔ فرم‌های ماهانه (بانک/خدماتی/پرتفوی) → متن قبلی
            const hasMonthly = freshTitles.some(isMonthlyTitle)
            const latestMonth = hasMonthly && payload.months.length ? payload.months[payload.months.length - 1] : null
            const monthlyIsProduction = !!latestMonth && latestMonth.kind === 'production'
            let monthlyPhotoSent = false
            if (monthlyIsProduction) {
              try { monthlyPhotoSent = await sendMonthlyPhoto(s, payload, latestMonth, { amendment: monthlyAmendment }) }
              catch (e) { log(`⚠️ ${s}: کارت عکسی ماهانه شکست خورد، ادامه با متن — ${e.message}`) }
            }

            const hasQuarterly = freshTitles.some(isQuarterlyTitle)
            const latestQuarter = hasQuarterly && payload.quarters.length ? payload.quarters[payload.quarters.length - 1] : null
            let quarterlyPhotoSent = false
            if (latestQuarter) {
              try { quarterlyPhotoSent = await sendQuarterlyPhoto(s, payload, latestQuarter, { amendment: quarterlyAmendment }) }
              catch (e) { log(`⚠️ ${s}: کارت عکسی فصلی شکست خورد، ادامه با متن — ${e.message}`) }
            }

            // پست تحلیل عمیق سالانهٔ حسابرسی‌شده — اضافه بر کارت بالا، نه جایگزینش.
            // کل بلوک try/catch است تا شکستش هرگز کارت/خلاصهٔ فعلی را متوقف نکند.
            if (latestQuarter?.months === 12 && latestQuarter?.audited) {
              try {
                const letterAnnouncement = mine
                  .filter(a => isQuarterlyTitle(norm(a.title)) && /حسابرسی شده/.test(norm(a.title)))
                  .sort((x, y) => (y.publish || '').localeCompare(x.publish || ''))[0]
                if (letterAnnouncement?.url) {
                  const browser = await getBrowser()
                  const extracted = await fetchAuditLetter(letterAnnouncement.url, browser)
                  if (extracted) {
                    const deepText = await buildDeepAnalysisText(s, latestQuarter, extracted)
                    if (deepText && (await claimSend(`deep-audited|${s}|${latestQuarter.period}`))) {
                      await sendTelegram(deepPostFooter(s, deepText), { html: true })
                    }
                  } else {
                    log(`ℹ️ ${s}: نامهٔ حسابرسی قابل استخراج نبود — پست تحلیل عمیق رد شد`)
                  }
                }
              } catch (e) { log(`⚠️ ${s}: پست تحلیل عمیق سالانهٔ حسابرسی‌شده شکست خورد (نادیده گرفته شد) — ${e.message}`) }
            } else if (latestQuarter && [3, 6, 9].includes(latestQuarter.months)) {
              // میاندوره‌ای معمولی — بدون نامهٔ حسابرس، مستقیم از اعداد پارس‌شده
              try {
                const deepText = await buildDeepQuarterlyText(s, latestQuarter)
                if (deepText && (await claimSend(`deep-quarterly|${s}|${latestQuarter.period}`))) {
                  await sendTelegram(deepPostFooter(s, deepText), { html: true })
                }
              } catch (e) { log(`⚠️ ${s}: پست تحلیل عمیق میاندوره‌ای شکست خورد (نادیده گرفته شد) — ${e.message}`) }
            }

            // اگه عکس واقعاً نرفت (خطا/عدم داده)، متن قدیمی جایگزینش می‌شه — گزارش نباید کامل از دست بره
            const kp = buildKeyPoints(s, payload, freshTitles, { skipMonthly: monthlyPhotoSent, skipQuarterly: quarterlyPhotoSent, monthlyAmendment, quarterlyAmendment })
            if (kp && (await claimSend(`summary|${s}|${[...freshTitles].sort().join('~')}`))) {
              const narrated = await narrate(s, kp.facts)
              await sendTelegram(narrated ? `${narrated}\n\n${kp.text}` : kp.text)
            }
          }
        } catch (e) { log(`⚠️ ${s}: ساخت/ارسال خلاصه تلگرام شکست خورد — ${e.message}`) }
      } else { fail++; log(`⚠️ ${s}: ${status}`) }
    } catch (e) { fail++; log(`❌ ${s}: ${e.message}`) }

    // seen فوری بعد از همین نماد، نه فقط یک‌جا در انتها — با ۵۰+ نماد در یک اجرا (کارت/اسکرین‌شات/Gemini
    // هر کدام تا ۹۰ ثانیه) کل اجرا گاهی نیم‌ساعت طول می‌کشد و قبل رسیدن به انتها کرش/کیل می‌شود؛ چون seen
    // فقط در پایان ذخیره می‌شد، هر اطلاعیه‌ای که واقعاً پست شده بود اما اجرا ناتمام می‌ماند، اجرای بعدی
    // دوباره «تازه» دیده و دوباره پست می‌شد (باگ ارسال چندباره ۲۰۲۶-۰۷-۲۰: وفتخار/بزاگرس/درازک/وصندوق).
    for (const a of fresh) if (a.symbol === s && built.has(s) && !pendingKeys.has(a.key)) seen.add(a.key)
    st.seen = [...seen].slice(-SEEN_CAP)
    st.lastRun = new Date().toISOString()
    saveState(st)
  }

  await runPool(symbols, CONCURRENCY, processSymbol)

  await closeBrowser()
  log(`✔ تمام شد. ✅${built.size} به‌روز | ⛔${fail} ناموفق`)
}

module.exports = { sendMonthlyPhoto, sendQuarterlyPhoto, closeBrowser }

if (require.main === module) {
  main().catch(e => { log(`FATAL ${(e && e.stack) || e}`); process.exit(1) })
}
