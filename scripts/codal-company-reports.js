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

// ═══ دانلود اکسل-HTML کدال و پارس با XLSX ═══
async function fetchWorkbook(a) {
  if (!a.link_excel) return null
  const url = unmask(a.link_excel)
  const res = await fetch(url, {
    signal: AbortSignal.timeout(120_000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  const buf = Buffer.from(await res.arrayBuffer())
  const sig = buf.slice(0, 4).toString('hex')
  if (sig.startsWith('504b') || sig.startsWith('d0cf')) return XLSX.read(buf, { type: 'buffer' })
  const text = buf.toString('utf8')
  if (!/<table/i.test(text)) return null
  try { return XLSX.read(text, { type: 'string' }) } catch { return null }
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
  const latestBy = (arr, keyFn) => {
    const m = new Map()
    for (const a of arr) {
      const k = keyFn(a)
      if (!k) continue
      const prev = m.get(k)
      // اصلاحیه/نسخه جدیدتر برنده — بر اساس تاریخ انتشار
      if (!prev || faDate(a.date_publish) > faDate(prev.date_publish)
          || (norm(a.title).includes('اصلاحیه') && !norm(prev.title).includes('اصلاحیه'))) m.set(k, a)
    }
    return [...m.values()]
  }

  const monthly = latestBy(
    list.filter(a => /گزارش فعالیت ماهانه/.test(norm(a.title)) && !isSub(norm(a.title))),
    a => faDate(a.title),
  )

  const interim = list.filter(a => {
    const t = norm(a.title)
    return /میاندوره ای|میان دوره ای|میاندوره‌ای/.test(t.replace(/‌/g, ' ')) || /میاندوره/.test(t)
  }).filter(a => {
    const t = norm(a.title)
    return /دوره (۳|۶|۹|3|6|9) ماهه/.test(t) && !isSub(t)
  })
  const annual = list.filter(a => {
    const t = norm(a.title)
    return /^صورت های مالی\s+سال مالی منتهی به/.test(t.replace(/‌/g, ' ')) && !isSub(t)
  })

  // برای هر (تاریخ دوره + طول دوره): غیرتلفیقی مقدم، بعد جدیدترین انتشار
  const key = (a) => {
    const t = norm(a.title)
    const dur = t.match(/دوره (۳|۶|۹|3|6|9|۱۲|12) ماهه/)
    const d = faDate(t)
    return d ? `${d}|${dur ? faNum(dur[1]) : 12}` : null
  }
  const m = new Map()
  for (const a of [...interim, ...annual]) {
    const k = key(a)
    if (!k) continue
    const prev = m.get(k)
    if (!prev) { m.set(k, a); continue }
    const aCons = /تلفیقی/.test(norm(a.title))
    const pCons = /تلفیقی/.test(norm(prev.title))
    if (pCons && !aCons) { m.set(k, a); continue }
    if (aCons === pCons && faDate(a.date_publish) > faDate(prev.date_publish)) m.set(k, a)
  }
  return { monthly, quarterly: [...m.values()] }
}

// ═══ پردازش یک نماد ═══
async function buildSymbol(symbol) {
  const outFile = path.join(OUT_DIR, `${symbol.replace(/\s+/g, '-')}.json`)
  if (!FORCE && fs.existsSync(outFile)) { console.log(`⏭ ${symbol} — موجود است`); return }

  console.log(`\n═══ ${symbol} ═══`)
  const list = await fetchAnnouncements(symbol)
  console.log(`  ${list.length} اطلاعیه`)
  const { monthly, quarterly } = pickReports(list)
  console.log(`  فعالیت ماهانه: ${monthly.length} | صورت مالی دوره‌ای: ${quarterly.length}`)

  const months = []
  for (const a of monthly) {
    try {
      const wb = await fetchWorkbook(a)
      if (!wb) { console.log(`    ⚠️ ${faDate(a.title)}: اکسل نیامد`); continue }
      const p = parseMonthly(wb)
      if (!p) { console.log(`    ⚠️ ${faDate(a.title)}: فرم ماهانه پارس نشد`); continue }
      months.push({ period: faDate(a.title), publish: faDate(a.date_publish), ...p })
    } catch (e) { console.log(`    ⚠️ ${faDate(a.title)}: ${e.message}`) }
    await sleep(1500)
  }
  months.sort((a, b) => a.period.localeCompare(b.period))

  const quarters = []
  for (const a of quarterly) {
    try {
      const wb = await fetchWorkbook(a)
      if (!wb) { console.log(`    ⚠️ فصلی ${faDate(a.title)}: اکسل نیامد`); continue }
      const pl = parsePL(wb)
      if (!pl) { console.log(`    ⚠️ فصلی ${faDate(a.title)}: سود و زیان پارس نشد`); continue }
      const t = norm(a.title)
      const dur = t.match(/دوره (۳|۶|۹|3|6|9|۱۲|12) ماهه/)
      quarters.push({
        period: faDate(t),
        months: dur ? faNum(dur[1]) : 12,
        audited: /حسابرسی شده/.test(t),
        consolidated: /تلفیقی/.test(t),
        publish: faDate(a.date_publish),
        ...pl,
      })
    } catch (e) { console.log(`    ⚠️ فصلی: ${e.message}`) }
    await sleep(1500)
  }
  quarters.sort((a, b) => (a.period + a.months).localeCompare(b.period + b.months))

  if (months.length === 0 && quarters.length === 0) {
    console.log(`  ❌ ${symbol}: هیچ گزارشی پارس نشد`)
    return
  }
  fs.writeFileSync(outFile, JSON.stringify({ symbol, updated: new Date().toISOString(), months, quarters }))
  console.log(`  ✅ ${symbol}: ${months.length} ماه + ${quarters.length} دوره → ${path.basename(outFile)}`)
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const indIdx = process.argv.indexOf('--industry')
  let symbols = []
  if (indIdx !== -1) {
    const id = Number(process.argv[indIdx + 1])
    const file = path.join(__dirname, 'stocks-industries.json')
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const ind = data.industries.find(x => x.id === id)
    if (!ind) { console.error(`صنعت ${id} در ${file} نیست`); process.exit(1) }
    symbols = ind.symbols.map(s => s.l18)
    console.log(`صنعت «${ind.name}» — ${symbols.length} نماد`)
  } else {
    symbols = process.argv.slice(2).filter(a => !a.startsWith('--'))
    if (symbols.length === 0) { console.error('نماد یا --industry بدهید'); process.exit(1) }
  }

  for (const s of symbols) {
    try { await buildSymbol(s) }
    catch (e) { console.error(`❌ ${s}: ${e.message}`) }
    await sleep(4000)
  }
  console.log('\nتمام شد.')
}

main().catch(e => { console.error(e); process.exit(1) })
