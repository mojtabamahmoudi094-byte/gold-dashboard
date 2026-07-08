#!/usr/bin/env node
/**
 * build-portfolio-radar.js
 *
 * بورس سنج — تجمیع پرتفوی ماهانه همه صندوق‌ها به یک فایل «رادار پول هوشمند»
 * ورودی:  public/portfolio/<slug>.json   (خروجی codal-portfolio.js)
 * خروجی: public/portfolio/_radar.json
 *
 * اجرا بعد از هر به‌روزرسانی ماهانه پرتفوی‌ها:
 *   node scripts/build-portfolio-radar.js
 *
 * ساختار خروجی (واحد ارزش‌ها: میلیارد تومان، گرد به ۲ رقم):
 *   month      "1405/03" — ماه غالب بین آخرین گزارش صندوق‌ها
 *   funds      [{ s: نماد, g: slug فایل, nav, date }]
 *   stocks     [{ n: نام شرکت, sym: نماد (از نگاشت l30→l18، اگر پیدا شد),
 *                 v: ارزش کل نزد صندوق‌ها, c: تعداد صندوق دارنده,
 *                 b: جمع خرید ماه, s: جمع فروش ماه,
 *                 e: [idx صندوق‌های تازه‌وارد], x: [idx صندوق‌های خارج‌شده],
 *                 h: [[idx صندوق, ارزش, درصد از NAV صندوق], …] }]
 *
 * نگاشت نام شرکت → نماد از stocks-industries (اولین مسیر موجود):
 *   /opt/stocks-industries.json (سرور) یا public/stocks/industries.json (repo)
 */

'use strict'

const fs = require('fs')
const path = require('path')

const DIR = path.resolve(__dirname, '../public/portfolio')
const OUT = path.join(DIR, '_radar.json')

// ریال → میلیارد تومان
const bt = (v) => Math.round(v / 1e10 * 100) / 100
// نرمال‌سازی نام شرکت — همان منطق codal-portfolio.js
const normTxt = (s) => String(s ?? '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[أإ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ة/g, 'ه')
  .replace(/[‌‎‏‪-‮]/g, ' ')
  .replace(/\s+/g, ' ').trim()
// ردیف‌های غیرسهم شیت اکسل: نقل از/به صفحه، جمع، جمع کل
const isJunkRow = (n) => /^(نقل (از|به) صفحه|جمع( کل)?$)/.test(n)

// ── نگاشت نام کامل شرکت → نماد (l30 → l18) ─────────────────────────
// کلید تطبیق: نام نرمال‌شده بدون هیچ فاصله‌ای — نام‌های کدال و TSETMC در
// فاصله/نیم‌فاصله فرق دارند ولی بعد از حذف فاصله‌ها تقریباً یکی می‌شوند
const nameKey = (s) => normTxt(s)
  .replace(/\(.*?\)/g, '')                 // (هلدینگ)، (سهامی عام)…
  .replace(/سهامی عام|هلدینگ|شرکت/g, '')
  .replace(/[\s‌.\-،]+/g, '')              // «س. نفت» و «سرمایه‌گذاری» هم‌کلید شوند

// دیکشنری تجمعی — AllSymbols نمادهای «ممنوع-متوقف» را حذف می‌کند (مثل فولاد
// از اسفند ۱۴۰۴)، پس هر نمادی که یک بار دیده شد در این فایل می‌ماند
const MAP_FILE = path.join(DIR, '_symbols.json')
const symbolMap = new Map()   // nameKey → l18

// ۱) seed دستی — نمادهای بزرگِ در حال حاضر متوقف/غایب از AllSymbols
const SEED = {
  'فولاد مبارکه اصفهان': 'فولاد', 'فولاد مبارکه': 'فولاد',
  'فروشگاههای زنجیره ای افق کوروش': 'کورش', 'افق کوروش': 'کورش',
  'مبین انرژی خلیج فارس': 'مبین',
  'سرمایه گذاری صدرتامین': 'تاصیکو', 'صدرتامین': 'تاصیکو',
  'پالایش نفت اصفهان': 'شپنا', 'نفت اصفهان': 'شپنا',
  'ملی صنایع مس ایران': 'فملی', 'ملی مس': 'فملی',
  'بانک اقتصادنوین': 'ونوین', 'اقتصاد نوین': 'ونوین',
  'فجر انرژی خلیج فارس': 'بفجر',
  'فولاد خوزستان': 'فخوز',
  'حفاری شمال': 'حفاری',
  'سیمرغ': 'سیمرغ',
  'پاکدیس': 'غدیس',
  'داروسازی شهید قاضی': 'دقاضی',
  'صنایع خاک چینی ایران': 'کخاک',
  'کشت و صنعت دشت خرم دره': 'زدشت',
  'تولیدمواداولیه داروپخش': 'دتولید',
  'پتروشیمی تامین': 'تاپیکو',
  'سنگ آهن گهرزمین': 'کگهر', 'سنگ آهن گهر زمین': 'کگهر',
  'کشاورزی ودامپروی مگسال': 'زمگسا',
  'سرمایه گذاری توسعه صنایع سیمان': 'سیدکو',
  'فولاد خراسان': 'فخاس',
  'مپنا': 'رمپنا',
}
for (const [n, sym] of Object.entries(SEED)) symbolMap.set(nameKey(n), sym)

// ۲) دیکشنری تجمعی قبلی
if (fs.existsSync(MAP_FILE)) {
  try {
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))))
      symbolMap.set(k, v)
  } catch { /* فایل خراب — از بقیه منابع ساخته می‌شود */ }
}

