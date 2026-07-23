#!/usr/bin/env node
/**
 * codal-backfill-quarterly.js
 *
 * بورس سنج — backfill یک‌بارهٔ صورت‌های مالی فصلی/سالانهٔ قدیمی (پیش‌فرض: دورهٔ ۱۴۰۰/۰۱/۰۱ تا ۱۴۰۴/۰۱/۰۱)
 * برای همهٔ نمادهای موجود در جدول stock_reports.
 *
 * چرا جدا از codal-company-reports.js؟ پنجرهٔ آن اسکریپت بر اساس «تاریخ انتشار» از ۱۴۰۴ به بعد است؛
 * این‌جا برعکس بر اساس «دورهٔ گزارش» عقب می‌رویم. فقط فصلی — ماهانه‌ها عمداً بیرون‌اند (×۱۲ حجم،
 * نمودارهای کارت/سایت فقط فصلی می‌خواهند).
 *
 * طراحی برای اجرا روی سرور آلمان (بدون reports-out محلی):
 *   - payload قبلی از خود Supabase خوانده می‌شود، دوره‌های قدیمی merge و دوباره upsert می‌شود.
 *   - هیچ ارسال تلگرامی ندارد — فقط دیتا.
 *   - دوره‌های پارس‌شده در backfill-out/<نماد>.json هم کش می‌شوند تا اگر codal-watch (که از فایل
 *     محلی سرور ایران می‌سازد) روی همان نماد upsert کرد و backfill را شست، اجرای دوباره با
 *     --resync بدون هیچ دانلودی از کش دوباره merge کند.
 *   - resume-safe: نمادی که در کش تمام‌شده علامت خورده، در اجرای بعدی رد می‌شود (--force برای بازسازی).
 *
 * استفاده:
 *   node scripts/codal-backfill-quarterly.js --all              → همهٔ نمادهای stock_reports
 *   node scripts/codal-backfill-quarterly.js شپدیس فولاد        → چند نماد مشخص
 *   node scripts/codal-backfill-quarterly.js --all --resync     → فقط merge دوباره از کش (بدون فچ)
 *   گزینه‌ها: --from 1400/01/01  --to 1404/01/01  --force
 *
 * بعد از پایان، روی سرور ایران یک بار sync فایل‌ها لازم است (تا rebuild بعدی codal-watch دیتا را نشوید):
 *   node scripts/pull-reports-into-files.js
 */

'use strict'

const path = require('path')
const fs = require('fs')

const {
  sbClient, codalVariants, codalPage, pickReports, firstParsable,
  parseFinancials, computeRatios, upsertReport, faDate, norm, faNum, sleep,
} = require('./codal-company-reports.js')

const CACHE_DIR = path.join(__dirname, 'backfill-out')

const argVal = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}
const FROM = argVal('--from', '1400/01/01')   // قدیمی‌ترین «دورهٔ» موردنظر
const TO = argVal('--to', '1404/01/01')       // از این دوره به بعد را خط لولهٔ اصلی دارد
const FORCE = process.argv.includes('--force')
const RESYNC = process.argv.includes('--resync')
const ALL = process.argv.includes('--all')

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)

// ═══ فچ کدال بر اساس دوره — صفحه‌به‌صفحه عقب می‌رویم تا انتشارِ قدیمی‌تر از FROM ═══
// شرط توقف روی «تاریخ انتشار» است: انتشار همیشه ≥ پایان دوره است، پس وقتی انتشار از FROM
// قدیمی‌تر شد، دورهٔ ≥ FROM دیگر نمی‌آید. سقف صفحه بالاتر از اسکریپت اصلی چون ۵+ سال عقب می‌رویم.
const MAX_PAGES = 120

