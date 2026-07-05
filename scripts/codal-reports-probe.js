#!/usr/bin/env node
/**
 * codal-reports-probe.js
 *
 * بورس سنج — کاوش گزارش‌های کدال یک شرکت تولیدی (پیش‌فرض: شپدیس)
 *   ۱) گزارش فعالیت ماهانه (۱۲ ماه اخیر)
 *   ۲) اطلاعات و صورت‌های مالی میاندوره‌ای ۳ ماهه (فصلی)
 *
 * روی سرور ایرانی:
 *   node codal-reports-probe.js            → شپدیس
 *   node codal-reports-probe.js نوری       → نماد دیگر
 *
 * خروجی: عنوان همه اطلاعیه‌ها + دانلود اکسل یک نمونه از هر نوع و چاپ ساختار شیت‌ها
 * — برای طراحی parser
 */

'use strict'

const path = require('path')
const fs   = require('fs')

const KEY = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const SYMBOL = process.argv[2] || 'شپدیس'

// ماسک BrsAPI روی base64: QQQaQQQ = %2f و OOObOOO = %2b — فقط id فایل unmask شود
const unmask = (s) => String(s).replace(/QQQaQQQ/g, '%2f').replace(/OOObOOO/g, '%2b')

const norm = (s) => String(s || '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[‌‎‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim()

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function dumpExcel(a, tag, XLSX) {
  console.log(`\n═══════ [${tag}] ${a.title} ═══════`)
  console.log('  فیلدهای اطلاعیه:', Object.keys(a).join(', '))
  console.log('  link_excel:', a.link_excel || '—')

  // اول link_excel اگر بود، وگرنه صفحه پیوست
  const tryUrls = []
  if (a.link_excel) tryUrls.push({ url: unmask(a.link_excel), ref: '' })

  const attUrl = a.link_attachment || a.link || ''
  let cookies = ''
  if (attUrl) {
    try {
      const res = await fetch(attUrl, { signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'Mozilla/5.0' } })
      cookies = (res.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
      const html = await res.text()
      const hrefs = [...new Set(
        (html.match(/DownloadFile\.aspx[^"'<>\s]*/g) || [])
          .map(h => h.replace(/&amp;/g, '&').replace(/&#39.*$/, '').replace(/['");]+$/, ''))
          .map(unmask)
      )]
      console.log(`  ${hrefs.length} فایل در صفحه پیوست`)
      for (const h of hrefs) tryUrls.push({ url: 'https://codal.ir/Reports/' + h, ref: attUrl })
    } catch (e) { console.log('  خطا در صفحه پیوست:', e.message) }
  }

  let count = 0
  for (const { url, ref } of tryUrls) {
    if (count >= 2) break // حداکثر ۲ فایل از هر اطلاعیه
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(120_000),
        headers: { 'User-Agent': 'Mozilla/5.0', ...(ref ? { Referer: ref } : {}), ...(cookies ? { Cookie: cookies } : {}) },
      })
      const buf = Buffer.from(await res.arrayBuffer())
      const sig = buf.slice(0, 4).toString('hex')
      const isErr = buf.length < 100000 && buf.toString('utf8', 0, 2000).includes('خطای سیستمی')
      console.log(`  ${url.slice(0, 80)}… → ${buf.length} bytes | sig ${sig}${isErr ? ' (صفحه خطا)' : ''}`)
      if (isErr || buf.length < 500) continue

      let wb = null
      if (sig.startsWith('504b') || sig.startsWith('d0cf')) {
        wb = XLSX.read(buf, { type: 'buffer' })
      } else {
        const text = buf.toString('utf8')
        if (/<html|<table/i.test(text)) {
          // اکسل-HTML قدیمی کدال (Excel Workbook Frameset) — xlsx می‌تواند جدول‌های HTML را بخواند
          const frames = [...new Set((text.match(/<frame[^>]*src="([^"]+)"/gi) || []).map(m => m.match(/src="([^"]+)"/i)[1]))]
          if (frames.length) console.log('  فریم‌ها:', frames.join(' | '))
          try { wb = XLSX.read(text, { type: 'string' }) }
          catch (e) { console.log('  XLSX از HTML شکست خورد:', e.message) }
          if (!wb || wb.SheetNames.every(sn => XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 }).length === 0)) {
            console.log('  (HTML بدون جدول قابل پارس — ۱۰۰۰ کاراکتر بعد از head:)')
            console.log('  ' + text.slice(500, 1500).replace(/\s+/g, ' '))
            continue
          }
        } else {
          console.log('  (نه اکسل نه HTML — رد شد)')
          continue
        }
      }
      count++
      console.log('  ✅ اکسل — شیت‌ها:', wb.SheetNames.map(s => `«${s}»`).join(' | '))
      for (const sn of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' })
        console.log(`\n  ─── شیت «${sn}» — ${rows.length} ردیف ───`)
        rows.slice(0, 40).forEach((r, i) => {
          const line = r.map(c => String(c).slice(0, 22)).join(' ⁞ ').slice(0, 240)
          if (line.replace(/[⁞\s]/g, '')) console.log(`  ${i}: ${line}`)
        })
        if (rows.length > 40) console.log(`  … (${rows.length - 40} ردیف دیگر)`)
      }
    } catch (e) { console.log('  خطا:', e.message) }
  }
}

async function main() {
  let XLSX
  try { XLSX = require('xlsx') } catch {
    console.log('⚠️ npm install xlsx لازم است'); process.exit(1)
  }

  // بازه بلند HTTP 400 می‌دهد — پنجره‌های ۲ ماهه از ۱۴۰۴-۰۱ تا ۱۴۰۵-۰۴
  const windows = [
    ['1404-01-01', '1404-02-31'], ['1404-03-01', '1404-04-31'],
    ['1404-05-01', '1404-06-31'], ['1404-07-01', '1404-08-30'],
    ['1404-09-01', '1404-10-30'], ['1404-11-01', '1404-12-29'],
    ['1405-01-01', '1405-02-31'], ['1405-03-01', '1405-04-15'],
  ]
  console.log(`═══ اطلاعیه‌های کدال «${SYMBOL}» (1404-01-01 تا 1405-04-15، پنجره‌ای) ═══`)
  const cacheFile = path.join(__dirname, `codal-list-${SYMBOL}.json`)
  const list = []
  if (fs.existsSync(cacheFile)) {
    list.push(...JSON.parse(fs.readFileSync(cacheFile, 'utf8')))
    console.log(`(از کش: ${list.length} اطلاعیه — برای دریافت تازه فایل ${cacheFile} را پاک کنید)`)
  }
  for (const [ds, de] of (list.length ? [] : windows)) {
    const url = `https://Api.BrsApi.ir/Codal/Announcement.php?key=${KEY}`
      + `&l18=${encodeURIComponent(SYMBOL)}`
      + `&date_start=${ds}&date_end=${de}`
    try {
      const data = await fetchJson(url)
      const part = Array.isArray(data) ? data : (data?.announcement ?? [])
      console.log(`  ${ds} تا ${de}: ${part.length} اطلاعیه`)
      list.push(...part)
    } catch (e) { console.log(`  ${ds} تا ${de}: خطا — ${e.message}`) }
    await new Promise(r => setTimeout(r, 4000)) // throttle کدال
  }
  console.log('تعداد کل:', list.length)
  if (!fs.existsSync(cacheFile)) fs.writeFileSync(cacheFile, JSON.stringify(list))

  console.log('\n═══ همه عنوان‌ها ═══')
  list.forEach((a, i) => console.log(`${i}) [${a.date_publish ?? a.date_send}] ${a.title}`))

  const monthly = list.filter(a => /فعالیت ماهانه/.test(norm(a.title)))
  const quarterly = list.filter(a => /میاندوره|میان دوره/.test(norm(a.title)) && /3 ماهه|۳ ماهه|سه ماهه/.test(norm(a.title)))

  console.log(`\n═══ فعالیت ماهانه: ${monthly.length} | میاندوره‌ای ۳ ماهه: ${quarterly.length} ═══`)

  // یک نمونه از هر نوع کافی است برای طراحی parser
  if (monthly[0]) await dumpExcel(monthly[0], 'ماهانه', XLSX)
  if (quarterly[0]) await dumpExcel(quarterly[0], 'فصلی', XLSX)
}

main().catch(e => { console.error(e); process.exit(1) })