// ۳) منابع تازه: AllSymbols کامل (سرور) و stock_industries (fallback)
const addPairs = (pairs) => {
  for (const s of pairs) if (s.l18 && s.l30) symbolMap.set(nameKey(s.l30), normTxt(s.l18))
}
for (const p of ['/opt/all-symbols.json', path.resolve(__dirname, '../public/stocks/all-symbols.json')]) {
  if (!fs.existsSync(p)) continue
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))
    addPairs(Array.isArray(j) ? j : j.data || [])
    break
  } catch { /* ادامه با منبع بعدی */ }
}
for (const p of ['/opt/stocks-industries.json', path.resolve(__dirname, '../public/stocks/industries.json')]) {
  if (!fs.existsSync(p)) continue
  try {
    for (const g of (JSON.parse(fs.readFileSync(p, 'utf8')).industries || [])) addPairs(g.symbols || [])
    break
  } catch { /* نگاشت از منابع قبلی کافی است */ }
}

// نوشتن دیکشنری تجمعی به‌روز — دفعه بعد نمادهای متوقف هم پوشش دارند
fs.writeFileSync(MAP_FILE, JSON.stringify(Object.fromEntries([...symbolMap.entries()].sort())))

const symbolKeys = [...symbolMap.keys()]
const knownSymbols = new Set(symbolMap.values())
const findSymbol = (name) => {
  const raw = normTxt(name)
  // حق تقدم: «ح . نام شرکت» → نماد پایه + «ح»
  const rights = raw.match(/^ح\s*[.،]?\s+(.+)$/)
  if (rights) {
    const base = findSymbol(rights[1])
    return base ? `${base}ح` : null
  }
  // نماد داخل پرانتز: «سر. غدیر (وغدیر)»
  const paren = raw.match(/\(([آ-ی]{2,12})\)/)
  if (paren && knownSymbols.has(paren[1])) return paren[1]
  const k = nameKey(raw)
  if (!k) return null
  const exact = symbolMap.get(k)
  if (exact) return exact
  // تطبیق دربرگیری — فقط اگر دقیقاً یک کاندید باشد (از ابهام جلوگیری می‌کند)
  if (k.length >= 5) {
    const cands = symbolKeys.filter(sk => sk.length >= 5 && (sk.includes(k) || k.includes(sk)))
    if (cands.length === 1) return symbolMap.get(cands[0])
  }
  return null
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'))

// ── آخرین ماه هر صندوق + تشخیص ماه غالب ──────────────────────────────
const perFund = []
for (const f of files) {
  let j
  try { j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) } catch { continue }
  if (!j?.months?.length) continue
  const cur = j.months[j.months.length - 1]
  if (!cur?.holdings?.length) continue
  const nav = cur.holdings.reduce((s, h) => s + (h.n1 || 0), 0)
  if (nav <= 0) continue
  perFund.push({ slug: f.replace(/\.json$/, ''), symbol: j.symbol || f.replace(/\.json$/, ''), cur, nav })
}

