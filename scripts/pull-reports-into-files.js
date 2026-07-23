#!/usr/bin/env node
/**
 * pull-reports-into-files.js
 *
 * بورس سنج — همگام‌سازی reports-out/ محلی از جدول stock_reports (جهت عکسِ خط لولهٔ عادی).
 *
 * چرا؟ backfill فصلی روی سرور آلمان مستقیم در DB انجام می‌شود، ولی codal-watch روی سرور ایران
 * هر rebuild را از «فایل محلی» merge می‌کند و کل payload را upsert می‌کند — اگر فایل محلی
 * دوره‌های backfill را نداشته باشد، اولین گزارش تازهٔ همان نماد آن‌ها را از DB می‌شوید.
 * این اسکریپت یک بار بعد از backfill روی سرور ایران اجرا می‌شود و دوره‌های DB را که در فایل
 * نیستند به فایل اضافه می‌کند (union — چیزی از فایل حذف نمی‌شود، فقط اضافه).
 *
 * استفاده (روی سرور ایران، /opt/bourssanj):
 *   node scripts/pull-reports-into-files.js
 */

'use strict'

const path = require('path')
const fs = require('fs')
const { sbClient, OUT_DIR } = require('./codal-company-reports.js')

const filled = (x) => Object.values(x).filter(v => v != null).length
const keepA = (a, b) => (a.publish || '') > (b.publish || '')
  || ((a.publish || '') === (b.publish || '') && filled(a) >= filled(b))
const qKey = (q) => `${q.period}|${q.months}`
const mKey = (m) => m.period

// union دو فهرست — روی کلید مشترک، publish جدیدتر می‌برد (همان قاعدهٔ buildSymbol)
function unionMerge(fileArr, dbArr, keyFn) {
  const map = new Map((fileArr || []).map(x => [keyFn(x), x]))
  let added = 0
  for (const d of dbArr || []) {
    const k = keyFn(d)
    const f = map.get(k)
    if (!f) { map.set(k, d); added++; continue }
    if (keepA(d, f)) map.set(k, d)
  }
  return { arr: [...map.values()], added }
}

async function main() {
  const sb = sbClient()
  if (!sb) { console.error('SUPABASE_URL/SUPABASE_KEY لازم است'); process.exit(1) }

  // صفحه‌بندی — supabase پیش‌فرض ۱۰۰۰ ردیف می‌دهد
  const rows = []
  for (let fromIdx = 0; ; fromIdx += 500) {
    const { data, error } = await sb.from('stock_reports').select('symbol, data').order('symbol').range(fromIdx, fromIdx + 499)
    if (error) { console.error(error.message); process.exit(1) }
    rows.push(...(data || []))
    if (!data || data.length < 500) break
  }
  console.log(`${rows.length} نماد در stock_reports`)

  let touched = 0
  for (const r of rows) {
    if (!r.data) continue
    const outFile = path.join(OUT_DIR, `${r.symbol.replace(/\s+/g, '-')}.json`)
    let file = null
    try { file = JSON.parse(fs.readFileSync(outFile, 'utf8')) } catch {}
    if (!file) {
      // فایل محلی نیست (نماد فقط در DB) — کل payload نوشته می‌شود
      fs.mkdirSync(OUT_DIR, { recursive: true })
      fs.writeFileSync(outFile, JSON.stringify(r.data))
      console.log(`＋ ${r.symbol}: فایل محلی نبود — از DB نوشته شد`)
      touched++
      continue
    }
    const q = unionMerge(file.quarters, r.data.quarters, qKey)
    const m = unionMerge(file.months, r.data.months, mKey)
    if (!q.added && !m.added) continue
    file.quarters = q.arr.sort((a, b) => (a.period + a.months).localeCompare(b.period + b.months))
    file.months = m.arr.sort((a, b) => a.period.localeCompare(b.period))
    fs.writeFileSync(outFile, JSON.stringify(file))
    console.log(`✅ ${r.symbol}: ${q.added} فصلی + ${m.added} ماهانه از DB به فایل اضافه شد`)
    touched++
  }
  console.log(`✔ تمام شد — ${touched} فایل به‌روز شد`)
}

main().catch(e => { console.error(e); process.exit(1) })
