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

const KEY   = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const FORCE = process.argv.includes('--force')
const OUT_DIR = path.join(__dirname, 'reports-out')

let XLSX
try { XLSX = require('xlsx') } catch { console.error('npm install xlsx لازم است'); process.exit(1) }

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ماسک BrsAPI روی base64: QQQaQQQ = %2f و OOObOOO = %2b
const unmask = (s) => String(s).replace(/QQQaQQQ/g, '%2f').replace(/OOObOOO/g, '%2b')

const norm = (s) => String(s || '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[‌‎‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim()

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

async function fetchAnnouncements(symbol) {
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

// ═══ دانلود اکسل-HTML کدال و پارس با XLSX (با retry برای throttle) ═══
async function fetchWorkbookOnce(a) {
  if (!a.link_excel) return null
  const url = unmask(a.link_excel)
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

// ═══ پارس گزارش فعالیت ماهانه — فرم استاندارد، ستون‌های موقعیتی ═══
// name(0) unit(1) | تجمعی قبل 2-5 | اصلاحات 6-8 | تجمعی اصلاح‌شده 9-12 |
// ماه 13-16 (تولید،فروش،نرخ،مبلغ) | تجمعی فعلی 17-20 | مشابه سال قبل 21-24
function parseMonthly(wb) {
  for (const sn of wb.SheetNames) {
    const rows = sheetRows(wb, sn)
    const hi = rows.findIndex(r => r.some(c => norm(c) === 'نام محصول'))
    if (hi === -1) continue
    const products = []
    let totals = null
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]
      const name = norm(r[0])
      if (!name) continue
      if (name === 'جمع') {
        totals = { month: faNum(r[16]), cum: faNum(r[20]), lastYearCum: faNum(r[24]) }
        break
      }
      if (name.endsWith(':') || name.startsWith('جمع')) continue
      const amount_m = faNum(r[16])
      const qty_m    = faNum(r[14])
      if (amount_m === null && qty_m === null) continue
      products.push({
        name, unit: norm(r[1]) || null,
        prod_m: faNum(r[13]), qty_m, rate_m: faNum(r[15]), amount_m,
        amount_cum: faNum(r[20]),
      })
    }
    if (totals) return { products, ...totals }
  }
  return null
}

// ═══ پارس صورت سود و زیان میاندوره‌ای — سطرها با برچسب، ستون ۱=دوره جاری، ۲=مشابه سال قبل، ۳=سال مالی قبل ═══
const PL_MAP = [
  ['revenue',  /^درآمدهای عملیاتی/],
  ['cogs',     /^بهای تمام شده/],
  ['gross',    /^سود\(زیان\) ناخالص/],
  ['sga',      /هزینه های فروش، اداری/],
  ['op',       /^سود\(زیان\) عملیاتی/],
  ['fin_cost', /^هزینه های مالی/],
  ['net',      /^سود\(زیان\) خالص$/],
  ['eps',      /^سود \(زیان\) خالص هر سهم|^سود\(زیان\) خالص هر سهم/],
  ['capital',  /^سرمایه$/],
]

function parsePL(wb) {
  for (const sn of wb.SheetNames) {
    const rows = sheetRows(wb, sn)
    const labels = rows.map(r => norm(r[0]).replace(/‏/g, ''))
    if (!labels.some(l => /^درآمدهای عملیاتی/.test(l)) || !labels.some(l => /^سود\(زیان\) خالص$/.test(l))) continue
    const out = {}
    rows.forEach((r, i) => {
      const label = labels[i]
      for (const [key, re] of PL_MAP) {
        if (out[key] === undefined && re.test(label)) {
          out[key] = faNum(r[1])
          out[key + '_ly'] = faNum(r[2])   // دوره مشابه سال قبل
        }
      }
    })
    if (out.revenue !== undefined) return out
  }
  return null
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
    return /^صورت های مالی\s+سال مالی منتهی به/.test(t) && !isSub(norm(a.title))
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
async function firstParsable(candidates, parse, label) {
  for (const a of candidates) {
    try {
      const wb = await fetchWorkbook(a)
      await sleep(1500)
      if (!wb) continue
      const p = parse(wb)
      if (p) return { a, p }
    } catch { await sleep(1500) }
  }
  return null
}

// ═══ پردازش یک نماد ═══
// خروجی: 'skip' | 'throttle' | 'empty' | 'ok'
async function buildSymbol(symbol) {
  const outFile = path.join(OUT_DIR, `${symbol.replace(/\s+/g, '-')}.json`)
  if (!FORCE && fs.existsSync(outFile)) { console.log(`⏭ ${symbol} — موجود است`); return 'skip' }

  console.log(`\n═══ ${symbol} ═══`)
  const list = await fetchAnnouncements(symbol)
  console.log(`  ${list.length} اطلاعیه`)
  // صفر اطلاعیه = تقریباً همیشه throttle کدال (هر شرکت بورسی اطلاعیه دارد)
  if (list.length === 0) return 'throttle'
  const { monthly, quarterly } = pickReports(list)
  console.log(`  فعالیت ماهانه: ${monthly.length} دوره | صورت مالی: ${quarterly.length} دوره`)

  const months = []
  for (const g of monthly) {
    const r = await firstParsable(g.candidates, parseMonthly)
    if (!r) { console.log(`    ⚠️ ماهانه ${g.key}: نیامد/پارس نشد (${g.candidates.length} نسخه)`); continue }
    months.push({ period: faDate(r.a.title), publish: faDate(r.a.date_publish), ...r.p })
  }
  months.sort((a, b) => a.period.localeCompare(b.period))

  const quarters = []
  for (const g of quarterly) {
    const r = await firstParsable(g.candidates, parsePL)
    if (!r) { console.log(`    ⚠️ فصلی ${g.key}: نیامد/پارس نشد (${g.candidates.length} نسخه)`); continue }
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

  if (months.length === 0 && quarters.length === 0) {
    console.log(`  ❌ ${symbol}: هیچ گزارشی پارس نشد`)
    return 'empty'
  }
  fs.writeFileSync(outFile, JSON.stringify({ symbol, updated: new Date().toISOString(), months, quarters }))
  console.log(`  ✅ ${symbol}: ${months.length} ماه + ${quarters.length} دوره → ${path.basename(outFile)}`)
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
    console.log(`همه صنایع — ${symbols.length} نماد یکتا`)
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
    let status = null
    // تا ۴ بار در برابر throttle مقاومت کن: صفر اطلاعیه → صبر ۱۵ دقیقه و تلاش دوباره
    for (let attempt = 1; attempt <= 4; attempt++) {
      try { status = await buildSymbol(s) }
      catch (e) { console.error(`❌ ${s}: ${e.message}`); status = 'fail'; break }
      if (status !== 'throttle') break
      if (attempt === 4) { console.log(`  ⛔ ${s}: throttle مداوم — رد شد`); status = 'fail'; break }
      const wait = 15 * 60 * 1000
      console.log(`  ⏸ throttle کدال — صبر ۱۵ دقیقه (تلاش ${attempt}/۳) [${done}/${symbols.length}]`)
      await sleep(wait)
    }
    if (status && stat[status] !== undefined) stat[status]++
    if (done % 10 === 0) console.log(`  ── پیشرفت: ${done}/${symbols.length} | ✅${stat.ok} ⏭${stat.skip} ❌${stat.empty + stat.fail}`)
    await sleep(4000)
  }
  console.log(`\nتمام شد. ✅${stat.ok} جدید | ⏭${stat.skip} موجود | ❌${stat.empty} بدون‌گزارش | ⛔${stat.fail} ناموفق`)
}

main().catch(e => { console.error(e); process.exit(1) })