const monthCount = {}
for (const p of perFund) {
  const ym = p.cur.date.slice(0, 7)
  monthCount[ym] = (monthCount[ym] || 0) + 1
}
const month = Object.keys(monthCount).sort((a, b) => monthCount[b] - monthCount[a])[0]
const inMonth = perFund.filter(p => p.cur.date.slice(0, 7) === month)
const stale = perFund.length - inMonth.length

// ── تجمیع سهم‌به‌سهم ─────────────────────────────────────────────────
const funds = inMonth.map(p => ({ s: p.symbol, g: p.slug, nav: bt(p.nav), date: p.cur.date }))
const stocks = new Map()

inMonth.forEach((p, fi) => {
  for (const h of p.cur.holdings) {
    const name = normTxt(h.name)
    if (!name || isJunkRow(name)) continue
    // کلید تجمیع: نماد اگر پیدا شد — واریانت‌های اسمی یک سهم (ملی مس/ملی
    // صنایع مس ایران) در صندوق‌های مختلف با هم یکی می‌شوند
    const sym = findSymbol(name)
    const key = sym ? `s:${sym}` : `n:${nameKey(name)}`
    let st = stocks.get(key)
    if (!st) stocks.set(key, st = { n: name, sym, v: 0, c: 0, b: 0, s: 0, e: [], x: [], h: [], variants: new Map() })
    st.variants.set(name, (st.variants.get(name) || 0) + 1)
    const held = (h.n1 || 0) > 0
    if (held) {
      st.v += h.n1
      st.c += 1
      st.h.push([fi, bt(h.n1), Math.round((h.n1 / p.nav) * 10000) / 100])
    }
    st.b += h.bc || 0
    st.s += h.sa || 0
    if ((h.q0 || 0) === 0 && (h.q1 || 0) > 0 && (h.bc || 0) > 0) st.e.push(fi)
    if ((h.q0 || 0) > 0 && (h.q1 || 0) === 0) st.x.push(fi)
  }
})

let matched = 0
const list = [...stocks.values()]
  .map(st => {
    if (st.sym) matched++
    // نام نمایشی: پرتکرارترین واریانت بین گزارش‌ها
    const n = [...st.variants.entries()].sort((a, b) => b[1] - a[1])[0][0]
    // بعد از ادغام واریانت‌ها یک صندوق ممکن است دو بار آمده باشد — یکتاسازی:
    // h با جمع ارزش/درصد per صندوق، e و x با Set
    const byFund = new Map()
    for (const [fi, val, pct] of st.h) {
      const cur = byFund.get(fi)
      if (cur) { cur[1] = Math.round((cur[1] + val) * 100) / 100; cur[2] = Math.round((cur[2] + pct) * 100) / 100 }
      else byFund.set(fi, [fi, val, pct])
    }
    const h = [...byFund.values()].sort((a, b) => b[1] - a[1])
    const { variants, sym, ...rest } = st
    return {
      ...rest, n, ...(sym ? { sym } : {}),
      v: bt(st.v), c: h.length, b: bt(st.b), s: bt(st.s),
      e: [...new Set(st.e)], x: [...new Set(st.x)], h,
    }
  })
  .filter(st => st.v > 0 || st.s > 0)
  .sort((a, b) => b.v - a.v)

const out = {
  updated: new Date().toISOString(),
  month,
  fundsTotal: perFund.length,
  stale,
  funds,
  stocks: list,
}

fs.writeFileSync(OUT, JSON.stringify(out))
const kb = Math.round(fs.statSync(OUT).size / 1024)
console.log(`ماه غالب: ${month} — ${inMonth.length} صندوق (${stale} قدیمی کنار گذاشته شد)`)
console.log(`${list.length} سهم منحصربه‌فرد → ${OUT} (${kb}KB)`)
console.log(`نگاشت نماد: ${matched}/${list.length} (${symbolMap.size} نماد در مرجع)`)
