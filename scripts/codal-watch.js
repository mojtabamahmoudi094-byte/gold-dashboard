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
 * وضعیت در codal-watch-state.json نگه داشته می‌شود تا یک اطلاعیه دوبار پردازش نشود.
 */

'use strict'

const path = require('path')
const fs   = require('fs')

const { buildSymbol, sbClient, OUT_DIR } = require('./codal-company-reports.js')

const KEY = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID
const SITE = process.env.SITE_URL || 'https://bourssanj.ir'
const DRY = process.argv.includes('--dry')
const hoursIdx = process.argv.indexOf('--hours')
const HOURS = hoursIdx !== -1 ? Number(process.argv[hoursIdx + 1]) : 36

const STATE_FILE = path.join(__dirname, 'codal-watch-state.json')
const LOG_FILE   = path.join(__dirname, 'codal-watch.log')
const SEEN_CAP   = 5000

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
  /^صورت های مالی\s+سال مالی منتهی به/.test(t.replace(/‌/g, ' '))
const isInteresting = (title) => {
  const t = norm(title)
  return isMonthlyTitle(t) || isQuarterlyTitle(t)
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

// P/E ttm از فید BrsAPI (stocks-industries.json — هر ۵ دقیقه در ساعات بازار تازه می‌شود)
let _peMap = null
function peOf(symbol) {
  if (_peMap === null) {
    _peMap = new Map()
    try {
      const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'stocks-industries.json'), 'utf8'))
      for (const ind of data.industries) for (const s of ind.symbols) if (s.pe != null && s.pe > 0) _peMap.set(s.l18, s.pe)
    } catch {}
  }
  return _peMap.get(symbol) ?? null
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

function summarizeMonth(symbol, months, m) {
  const tag = `#گزارش_عملکرد_${monthName(m.period)}_${periodParts(m.period)?.y ?? ''}`
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

function summarizeQuarter(symbol, q) {
  const tag = `#صورت_مالی_${faNumFmt(q.months)}ماهه_${periodParts(q.period)?.y ?? ''}${q.audited ? '_حسابرسی‌شده' : ''}`
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

// symbol, و عناوین اطلاعیه‌هایی که برای همین اجرا «تازه» تشخیص داده شدند (تعیین می‌کند ماهانه/فصلی کدام‌یک واقعاً جدیدند)
function buildKeyPoints(symbol, payload, freshTitles) {
  const hasMonthly   = freshTitles.some(isMonthlyTitle)
  const hasQuarterly = freshTitles.some(isQuarterlyTitle)
  const parts = []
  if (hasMonthly && payload.months.length) parts.push(summarizeMonth(symbol, payload.months, payload.months[payload.months.length - 1]))
  if (hasQuarterly && payload.quarters.length) parts.push(summarizeQuarter(symbol, payload.quarters[payload.quarters.length - 1]))
  if (!parts.length) return null

  const hashtags = [`#${symbol.replace(/\s+/g, '_')}`, ...parts.map(p => p.tag)].join('\n')
  return [
    hashtags,
    ...parts.map(p => p.body),
    `${SITE}/stock/${encodeURIComponent(symbol)}`,
    '⚠️ صرفاً اطلاع‌رسانی است، توصیه مالی نیست.',
  ].join('\n\n')
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) { log('⚠️ TELEGRAM_BOT_TOKEN/CHAT_ID تنظیم نشده — اعلان ارسال نشد'); return }
  // مستقیم — از داخل ایران معمولاً فیلتر است، ولی اگر باز بود سریع‌ترین راه است
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
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
      body: JSON.stringify({ token: TELEGRAM_BOT_TOKEN, chat_id: TELEGRAM_CHAT_ID, text }),
      signal: AbortSignal.timeout(90_000), // کلد-استارت Render
    })
    const data = await res.json()
    if (!data.ok) log(`⚠️ رله تلگرام هم ناموفق: ${data.error || res.status}`)
  } catch (e) { log(`⚠️ رله تلگرام هم خطا داد: ${e.message}`) }
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
        key: String(l.TracingNo ?? `${l.Symbol}|${l.Title}|${publish}`),
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
  return list.map(a => ({
    symbol: a.l18,
    title: a.title,
    publish: pdt(a.date_publish ?? a.date_send),
    key: String(a.tracing_no ?? `${a.l18}|${a.title}|${a.date_publish}`),
  }))
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

async function main() {
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

  let fail = 0
  const built = new Set()
  for (const s of symbols) {
    try {
      const status = await buildSymbol(s, { force: true })
      if (status === 'ok') {
        built.add(s)
        try {
          const outFile = path.join(OUT_DIR, `${s.replace(/\s+/g, '-')}.json`)
          const payload = JSON.parse(fs.readFileSync(outFile, 'utf8'))
          const freshTitles = fresh.filter(a => a.symbol === s).map(a => norm(a.title))
          const text = buildKeyPoints(s, payload, freshTitles)
          if (text) await sendTelegram(text)
        } catch (e) { log(`⚠️ ${s}: ساخت/ارسال خلاصه تلگرام شکست خورد — ${e.message}`) }
      } else { fail++; log(`⚠️ ${s}: ${status}`) }
    } catch (e) { fail++; log(`❌ ${s}: ${e.message}`) }
    await sleep(4000)
  }

  // فقط اطلاعیه‌های نمادهایی که موفق ساخته شدند seen می‌شوند؛
  // ناموفق‌ها (throttle کدال، اکسل خراب) اجرای بعدی دوباره تلاش می‌شوند
  for (const a of fresh) if (built.has(a.symbol)) seen.add(a.key)
  st.seen = [...seen].slice(-SEEN_CAP)
  st.lastRun = new Date().toISOString()
  saveState(st)

  log(`✔ تمام شد. ✅${built.size} به‌روز | ⛔${fail} ناموفق`)
}

main().catch(e => { log(`FATAL ${(e && e.stack) || e}`); process.exit(1) })
