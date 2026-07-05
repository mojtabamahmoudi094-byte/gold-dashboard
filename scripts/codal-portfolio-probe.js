#!/usr/bin/env node
/**
 * codal-portfolio-probe.js
 *
 * بورس سنج — مرحله ۱ (کاوش): دریافت اطلاعیه‌های «صورت وضعیت پورتفوی» صندوق اهرم
 * از کدال (BrsAPI Codal) برای اردیبهشت و خرداد ۱۴۰۵ + دانلود اکسل و چاپ ساختار
 *
 * روی سرور ایرانی:
 *   npm install xlsx        (فقط یک بار)
 *   node codal-portfolio-probe.js
 *
 * خروجی: فهرست اطلاعیه‌ها + نام شیت‌ها و ردیف‌های اول هر اکسل — برای طراحی parser
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

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function main() {
  const url = `https://Api.BrsApi.ir/Codal/Announcement.php?key=${KEY}`
    + `&l18=${encodeURIComponent(SYMBOL)}`
    + `&date_start=1405-02-01&date_end=1405-04-14`
  console.log('═══ دریافت اطلاعیه‌های کدال برای «' + SYMBOL + '» (1405-02-01 تا 1405-04-14) ═══')
  const data = await fetchJson(url)

  const list = Array.isArray(data) ? data : (data?.announcement ?? [])
  console.log('تعداد اطلاعیه:', Array.isArray(list) ? list.length : '؟')

  console.log('\n═══ همه عنوان‌ها ═══')
  list.forEach((a, i) => {
    console.log(`${i}) [${a.date_publish ?? a.date_send}] ${a.title}`)
  })

  // اطلاعیه‌های صورت وضعیت پورتفوی (ماهانه) — فایل در صفحه پیوست است نه link_excel
  const ports = list.filter(a => String(a.title || '').includes('پورتفوی'))
  console.log(`\n═══ اطلاعیه‌های پورتفوی: ${ports.length} ═══`)

  let XLSX
  try { XLSX = require('xlsx') } catch {
    console.log('\n⚠️ پکیج xlsx نصب نیست — npm install xlsx و دوباره اجرا کنید')
    return
  }

  for (const a of ports) {
    console.log(`\n═══════ ${a.title} ═══════`)
    const attUrl = a.link_attachment || a.link
    if (!attUrl) { console.log('  لینک پیوست ندارد'); continue }

    // صفحه پیوست کدال: HTML با لینک‌های DownloadFile.aspx
    let html
    try {
      const res = await fetch(attUrl, {
        signal: AbortSignal.timeout(60_000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      html = await res.text()
    } catch (e) { console.log('  خطا در صفحه پیوست:', e.message); continue }

    // ── DEBUG: تمام لینک‌ها و ساختار صفحه پیوست ──
    const serial = (attUrl.match(/LetterSerial=([^&]+)/) || [])[1] || ''
    console.log('  LetterSerial:', serial)
    console.log('  طول HTML:', html.length)
    const allA = html.match(/<a[^>]*href="[^"]*"[^>]*>[\s\S]*?<\/a>/g) || []
    console.log(`  ${allA.length} تگ <a>:`)
    allA.slice(0, 20).forEach(t => console.log('   ', t.replace(/\s+/g, ' ').slice(0, 180)))
    const aspxLinks = [...new Set(html.match(/[A-Za-z]+\.aspx\?[^"'<>\s]*/g) || [])]
    console.log(`  لینک‌های aspx:`)
    aspxLinks.slice(0, 20).forEach(l => console.log('   ', l.slice(0, 160)))
    // تلاش با سرویس اکسل استاندارد کدال
    if (serial) {
      const exUrl = `https://excel.codal.ir/service/Excel/GetAll/${serial}/0`
      try {
        const r2 = await fetch(exUrl, { signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'Mozilla/5.0' } })
        const b2 = Buffer.from(await r2.arrayBuffer())
        console.log(`  excel-service: HTTP ${r2.status} | ${b2.length} bytes | sig: ${b2.slice(0, 4).toString('hex')}`)
        if (b2.slice(0, 2).toString('hex') === '504b' || b2.slice(0, 4).toString('hex').startsWith('d0cf')) {
          const fname = path.join(__dirname, `codal-${SYMBOL}-${(a.date_title || '').replace(/\//g, '')}-svc.xlsx`)
          fs.writeFileSync(fname, b2)
          const wb = XLSX.read(b2, { type: 'buffer' })
          console.log('  ✅ شیت‌ها:', wb.SheetNames.join(' | '))
          for (const sn of wb.SheetNames) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' })
            console.log(`\n  ─── شیت «${sn}» — ${rows.length} ردیف ───`)
            rows.slice(0, 30).forEach((r, i) => {
              const line = r.map(c => String(c).slice(0, 24)).join(' ⁞ ').slice(0, 230)
              if (line.replace(/[⁞\s]/g, '')) console.log(`  ${i}: ${line}`)
            })
          }
          continue
        } else {
          console.log('  excel-service body:', b2.toString('utf8').slice(0, 200))
        }
      } catch (e) { console.log('  excel-service خطا:', e.message) }
    }

    const hrefs = [...new Set(
      (html.match(/DownloadFile\.aspx[^"'<>\s]*/g) || []).map(h => h.replace(/&amp;/g, '&'))
    )]
    console.log(`  ${hrefs.length} فایل پیوست پیدا شد`)

    for (const [fi, href] of hrefs.entries()) {
      const fileUrl = 'https://codal.ir/' + href
      try {
        const res = await fetch(fileUrl, {
          signal: AbortSignal.timeout(120_000),
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: attUrl },
        })
        const ctype = res.headers.get('content-type') || ''
        const cdisp = res.headers.get('content-disposition') || ''
        const buf = Buffer.from(await res.arrayBuffer())
        console.log(`\n  فایل ${fi}: ${buf.length} bytes | type: ${ctype} | ${cdisp.slice(0, 80)}`)

        // امضای فایل: xlsx=PK، xls=D0CF، pdf=%PDF
        const sig = buf.slice(0, 4).toString('hex')
        const isExcel = sig.startsWith('504b') || sig.startsWith('d0cf')
        if (!isExcel) { console.log('  (اکسل نیست — رد شد، امضا: ' + sig + ')'); continue }

        const fname = path.join(__dirname, `codal-${SYMBOL}-${(a.date_title || '').replace(/\//g, '')}-${fi}.xlsx`)
        fs.writeFileSync(fname, buf)
        console.log(`  ذخیره شد: ${fname}`)

        const wb = XLSX.read(buf, { type: 'buffer' })
        console.log('  شیت‌ها:', wb.SheetNames.join(' | '))
        for (const sn of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' })
          console.log(`\n  ─── شیت «${sn}» — ${rows.length} ردیف ───`)
          rows.slice(0, 30).forEach((r, i) => {
            const line = r.map(c => String(c).slice(0, 24)).join(' ⁞ ').slice(0, 230)
            if (line.replace(/[⁞\s]/g, '')) console.log(`  ${i}: ${line}`)
          })
        }
      } catch (e) {
        console.log('  خطا در دانلود فایل:', e.message)
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
