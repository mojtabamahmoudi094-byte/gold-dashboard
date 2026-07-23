#!/usr/bin/env node
/**
 * sync-fund-weight-one.js
 *
 * پردازش یک صندوق در یک پروسه‌ی جدا — چون سرور تولید فقط ~۱GB رم دارد و
 * پارس اکسل بعضی صندوق‌های طلا (مثلاً «مثقال») حافظه را تا OOM بالا می‌برد
 * (رخ‌داده در عمل: kernel OOM-killer پروسه‌ی اصلی sync-fund-weights.js را کشت).
 * ایزوله‌کردن هر صندوق در پروسه‌ی جدا با --max-old-space-size محدود، یعنی
 * اگر یک صندوق حافظه‌بر بود فقط همان پروسه کشته می‌شود، نه سرور تولید.
 *
 * خروجی: یک خط JSON در stdout — { ok:true, weights:{...} } یا { ok:false, error }
 */

'use strict'

const { buildSymbol } = require('./codal-portfolio')

const name = process.argv[2]
const kind = process.argv[3] // 'gold' | 'silver' | 'saffron'

const norm = (s) => String(s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()

function pctScale(holdings) {
  const total = holdings.reduce((s, h) => s + (h.pct || 0), 0)
  return total > 5 ? 1 : 100
}

function sumPct(holdings, pattern, scale) {
  return holdings.filter(h => pattern.test(norm(h.name))).reduce((s, h) => s + (h.pct || 0), 0) * scale
}

// برچسب خواناى هر قلم دارایى صندوق کالایى
// «زعفران0510نگین سحرخیز(پ)» → «سحرخیز» · «گواهی سپرده پیوسته شمش نقره 999.9» → «گواهی شمش نقره»
function prettyPart(raw) {
  const s = norm(raw).replace(/\((?:پ|ن)\)\s*$/, '').trim()
  const negin = s.match(/زعفران\s*\d*\s*نگین\s*(.+)$/)
  if (negin) return negin[1].trim()
  const pooshal = s.match(/زعفران\s*\d*\s*پوشال\s*(.+)$/)
  if (pooshal) return `${pooshal[1].trim()} (پوشال)`
  if (/شمش\s*نقره/.test(s)) return 'گواهی شمش نقره'
  if (/شمش\s*طلا/.test(s)) return 'گواهی شمش طلا'
  if (/سکه/.test(s)) return 'گواهی سکه طلا'
  return s
}

// ستون درصدِ گزارش صندوق‌های زعفران ناهم‌تراز است (مقدار ریالى خام به‌جاى درصد)،
// اما ستون ارزش روز (n1) درست است — سهم هر قلم از سبد را از روى n1 حساب مى‌کنیم.
function partsFromValue(holdings) {
  const agg = new Map()
  for (const h of holdings) {
    const v = Number(h.n1) || 0
    if (v <= 0) continue
    const k = prettyPart(h.name)
    agg.set(k, (agg.get(k) || 0) + v)
  }
  const total = [...agg.values()].reduce((s, v) => s + v, 0)
  if (total <= 0) throw new Error('ارزش روز هیچ قلمى ثبت نشده است')
  return [...agg.entries()]
    .map(([n, v]) => ({ name: n, pct: +(v / total * 100).toFixed(1) }))
    .sort((a, b) => b.pct - a.pct)
}

async function main() {
  const out = await buildSymbol(name, { verbose: false })
  const holdings = out.months[out.months.length - 1].holdings
  const scale = pctScale(holdings)

  if (kind === 'saffron') return { parts: partsFromValue(holdings) }

  // سهم هر گروه دارایی از «ارزش روز» — پشتیبانِ حالتی که ستون درصد ناهم‌تراز است.
  // توجه: جمع اقلام ۱۰۰٪ در نظر گرفته می‌شود، یعنى سهم نقد صندوق قابل استخراج نیست
  // و صفر فرض مى‌شود (خروجى با approx:true علامت مى‌خورد تا در سایت شفاف گفته شود).
  const shareOfValue = (() => {
    const total = holdings.reduce((s, h) => s + (Number(h.n1) || 0), 0)
    if (total <= 0) return null
    return (pattern) => holdings
      .filter(h => pattern.test(norm(h.name)))
      .reduce((s, h) => s + (Number(h.n1) || 0), 0) / total * 100
  })()

  // سلامت‌سنجی: ستون درصد بعضی قالب‌های اکسل صندوق ناهم‌ترازه (تعداد عدد هر ردیف
  // با فرض ۱۲تایی parseHoldingRows جور در نمی‌آید) و یک مبلغ ریالی خام به‌جای
  // درصد استخراج می‌شود — رخ‌داده در عمل برای بعضی صندوق‌ها. یک وزن معتبر هرگز
  // از ۱۰۰٪ بیشتر نمی‌شود؛ در غیر این صورت به‌جای عدد ساختگی خطا برمی‌گردانیم
  // تا در سایت مقدار هاردکد قبلی (fallback) جایگزینش نشود.
  if (kind === 'silver') {
    let silver = sumPct(holdings, /نقره/, scale)
    let approx = false
    if (silver > 100.5) {
      if (!shareOfValue) throw new Error(`مقدار نامعتبر (نقره=${silver.toFixed(0)}٪) و ارزش روزى هم ثبت نشده`)
      silver = shareOfValue(/نقره/)
      approx = true
    }
    const other = Math.max(0, 100 - silver)
    const out = { silver: +silver.toFixed(1), other: +other.toFixed(1) }
    return approx ? { ...out, approx: true } : out
  }

  let coin = sumPct(holdings, /سکه/, scale)
  let bar = sumPct(holdings, /شمش طلا|شمش‌طلا/, scale)
  let silverBar = sumPct(holdings, /شمش نقره/, scale)
  let approx = false
  if (coin > 100.5 || bar > 100.5 || silverBar > 100.5) {
    if (!shareOfValue) {
      throw new Error(`مقدار نامعتبر (سکه=${coin.toFixed(0)}٪ شمش=${bar.toFixed(0)}٪) و ارزش روزى هم ثبت نشده`)
    }
    coin = shareOfValue(/سکه/)
    bar = shareOfValue(/شمش طلا|شمش‌طلا/)
    silverBar = shareOfValue(/شمش نقره/)
    approx = true
  }
  const liq = Math.max(0, 100 - coin - bar - silverBar)
  const goldOut = { coin: +coin.toFixed(1), bar: +(bar + silverBar).toFixed(1), liq: +liq.toFixed(1) }
  return approx ? { ...goldOut, approx: true } : goldOut
}

main()
  .then(weights => { process.stdout.write(JSON.stringify({ ok: true, weights })); process.exit(0) })
  .catch(e => { process.stdout.write(JSON.stringify({ ok: false, error: e.message })); process.exit(0) })
