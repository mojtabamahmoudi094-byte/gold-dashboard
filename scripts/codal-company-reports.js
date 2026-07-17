#!/usr/bin/env node
/**
 * codal-company-reports.js
 *
 * بورس سنج — دریافت و پارس گزارش‌های کدال شرکت‌های تولیدی:
 *   ۱) گزارش فعالیت ماهانه (فرم استاندارد — فروش ماه/تجمعی + محصولات)
 *   ۲) صورت‌های مالی میاندوره‌ای ۳/۶/۹ ماهه + سالانه (صورت سود و زیان)
 *
 * روی سرور ایرانی:
 *   node codal-company-reports.js شپدیس            → یک نماد
 *   node codal-company-reports.js --industry 44     → همه نمادهای صنعت (از stocks-industries.json)
 *   node codal-company-reports.js --industry 44 --force
 *
 * خروجی: reports-out/<l18>.json — سپس از مک:
 *   scp -r root@45.94.215.115:/opt/reports-out/ public/reports/
 */

'use strict'

const path = require('path')
const fs   = require('fs')

// همان الگوی stocks-industries.js — cron هیچ env نمی‌دهد، اسکریپت خودش می‌خواند
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
loadEnv('.env')

const KEY   = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const FORCE = process.argv.includes('--force')
const OUT_DIR = path.join(__dirname, 'reports-out')

// نسخهٔ پارسر — با هر تغییر منطق پارس یکی بالا برود.
// خروجی قدیمی‌تر از این نسخه دوباره ساخته می‌شود، حتی بدون --force؛ وگرنه بعد از
// اصلاح پارسر، نمادهایی که فایل کهنه دارند برای همیشه skip می‌شوند.
const PARSER_VERSION = 9

// خروجی علاوه بر فایل، در جدول stock_reports هم upsert می‌شود تا سایت بدون rebuild به‌روز شود.
// SUPABASE_KEY باید service-role باشد و فقط روی سرور بماند (هرگز NEXT_PUBLIC_).
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

let XLSX
try { XLSX = require('xlsx') } catch { console.error('npm install xlsx لازم است'); process.exit(1) }

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ═══ تشخیص توقف: لاگ synchronous در فایل جدا (بافر نمی‌شود، حتی هنگام مرگ ناگهانی) ═══
const DIAG_FILE = path.join(__dirname, 'reports-diag.log')
const ts = () => new Date().toISOString()
const mem = () => {
  const m = process.memoryUsage()
  return `rss=${(m.rss / 1e6).toFixed(0)}MB heap=${(m.heapUsed / 1e6).toFixed(0)}/${(m.heapTotal / 1e6).toFixed(0)}MB`
}
function diag(msg) {
  const line = `[${ts()}] ${msg}\n`
  try { fs.appendFileSync(DIAG_FILE, line) } catch {}
  try { process.stdout.write(line) } catch {}
}
process.on('uncaughtException', (e) => { diag(`FATAL uncaughtException: ${(e && e.stack) || e}`); process.exit(1) })
process.on('unhandledRejection', (e) => { diag(`FATAL unhandledRejection: ${(e && e.stack) || e}`) })
process.on('exit', (code) => { diag(`EXIT code=${code} ${mem()}`) })
process.on('beforeExit', (code) => { diag(`beforeExit code=${code}`) })
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGABRT']) {
  process.on(sig, () => { diag(`SIGNAL ${sig} — پردازش توسط سیستم متوقف شد`); process.exit(1) })
}
diag(`▶ شروع اجرا — pid=${process.pid} node=${process.version} argv=${process.argv.slice(2).join(' ')}`)

// ماسک BrsAPI روی base64: QQQaQQQ = %2f و OOObOOO = %2b
// نکته: link_excel کدال نباید unmask شود (id در path است؛ %2f را IIS رد می‌کند).
// unmask فقط جای query string لازم است — نگاه کنید به codal-portfolio.js برای DownloadFile.aspx?id=

