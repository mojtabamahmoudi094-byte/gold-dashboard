#!/usr/bin/env node
/**
 * codal-letter-extract.js
 *
 * بورس سنج — استخراج نوع اظهارنظر حسابرس + بندهای پرچم‌قرمز از صفحهٔ نامهٔ
 * کدال (نه اکسل صورت‌های مالی — این صفحه فقط متن روایی نامهٔ حسابرس را دارد).
 * فقط برای گزارش‌های سالانهٔ حسابرسی‌شده صدا زده می‌شود (کم‌تعداد، ~۱بار/سال/نماد).
 *
 * روی نمونهٔ واقعی (کفرا، سالانهٔ ۱۴۰۴) تست و تأیید شد: opinionType درست درمیاد،
 * بندهای پرچم‌قرمز از انکر بولرپلیت ثابت گزارش حسابرس استخراج می‌شوند (نه هدر باکسی —
 * هدرهای باکسی در innerText نسخهٔ زندهٔ صفحه اصلاً نمی‌آیند، فقط در PDF/پرینت هستند).
 * ⚠️ ریسک باز: انکرها فقط روی یک ناشر/حسابرس تست شده‌اند — قبل از تکیهٔ کامل در تولید،
 * روی ۲-۳ نماد دیگر (حسابرس/فرم متفاوت) هم چک شود:
 *   node scripts/codal-letter-extract.js <URL نامه>
 * (نیاز به NODE_PATH=<مسیر node_modules ریپو> و PUPPETEER_EXECUTABLE_PATH=<مسیر chromium> دارد)
 */

'use strict'