async function fetchOldLetters(symbol) {
  let sym = null
  for (const v of codalVariants(symbol)) {
    const first = await codalPage(v, 1)
    await sleep(1500)
    if (first.some(l => l.Symbol === v)) { sym = v; break }
  }
  if (!sym) return []
  if (sym !== symbol) log(`  نماد کدالِ «${symbol}» → «${sym}»`)

  const out = []
  for (let p = 1; p <= MAX_PAGES; p++) {
    const letters = await codalPage(sym, p)
    if (!letters.length) break
    let old = false
    for (const l of letters) {
      if (l.Symbol !== sym) continue
      const pub = faDate(l.PublishDateTime ?? l.SentDateTime)
      if (pub && pub < FROM) { old = true; continue }
      out.push({
        l18: symbol,
        title: l.Title,
        date_publish: l.PublishDateTime ?? l.SentDateTime ?? null,
        link_excel: l.ExcelUrl || null,
        link_attachment: l.AttachmentUrl || null,
        link: l.Url || null,
      })
    }
    if (old) break
    await sleep(1500)
  }
  return out
}

// ═══ merge — همان قاعدهٔ برد buildSymbol: publish جدیدتر می‌برد ═══
const filled = (x) => Object.values(x).filter(v => v != null).length
const keepNew = (n, o) => (n.publish || '') > (o.publish || '')
  || ((n.publish || '') === (o.publish || '') && filled(n) >= filled(o))
const qKey = (q) => `${q.period}|${q.months}`

function mergeQuarters(current, extra) {
  const map = new Map((current || []).map(x => [qKey(x), x]))
  let added = 0
  for (const e of extra || []) {
    const cur = map.get(qKey(e))
    if (!cur) { map.set(qKey(e), e); added++; continue }
    if (keepNew(e, cur)) map.set(qKey(e), e)
  }
  const arr = [...map.values()]
  arr.sort((a, b) => (a.period + a.months).localeCompare(b.period + b.months))
  return { quarters: arr, added }
}

// ═══ یک نماد ═══
// خروجی: 'skip' | 'done' | 'empty' | 'throttle'
async function backfillSymbol(sb, symbol) {
  const cacheFile = path.join(CACHE_DIR, `${symbol.replace(/\s+/g, '-')}.json`)
  let cache = null
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) } catch {}

  // payload فعلی از DB — منبع حقیقت مشترک با سایت
  const { data: rows, error } = await sb.from('stock_reports').select('symbol, data').eq('symbol', symbol)
  if (error) throw new Error(`خواندن stock_reports «${symbol}»: ${error.message}`)
  const row = rows?.[0]
  if (!row?.data) { log(`  ⚠️ ${symbol}: در stock_reports نیست — رد شد`); return 'empty' }
  const payload = row.data

  let oldQuarters
  if (cache?.complete && !FORCE) {
    oldQuarters = cache.quarters || []
    if (!RESYNC) { log(`⏭ ${symbol} — کش کامل موجود است (فقط merge)`) }
  } else if (RESYNC) {
    // resync بدون کش یعنی چیزی برای merge نیست
    return 'skip'
  } else {
    let letters
    try { letters = await fetchOldLetters(symbol) }
    catch (e) {
      if (/۴۲۹/.test(e.message)) return 'throttle'
      throw e
    }
    const { quarterly } = pickReports(letters)
    // فقط گروه‌هایی که دوره‌شان در [FROM, TO) است و در payload فعلی نیستند
    const have = new Set((payload.quarters || []).map(qKey))
    const targets = quarterly.filter(g => {
      const period = g.key.split('|')[0]
      const months = Number(g.key.split('|')[1])
      return period >= FROM && period < TO && !have.has(`${period}|${months}`)
    })
    log(`  ${symbol}: ${letters.length} نامه، ${targets.length} دورهٔ قدیمی برای پارس`)

    oldQuarters = cache?.quarters || []
    const haveCached = new Set(oldQuarters.map(qKey))
    for (const g of targets) {
      const [period, monthsStr] = g.key.split('|')
      if (haveCached.has(`${period}|${Number(monthsStr)}`)) continue
      const r = await firstParsable(g.candidates, parseFinancials, (p) => p.eps != null || p.revenue != null)
      if (r.reason) { log(`    ⚠️ ${g.key}: ${r.reason} ناموفق (${g.candidates.length} نسخه)`); continue }
      const t = norm(r.a.title)
      const dur = t.match(/دوره (۳|۶|۹|3|6|9|۱۲|12) ماهه/)
      oldQuarters.push({
        period: faDate(t),
        months: dur ? faNum(dur[1]) : 12,
        audited: /حسابرسی شده/.test(t),
        consolidated: /تلفیقی/.test(t),
        publish: faDate(r.a.date_publish),
        ...r.p,
        cash_flow: r.p.cash_flow ?? null,
        ratios: computeRatios(r.p),
        red_flags: [],
      })
      log(`    ✅ ${g.key} پارس شد`)
      // کش بعد از هر پارس ذخیره می‌شود — کرش وسط کار، دانلودهای انجام‌شده را نمی‌سوزاند
      fs.mkdirSync(CACHE_DIR, { recursive: true })
      fs.writeFileSync(cacheFile, JSON.stringify({ symbol, complete: false, quarters: oldQuarters }))
    }
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify({ symbol, complete: true, quarters: oldQuarters }))
  }

  if (!oldQuarters.length) return 'empty'

  // merge در payload و upsert — payload تازه را دوباره از DB بخوان (بین فچ و الان codal-watch
  // ممکن است upsert کرده باشد؛ پنجرهٔ race کوچک می‌ماند ولی صفر نمی‌شود — پاس --resync آخر برای همین است)
  const { data: rows2 } = await sb.from('stock_reports').select('data').eq('symbol', symbol)
  const fresh = rows2?.[0]?.data || payload
  const { quarters, added } = mergeQuarters(fresh.quarters, oldQuarters)
  if (!added && quarters.length === (fresh.quarters || []).length) {
    log(`  ${symbol}: چیزی برای افزودن نبود`)
    return 'done'
  }
  fresh.quarters = quarters
  fresh.updated = new Date().toISOString()
  await upsertReport({
    symbol,
    data: fresh,
    months: (fresh.months || []).length,
    quarters: quarters.length,
    updated: fresh.updated,
  })
  log(`  ✅ ${symbol}: ${added} دورهٔ قدیمی اضافه شد (جمع ${quarters.length})`)
  return 'done'
}