const norm = (s) => String(s || '')
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/ۀ|ة/g, 'ه')
  .replace(/[‌‎‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim()

// برچسب صورت مالی: فاصله‌ها حذف می‌شوند — کدال بین فرم‌ها «سود(زیان)» و «سود (زیان)» را قاطی می‌کند
const label = (s) => norm(s).replace(/\s+/g, '')

// «۱۲۳,۴۵۶» یا «(۱۲۳)» → عدد؛ خالی/-- → null
const faNum = (v) => {
  let s = String(v ?? '').trim()
  if (!s || s === '--' || s === '-') return null
  s = s.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
       .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
       .replace(/,/g, '').replace(/٫/g, '.')
  let neg = false
  const m = s.match(/^\((.+)\)$/)
  if (m) { neg = true; s = m[1] }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

const faDate = (s) => {
  const t = String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  const m = t.match(/(\d{4})\/(\d{2})\/(\d{2})/)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : null
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ═══ دریافت فهرست اطلاعیه‌ها (پنجره‌های ۲ ماهه — بازه بلند HTTP 400) ═══
const WINDOWS = [
  ['1404-01-01', '1404-02-31'], ['1404-03-01', '1404-04-31'],
  ['1404-05-01', '1404-06-31'], ['1404-07-01', '1404-08-30'],
  ['1404-09-01', '1404-10-30'], ['1404-11-01', '1404-12-29'],
  ['1405-01-01', '1405-02-31'], ['1405-03-01', '1405-04-14'],
]

async function fetchFromBrsApi(symbol) {
  const list = []
  for (const [ds, de] of WINDOWS) {
    const url = `https://Api.BrsApi.ir/Codal/Announcement.php?key=${KEY}`
      + `&l18=${encodeURIComponent(symbol)}&date_start=${ds}&date_end=${de}`
    try {
      const data = await fetchJson(url)
      list.push(...(Array.isArray(data) ? data : (data?.announcement ?? [])))
    } catch (e) { console.log(`    پنجره ${ds}: ${e.message}`) }
    await sleep(4000)
  }
  return list
}

// ═══ منبع دوم: API عمومی کدال ═══
// BrsAPI چند نماد را اصلاً پوشش نمی‌دهد (رفاه، فاهواز، نیروترانسفو، …): HTTP 200 با صفر اطلاعیه،
// در حالی که همان لحظه برای نماد سالم داده می‌دهد. برای آن‌ها مستقیم از کدال می‌گیریم.
// خروجی هم‌شکل BrsAPI ساخته می‌شود تا بقیهٔ خط لوله دست نخورد.
const CODAL_Q = 'https://search.codal.ir/api/search/v2/q'
  + '?Audited=true&AuditorRef=-1&Category=-1&Childs=false&CompanyState=-1&CompanyType=-1'
  + '&Consolidatable=true&IsNotAudited=false&Length=-1&LetterType=-1&Mains=true'
  + '&NotAudited=true&NotConsolidatable=true&Publisher=false&TracingNo=-1&search=true'

// BrsAPI برای چند شرکت به‌جای نماد معاملاتی، نام کوتاه شرکت را در l18 گذاشته است.
// کدال فقط نماد واقعی را می‌شناسد.
const CODAL_ALIAS = {
  'نیروترانسفو': 'بنیرو',   // نیرو ترانس
  'گنگین': 'ونگین',         // گروه اقتصادی مالی نگین ایرانیان
}

// املای کدال با تسه‌تی‌ام‌سی یکی نیست: «آ» را «ا» می‌نویسد (غپآذر → غپاذر) و
// فاصلهٔ نماد گاهی نیم‌فاصله است (فن افزار → فن‌افزار).
function codalVariants(symbol) {
  const s = CODAL_ALIAS[symbol] ?? symbol
  return [...new Set([
    s,
    s.replace(/آ/g, 'ا'),
    s.replace(/ /g, '‌'),          // نیم‌فاصله
    s.replace(/ /g, '‌').replace(/آ/g, 'ا'),
    s.replace(/[ ‌]/g, ''),
  ])]
}

async function codalPage(sym, p) {
  const url = `${CODAL_Q}&Symbol=${encodeURIComponent(sym)}&PageNumber=${p}`
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (res.status === 429) throw new Error('کدال ۴۲۹ (rate limit)')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json())?.Letters ?? []
}

// کدال از جدیدترین مرتب می‌کند؛ همین که به گزارش‌های قدیمی‌تر از بازهٔ ما رسیدیم بس است.
const OLDEST = WINDOWS[0][0].replace(/-/g, '/')   // «1404/01/01»
const CODAL_MAX_PAGES = 40

async function fetchFromCodal(symbol) {
  let sym = null
  for (const v of codalVariants(symbol)) {
    const first = await codalPage(v, 1)
    await sleep(1200)
    if (first.some(l => l.Symbol === v)) { sym = v; break }
  }
  if (!sym) return []
  if (sym !== symbol) console.log(`  نماد کدالِ «${symbol}» → «${sym}»`)

  const out = []
  for (let p = 1; p <= CODAL_MAX_PAGES; p++) {
    const letters = await codalPage(sym, p)
    if (!letters.length) break
    let old = false
    for (const l of letters) {
      if (l.Symbol !== sym) continue
      const pub = faDate(l.PublishDateTime ?? l.SentDateTime)
      if (pub && pub < OLDEST) { old = true; continue }
      out.push({
        l18: symbol,                       // نماد خودمان، نه املای کدال
        title: l.Title,
        date_publish: l.PublishDateTime ?? l.SentDateTime ?? null,
        link_excel: l.ExcelUrl || null,
        link_attachment: l.AttachmentUrl || null,
        link: l.Url || null,
      })
    }
    if (old) break                          // به قبل از بازه رسیدیم
    await sleep(1200)
  }
  return out
}

// نماد شاهد: اگر این هم صفر برگرداند، واقعاً throttle است؛ اگر داده بدهد،
// صفر بودنِ نماد هدف یعنی BrsAPI آن را ندارد — نه throttle. (بدون این، به ازای هر
// نماد بی‌پوشش چهار بار ۱۵ دقیقه الکی صبر می‌شد.)
const CANARY = 'شپدیس'
async function brsApiHealthy() {
  try {
    const [ds, de] = WINDOWS[WINDOWS.length - 1]
    const url = `https://Api.BrsApi.ir/Codal/Announcement.php?key=${KEY}`
      + `&l18=${encodeURIComponent(CANARY)}&date_start=${ds}&date_end=${de}`
    const data = await fetchJson(url)
    return (Array.isArray(data) ? data : (data?.announcement ?? [])).length > 0
  } catch { return false }
}

// آیا این فهرست اصلاً گزارشی دارد که ما پارس می‌کنیم؟
// (فاهواز از BrsAPI دو اطلاعیه می‌گیرد که هیچ‌کدام ماهانه/فصلی نیست، در حالی که کدال
//  ۱۶۰ نامه دارد — پس «فهرست خالی» معیار درستی برای fallback نیست.)
const hasUsable = (list) => {
  const { monthly, quarterly } = pickReports(list)
  return monthly.length > 0 || quarterly.length > 0
}

// خروجی: { list, throttled }
// کدال منبع مرجع است — BrsAPI گاهی اطلاعیه‌های تازه را جا می‌اندازد (سالانهٔ حسابرسی‌شدهٔ
// کفرا، منتشر ۱۴۰۵/۰۴/۲۵، در فید BrsAPI نبود در حالی که روی کدال بود؛ نتیجه: سایت و کانال
// روی نسخهٔ حسابرسی‌نشده ماندند). پس همیشه هر دو گرفته و ادغام می‌شوند؛ ردیف کدال مقدم است
// (لینک اکسل مستقیم و فهرست کامل‌تر). throttle فقط وقتی اعلام می‌شود که هیچ‌کدام چیزی
// ندهند و نماد شاهدِ BrsAPI هم ساکت باشد.
async function fetchAnnouncements(symbol) {
  const list = await fetchFromBrsApi(symbol)

  await sleep(2000)
  let codal = []
  let codalErr = null
  try { codal = await fetchFromCodal(symbol) }
  catch (e) { codalErr = e; console.log(`    کدال: ${e.message}`) }

  if (codal.length) {
    // dedupe نمی‌کنیم: ردیف تکراری کدال/BrsAPI لینک اکسل متفاوت دارد و firstParsable
    // نسخهٔ بعدی را وقتی امتحان می‌کند که قبلی دانلود/پارس نشود — حذفش یعنی از دست دادن fallback
    // (اکسل GetAll کدال زیر بار پشت‌سرهم throttle می‌شود و ماهانه‌ها فقط با لینک BrsAPI درآمدند).
    return { list: [...codal, ...list], throttled: false }
  }

  if (list.length) return { list, throttled: false }
  if (codalErr && /۴۲۹/.test(codalErr.message)) return { list: [], throttled: true }

  // هیچ‌کدام چیزی نداد: اگر شاهد سالم است، نماد واقعاً گزارشی ندارد
  await sleep(2000)
  return { list: [], throttled: !(await brsApiHealthy()) }
}

// ═══ دانلود اکسل-HTML کدال و پارس با XLSX (با retry برای throttle) ═══
async function fetchWorkbookOnce(a) {
  if (!a.link_excel) return null
  // link_excel را unmask نکن: id در path است و IIS کدال %2f را ۴۰۴ می‌دهد.
  // فرم ماسک‌شده (QQQaQQQ/OOObOOO) مستقیماً ۲۰۰ برمی‌گرداند. unmask فقط برای DownloadFile.aspx?id= (query string) درست است.
  const url = a.link_excel
  const res = await fetch(url, {
    signal: AbortSignal.timeout(40_000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const sig = buf.slice(0, 4).toString('hex')
  if (sig.startsWith('504b') || sig.startsWith('d0cf')) return XLSX.read(buf, { type: 'buffer' })
  const text = buf.toString('utf8')
  if (!/<table/i.test(text)) throw new Error('بدون جدول')
  return XLSX.read(text, { type: 'string' })
}

async function fetchWorkbook(a) {
  if (!a.link_excel) return null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { return await fetchWorkbookOnce(a) }
    catch (e) {
      if (attempt === 2) return null
      await sleep(3000)
    }
  }
  return null
}

const sheetRows = (wb, sn) => XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' })

// ═══ پارس گزارش فعالیت ماهانه — فرم استاندارد ═══
// چیدمان ستون‌ها ثابت نیست و نباید hardcode شود:
//   اولین ماهِ سال مالی → «دوره یک ماهه» | «تجمعی» | «تجمعی سال قبل»           (مبلغ در ۵/۹/۱۳)
//   ماه‌های بعد        → تجمعی قبل | اصلاحات | تجمعی اصلاح‌شده | «دوره یک ماهه» | … (مبلغ در ۱۶/۲۰/۲۴)
// پس بلوک‌ها را از ردیف سرگروه (بالای «نام محصول») پیدا می‌کنیم و ستون هر بلوک را از عنوانش.

// مرزهای بلوک‌ها از ردیف سرگروه: هر سلول پرشده شروع یک بلوک است تا سلول پرشدهٔ بعدی
function headerBlocks(groupRow, width) {
  const starts = []
  for (let i = 0; i < width; i++) if (norm(groupRow[i])) starts.push(i)
  return starts.map((s, k) => ({
    label: norm(groupRow[s]),
    from: s,
    to: (k + 1 < starts.length ? starts[k + 1] : width) - 1,
  }))
}

// ستونِ یک عنوان مشخص داخل بازهٔ یک بلوک
const colIn = (headRow, blk, re) => {
  if (!blk) return -1
  for (let i = blk.from; i <= blk.to; i++) if (re.test(norm(headRow[i]))) return i
  return -1
}

function monthlyCols(rows, hi) {
  const groupRow = rows[hi - 1] ?? []
  const headRow  = rows[hi]
  const width    = Math.max(groupRow.length, headRow.length)
  const blocks   = headerBlocks(groupRow, width)

  // بلوک ماه جاری: «دوره ... ماهه منتهی به»
  const mi = blocks.findIndex(b => /^دوره .* ماهه/.test(b.label))
  if (mi === -1) return null
  // دو بلوک «از ابتدای سال مالی» بعد از آن: اولی تجمعی امسال، دومی مشابه سال قبل
  const cums = blocks.slice(mi + 1).filter(b => /^از ابتدای سال مالی/.test(b.label))

  const AMOUNT = /^مبلغ فروش/
  const cols = {
    prod_m:  colIn(headRow, blocks[mi], /^تعداد تولید/),
    qty_m:   colIn(headRow, blocks[mi], /^تعداد فروش/),
    rate_m:  colIn(headRow, blocks[mi], /^نرخ فروش/),
    month:   colIn(headRow, blocks[mi], AMOUNT),
    cum:     colIn(headRow, cums[0], AMOUNT),
    lastCum: colIn(headRow, cums[1], AMOUNT),
  }
  return cols.month === -1 ? null : cols
}

function parseMonthly(wb) {
  for (const sn of wb.SheetNames) {
    const rows = sheetRows(wb, sn)
    const hi = rows.findIndex(r => r.some(c => norm(c) === 'نام محصول'))
    if (hi < 1) continue
    const c = monthlyCols(rows, hi)
    if (!c) continue

    const at = (r, i) => (i === -1 ? null : faNum(r[i]))
    const products = []
    let totals = null
    // سرفصل‌های بخش: «فروش داخلی:» → 'domestic'، «فروش صادراتی:» → 'export'،
    // «درآمد ارائه خدمات:» → 'service' (شرکت‌های خدماتی/لیزینگ محصولشان همین‌جاست).
    // فقط «برگشت از فروش» و «تخفیفات» محصول نیستند → section=null یعنی drop.
    // سرفصل ناشناخته به‌جای drop، 'other' می‌شود تا داده بی‌صدا از دست نرود.
    // پیش‌فرض 'domestic' برای فرم‌هایی که همان اول محصول را بدون سرفصل صریح می‌آورند.
    let section = 'domestic'
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]
      const name = norm(r[0])
      if (!name) continue
      if (name === 'جمع') {
        totals = { month: at(r, c.month), cum: at(r, c.cum), lastYearCum: at(r, c.lastCum) }
        break
      }
      if (name.endsWith(':')) {
        if (/^فروش داخلی:?$/.test(name)) section = 'domestic'
        else if (/^فروش صادراتی:?$/.test(name)) section = 'export'
        else if (/^درآمد ارائه خدمات:?$/.test(name)) section = 'service'
        else if (/^(برگشت از فروش|تخفیفات):?$/.test(name)) section = null
        else section = 'other'
        continue
      }
      if (name.startsWith('جمع')) continue
      if (!section) continue
      const amount_m = at(r, c.month)
      const qty_m    = at(r, c.qty_m)
      if (amount_m === null && qty_m === null) continue
      products.push({
        name, unit: norm(r[1]) || null, channel: section,
        prod_m: at(r, c.prod_m), qty_m, rate_m: at(r, c.rate_m), amount_m,
        amount_cum: at(r, c.cum),
      })
    }
    if (totals) return { products, ...totals }
  }
  return null
}

// ═══ پارس صورت سود و زیان میاندوره‌ای — سطرها با برچسب، ستون ۱=دوره جاری، ۲=مشابه سال قبل، ۳=سال مالی قبل ═══
// روی برچسبِ بدون فاصله تطبیق می‌شوند (label())
// «جمعدرآمدهایعملیاتی» فرم شرکت سرمایه‌گذاری است؛ «درآمدهایعملیاتی» فرم تولیدی.
const PL_MAP = [
  ['revenue',  /^جمعدرآمدهایعملیاتی$|^درآمدهایعملیاتی$/],
  ['cogs',     /^بهایتمامشده/],
  ['gross',    /^سود\(زیان\)ناخالص/],
  ['sga',      /^هزینههایفروش،اداری|^جمعهزینههایعملیاتی$/],
  ['op',       /^سود\(زیان\)عملیاتی$/],
  ['fin_cost', /^هزینههایمالی$/],
  ['net',      /^سود\(زیان\)خالص$/],
  ['eps',      /^سود\(زیان\)خالصهرسهم/],
  ['capital',  /^سرمایه$/],
]

// ═══ گزارش ماهانه شرکت‌های سرمایه‌گذاری/هلدینگ: صورت وضعیت پرتفوی ═══
// شیت «سهام پذیرفته‌شده در بورس» — هدر دو ردیفه:
//   نام شرکت | سرمایه | ارزش اسمی | [ابتدای دوره: تعداد، بهای تمام‌شده، ارزش بازار]
//   | [تغییرات: تعداد، بهای، ارزش بازار] | [انتهای دوره: درصد مالکیت، بهای، ارزش بازار] | …
// همه مبالغ میلیون ریال. «تغییرات تعداد سهام» = خرید (مثبت) / فروش (منفی) طی ماه.
function parseMonthlyPortfolio(wb) {
  for (const sn of wb.SheetNames) {
    const rows = sheetRows(wb, sn)
    // ردیف زیرعنوان که ستون‌های واقعی را دارد
    const hi = rows.findIndex(r => {
      const cells = r.map(norm)
      return cells.filter(c => c === 'تعداد سهام').length >= 2
        && cells.includes('ارزش بازار') && cells.includes('بهای تمام شده')
    })
    if (hi === -1) continue
    const sub = rows[hi].map(norm)
    // گروه‌ها را از روی ترتیب «تعداد سهام» پیدا کن
    const qIdx = sub.reduce((a, c, i) => (c === 'تعداد سهام' ? [...a, i] : a), [])
    const ownIdx = sub.indexOf('درصد مالکیت')
    if (qIdx.length < 2 || ownIdx === -1) continue
    const [i0, i1] = qIdx           // ابتدای دوره، تغییرات
    const col = { q0: i0, c0: i0 + 1, mv0: i0 + 2, dq: i1, dc: i1 + 1, dmv: i1 + 2, own: ownIdx, c1: ownIdx + 1, mv1: ownIdx + 2 }

    const holdings = []
    let totals = null
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]
      const name = norm(r[0])
      if (name.startsWith('جمع')) {
        // «جمع» نهایی — جمع‌های میانی (جمع سهام پذیرفته‌شده…) را رد نکن، آخری برنده است
        totals = { totalCost: faNum(r[col.c1]), totalMv: faNum(r[col.mv1]) }
        continue
      }
      if (!name || name.endsWith(':')) continue
      const mv1 = faNum(r[col.mv1])
      const c1  = faNum(r[col.c1])
      if (mv1 === null && c1 === null) continue
      holdings.push({
        name,
        q0: faNum(r[col.q0]), c0: faNum(r[col.c0]), mv0: faNum(r[col.mv0]),
        dq: faNum(r[col.dq]), dc: faNum(r[col.dc]), dmv: faNum(r[col.dmv]),
        own: faNum(r[col.own]), c1, mv1,
      })
    }
    if (holdings.length && totals && totals.totalMv !== null) {
      const gain = (totals.totalMv ?? 0) - (totals.totalCost ?? 0)
      return { kind: 'portfolio', holdings, ...totals, gain }
    }
  }
  return null
}

// ═══ گزارش ماهانه بدون محصول: بانک، خدماتی/قراردادی، انبوه‌سازی ═══
// هر سه یک شکل دارند — «شرح» در ستون ۰ و یک ستون «… طی دوره …» که مبلغ خودِ ماه است.
// ستون‌ها را از متن هدر پیدا می‌کنیم، نه از جای ثابت: چند ستون «از ابتدای سال مالی تا …»
// وجود دارد (تجمعی تا ماه قبل، اصلاح‌شده، تجمعی جاری) و انتخاب نادرست، تجمعیِ ماه قبل را
// به‌جای فروش ماه می‌نشاند.
//
//   بانک/انبوه‌سازی: شرح | تجمعی تا ماه قبل | اصلاحات | اصلاح‌شده | ⟨طی دوره⟩ | ⟨جمع از ابتدای سال⟩
//   خدماتی:        شرح | تاریخ عقد | مدت | تجمعی تا ماه قبل | اصلاحات | اصلاح‌شده | ⟨طی دوره⟩ | ⟨از اول سال⟩ | کل سال مالی قبل
//
// ستون آخرِ فرم خدماتی «تا پایان دوره مالی منتهی به ۱۴۰۴/۱۲/۲۹» است — کل سال مالی قبل،
// نه دوره مشابه. پس lastYearCum را null می‌گذاریم؛ مقایسهٔ ۳ ماه با ۱۲ ماه معنا ندارد.
const MONTH_COL_RE = /(طی|طي) (دوره|ماه)/
const CUM_COL_RE   = /از (ابتدای|اول) سال مالی تا/

function findRevenueCols(rows) {
  for (let hi = 0; hi < Math.min(rows.length, 4); hi++) {
    const cells = rows[hi].map(norm)
    const mi = cells.findIndex(c => MONTH_COL_RE.test(c))
    if (mi < 1) continue                          // ستون ۰ همان «شرح» است
    const ci = cells.findIndex((c, j) => j > mi && CUM_COL_RE.test(c) && !/اصلاح/.test(c))
    return { hi, mi, ci: ci === -1 ? null : ci, head: cells[mi] }
  }
  return null
}

// همهٔ جدول‌های «درآمد/هزینه طی دوره» در کل فایل
function revenueTables(wb) {
  const out = []
  for (const sn of wb.SheetNames) {
    const rows = sheetRows(wb, sn)
    const f = findRevenueCols(rows)
    if (!f) continue

    const items = []
    let total = null
    for (const r of rows.slice(f.hi + 1)) {
      const name = norm(r[0])
      const amount_m = faNum(r[f.mi])
      if (!name || amount_m === null) continue
      const amount_cum = f.ci === null ? null : faNum(r[f.ci])
      if (/^جمع/.test(name)) { total = { month: amount_m, cum: amount_cum }; continue }
      if (/^سرفصل/.test(name)) continue
      items.push({ name, unit: null, prod_m: null, qty_m: null, rate_m: null, amount_m, amount_cum })
    }
    if (!items.length) continue

    const sum = (k) => items.reduce((s, x) => s + (x[k] ?? 0), 0)
    out.push({
      head: f.head,
      items,
      month: total?.month ?? sum('amount_m'),
      cum: total?.cum ?? sum('amount_cum'),
    })
  }
  return out
}

function parseMonthlyRevenue(wb) {
  const tables = revenueTables(wb)
  if (!tables.length) return null
  const income  = tables.find(t => /^درآمد/.test(t.head)) ?? tables[0]
  const expense = tables.find(t => /^هزینه/.test(t.head))

  return {
    // بانک‌ها هم درآمد دارند هم هزینهٔ محقق‌شده؛ خدماتی/انبوه‌سازی فقط درآمد
    kind: expense ? 'bank' : 'service',
    products: income.items,
    expenses: expense?.items ?? [],
    month: income.month,
    cum: income.cum,
    lastYearCum: null,
    expense_m: expense?.month ?? null,
    expense_cum: expense?.cum ?? null,
  }
}

function parsePL(wb) {
  // «صورت سود و زیان جامع» هم ردیف «سود(زیان) خالص» را دارد؛ اگر قبل از صورت سود و زیان
  // اصلی بیاید (فرم سالانهٔ کفرا)، فقط net پر می‌شد و بقیه null می‌ماند. پس همهٔ شیت‌ها
  // امتیازدهی می‌شوند و کامل‌ترین (بیشترین فیلد PL_MAP) برنده است.
  let best = null, bestScore = 0
  for (const sn of wb.SheetNames) {
    const rows = sheetRows(wb, sn)
    const labels = rows.map(r => label(r[0]))
    if (!labels.some(l => /^سود\(زیان\)خالص$/.test(l))) continue
    const out = {}
    rows.forEach((r, i) => {
      const v = faNum(r[1])
      // ردیف‌های سرفصل مقدار ندارند (مثلاً «درآمدهای عملیاتی» در فرم شرکت سرمایه‌گذاری)
      if (v === null) return
      for (const [key, re] of PL_MAP) {
        if (out[key] === undefined && re.test(labels[i])) {
          out[key] = v
          out[key + '_ly'] = faNum(r[2])   // دوره مشابه سال قبل
        }
      }
    })
    // بانک‌ها ردیف «درآمدهای عملیاتی» استاندارد ندارند — سود خالص کافی است
    if (out.net === undefined) continue
    const score = PL_MAP.filter(([key]) => out[key] !== undefined).length
    if (score > bestScore) { best = out; bestScore = score }
  }
  if (!best) return null
  // کلیدهای غایب باید null باشند نه undefined (وگرنه در JSON حذف و در UI به NaN تبدیل می‌شوند)
  for (const [key] of PL_MAP) {
    if (best[key] === undefined) { best[key] = null; best[key + '_ly'] = null }
  }
  return best
}

// ═══ پارس ترازنامه — همان اکسل صورت‌های مالی میاندوره‌ای/سالانه، شیت جداگانه ═══
// ستون‌ها: ۱=پایان دوره جاری، ۲=پایان سال مالی قبل (نه دورهٔ مشابه — ترازنامه مقطعی است)
// روی گزارش سالانه/فصلی صورت‌های مالی این دو ستون درست‌اند؛ برای محاسبه فقط گزارش سالانه
// (months===12، در computeFundamentals) استفاده می‌شود که معمولاً دقیقاً همین دو ستون را دارد.
// ✅ تأیید شده روی داده واقعی شپدیس (صورت‌های مالی میاندوره‌ای ۹ ماهه، سرور ایران):
// «جمع دارايي‌ها»، «جمع بدهي‌ها»، «جمع حقوق مالکانه» (نه «حقوق صاحبان سهام» — کدال بسته
// به فرم شرکت این عنوان را عوض می‌کند) — چک تراز (دارایی = بدهی + حقوق مالکانه) هم درست بود.
// cash/debt_lt/debt_st برای EV (ارزش شرکت) — جمع بدهی‌ها معیار درستی برای EV نیست چون
// پرداختنی‌های تجاری/ذخایر را هم شامل می‌شود؛ فقط بدهی بهره‌دار (تسهیلات مالی) باید در EV بیاید.
// ✅ تأیید شده روی داده واقعی شپدیس: «موجودي نقد» (دارایی جاری)، «تسهيلات مالي بلندمدت»
// (بدهی غیرجاری)، «تسهيلات مالي» بدون پسوند (بدهی جاری) — ترتیب رجکس مهم نیست چون هر دو
// دقیقاً منطبق (^...$) و مانع تداخل‌اند.
const BS_MAP = [
  ['assets',      /^جمعداراییها$|^جمعکلداراییها$/],
  ['liabilities', /^جمعبدهیها$|^جمعکلبدهیها$/],
  ['equity',      /^جمعحقوقصاحبانسهام$|^جمعحقوقمالکانه$/],
  ['cash',        /^موجودینقد$/],
  ['debt_lt',     /^تسهیلاتمالیبلندمدت$/],
  ['debt_st',     /^تسهیلاتمالی$/],
]

function parseBS(wb) {
  for (const sn of wb.SheetNames) {
    const rows = sheetRows(wb, sn)
    const labels = rows.map(r => label(r[0]))
    if (!labels.some(l => /^جمعحقوقصاحبانسهام$|^جمعحقوقمالکانه$/.test(l))) continue
    const out = {}
    rows.forEach((r, i) => {
      const v = faNum(r[1])
      if (v === null) return
      for (const [key, re] of BS_MAP) {
        if (out[key] === undefined && re.test(labels[i])) {
          out[key] = v
          out[key + '_prev'] = faNum(r[2])   // پایان سال مالی قبل
        }
      }
    })
    if (out.equity !== undefined) {
      for (const [key] of BS_MAP) {
        if (out[key] === undefined) { out[key] = null; out[key + '_prev'] = null }
      }
      return out
    }
  }
  return null
}

// صورت سود و زیان + ترازنامه — هر دو از یک اکسل صورت‌های مالی
function parseFinancials(wb) {
  const pl = parsePL(wb)
  if (!pl) return null
  const bs = parseBS(wb) || Object.fromEntries(
    BS_MAP.flatMap(([key]) => [[key, null], [key + '_prev', null]]),
  )
  return { ...pl, ...bs }
}

// ═══ انتخاب اطلاعیه‌ها ═══
function pickReports(list) {
  const isSub = (t) => /\(شرکت /.test(t)                  // گزارش زیرمجموعه

  // گروه‌بندی بر اساس کلید دوره؛ در هر گروه نسخه‌ها را به‌ترتیب اولویت مرتب می‌کند
  const groupBy = (arr, keyFn, rank) => {
    const m = new Map()
    for (const a of arr) {
      const k = keyFn(a)
      if (!k) continue
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(a)
    }
    const groups = []
    for (const [k, cands] of m) {
      cands.sort(rank)
      groups.push({ key: k, candidates: cands })
    }
    return groups
  }

  // ماهانه: نسخه اصلی مقدم بر اصلاحیه (اصلاحیه گاهی اکسل خالی دارد)، بعد جدیدترین انتشار
  const monthly = groupBy(
    list.filter(a => /گزارش فعالیت ماهانه/.test(norm(a.title)) && !isSub(norm(a.title))),
    a => faDate(a.title),
    // اصلاحیه (داده تصحیح‌شده) اول؛ اگر اکسلش نیامد، نسخه اصلی جایگزین می‌شود
    (a, b) => (faDate(b.date_publish) || '').localeCompare(faDate(a.date_publish) || ''),
  ).sort((x, y) => x.key.localeCompare(y.key))

  const interim = list.filter(a => {
    const t = norm(a.title)
    return (/میاندوره/.test(t.replace(/‌/g, '')) || /میان دوره/.test(t))
      && /دوره (۳|۶|۹|3|6|9) ماهه/.test(t) && !isSub(t)
  })
  const annual = list.filter(a => {
    const t = norm(a.title).replace(/‌/g, ' ')
    return /^صورت های مالی(\s+تلفیقی)?\s+سال مالی منتهی به/.test(t) && !isSub(norm(a.title))
  })

  const durOf = (a) => {
    const m = norm(a.title).match(/دوره (۳|۶|۹|3|6|9|۱۲|12) ماهه/)
    return m ? faNum(m[1]) : 12
  }
  // صورت‌های مالی: غیرتلفیقی مقدم، بعد جدیدترین انتشار (اصلاحیه‌ها هم پوشش داده می‌شوند)
  const quarterly = groupBy(
    [...interim, ...annual],
    a => { const d = faDate(norm(a.title)); return d ? `${d}|${durOf(a)}` : null },
    (a, b) => {
      const ac = /تلفیقی/.test(norm(a.title)) ? 1 : 0
      const bc = /تلفیقی/.test(norm(b.title)) ? 1 : 0
      if (ac !== bc) return ac - bc
      return (faDate(b.date_publish) || '').localeCompare(faDate(a.date_publish) || '')
    },
  ).sort((x, y) => x.key.localeCompare(y.key))

  return { monthly, quarterly }
}

// اولین نسخه‌ای که اکسلش می‌آید و پارس می‌شود؛ در غیر این صورت null
// isComplete (اختیاری): اگر نسخهٔ پارس‌شده ناقص بود (مثلاً اکسل سالانهٔ حسابرسی‌نشدهٔ کفرا
// که کلاً شیت صورت سود و زیان ندارد و فقط «جامع» دارد)، نسخه‌های بعدی هم امتحان می‌شوند
// و ناقصِ اول فقط وقتی برمی‌گردد که هیچ نسخهٔ کاملی پیدا نشود.
// خروجی: { a, p } یا { reason: 'دانلود' | 'پارس' }
async function firstParsable(candidates, parse, isComplete) {
  let reason = 'دانلود'
  let partial = null
  for (const a of candidates) {
    try {
      const wb = await fetchWorkbook(a)
      await sleep(1500)
      if (!wb) continue
      const p = parse(wb)
      if (!p) { reason = 'پارس'; continue }   // اکسل آمد ولی فرم شناخته نشد
      if (!isComplete || isComplete(p)) return { a, p }
      if (!partial) partial = { a, p }        // ناقص — نگه دار، شاید نسخهٔ دیگر کامل باشد
    } catch { await sleep(1500) }
  }
  return partial || { reason }
}

// ═══ Supabase ═══ (lazy — اگر کلید نبود، فقط فایل نوشته می‌شود)
let _sb = null
function sbClient() {
  if (_sb !== null) return _sb
  if (!SUPABASE_URL || !SUPABASE_KEY) { _sb = false; return false }
  const { createClient } = require('@supabase/supabase-js')
  // Node < 22 بدون WebSocket بومی — پکیج ws را صریح پاس می‌دهیم (مثل stocks-industries.js)
  let wsTransport
  try { wsTransport = require('ws') } catch { /* Node 22+ نیازی ندارد */ }
  _sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    ...(wsTransport ? { realtime: { transport: wsTransport } } : {}),
  })
  return _sb
}

