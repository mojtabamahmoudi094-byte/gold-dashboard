#!/usr/bin/env node
/**
 * codal-portfolio.js
 *
 * بورس سنج — دانلود و پارس «صورت وضعیت پورتفوی» ماهانه صندوق از کدال
 * خروجی: JSON دو ماه اخیر برای نمایش نمودار دایره‌ای و تغییرات در سایت
 *
 * روی سرور ایرانی:
 *   node codal-portfolio.js اهرم     → یک نماد (خروجی: portfolio-اهرم.json)
 *   node codal-portfolio.js --all    → همه صندوق‌های bourse-symbols
 *   → پوشه portfolio-out/<slug>.json  (بعداً scp به public/portfolio/ در repo)
 *
 * نکات فنی (کشف‌شده در probe):
 *   - BrsAPI کاراکترهای base64 را ماسک می‌کند: QQQaQQQ = / و OOObOOO = +
 *   - فایل پورتفوی در صفحه پیوست (Attachment.aspx) است؛ id داخل JS صفحه
 *   - دانلود از https://codal.ir/Reports/DownloadFile.aspx?id=…
 *   - شیت «سهام»: ستون‌ها = مانده اول دوره (تعداد/بها/ارزش)، خرید طی دوره
 *     (تعداد/بها)، فروش طی دوره (تعداد/مبلغ)، مانده پایان (تعداد/قیمت/بها/ارزش/درصد)
 */

'use strict'

const path = require('path')
const fs   = require('fs')

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

const KEY = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const SYMBOL = process.argv[2] || 'اهرم'
const MONTHS_WANTED = 2   // دو گزارش ماهانه اخیر

const XLSX = require('xlsx')

// ماسک BrsAPI روی کاراکترهای base64
const unmask = (s) => String(s).replace(/QQQaQQQ/g, '%2f').replace(/OOObOOO/g, '%2b')
// ارقام فارسی → لاتین
const faDigits = (s) => String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
// نرمال‌سازی متن فارسی: ي/ك عربی، نیم‌فاصله، فاصله تکراری
const normTxt = (s) => String(s ?? '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/‌/g, ' ').replace(/\s+/g, ' ').trim()
// عنوان گزارش پورتفوی: هم «پورتفوی» هم «پرتفوی»
const isPortfolioTitle = (t) => /پر?ورتفو|پرتفو/.test(normTxt(t))

async function fetchJson(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (i === retries) throw e
      await new Promise(r => setTimeout(r, 2500 * (i + 1)))
    }
  }
}

async function fetchBuf(url, headers = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(120_000),
    headers: { 'User-Agent': 'Mozilla/5.0', ...headers },
  })
  return Buffer.from(await res.arrayBuffer())
}

