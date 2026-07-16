'use strict'

/**
 * محاسبه‌ی سرور-ساید ارزش پورتفو — استخراج‌شده از منطق useMemo(holdings)/useMemo(totals) در
 * app/portfolio/page.tsx تا هم scripts/snapshot-portfolio.js هم بات تلگرام از یک منبع استفاده کنند.
 * CommonJS چون هم از اسکریپت‌های node ساده و هم (در آینده) از route‌های Next import می‌شود.
 */

const safe = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// قیمت روز همه‌ی نمادها (سهام + صندوق + فیزیکی) — همان سه منبعی که app/portfolio/page.tsx در مرورگر می‌خواند
async function fetchPriceMap(siteUrl) {
  const SITE = siteUrl.replace(/\/$/, '')
  const map = new Map()
  try {
    const res = await fetch(`${SITE}/api/stocks-industries`)
    const data = await res.json()
    for (const ind of data.industries ?? []) {
      for (const s of ind.symbols ?? []) map.set(s.l18, safe(s.pl))
    }
  } catch (e) { console.error('[portfolioValuation] stocks-industries fetch failed:', e.message) }
  try {
    const res = await fetch(`${SITE}/api/funds`)
    const data = await res.json()
    const byId = new Map()
    for (const r of data.records ?? []) byId.set(r.asset_id, r)
    for (const a of data.assets ?? []) {
      const r = byId.get(a.id)
      if (r) map.set(a.slug, safe(r.price_close))
    }
  } catch (e) { console.error('[portfolioValuation] funds fetch failed:', e.message) }
  try {
    const res = await fetch(`${SITE}/api/physical-prices`)
    const data = await res.json()
    for (const [k, v] of Object.entries(data.prices ?? {})) map.set(k, safe(v))
  } catch (e) { console.error('[portfolioValuation] physical-prices fetch failed:', e.message) }
  return map
}

// دیتای بازار هر سهم (قیمت آخرین/پایانی + درصد + حجم) — همان stock_industries که fetchPriceMap هم می‌خواند،
// اینجا فیلدهای بیشتری از همان پاسخ نگه می‌داریم (برای گزارش‌های تکمیلی مثل بات تلگرام)
async function fetchStockMarketData(siteUrl) {
  const SITE = siteUrl.replace(/\/$/, '')
  const map = new Map()
  try {
    const res = await fetch(`${SITE}/api/stocks-industries`)
    const data = await res.json()
    for (const ind of data.industries ?? []) {
      for (const s of ind.symbols ?? []) {
        map.set(s.l18, { pl: safe(s.pl), plp: safe(s.plp), pc: safe(s.pc), pcp: safe(s.pcp), tvol: safe(s.tvol) })
      }
    }
  } catch (e) { console.error('[portfolioValuation] fetchStockMarketData failed:', e.message) }
  return map
}

// دیتای بازار هر صندوق (طلا/نقره) — از gold_funds (از راه /api/funds) که ستون‌های خرید/فروش حقیقی
// را مستقیم دارد؛ برخلاف سهام نیازی به جدول جداگانه‌ی سرانه نیست، همین‌جا محاسبه می‌شود
// (همان فرمول lib/vipFiltersShared.tsx: سرانه = (حجم × قیمت) / تعداد، قدرت خرید = سرانه خرید ÷ سرانه فروش)
async function fetchFundMarketData(siteUrl) {
  const SITE = siteUrl.replace(/\/$/, '')
  const map = new Map()
  try {
    const res = await fetch(`${SITE}/api/funds`)
    const data = await res.json()
    const byId = new Map()
    for (const r of data.records ?? []) byId.set(r.asset_id, r)
    for (const a of data.assets ?? []) {
      const r = byId.get(a.id)
      if (!r) continue
      const pc = safe(r.price_close)
      const bI = safe(r.buy_i_volume), bCI = safe(r.buy_count_i)
      const sI = safe(r.sell_i_volume), sCI = safe(r.sell_count_i)
      map.set(a.slug, {
        priceLast: safe(r.price_last),
        priceClose: pc,
        priceChangePct: safe(r.price_change_pct),
        volume: safe(r.volume),
        perCapitaBuy: bCI > 0 ? (bI * pc) / bCI : null,
        perCapitaSell: sCI > 0 ? (sI * pc) / sCI : null,
      })
    }
  } catch (e) { console.error('[portfolioValuation] fetchFundMarketData failed:', e.message) }
  return map
}

// میانگین موزون هلدینگ‌ها — همان منطق useMemo(holdings) در app/portfolio/page.tsx
function computeHoldings(txs) {
  const map = new Map()
  for (const tx of txs) {
    let h = map.get(tx.symbol)
    if (!h) { h = { symbol: tx.symbol, name: tx.name || tx.symbol, assetType: tx.asset_type || 'stock', qty: 0, totalCost: 0 }; map.set(tx.symbol, h) }
    const q = safe(tx.quantity)
    if (tx.side === 'buy') {
      h.totalCost += q * safe(tx.price) + safe(tx.commission)
      h.qty += q
    } else {
      const avg = h.qty > 0 ? h.totalCost / h.qty : 0
      const sellQty = Math.min(q, h.qty)
      h.totalCost -= avg * sellQty
      h.qty -= sellQty
    }
  }
  return [...map.values()]
}

/**
 * خلاصه‌ی پورتفوی یک کاربر — برای بات تلگرام و اسنپ‌شات روزانه.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb کلاینت service-role
 * @param {string} userId
 * @param {string} siteUrl پایه‌ی API قیمت زنده (SITE_URL)
 * @returns {Promise<{totalValue:number, investedCapital:number, pnl:number, pnlPct:number, priced:boolean, holdings:Array}>}
 */
async function computePortfolioSummary(sb, userId, siteUrl) {
  const [priceMap, txsRes] = await Promise.all([
    fetchPriceMap(siteUrl),
    sb.from('portfolio_transactions')
      .select('symbol, name, asset_type, side, quantity, price, commission')
      .eq('user_id', userId),
  ])
  if (txsRes.error) throw new Error(txsRes.error.message)

  const holdings = computeHoldings(txsRes.data ?? []).filter(h => h.qty > 0)
  let totalValue = 0, investedCapital = 0, priced = true
  const rows = []
  for (const h of holdings) {
    investedCapital += h.totalCost
    const px = priceMap.get(h.symbol)
    const hasPrice = px != null && px > 0
    if (!hasPrice) priced = false
    const value = hasPrice ? h.qty * px : null
    if (value != null) totalValue += value
    rows.push({
      symbol: h.symbol,
      name: h.name,
      assetType: h.assetType,
      qty: h.qty,
      avgCost: h.qty > 0 ? h.totalCost / h.qty : 0,
      price: hasPrice ? px : null,
      value,
      pnl: value != null ? value - h.totalCost : null,
      pnlPct: value != null && h.totalCost > 0 ? ((value - h.totalCost) / h.totalCost) * 100 : null,
    })
  }

  const pnl = totalValue - investedCapital
  const pnlPct = investedCapital > 0 ? (pnl / investedCapital) * 100 : 0

  return { totalValue, investedCapital, pnl, pnlPct, priced, holdings: rows }
}

module.exports = { computePortfolioSummary, computeHoldings, fetchPriceMap, fetchStockMarketData, fetchFundMarketData, safe }
