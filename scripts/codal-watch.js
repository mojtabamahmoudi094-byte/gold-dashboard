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

const { buildSymbol, sbClient } = require('./codal-company-reports.js')

const KEY = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
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
const isInteresting = (title) => {
  const t = norm(title)
  if (/گزارش فعالیت ماهانه/.test(t)) return true
  if (/میاندوره|میان دوره/.test(t.replace(/‌/g, '')) && /دوره (۳|۶|۹|3|6|9) ماهه/.test(t)) return true
  if (/^صورت های مالی\s+سال مالی منتهی به/.test(t.replace(/‌/g, ' '))) return true
  return false
}

// تاریخ شمسی امروز و n روز قبل — YYYY-MM-DD (فرمت date_start/date_end برای BrsAPI)
function jalali(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran',
  }).formatToParts(d)
  const g = (t) => parts.find(p => p.type === t).value
  return `${String(Number(g('year'))).padStart(4, '0')}-${g('month')}-${g('day')}`
}
const daysAgo = (n) => jalali(new Date(Date.now() - n * 86_400_000))

// ═══ منبع ۱: BrsAPI بدون l18 (کل بازار در یک بازه) ═══
async function fromBrsApi(ds, de) {
  const url = `https://Api.BrsApi.ir/Codal/Announcement.php?key=${KEY}&date_start=${ds}&date_end=${de}`
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const list = Array.isArray(data) ? data : (data?.announcement ?? [])
  return list.map(a => ({
    symbol: a.l18,
    title: a.title,
    publish: a.date_publish ?? a.date_send ?? null,
    key: String(a.tracing_no ?? `${a.l18}|${a.title}|${a.date_publish}`),
  }))
}

// ═══ منبع ۲: API عمومی خود کدال (بدون auth) ═══
async function fromCodal(pages = 3) {
  const out = []
  for (let p = 1; p <= pages; p++) {
    const url = 'https://search.codal.ir/api/search/v2/q'
      + '?Audited=true&AuditorRef=-1&Category=-1&Childs=false&CompanyState=-1&CompanyType=-1'
      + '&Consolidatable=true&IsNotAudited=false&Length=-1&LetterType=-1&Mains=true'
      + '&NotAudited=true&NotConsolidatable=true&Publisher=false&TracingNo=-1&search=true'
      + `&PageNumber=${p}`
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const letters = data?.Letters ?? []
    if (!letters.length) break
    for (const l of letters) {
      out.push({
        symbol: l.Symbol,
        title: l.Title,
        publish: l.PublishDateTime ?? l.SentDateTime ?? null,
        key: String(l.TracingNo ?? `${l.Symbol}|${l.Title}|${l.PublishDateTime}`),
      })
    }
    await sleep(1500)
  }
  return out
}

// BrsAPI اول (بازهٔ تاریخی دقیق دارد)؛ اگر خالی/خطا بود، از API کدال
async function fetchRecent() {
  const days = Math.max(1, Math.ceil(HOURS / 24))
  try {
    const list = await fromBrsApi(daysAgo(days), jalali())
    if (list.length) { log(`منبع: BrsApi — ${list.length} اطلاعیه در ${days} روز اخیر`); return list }
    log('BrsApi بدون l18 چیزی برنگرداند — سراغ API کدال')
  } catch (e) { log(`BrsApi ناموفق (${e.message}) — سراغ API کدال`) }

  const list = await fromCodal()
  log(`منبع: search.codal.ir — ${list.length} اطلاعیه`)
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
      if (status === 'ok') built.add(s)
      else { fail++; log(`⚠️ ${s}: ${status}`) }
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
