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
const kind = process.argv[3] // 'gold' | 'silver'

const norm = (s) => String(s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()

function pctScale(holdings) {
  const total = holdings.reduce((s, h) => s + (h.pct || 0), 0)
  return total > 5 ? 1 : 100
}

function sumPct(holdings, pattern, scale) {
  return holdings.filter(h => pattern.test(norm(h.name))).reduce((s, h) => s + (h.pct || 0), 0) * scale
}

async function main() {
  const out = await buildSymbol(name, { verbose: false })
  const holdings = out.months[out.months.length - 1].holdings
  const scale = pctScale(holdings)

  // سلامت‌سنجی: ستون درصد بعضی قالب‌های اکسل صندوق ناهم‌ترازه (تعداد عدد هر ردیف
  // با فرض ۱۲تایی parseHoldingRows جور در نمی‌آید) و یک مبلغ ریالی خام به‌جای
  // درصد استخراج می‌شود — رخ‌داده در عمل برای بعضی صندوق‌ها. یک وزن معتبر هرگز
  // از ۱۰۰٪ بیشتر نمی‌شود؛ در غیر این صورت به‌جای عدد ساختگی خطا برمی‌گردانیم
  // تا در سایت مقدار هاردکد قبلی (fallback) جایگزینش نشود.
  if (kind === 'silver') {
    const silver = sumPct(holdings, /نقره/, scale)
    if (silver > 100.5) throw new Error(`مقدار نامعتبر (نقره=${silver.toFixed(0)}٪) — ستون درصد این صندوق ناهم‌تراز است`)
    const other = Math.max(0, 100 - silver)
    return { silver: +silver.toFixed(1), other: +other.toFixed(1) }
  }
  const coin = sumPct(holdings, /سکه/, scale)
  const bar = sumPct(holdings, /شمش طلا|شمش‌طلا/, scale)
  const silverBar = sumPct(holdings, /شمش نقره/, scale)
  if (coin > 100.5 || bar > 100.5 || silverBar > 100.5) {
    throw new Error(`مقدار نامعتبر (سکه=${coin.toFixed(0)}٪ شمش=${bar.toFixed(0)}٪) — ستون درصد این صندوق ناهم‌تراز است`)
  }
  const liq = Math.max(0, 100 - coin - bar - silverBar)
  return { coin: +coin.toFixed(1), bar: +(bar + silverBar).toFixed(1), liq: +liq.toFixed(1) }
}

main()
  .then(weights => { process.stdout.write(JSON.stringify({ ok: true, weights })); process.exit(0) })
  .catch(e => { process.stdout.write(JSON.stringify({ ok: false, error: e.message })); process.exit(0) })