const norm = (s) => String(s || '')
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/ۀ|ة/g, 'ه')
  .replace(/[‌‎‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim()

// اولویت از خاص به عام — چون متن «مشروط» ممکن است داخل توضیح یک گزارش «مقبول» هم ظاهر شود
const OPINION_PATTERNS = [
  ['مردود',          /اظهار\s*نظر\s*مردود/],
  ['عدم اظهارنظر',   /عدم\s*اظهار\s*نظر/],
  ['مشروط',          /اظهار\s*نظر\s*مشروط/],
  ['مقبول',          /اظهار\s*نظر\s*مقبول/],
]

const SNIPPET_CAP = 500

// notableClauses چند بند را با هم می‌گیرد (سایر بندهای توضیحی + تاکید بر مطالب خاص) —
// روی نمونهٔ واقعی کفرا با cap ۵۰۰ وسط بند «زیان عملیاتی» قطع می‌شد؛ فضای بیشتر لازم است
const NOTABLE_CLAUSES_CAP = 1200

const cap = (s, max = SNIPPET_CAP) => {
  const t = (s || '').trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

// نکتهٔ کلیدی که با دیباگ رو یه نمونهٔ واقعی (کفرا، سالانهٔ ۱۴۰۴) کشف شد: هدرهای باکسی
// («تاکید بر مطالب خاص»، «گزارش در مورد سایر الزامات قانونی و قراردادی») در innerText
// نسخهٔ زندهٔ صفحه اصلاً رندر نمی‌شوند (فقط در PDF/پرینت هستند)؛ فقط محتوای بندهای شماره‌دار
// هست. ترتیب DOM هم لزوماً با ترتیب بصری PDF یکی نیست (باکس‌ها بلوک‌بلوک می‌آیند، نه بند‌به‌بند).
// راه‌حل: انکر روی دو عبارت بولرپلیت ثابتِ گزارش حسابرس استاندارد ایران (در همهٔ ناشران یکسان‌اند):
//   «منظور از مسائل عمده حسابرسی» → شروع بلوک «سایر بندهای توضیحی + تاکید بر مطالب خاص»
//   «مسئولیت سایر اطلاعات با هیئت مدیره» → پایان آن بلوک و شروع «گزارش در مورد سایر اطلاعات»
const BOILERPLATE_KEY_MATTERS = /منظور از مسائل عمده حسابرسی/
const BOILERPLATE_OTHER_INFO  = /مسئولیت سایر اطلاعات با هیئت مدیره/

function detectOpinion(text) {
  for (const [label, re] of OPINION_PATTERNS) {
    if (re.test(text)) return label
  }
  return null
}

// متن خام صفحهٔ نامه → فیلدهای گراندد؛ null یعنی استخراج شکست خورد (پست رد شود، حدس زده نشود)
function extractFromText(rawText) {
  const text = norm(rawText)
  const opinionType = detectOpinion(text)

  // مبنای اظهار نظر (بند ۴ دنباله + بند ۵، وقتی مشروط/مردود باشد) — از انتهای اولین تطبیق
  // نوع اظهارنظر تا شروع بولرپلیت «مسائل عمده حسابرسی»
  let basisForQualified = null
  const opinionMatch = OPINION_PATTERNS.map(([, re]) => re.exec(text)).find(Boolean)
  const keyMattersMatch = BOILERPLATE_KEY_MATTERS.exec(text)
  if (opinionMatch && keyMattersMatch && keyMattersMatch.index > opinionMatch.index) {
    basisForQualified = cap(text.slice(opinionMatch.index + opinionMatch[0].length, keyMattersMatch.index), 900)
  }

  // «سایر بندهای توضیحی» + «تاکید بر مطالب خاص» با هم (تفکیک‌شان در DOM قابل اتکا نیست) —
  // بین دو بولرپلیت بالا
  let notableClauses = null
  const otherInfoMatch = BOILERPLATE_OTHER_INFO.exec(text)
  if (keyMattersMatch && otherInfoMatch && otherInfoMatch.index > keyMattersMatch.index) {
    notableClauses = cap(text.slice(keyMattersMatch.index + keyMattersMatch[0].length, otherInfoMatch.index), NOTABLE_CLAUSES_CAP)
  }

  // شروع «گزارش در مورد سایر الزامات قانونی و قراردادی» بعد از بلوک «سایر اطلاعات» می‌آید —
  // فقط یه تکه از ابتدایش (شامل بند مسئولیت قانونی + شروع بندهای بعدی)
  const legalComplianceNotes = otherInfoMatch ? cap(text.slice(otherInfoMatch.index)) : null

  if (!opinionType && !basisForQualified && !notableClauses && !legalComplianceNotes) return null
  return { opinionType, basisForQualified, notableClauses, legalComplianceNotes }
}

// browser: نمونهٔ مشترک puppeteer که در codal-watch.js از قبل مدیریت می‌شود — اینجا launch جدید نمی‌شود
async function fetchAuditLetter(url, browser) {
  const page = await browser.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 })
    let text = await page.evaluate(() => document.body.innerText)
    if (!text || text.trim().length < 500) {
      // صفحهٔ اصلی خیلی کوتاه بود — احتمالاً محتوا داخل iframe است
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue
        try {
          const frameText = await frame.evaluate(() => document.body.innerText)
          if (frameText && frameText.trim().length > (text || '').trim().length) text = frameText
        } catch { /* فریم بیگانه/cross-origin — رد شو */ }
      }
    }
    if (!text || text.trim().length < 500) return null   // متن قابل استخراج نبود (مثلاً PDF اسکن‌شده)
    // دیباگ محلی: CODAL_LETTER_DUMP=/path/to/file.txt برای بازبینی متن خام قبل از تنظیم ریجکس‌ها
    if (process.env.CODAL_LETTER_DUMP) {
      try { require('fs').writeFileSync(process.env.CODAL_LETTER_DUMP, norm(text)) } catch {}
    }
    return extractFromText(text)
  } catch {
    return null
  } finally {
    await page.close().catch(() => {})
  }
}

module.exports = { fetchAuditLetter, extractFromText }

if (require.main === module) {
  ;(async () => {
    const url = process.argv[2]
    if (!url) { console.error('استفاده: node codal-letter-extract.js <URL نامه>'); process.exit(1) }
    const puppeteer = require('puppeteer')
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    try {
      const result = await fetchAuditLetter(url, browser)
      console.log(JSON.stringify(result, null, 2))
    } finally {
      await browser.close()
    }
  })().catch(e => { console.error('FATAL', e); process.exit(1) })
}
