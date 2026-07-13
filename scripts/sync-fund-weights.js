#!/usr/bin/env node
/**
 * sync-fund-weights.js
 *
 * بورس سنج — استخراج وزن سکه/شمش طلا/گواهی نقره در ترکیب دارایی صندوق‌های
 * طلا و نقره، از همان گزارش ماهانه‌ی «صورت وضعیت پورتفوی» کدال که
 * scripts/codal-portfolio.js برای صندوق‌های سهامی/اهرمی/بخشی می‌خواند —
 * شیت «سهام» برای صندوق کالایی هم دقیقاً همان قالب ۱۲ ستونی را دارد،
 * فقط ردیف‌ها به‌جای نماد سهام، «شمش طلا»/«گواهی سپرده تمام سکه»/«شمش نقره» است
 * (ساختار واقعی با codal-portfolio-probe.js عیار روی سرور ایران راستی‌آزمایی شد).
 *
 * قبلاً این وزن‌ها هاردکد بودند: lib/goldBubbles.ts (FUND_WEIGHTS, SILVER_FUND_WEIGHTS)
 * این اسکریپت ماهانه public/fund-weights/gold.json و silver.json را می‌سازد؛
 * صفحات app/analysis/gold و silver این JSON را fetch می‌کنند و روی مقادیر
 * هاردکد override می‌کنند (هاردکد fallback می‌ماند برای صندوقی که گزارشش پارس نشد).
 *
 * هر صندوق در یک پروسه‌ی جدا (sync-fund-weight-one.js) با سقف حافظه‌ی محدود
 * پردازش می‌شود — سرور تولید فقط ~۱GB رم دارد و پارس اکسل بعضی صندوق‌های طلا
 * (مثلاً «مثقال») در عمل حافظه را تا OOM بالا برد و kernel پروسه را کشت؛
 * ایزوله‌کردن یعنی صندوق حافظه‌بر فقط پروسه‌ی خودش را می‌کشد، نه سرور را.
 *
 * روی سرور ایرانی:
 *   node sync-fund-weights.js --probe   → فقط عیار و یک صندوق نقره، بدون نوشتن فایل
 *   node sync-fund-weights.js           → همه‌ی صندوق‌های GOLD_FUNDS + SILVER_FUNDS
 */

'use strict'

const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')

const PROBE = process.argv.includes('--probe')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// lib/goldBubbles.ts را مستقیم import نمی‌کنیم (TS است) — همان اسم صندوق‌ها را اینجا هم نگه می‌داریم
const GOLD_FUNDS = [
  'عیار', 'طلا', 'مثقال', 'کهربا', 'جام طلا', 'گنج', 'ریتون', 'زمرد',
  'امرالد', 'گوهر', 'درخشان', 'جواهر', 'زر', 'آلتون', 'گلدا', 'زروان',
  'رز ترنج', 'آتش', 'زرفام', 'لیان', 'ناب', 'میراث', 'رزگلد', 'تابش',
  'زرگر', 'نفیس', 'نگین فارس', 'قیراط', 'درنا', 'گلدیس', 'همیان', 'دفینه',
]
const SILVER_FUNDS = ['نقرسا', 'نقرین', 'نقرفام', 'نقران', 'سیمین', 'نقرابی', 'سیلور']

const ONE_SCRIPT = path.join(__dirname, 'sync-fund-weight-one.js')

// هر صندوق در پروسه‌ی جدا — سقف رم ۳۵۰MB + timeout ۹۰ ثانیه؛ اگر OOM/timeout
// شد فقط این پروسه می‌میرد (خروجی خالی)، نه سرور
function runOne(name, kind) {
  const res = spawnSync(process.execPath, ['--max-old-space-size=350', ONE_SCRIPT, name, kind], {
    encoding: 'utf8', timeout: 90_000, maxBuffer: 4 * 1024 * 1024,
  })
  if (res.error) return { ok: false, error: res.error.message }
  if (res.signal) return { ok: false, error: `پروسه با سیگنال ${res.signal} متوقف شد (احتمالاً کمبود حافظه)` }
  const line = (res.stdout || '').trim()
  if (!line) return { ok: false, error: `خروجی خالی (کد ${res.status})` }
  try { return JSON.parse(line) } catch { return { ok: false, error: 'خروجی JSON نامعتبر' } }
}

async function main() {
  const names = PROBE ? ['عیار', 'نقرفام'] : [...GOLD_FUNDS, ...SILVER_FUNDS]
  const goldOut = {}, silverOut = {}
  const failed = []

  for (const [i, name] of names.entries()) {
    const isSilver = SILVER_FUNDS.includes(name)
    process.stdout.write(`[${i + 1}/${names.length}] ${name} (${isSilver ? 'نقره' : 'طلا'}) … `)
    const r = runOne(name, isSilver ? 'silver' : 'gold')
    if (r.ok) {
      if (isSilver) { silverOut[name] = r.weights; console.log(`✅ نقره=${r.weights.silver}٪ سایر=${r.weights.other}٪`) }
      else { goldOut[name] = r.weights; console.log(`✅ سکه=${r.weights.coin}٪ شمش=${r.weights.bar}٪ نقد=${r.weights.liq}٪`) }
    } else {
      console.log(`❌ ${r.error}`)
      failed.push(`${name}: ${r.error}`)
    }
    await sleep(4000) // رعایت rate limit کدال — همان الگوی codal-portfolio.js
  }

  console.log(`\n═══ نتیجه: ${Object.keys(goldOut).length + Object.keys(silverOut).length} موفق، ${failed.length} ناموفق ═══`)
  failed.forEach(f => console.log('  -', f))

  if (PROBE) { console.log('\n--probe: فایلی نوشته نشد'); return }

  const outDir = path.join(__dirname, '..', 'public', 'fund-weights')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'gold.json'), JSON.stringify({ updated: new Date().toISOString(), weights: goldOut }, null, 0))
  fs.writeFileSync(path.join(outDir, 'silver.json'), JSON.stringify({ updated: new Date().toISOString(), weights: silverOut }, null, 0))
  console.log(`\nنوشته شد: ${outDir}/gold.json ، ${outDir}/silver.json`)
}

main().catch(e => { console.error(e); process.exit(1) })
