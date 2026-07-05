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
    // صفحه پیوست فقط با URL ماسک‌شده اصلی کار می‌کند — unmask نکن
    const attUrl = a.link_attachment || a.link || ''
    if (!attUrl) { console.log('  لینک پیوست ندارد'); continue }

    // صفحه پیوست کدال: HTML با لینک‌های DownloadFile.aspx
    let html, cookies = ''
    try {
      const res = await fetch(attUrl, {
        signal: AbortSignal.timeout(60_000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      // کوکی‌های session — دانلود برخی فایل‌ها بدون آن «خطای سیستمی» می‌دهد
      cookies = (res.headers.getSetCookie?.() || [])
        .map(c => c.split(';')[0]).join('; ')
      html = await res.text()
    } catch (e) { console.log('  خطا در صفحه پیوست:', e.message); continue }

    // BrsAPI کاراکترهای base64 را ماسک می‌کند: + → QQQaQQQ و / → OOObOOO
    // فقط id فایل unmask می‌شود؛ URL صفحه پیوست باید دست‌نخورده بماند
    const unmask = (s) => String(s).replace(/QQQaQQQ/g, '%2b').replace(/OOObOOO/g, '%2f')

    const hrefs = [...new Set(
      (html.match(/DownloadFile\.aspx[^"'<>\s]*/g) || [])
        .map(h => h.replace(/&amp;/g, '&').replace(/&#39.*$/, '').replace(/['");]+$/, ''))
        .map(unmask)
    )]
    console.log(`  ${hrefs.length} فایل پیوست:`, hrefs)

    for (const [fi, href] of hrefs.entries()) {
      // چند مسیر ممکن — اولی که فایل واقعی داد برنده است
      const candidates = [
        'https://codal.ir/Reports/' + href,
        'https://codal.ir/' + href,
        'https://www.codal.ir/Reports/' + href,
      ]
      let buf = null, sig = ''
      for (const fileUrl of candidates) {
        try {
          const res = await fetch(fileUrl, {
            signal: AbortSignal.timeout(120_000),
            headers: {
              'User-Agent': 'Mozilla/5.0',
              Referer: attUrl,
              ...(cookies ? { Cookie: cookies } : {}),
            },
          })
          const b = Buffer.from(await res.arrayBuffer())
          const s = b.slice(0, 4).toString('hex')
          const isErrorPage = b.length < 100000 && b.toString('utf8', 0, 2000).includes('خطای سیستمی')
          console.log(`  تلاش ${fileUrl.slice(0, 60)}… → ${b.length} bytes | sig ${s}${isErrorPage ? ' (صفحه خطا)' : ''}`)
          if (!isErrorPage && b.length > 200) { buf = b; sig = s; break }
        } catch (e) { console.log('  خطا:', e.message) }
      }
      if (!buf) { console.log('  ❌ هیچ مسیری فایل نداد'); continue }
      try {
        console.log(`\n  فایل ${fi}: ${buf.length} bytes | sig: ${sig}`)

        if (sig.startsWith('504b') || sig.startsWith('d0cf')) {
          // اکسل واقعی
          const fname = path.join(__dirname, `codal-${SYMBOL}-${(a.date_title || '').replace(/\//g, '')}-${fi}.xlsx`)
          fs.writeFileSync(fname, buf)
          const wb = XLSX.read(buf, { type: 'buffer' })
          console.log('  ✅ اکسل — شیت‌ها:', wb.SheetNames.join(' | '))
          for (const sn of wb.SheetNames) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' })
            console.log(`\n  ─── شیت «${sn}» — ${rows.length} ردیف ───`)
            rows.slice(0, 30).forEach((r, i) => {
              const line = r.map(c => String(c).slice(0, 24)).join(' ⁞ ').slice(0, 230)
              if (line.replace(/[⁞\s]/g, '')) console.log(`  ${i}: ${line}`)
            })
          }
          continue
        }

        const text = buf.toString('utf8')
        if (!text.includes('<table') && !text.includes('<TABLE')) {
          console.log('  (HTML بدون جدول — محتوای خام برای تشخیص:)')
          console.log('  ── ۱۵۰۰ کاراکتر اول ──')
          console.log(text.slice(0, 1500))
          console.log('  ── شمارش الگوها ──')
          for (const pat of ['<div', '<script', 'var ', 'json', 'datasource', 'rowSpan', 'iframe', '.xls', 'DownloadFile']) {
            const c = text.split(pat).length - 1
            if (c) console.log(`   ${pat}: ${c}`)
          }
          continue
        }

        // گزارش HTML کدال — ذخیره + چاپ ساختار جدول‌ها
        const fname = path.join(__dirname, `codal-${SYMBOL}-${(a.date_title || '').replace(/\//g, '')}-${fi}.html`)
        fs.writeFileSync(fname, buf)
        console.log(`  ✅ گزارش HTML ذخیره شد: ${fname}`)

        const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
        const tables = text.match(/<table[\s\S]*?<\/table>/gi) || []
        console.log(`  ${tables.length} جدول:`)
        tables.forEach((tb, ti) => {
          const trs = tb.match(/<tr[\s\S]*?<\/tr>/gi) || []
          console.log(`\n  ─── جدول ${ti} — ${trs.length} ردیف ───`)
          trs.slice(0, 14).forEach((tr, ri) => {
            const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(stripTags)
            const line = cells.map(c => c.slice(0, 20)).join(' ⁞ ').slice(0, 230)
            if (line.replace(/[⁞\s]/g, '')) console.log(`  ${ri}: ${line}`)
          })
          if (trs.length > 14) console.log(`  ... (${trs.length - 14} ردیف دیگر)`)
        })
      } catch (e) {
        console.log('  خطا در دانلود فایل:', e.message)
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
