/**
 * candles-lib.js — ابزارهای مشترک اسکریپت‌های کندل (backfill + daily)
 *
 * تبدیل تقویم جلالی↔میلادی (پکیج jalaali-js)،
 * نرمال‌سازی نام شاخص‌ها، و helper های fetch/عدد.
 */

'use strict'

// ───────────────────────── تقویم ─────────────────────────

const jalaali = require('jalaali-js')

const pad2 = (x) => String(x).padStart(2, '0')

/** «1403/08/08» یا «1403-08-08» → «2024-10-29» (یا null) */
function shamsiToGregorian(s) {
  const m = String(s ?? '').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (!m) return null
  try {
    const { gy, gm, gd } = jalaali.toGregorian(+m[1], +m[2], +m[3])
    return `${gy}-${pad2(gm)}-${pad2(gd)}`
  } catch { return null }
}

/** «2024-10-29» یا «20241029» → «1403/08/08» (یا null) */
function gregorianToShamsi(s) {
  const m = String(s ?? '').match(/^(\d{4})-?(\d{2})-?(\d{2})$/)
  if (!m) return null
  try {
    const { jy, jm, jd } = jalaali.toJalaali(+m[1], +m[2], +m[3])
    return `${jy}/${pad2(jm)}/${pad2(jd)}`
  } catch { return null }
}

/** تاریخ امروز تهران — هر دو تقویم */
function tehranToday() {
  const greg = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()) // «2026-07-10»
  return { gregorian: greg, shamsi: gregorianToShamsi(greg) }
}

/** روز هفته تهران — 0=یکشنبه … 6=شنبه (مثل getDay) */
function tehranDay() {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', weekday: 'short' }).format(new Date())
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

// ───────────────────────── متن و عدد ─────────────────────────

const clean = (s) => String(s ?? '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[‌‎‏‪-‮]/g, ' ')
  .replace(/\s+/g, ' ').trim()

function num(v) {
  const x = parseFloat(String(v ?? '').replace(/,/g, ''))
  return isNaN(x) ? null : x
}

// ───────────────────────── شاخص‌ها ─────────────────────────

/**
 * کد شاخص‌ها در tsetmc (برای تاریخچه — GetIndexB2History)
 * منبع: کدهای شناخته‌شده pytse-client؛ با --probe-index قابل راستی‌آزمایی
 */
const INDEX_CODES = {
  'شاخص کل':                 '32097828799138957',
  'شاخص هم‌وزن':             '67130298613737946',
  'شاخص قیمت (وزنی-ارزشی)':  '5798407779416661',
  'شاخص قیمت (هم‌وزن)':      '8384385859414435',
  'شاخص آزاد شناور':         '49579049405614711',
  'شاخص بازار اول':          '62752761908615603',
  'شاخص بازار دوم':          '71704845530629737',
}

/**
 * نام شاخص از هر منبع (BrsApi type=3، tsetmc) → نام canonical جدول index_candles
 * ترتیب شرط‌ها مهم است: «قیمت هم‌وزن» قبل از «قیمت» قبل از «هم‌وزن»
 */
function normalizeIndexName(raw) {
  const s = clean(raw).replace(/‌/g, ' ')
  if (/فرابورس/.test(s))                    return 'شاخص کل فرابورس'
  if (/قیمت/.test(s) && /هم\s?وزن/.test(s)) return 'شاخص قیمت (هم‌وزن)'
  if (/قیمت/.test(s))                        return 'شاخص قیمت (وزنی-ارزشی)'
  if (/هم\s?وزن/.test(s))                    return 'شاخص هم‌وزن'
  if (/آزاد\s?شناور/.test(s))                return 'شاخص آزاد شناور'
  if (/بازار\s?اول/.test(s))                 return 'شاخص بازار اول'
  if (/بازار\s?دوم/.test(s))                 return 'شاخص بازار دوم'
  if (/کل/.test(s))                          return 'شاخص کل'
  return clean(raw)
}

// ───────────────────────── fetch ─────────────────────────

const TSETMC_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' }

// BrsApi History.php به fetch نود ECONNRESET می‌دهد ولی به curl همان سرور HTTP 200 —
// پس بعد از شکست fetch، خودکار با curl تلاش می‌کنیم
const { execFile } = require('child_process')

function curlJson(url, { timeout = 30_000, headers } = {}) {
  const args = ['-s', '--max-time', String(Math.ceil(timeout / 1000)), '--fail']
  for (const [k, v] of Object.entries(headers ?? {})) args.push('-H', `${k}: ${v}`)
  args.push(url)
  return new Promise((resolve, reject) => {
    execFile('curl', args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(`curl: ${err.message}`))
      try { resolve(JSON.parse(stdout)) } catch { reject(new Error('curl: پاسخ JSON نیست')) }
    })
  })
}

async function fetchJson(url, { retries = 2, timeout = 30_000, headers } = {}) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        ...(headers ? { headers } : {}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      try { return await curlJson(url, { timeout, headers }) } catch { /* خطای اصلی fetch گزارش شود */ }
      if (i === retries) throw e
      await new Promise(r => setTimeout(r, 1500 * (i + 1)))
    }
  }
}

async function mapLimit(items, limit, fn) {
  const out = []
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** فیلتر نماد قابل‌تحلیل: بدون پسوند عددی (اوراق/آپشن)، بدون حق تقدم */
function isCandleSymbol(it, allL18) {
  const l18 = clean(it.l18)
  const l30 = clean(it.l30)
  if (!l18) return false
  if (/[0-9۰-۹]/.test(l18)) return false
  if (/حق تقدم|حق‌تقدم/.test(l30)) return false
  if (l18.endsWith('ح') && allL18.has(l18.slice(0, -1))) return false
  return true
}

/**
 * تفکیک بورس/فرابورس از isin — کاراکتر پنجم (اندیس ۳) استاندارد ISIN ایران:
 * «1» = پذیرفته‌شده در بورس اوراق بهادار تهران، «3» = فرابورس ایران.
 * بقیه کدها (۵=ETF، ۷=حق‌تقدم، …) در دستهٔ 'other' می‌مانند.
 * راستی‌آزمایی با نمونهٔ واقعی AllSymbols.php: فملی=IRO1MSMI0001 (bourse), رانیز=IRO3NEYZ0001 (fara-bourse).
 */
function marketFromIsin(isin) {
  const c = String(isin ?? '').charAt(3)
  if (c === '1') return 'bourse'
  if (c === '3') return 'fara-bourse'
  return 'other'
}

module.exports = {
  shamsiToGregorian, gregorianToShamsi, tehranToday, tehranDay,
  clean, num, fetchJson, mapLimit, TSETMC_HEADERS,
  INDEX_CODES, normalizeIndexName, isCandleSymbol, marketFromIsin,
}
