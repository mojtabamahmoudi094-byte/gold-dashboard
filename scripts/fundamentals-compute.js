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
 * فیلدهای ترازنامه (assets/liabilities/equity) در parseBS (codal-company-reports.js) روی
 * داده واقعی شپدیس تأیید شدند — چک تراز (دارایی = بدهی + حقوق مالکانه) هم برقرار بود.
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

  // ارزش بازار میلیون ریال = قیمت × سرمایه / ۱۰۰۰؛ EV با بدهی بهره‌دار (تسهیلات) نه جمع بدهی‌ها
  const marketCap = price != null && q.capital != null ? (price * q.capital) / 1000 : null
  const netDebt = q.debt_lt != null && q.debt_st != null && q.cash != null
    ? q.debt_lt + q.debt_st - q.cash
    : null
  const enterpriseValue = marketCap != null && netDebt != null ? marketCap + netDebt : null

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
    marketCap,
    enterpriseValue,
    // EV/EBIT، نه EV/EBITDA — استهلاک از صورت‌های کدال قابل پارس مطمئن نیست
    evToEbit: div(enterpriseValue, q.op),
  }
}

async function loadPriceMap(sb) {
  const priceMap = new Map()
  const industryMap = new Map() // نماد → نام صنعت، برای صدک نسبی درون‌صنعتی
  const { data, error } = await sb.from('stock_industries').select('data').eq('id', 1).maybeSingle()
  if (error || !data?.data?.industries) return { priceMap, industryMap }
  for (const ind of data.data.industries) for (const s of ind.symbols ?? []) {
    priceMap.set(s.l18, s.pl ?? null)
    industryMap.set(s.l18, ind.name)
  }
  return { priceMap, industryMap }
}

// صدک یک مقدار در آرایه (۰..۱۰۰): چه نسبتی از اعضا کوچک‌تر یا مساوی‌اند
function percentileOf(sortedAsc, v) {
  if (!sortedAsc.length) return null
  let count = 0
  for (const x of sortedAsc) { if (x <= v) count++; else break }
  return Math.round((count / sortedAsc.length) * 100)
}

function median(sortedAsc) {
  const n = sortedAsc.length
  if (!n) return null
  const mid = Math.floor(n / 2)
  return n % 2 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2
}

async function main() {
  const sb = sbClient()
  if (!sb) { console.log('⚠️ SUPABASE_URL/SUPABASE_KEY تنظیم نشده — خروجی محاسبه نمی‌شود'); process.exit(1) }

  const [{ data: reports, error }, { priceMap, industryMap }] = await Promise.all([
    sb.from('stock_reports').select('symbol, data'),
    loadPriceMap(sb),
  ])
  if (error) throw new Error(`stock_reports select: ${error.message}`)

  // پاس ۱: محاسبهٔ نسبت‌های هر نماد
  const computed = [] // { symbol, fr }
  let skipped = 0
  for (const row of reports ?? []) {
    const fr = computeFundamentals(row.data?.quarters, priceMap.get(row.symbol) ?? null)
    if (!fr) { skipped++; continue }
    computed.push({ symbol: row.symbol, fr })
  }

  // پاس ۲: صدک و میانهٔ P/E درون هر صنعت. P/E مطلق ۸ برای پالایشی ارزان و برای دارویی
  // گران است؛ صدک نسبی این سوگیری cross-industry را رفع می‌کند. فقط P/E مثبت (سودده) شمرده می‌شود.
  const peByIndustry = new Map() // نام صنعت → آرایهٔ P/E مثبت مرتب‌شده
  for (const { symbol, fr } of computed) {
    const ind = industryMap.get(symbol)
    if (!ind || fr.pe == null || !(fr.pe > 0)) continue
    if (!peByIndustry.has(ind)) peByIndustry.set(ind, [])
    peByIndustry.get(ind).push(fr.pe)
  }
  for (const arr of peByIndustry.values()) arr.sort((a, b) => a - b)

  for (const { symbol, fr } of computed) {
    const ind = industryMap.get(symbol)
    const arr = ind ? peByIndustry.get(ind) : null
    // صدک فقط وقتی معنادار است که چند نماد سودده در صنعت باشند
    if (arr && arr.length >= 3 && fr.pe != null && fr.pe > 0) {
      fr.industry = ind
      fr.peIndustryMedian = median(arr)
      fr.pePercentile = percentileOf(arr, fr.pe)
      fr.peIndustryCount = arr.length
    } else if (ind) {
      fr.industry = ind
    }
  }

  // پاس ۳: upsert
  let ok = 0
  for (const { symbol, fr } of computed) {
    const { error: upErr } = await sb.from('stock_fundamentals')
      .upsert({ symbol, data: fr, updated: new Date().toISOString() }, { onConflict: 'symbol' })
    if (upErr) { console.log(`  ⚠️ ${symbol}: ${upErr.message}`); continue }
    ok++
  }
  console.log(`✅ ${ok} نماد محاسبه شد، ${skipped} رد شد (بدون گزارش سالانه)؛ صدک صنعتی برای ${peByIndustry.size} صنعت`)
}

main().catch(e => { console.error(e); process.exit(1) })
