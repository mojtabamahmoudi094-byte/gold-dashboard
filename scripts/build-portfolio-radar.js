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
 *   stocks     [{ n: نام شرکت, v: ارزش کل نزد صندوق‌ها, c: تعداد صندوق دارنده,
 *                 b: جمع خرید ماه, s: جمع فروش ماه,
 *                 e: [idx صندوق‌های تازه‌وارد], x: [idx صندوق‌های خارج‌شده],
 *                 h: [[idx صندوق, ارزش, درصد از NAV صندوق], …] }]
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
  .replace(/[‌‎‏‪-‮]/g, ' ')
  .replace(/\s+/g, ' ').trim()
// ردیف‌های غیرسهم شیت اکسل: نقل از/به صفحه، جمع، جمع کل
const isJunkRow = (n) => /^(نقل (از|به) صفحه|جمع( کل)?$)/.test(n)

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
    let st = stocks.get(name)
    if (!st) stocks.set(name, st = { n: name, v: 0, c: 0, b: 0, s: 0, e: [], x: [], h: [] })
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

const list = [...stocks.values()]
  .map(st => ({ ...st, v: bt(st.v), b: bt(st.b), s: bt(st.s), h: st.h.sort((a, b) => b[1] - a[1]) }))
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
