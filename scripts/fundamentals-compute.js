#!/usr/bin/env node
/**
 * fundamentals-compute.js
 *
 * بورس سنج — محاسبه نسبت‌های مالی (P/E, P/B, ROE, ROA, ...) از روی stock_reports
 * (گزارش‌های کدال، parseFinancials در codal-company-reports.js) + قیمت لحظه‌ای stock_industries
 * بدون تماس شبکه‌ای جدید با کدال — فقط محاسبه و upsert در stock_fundamentals.
 *
 * روی سرور ایرانی، بعد از هر اجرای موفق codal-watch.js:
 *   node fundamentals-compute.js
 *
 * ⚠️ فیلدهای ترازنامه (assets/liabilities/equity) در parseBS (codal-company-reports.js)
 * روی لیبل‌های حدسی کدال نوشته شده‌اند و هنوز روی داده واقعی تأیید نشده‌اند — تا وقتی
 * `node codal-reports-probe.js <نماد>` روی سرور این لیبل‌ها را تأیید نکند، ROE/ROA/P.B
 * ممکن است null بمانند (P/E و رشد EPS به آن‌ها وابسته نیستند و از قبل درست کار می‌کنند).
 */

'use strict'

const path = require('path')
const fs   = require('fs')

const { sbClient } = require('./codal-company-reports.js')

// نسخهٔ JS ساده‌ی lib/fundamentalRatios.ts — اسکریپت‌های scripts/ صرفاً CommonJS ساده‌اند
// و از کامپایلر TS پروژه (فقط برای app/ و lib/ سمت Next.js) استفاده نمی‌کنند.
const div = (a, b) => (a == null || b == null || b === 0 ? null : (isFinite(a / b) ? a / b : null))

function latestAnnual(quarters) {
  const annual = (quarters || [])
    .filter(q => q.months === 12 && q.net != null)
    .sort((a, b) => a.period.localeCompare(b.period))
  return annual.length ? annual[annual.length - 1] : null
}

function computeFundamentals(quarters, price) {
  const q = latestAnnual(quarters)
  if (!q) return null

  const shares = q.capital != null ? q.capital * 1000 : null
  const bookValuePerShare = shares && q.equity != null ? (q.equity * 1_000_000) / shares : null
  const pe = price != null && q.eps ? price / q.eps : null
  const pb = price != null && bookValuePerShare ? price / bookValuePerShare : null

  return {
    period: q.period,
    pe, pb,
    roe: div(q.net, q.equity),
    roa: div(q.net, q.assets),
    netMargin: div(q.net, q.revenue),
    opMargin: div(q.op, q.revenue),
    assetTurnover: div(q.revenue, q.assets),
    equityMultiplier: div(q.assets, q.equity),
    debtToEquity: div(q.liabilities, q.equity),
    bookValuePerShare,
  }
}

async function loadPriceMap(sb) {
  const map = new Map()
  const { data, error } = await sb.from('stock_industries').select('data').eq('id', 1).maybeSingle()
  if (error || !data?.data?.industries) return map
  for (const ind of data.data.industries) for (const s of ind.symbols ?? []) map.set(s.l18, s.pl ?? null)
  return map
}

async function main() {
  const sb = sbClient()
  if (!sb) { console.log('⚠️ SUPABASE_URL/SUPABASE_KEY تنظیم نشده — خروجی محاسبه نمی‌شود'); process.exit(1) }

  const [{ data: reports, error }, priceMap] = await Promise.all([
    sb.from('stock_reports').select('symbol, data'),
    loadPriceMap(sb),
  ])
  if (error) throw new Error(`stock_reports select: ${error.message}`)

  let ok = 0, skipped = 0
  for (const row of reports ?? []) {
    const quarters = row.data?.quarters
    const fr = computeFundamentals(quarters, priceMap.get(row.symbol) ?? null)
    if (!fr) { skipped++; continue }
    const { error: upErr } = await sb.from('stock_fundamentals')
      .upsert({ symbol: row.symbol, data: fr, updated: new Date().toISOString() }, { onConflict: 'symbol' })
    if (upErr) { console.log(`  ⚠️ ${row.symbol}: ${upErr.message}`); continue }
    ok++
  }
  console.log(`✅ ${ok} نماد محاسبه شد، ${skipped} رد شد (بدون گزارش سالانه)`)
}

main().catch(e => { console.error(e); process.exit(1) })