async function upsertReport(row) {
  const sb = sbClient()
  if (!sb) return
  // شبکهٔ ایران→Supabase گاهی «fetch failed» گذرا می‌دهد. چون skip بعدی نسخهٔ فایل را می‌بیند
  // نه جدول را، یک upsert ازدست‌رفته یعنی جدول برای همیشه کهنه می‌ماند — پس چند بار تلاش کن.
  let lastErr
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const { error } = await sb.from('stock_reports').upsert(row, { onConflict: 'symbol' })
      if (!error) return
      lastErr = error.message
    } catch (e) { lastErr = (e && e.message) || String(e) }
    await sleep(3000 * attempt)
  }
  throw new Error(`Supabase upsert «${row.symbol}»: ${lastErr}`)
}

// ═══ پردازش یک نماد ═══
// خروجی: 'skip' | 'throttle' | 'empty' | 'ok'
async function buildSymbol(symbol, opts = {}) {
  const force = opts.force ?? FORCE
  const outFile = path.join(OUT_DIR, `${symbol.replace(/\s+/g, '-')}.json`)
  // skip فقط وقتی خروجی با همین نسخهٔ پارسر ساخته شده باشد
  if (!force && fs.existsSync(outFile)) {
    let v = 0
    try { v = JSON.parse(fs.readFileSync(outFile, 'utf8')).parser ?? 0 } catch { v = 0 }
    if (v >= PARSER_VERSION) { console.log(`⏭ ${symbol} — موجود است (پارسر ${v})`); return 'skip' }
    console.log(`♻️ ${symbol} — خروجی با پارسر قدیمی (${v} < ${PARSER_VERSION})، بازسازی`)
  }

  console.log(`\n═══ ${symbol} ═══`)
  const { list, throttled } = await fetchAnnouncements(symbol)
  console.log(`  ${list.length} اطلاعیه`)
  // صفر اطلاعیه: فقط وقتی throttle است که نماد شاهد هم چیزی برنگرداند
  if (list.length === 0) return throttled ? 'throttle' : 'empty'
  const { monthly, quarterly } = pickReports(list)
  console.log(`  فعالیت ماهانه: ${monthly.length} دوره | صورت مالی: ${quarterly.length} دوره`)

  // فرم تولیدی (نام محصول) → پرتفوی (هلدینگ/سرمایه‌گذاری) → درآمدی (بانک/خدماتی/انبوه‌سازی)
  const parseAnyMonthly = (wb) => parseMonthly(wb) || parseMonthlyPortfolio(wb) || parseMonthlyRevenue(wb)

  const months = []
  for (const g of monthly) {
    const r = await firstParsable(g.candidates, parseAnyMonthly)
    if (r.reason) { console.log(`    ⚠️ ماهانه ${g.key}: ${r.reason} ناموفق (${g.candidates.length} نسخه)`); continue }
    // شفافیت برای دیباگ بعدی: کدوم نسخه واقعاً استفاده شد (اصلاحیه یا اصلی، وقتی چند نسخه بود)
    if (g.candidates.length > 1) console.log(`    ℹ️ ماهانه ${g.key}: از ${g.candidates.length} نسخه، «${norm(r.a.title)}» (منتشر ${faDate(r.a.date_publish)}) انتخاب شد`)
    months.push({ period: faDate(r.a.title), publish: faDate(r.a.date_publish), kind: 'production', ...r.p })
  }
  months.sort((a, b) => a.period.localeCompare(b.period))

  const quarters = []
  for (const g of quarterly) {
    // eps و revenue هر دو null یعنی فقط شیت «سود و زیان جامع» پارس شده — نسخهٔ کامل‌تر را بگرد
    const r = await firstParsable(g.candidates, parseFinancials, (p) => p.eps != null || p.revenue != null)
    if (r.reason) { console.log(`    ⚠️ فصلی ${g.key}: ${r.reason} ناموفق (${g.candidates.length} نسخه)`); continue }
    const t = norm(r.a.title)
    const dur = t.match(/دوره (۳|۶|۹|3|6|9|۱۲|12) ماهه/)
    quarters.push({
      period: faDate(t),
      months: dur ? faNum(dur[1]) : 12,
      audited: /حسابرسی شده/.test(t),
      consolidated: /تلفیقی/.test(t),
      publish: faDate(r.a.date_publish),
      ...r.p,
    })
  }
  quarters.sort((a, b) => (a.period + a.months).localeCompare(b.period + b.months))

  // ادغام با خروجی قبلی همین نماد: throttle/قطعی گذرای دانلود اکسل نباید دوره‌هایی را که
  // قبلاً سالم پارس شده‌اند بپراند (اتفاق واقعی: ۵ ماهانهٔ کفرا در یک اجرای بد شبکه گم شد و
  // همان payload لاغر روی Supabase نشست). قاعدهٔ برد: رکورد جدید فقط وقتی جای قبلی را
  // می‌گیرد که publish جدیدتر داشته باشد، یا publish برابر و فیلد پرشدهٔ کمتری نداشته باشد.
  let prevOut = null
  try { prevOut = JSON.parse(fs.readFileSync(outFile, 'utf8')) } catch {}
  if (prevOut) {
    const filled = (x) => Object.values(x).filter(v => v != null).length
    const keepNew = (n, o) => (n.publish || '') > (o.publish || '')
      || ((n.publish || '') === (o.publish || '') && filled(n) >= filled(o))
    const mergeInto = (cur, old, keyFn) => {
      const map = new Map(cur.map(x => [keyFn(x), x]))
      for (const o of old || []) {
        const k = keyFn(o)
        const n = map.get(k)
        if (!n || !keepNew(n, o)) map.set(k, o)
      }
      return [...map.values()]
    }
    months.splice(0, months.length, ...mergeInto(months, prevOut.months, (m) => m.period))
    months.sort((a, b) => a.period.localeCompare(b.period))
    quarters.splice(0, quarters.length, ...mergeInto(quarters, prevOut.quarters, (q) => `${q.period}|${q.months}`))
    quarters.sort((a, b) => (a.period + a.months).localeCompare(b.period + b.months))
  }

  if (months.length === 0 && quarters.length === 0) {
    console.log(`  ❌ ${symbol}: هیچ گزارشی پارس نشد`)
    return 'empty'
  }
  const payload = { symbol, updated: new Date().toISOString(), parser: PARSER_VERSION, months, quarters }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(payload))

  let sbNote = ''
  try {
    await upsertReport({
      symbol,
      data: payload,
      months: months.length,
      quarters: quarters.length,
      updated: payload.updated,
    })
    if (sbClient()) sbNote = ' → Supabase'
  } catch (e) { diag(`⚠️ ${symbol}: ${e.message}`) }

  console.log(`  ✅ ${symbol}: ${months.length} ماه + ${quarters.length} دوره → ${path.basename(outFile)}${sbNote}`)
  return 'ok'
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const indIdx = process.argv.indexOf('--industry')
  const ALL = process.argv.includes('--all')
  let symbols = []
  if (ALL) {
    const file = path.join(__dirname, 'stocks-industries.json')
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const seen = new Set()
    for (const ind of data.industries) {
      for (const s of ind.symbols) {
        if (!seen.has(s.l18)) { seen.add(s.l18); symbols.push(s.l18) }
      }
    }
    const live = symbols.length
    // stocks-industries.json فقط نمادهای فید زندهٔ BrsAPI را دارد؛ نمادی که یک بار از فید
    // بیفتد (تعلیق، بدون معامله) دیگر هرگز بازسازی نمی‌شود و برای همیشه با پارسر کهنه می‌ماند.
    // پس هر نمادی که قبلاً خروجی ساخته‌ایم هم در دامنه بماند.
    try {
      for (const f of fs.readdirSync(OUT_DIR)) {
        if (!f.endsWith('.json')) continue
        const s = f.replace(/\.json$/, '').replace(/-/g, ' ')
        if (!seen.has(s)) { seen.add(s); symbols.push(s) }
      }
    } catch { /* هنوز خروجی‌ای نیست */ }
    console.log(`همه صنایع — ${symbols.length} نماد یکتا (${live} از فید زنده، ${symbols.length - live} از خروجی‌های قبلی)`)
  } else if (indIdx !== -1) {
    const id = Number(process.argv[indIdx + 1])
    const file = path.join(__dirname, 'stocks-industries.json')
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const ind = data.industries.find(x => x.id === id)
    if (!ind) { console.error(`صنعت ${id} در ${file} نیست`); process.exit(1) }
    symbols = ind.symbols.map(s => s.l18)
    console.log(`صنعت «${ind.name}» — ${symbols.length} نماد`)
  } else {
    symbols = process.argv.slice(2).filter(a => !a.startsWith('--'))
    if (symbols.length === 0) { console.error('نماد یا --industry یا --all بدهید'); process.exit(1) }
  }

  const stat = { ok: 0, skip: 0, empty: 0, fail: 0 }
  let done = 0
  for (const s of symbols) {
    done++
    diag(`START ${done}/${symbols.length} «${s}» ${mem()}`)
    let status = null
    // تا ۴ بار در برابر throttle مقاومت کن: صفر اطلاعیه → صبر ۱۵ دقیقه و تلاش دوباره
    for (let attempt = 1; attempt <= 4; attempt++) {
      try { status = await buildSymbol(s) }
      catch (e) { diag(`❌ ${s}: ${(e && e.stack) || e.message}`); status = 'fail'; break }
      if (status !== 'throttle') break
      if (attempt === 4) { console.log(`  ⛔ ${s}: throttle مداوم — رد شد`); status = 'fail'; break }
      const wait = 15 * 60 * 1000
      console.log(`  ⏸ throttle کدال — صبر ۱۵ دقیقه (تلاش ${attempt}/۳) [${done}/${symbols.length}]`)
      await sleep(wait)
    }
    if (status && stat[status] !== undefined) stat[status]++
    diag(`END «${s}» → ${status} | پیشرفت ${done}/${symbols.length} ✅${stat.ok} ⏭${stat.skip} ❌${stat.empty} ⛔${stat.fail}`)
    await sleep(4000)
  }
  diag(`✔ تمام شد. ✅${stat.ok} جدید | ⏭${stat.skip} موجود | ❌${stat.empty} بدون‌گزارش | ⛔${stat.fail} ناموفق`)
}

// codal-watch.js این ماژول را require می‌کند و فقط buildSymbol را صدا می‌زند
module.exports = { buildSymbol, fetchAnnouncements, sbClient, diag, OUT_DIR, parseMonthly, parseFinancials, upsertReport, faDate }

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1) })
}
