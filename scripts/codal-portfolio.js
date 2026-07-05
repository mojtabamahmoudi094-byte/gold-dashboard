#!/usr/bin/env node
/**
 * codal-portfolio.js
 *
 * بورس سنج — دانلود و پارس «صورت وضعیت پورتفوی» ماهانه صندوق از کدال
 * خروجی: JSON دو ماه اخیر برای نمایش نمودار دایره‌ای و تغییرات در سایت
 *
 * روی سرور ایرانی:
 *   node codal-portfolio.js اهرم
 *   → /opt/portfolio-اهرم.json  (بعداً scp به public/portfolio/ در repo)
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

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
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

// پارس شیت «سهام» — هر ردیف ۱۲ عدد بعد از نام
function parseStockSheet(wb) {
  const sheet = wb.Sheets['سهام']
  if (!sheet) throw new Error('شیت «سهام» یافت نشد')
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  const headerIdx = rows.findIndex(r => r.some(c => String(c).includes('نام شرکت')))
  if (headerIdx < 0) throw new Error('سطر عنوان (نام شرکت) یافت نشد')

  const holdings = []
  for (const row of rows.slice(headerIdx + 1)) {
    const name = String(row[0] ?? '').trim()
    if (!name) continue
    if (name === 'جمع') break
    const nums = row.slice(1)
      .filter(c => c !== '' && c !== null && c !== undefined)
      .map(Number)
      .filter(n => isFinite(n))
    if (nums.length < 12) continue
    const [q0, c0, n0, bq, bc, sq, sa, q1, p1, c1, n1, pct] = nums
    holdings.push({ name, q0, c0, n0, bq, bc, sq, sa, q1, p1, c1, n1, pct })
  }
  return holdings
}

async function main() {
  console.log(`[portfolio] «${SYMBOL}» — دریافت اطلاعیه‌های کدال`)
  const url = `https://Api.BrsApi.ir/Codal/Announcement.php?key=${KEY}`
    + `&l18=${encodeURIComponent(SYMBOL)}&date_start=1405-01-15`
  const data = await fetchJson(url)
  const list = data?.announcement ?? []

  // گزارش‌های پورتفوی — جدیدترین اول؛ برای هر ماه اولین مورد (اصلاحیه مقدم است)
  const seen = new Set()
  const reports = []
  for (const a of list) {
    if (!String(a.title || '').includes('پورتفوی')) continue
    const date = faDigits(a.date_title || '')          // 1405/03/31
    if (!date || seen.has(date)) continue
    seen.add(date)
    reports.push({ ...a, dateNorm: date })
    if (reports.length >= MONTHS_WANTED) break
  }
  if (reports.length === 0) { console.error('هیچ گزارش پورتفوی یافت نشد'); process.exit(1) }
  console.log('[portfolio] گزارش‌ها:', reports.map(r => r.dateNorm).join(' ، '))

  const months = []
  for (const rep of reports) {
    console.log(`[portfolio] دانلود اکسل ${rep.dateNorm} …`)
    const buf = await downloadPortfolioExcel(rep)
    if (!buf) { console.error(`  ❌ اکسل ${rep.dateNorm} دانلود نشد`); continue }
    const wb = XLSX.read(buf, { type: 'buffer' })
    const holdings = parseStockSheet(wb)
    console.log(`  ✅ ${holdings.length} سهم پارس شد`)
    months.push({ date: rep.dateNorm, title: rep.title, holdings })
  }
  if (months.length === 0) process.exit(1)

  // قدیمی → جدید
  months.sort((a, b) => a.date.localeCompare(b.date))

  const out = { symbol: SYMBOL, updated: new Date().toISOString(), months }
  const fname = path.join(__dirname, `portfolio-${SYMBOL}.json`)
  fs.writeFileSync(fname, JSON.stringify(out))
  console.log(`\n[portfolio] ✅ ذخیره شد: ${fname}`)

  // خلاصه برای بررسی چشمی
  const last = months[months.length - 1]
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

main().catch(e => { console.error(e); process.exit(1) })