async function main() {
  const sb = sbClient()
  if (!sb) { console.error('SUPABASE_URL/SUPABASE_KEY لازم است'); process.exit(1) }

  let symbols = process.argv.slice(2).filter(a => !a.startsWith('--') && !/^\d{4}\/\d{2}\/\d{2}$/.test(a))
  if (ALL || !symbols.length) {
    const { data, error } = await sb.from('stock_reports').select('symbol').order('symbol')
    if (error) throw new Error(`فهرست نمادها: ${error.message}`)
    symbols = data.map(r => r.symbol)
  }
  log(`دامنه: ${symbols.length} نماد | دوره‌های [${FROM}, ${TO})${RESYNC ? ' | فقط resync از کش' : ''}`)

  const stat = { done: 0, skip: 0, empty: 0, fail: 0 }
  let i = 0
  for (const s of symbols) {
    i++
    log(`═══ ${i}/${symbols.length} «${s}» ═══`)
    let status = null
    for (let attempt = 1; attempt <= 4; attempt++) {
      try { status = await backfillSymbol(sb, s) }
      catch (e) { log(`❌ ${s}: ${e.message}`); status = 'fail'; break }
      if (status !== 'throttle') break
      if (attempt === 4) { log(`  ⛔ ${s}: throttle مداوم — رد شد`); status = 'fail'; break }
      log(`  ⏸ throttle کدال — صبر ۱۵ دقیقه (تلاش ${attempt}/۳)`)
      await sleep(15 * 60 * 1000)
    }
    stat[status === 'done' ? 'done' : status === 'skip' ? 'skip' : status === 'empty' ? 'empty' : 'fail']++
    if (!RESYNC) await sleep(4000)
  }
  log(`✔ تمام شد. ✅${stat.done} | ⏭${stat.skip} | ∅${stat.empty} | ⛔${stat.fail}`)
}

main().catch(e => { console.error(e); process.exit(1) })