// دانلود اکسل پورتفوی از صفحه پیوست یک اطلاعیه
async function downloadPortfolioExcel(announcement) {
  const attUrl = announcement.link_attachment || announcement.link
  if (!attUrl) return null
  const page = (await fetchBuf(attUrl)).toString('utf8')
  const ids = [...new Set(
    (page.match(/DownloadFile\.aspx[^"'<>\s]*/g) || [])
      .map(h => h.replace(/&amp;/g, '&').replace(/&#39.*$/, '').replace(/['");]+$/, ''))
      .map(unmask)
  )]
  for (const href of ids) {
    const buf = await fetchBuf('https://codal.ir/Reports/' + href, { Referer: attUrl })
    const sig = buf.slice(0, 4).toString('hex')
    if (sig === '504b0304' || sig.startsWith('d0cf')) return buf
  }
  return null
}

// پارس یک شیت با ساختار «نام + ۱۲ عدد» — null اگر ساختار نخواند
// قالب هر شرکت صندوق فرق دارد: ستون نام جابه‌جا، هدر «شرکت» یا «نام شرکت»،
// ستون‌های کنترلی اضافه در انتها. ترتیب ۱۲ عدد اول در همه یکی است.
const isNum = (v) => v !== '' && v !== null && v !== undefined && isFinite(Number(String(v).replace(/,/g, '')))

function parseHoldingRows(rows) {
  // سطر عنوان: هم «بهای تمام شده» دارد هم یکی از ستون‌های ارزش/فروش
  const headerIdx = rows.findIndex(r =>
    r.some(c => normTxt(c).includes('بهای تمام شده')) &&
    r.some(c => /خالص ارزش|مبلغ فروش|قیمت بازار/.test(normTxt(c)))
  )
  if (headerIdx < 0) return null

  const holdings = []
  for (const row of rows.slice(headerIdx + 1)) {
    // نام = اولین سلول متنی غیرعددی؛ اعداد پس از آن = داده‌ها
    let nameIdx = -1
    for (let j = 0; j < row.length; j++) {
      const v = row[j]
      if (v === '' || v === null || v === undefined || !String(v).trim()) continue
      if (isNum(v)) continue
      nameIdx = j
      break
    }
    if (nameIdx < 0) continue
    const name = normTxt(row[nameIdx])
    if (name.startsWith('جمع')) break
    const nums = row.slice(nameIdx + 1)
      .filter(c => c !== '' && c !== null && c !== undefined && String(c).trim() !== '')
      .map(c => Number(String(c).replace(/,/g, '')))
      .filter(n => isFinite(n))
    if (nums.length < 12) continue
    const [q0, c0, n0, bq, bc, sq, sa, q1, p1, c1, n1, pct] = nums
    holdings.push({ name, q0, c0, n0, bq, bc, sq, sa, q1, p1, c1, n1, pct })
  }
  return holdings
}

// پیدا کردن شیت سهام با محتوا، نه اسم — اسم شیت‌ها بین صندوق‌ها یکدست نیست
// (ي/ك عربی، «سهام و حق تقدم» و ...). شیت با بیشترین ردیف معتبر برنده است.
function parseStockSheet(wb) {
  // اول شیت‌هایی که اسمشان «سهام» دارد (بدون مشتقه/درآمد)، بعد بقیه
  const names = [...wb.SheetNames].sort((a, b) => {
    const score = (n) => {
      const t = normTxt(n)
      if (/مشتقه|درآمد|صندوق|اوراق|سپرده|تعدیل|نخست/.test(t)) return 2
      return t.includes('سهام') ? 0 : 1
    }
    return score(a) - score(b)
  })

  let best = null
  for (const sn of names) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' })
    const holdings = parseHoldingRows(rows)
    if (holdings && holdings.length > (best?.holdings.length ?? 0)) best = { sn, holdings }
    if (best && best.holdings.length >= 5 && normTxt(sn).includes('سهام')) break
  }
  if (!best || best.holdings.length === 0) {
    throw new Error(`شیت سهام قابل پارس نیست (شیت‌ها: ${wb.SheetNames.slice(0, 6).join('،')})`)
  }
  return best.holdings
}

// یک نماد: دریافت اطلاعیه‌ها → دانلود اکسل دو ماه اخیر → پارس → آبجکت خروجی
async function buildSymbol(symbol, { verbose = true } = {}) {
  const log = (...a) => { if (verbose) console.log(...a) }
  const url = `https://Api.BrsApi.ir/Codal/Announcement.php?key=${KEY}`
    + `&l18=${encodeURIComponent(symbol)}&date_start=1405-01-15`
  const data = await fetchJson(url)
  const list = data?.announcement ?? []

  // گزارش‌های پورتفوی — جدیدترین اول؛ برای هر ماه اولین مورد (اصلاحیه مقدم است)
  const seen = new Set()
  const reports = []
  for (const a of list) {
    if (!isPortfolioTitle(a.title)) continue
    const date = faDigits(a.date_title || '')          // 1405/03/31
    if (!date || seen.has(date)) continue
    seen.add(date)
    reports.push({ ...a, dateNorm: date })
    if (reports.length >= MONTHS_WANTED) break
  }
  if (reports.length === 0) throw new Error('هیچ گزارش پورتفوی یافت نشد')
  log('[portfolio] گزارش‌ها:', reports.map(r => r.dateNorm).join(' ، '))

  const months = []
  for (const rep of reports) {
    log(`[portfolio] دانلود اکسل ${rep.dateNorm} …`)
    const buf = await downloadPortfolioExcel(rep)
    if (!buf) { console.error(`  ❌ ${symbol}: اکسل ${rep.dateNorm} دانلود نشد`); continue }
    const wb = XLSX.read(buf, { type: 'buffer' })
    const holdings = parseStockSheet(wb)
    log(`  ✅ ${holdings.length} سهم پارس شد`)
    months.push({ date: rep.dateNorm, title: rep.title, holdings })
  }
  if (months.length === 0) throw new Error('هیچ اکسلی دانلود/پارس نشد')

  // قدیمی → جدید
  months.sort((a, b) => a.date.localeCompare(b.date))
  return { symbol, updated: new Date().toISOString(), months }
}

// slug فایل خروجی = قرارداد جدول assets (فاصله → خط تیره)
const toSlug = (name) => name.trim().replace(/\s+/g, '-')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function runAll() {
  const { BOURSE_SYMBOLS } = require('./bourse-symbols')
  const names = Object.values(BOURSE_SYMBOLS).flat()
  const outDir = path.join(__dirname, 'portfolio-out')
  fs.mkdirSync(outDir, { recursive: true })

  const FORCE_ALL = process.argv.includes('--force')
  const ok = [], failed = []
  for (const [i, name] of names.entries()) {
    process.stdout.write(`[${i + 1}/${names.length}] ${name} … `)
    if (!FORCE_ALL && fs.existsSync(path.join(outDir, `${toSlug(name)}.json`))) {
      console.log('⏭  از قبل موجود')
      ok.push(name)
      continue
    }
    try {
      const out = await buildSymbol(name, { verbose: false })
      fs.writeFileSync(path.join(outDir, `${toSlug(name)}.json`), JSON.stringify(out))
      const last = out.months[out.months.length - 1]
      console.log(`✅ ${out.months.length} ماه، ${last.holdings.length} سهم (${last.date})`)
      ok.push(name)
    } catch (e) {
      console.log(`❌ ${e.message}`)
      failed.push(`${name}: ${e.message}`)
    }
    await sleep(1200)   // رعایت rate limit کدال/BrsAPI
  }

  console.log(`\n═══ نتیجه: ${ok.length} موفق، ${failed.length} ناموفق ═══`)
  failed.forEach(f => console.log('  -', f))
  console.log(`\nخروجی: ${outDir}`)
  console.log('انتقال به مک:')
  console.log('  scp -r root@SERVER:/opt/portfolio-out/ ./public/portfolio/')
}

async function runOne() {
  console.log(`[portfolio] «${SYMBOL}» — دریافت اطلاعیه‌های کدال`)
  const out = await buildSymbol(SYMBOL)
  const fname = path.join(__dirname, `portfolio-${SYMBOL}.json`)
  fs.writeFileSync(fname, JSON.stringify(out))
  console.log(`\n[portfolio] ✅ ذخیره شد: ${fname}`)

  // خلاصه برای بررسی چشمی
  const last = out.months[out.months.length - 1]
  const totalNav = last.holdings.reduce((s, h) => s + (h.n1 || 0), 0)
  const top = [...last.holdings].sort((a, b) => (b.n1 || 0) - (a.n1 || 0)).slice(0, 10)
  console.log(`\n═══ ${last.date} — ${last.holdings.length} سهم | ارزش کل سهام: ${Math.round(totalNav / 1e10).toLocaleString()} میلیارد تومان ═══`)
  top.forEach(h => console.log(`  ${h.name}: ${(h.n1 / totalNav * 100).toFixed(1)}٪ (${Math.round(h.n1 / 1e10).toLocaleString()} م.ت)`))
  const buys  = [...last.holdings].filter(h => h.bc > 0).sort((a, b) => b.bc - a.bc).slice(0, 5)
  const sells = [...last.holdings].filter(h => h.sa > 0).sort((a, b) => b.sa - a.sa).slice(0, 5)
  console.log('\nخریدهای مهم ماه:')
  buys.forEach(h => console.log(`  + ${h.name}: ${Math.round(h.bc / 1e10).toLocaleString()} م.ت`))
  console.log('فروش‌های مهم ماه:')
  sells.forEach(h => console.log(`  - ${h.name}: ${Math.round(h.sa / 1e10).toLocaleString()} م.ت`))
}

// چاپ ساختار خام اکسل یک نماد — برای طراحی parser قالب‌های متفاوت
async function runDump() {
  const symbol = process.argv[3]
  if (!symbol) { console.error('استفاده: node codal-portfolio.js --dump <نماد>'); process.exit(1) }
  const url = `https://Api.BrsApi.ir/Codal/Announcement.php?key=${KEY}`
    + `&l18=${encodeURIComponent(symbol)}&date_start=1405-01-15`
  const data = await fetchJson(url)
  const list = data?.announcement ?? []
  console.log(`═══ همه عنوان‌های «${symbol}» (${list.length}) ═══`)
  list.forEach(a => console.log(`- [${a.date_publish}] ${a.title}`))

  const rep = list.find(a => isPortfolioTitle(a.title))
  if (!rep) { console.log('\n(گزارش پورتفوی ندارد)'); return }
  console.log(`\n═══ دانلود: ${rep.title} ═══`)
  const buf = await downloadPortfolioExcel(rep)
  if (!buf) { console.log('❌ اکسل دانلود نشد'); return }
  const wb = XLSX.read(buf, { type: 'buffer' })
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' })
    console.log(`\n─── شیت «${sn}» — ${rows.length} ردیف ───`)
    rows.slice(0, 14).forEach((r, i) => {
      const line = r.map(c => String(c).slice(0, 20)).join(' ⁞ ').slice(0, 220)
      if (line.replace(/[⁞\s]/g, '')) console.log(`${i}: ${line}`)
    })
  }
}

// یافتن نماد کدالِ صندوق‌های جامانده — همه اطلاعیه‌های پورتفوی بازه، بدون l18
async function runFind() {
  const { BOURSE_SYMBOLS } = require('./bourse-symbols')
  const names = Object.values(BOURSE_SYMBOLS).flat()
  const outDir = path.join(__dirname, 'portfolio-out')
  const have = new Set(
    fs.existsSync(outDir) ? fs.readdirSync(outDir).map(f => normTxt(f.replace('.json', '').replace(/-/g, ' '))) : []
  )
  const missing = names.filter(n => !have.has(normTxt(n)))
  console.log(`جامانده‌ها (${missing.length}):`, missing.join(' | '))

  // اطلاعیه‌های پورتفوی خرداد از همه ناشران
  const base = `https://Api.BrsApi.ir/Codal/Announcement.php?key=${KEY}`
    + `&date_start=1405-03-25&date_end=1405-04-14`
  const seen = new Map()   // normName(l18) → {l18, l30}
  let page = 1, pages = 1
  do {
    const d = await fetchJson(`${base}&page=${page}`)
    pages = Number(d?.count_page) || 1
    for (const a of d?.announcement ?? []) {
      if (!isPortfolioTitle(a.title)) continue
      const key = normTxt(a.l18)
      if (key && !seen.has(key)) seen.set(key, { l18: a.l18, l30: a.l30 })
    }
    process.stdout.write(`\rصفحه ${page}/${pages} — ${seen.size} ناشر پورتفوی`)
    page++
    await sleep(800)
  } while (page <= pages)
  console.log('')

  // برای هر جامانده: کاندیدهایی که نام ما در l18 یا l30 آن‌ها آمده
  console.log('\n═══ کاندیدها ═══')
  for (const m of missing) {
    const nm = normTxt(m)
    const cands = [...seen.values()].filter(v =>
      normTxt(v.l18).includes(nm) || normTxt(v.l30).includes(nm)
    )
    console.log(`${m}: ${cands.length ? cands.map(c => `«${c.l18}» (${c.l30})`).join(' | ') : '—'}`)
  }

  // ناشرانی که با هیچ نمادی از لیست ما match نشدند (برای بررسی چشمی)
  const matched = new Set(names.map(normTxt))
  const unknown = [...seen.values()].filter(v => !matched.has(normTxt(v.l18)))
  console.log(`\n═══ نمادهای پورتفوی‌دار خارج از لیست ما (${unknown.length}) ═══`)
  unknown.forEach(v => console.log(`  ${v.l18} — ${v.l30}`))
}

;(SYMBOL === '--all' ? runAll() : SYMBOL === '--dump' ? runDump() : SYMBOL === '--find' ? runFind() : runOne())
  .catch(e => { console.error(e); process.exit(1) })
