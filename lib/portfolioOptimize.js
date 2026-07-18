'use strict'

/**
 * بهینه‌سازی min-variance پرتفوی (سهام) — معادل ساده‌شده‌ی PyPortfolioOpt، بدون وابستگی خارجی
 * چون کل استک این ریپو Node/TS است. فقط نمادهای سهم را پوشش می‌دهد چون stock_candles فقط سهام دارد.
 */

const { computeHoldings, fetchPriceMap, safe } = require('./portfolioValuation')

async function fetchDailyCloses(sb, symbols, lookbackDays = 150) {
  const map = new Map()
  if (symbols.length === 0) return map
  const since = new Date(Date.now() - lookbackDays * 2 * 24 * 60 * 60 * 1000) // بازه تقویمی ۲برابر برای جبران تعطیلات
  const sinceISO = since.toISOString().slice(0, 10)
  const { data, error } = await sb
    .from('stock_candles')
    .select('symbol, trade_date, close, adj_close')
    .in('symbol', symbols)
    .gte('trade_date', sinceISO)
    .order('trade_date', { ascending: true })
  if (error) { console.error('[portfolioOptimize] fetchDailyCloses failed:', error.message); return map }
  for (const row of data ?? []) {
    let m = map.get(row.symbol)
    if (!m) { m = new Map(); map.set(row.symbol, m) }
    // adj_close (تعدیل‌شده برای افزایش سرمایه/سود سهام) اولویت دارد — close خام باعث جهش کاذب بازده می‌شود
    m.set(row.trade_date, safe(row.adj_close != null ? row.adj_close : row.close))
  }
  return map
}

function alignReturns(closesMap, symbols, minPoints = 40) {
  const excluded = []
  const usable = []
  for (const s of symbols) {
    const m = closesMap.get(s)
    if (m && m.size >= minPoints + 1) usable.push(s)
    else excluded.push(s)
  }
  if (usable.length < 2) return { symbols: usable, returns: [], excluded: symbols.filter((s) => !usable.includes(s)) }

  // تاریخ‌های مشترک بین همه نمادهای usable
  let commonDates = [...closesMap.get(usable[0]).keys()]
  for (const s of usable.slice(1)) {
    const dates = closesMap.get(s)
    commonDates = commonDates.filter((d) => dates.has(d))
  }
  commonDates.sort()

  if (commonDates.length < minPoints + 1) {
    return { symbols: [], returns: [], excluded: symbols }
  }

  const returns = []
  for (let i = 1; i < commonDates.length; i++) {
    const prevDate = commonDates[i - 1]
    const curDate = commonDates[i]
    const row = usable.map((s) => {
      const p0 = closesMap.get(s).get(prevDate)
      const p1 = closesMap.get(s).get(curDate)
      return p0 > 0 ? (p1 - p0) / p0 : 0
    })
    returns.push(row)
  }

  return { symbols: usable, returns, excluded }
}

function covarianceMatrix(returns) {
  const n = returns.length // تعداد روز
  const m = returns[0].length // تعداد نماد
  const means = new Array(m).fill(0)
  for (const row of returns) for (let j = 0; j < m; j++) means[j] += row[j] / n

  const cov = Array.from({ length: m }, () => new Array(m).fill(0))
  for (const row of returns) {
    for (let i = 0; i < m; i++) {
      const di = row[i] - means[i]
      for (let j = 0; j < m; j++) {
        cov[i][j] += (di * (row[j] - means[j])) / (n - 1)
      }
    }
  }
  return cov
}

// معکوس ماتریس با حذف گاوسی + pivoting جزئی
function invertMatrix(mat) {
  const n = mat.length
  const A = mat.map((row) => [...row])
  const I = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row
    }
    if (Math.abs(A[pivot][col]) < 1e-12) return null // تکین — قابل معکوس‌سازی نیست
    if (pivot !== col) { [A[col], A[pivot]] = [A[pivot], A[col]];[I[col], I[pivot]] = [I[pivot], I[col]] }

    const div = A[col][col]
    for (let j = 0; j < n; j++) { A[col][j] /= div; I[col][j] /= div }

    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = A[row][col]
      if (factor === 0) continue
      for (let j = 0; j < n; j++) { A[row][j] -= factor * A[col][j]; I[row][j] -= factor * I[col][j] }
    }
  }
  return I
}

// w = Σ⁻¹·1 / (1ᵀ·Σ⁻¹·1) — سپس کلیپ منفی‌ها به صفر و renormalize
function minVarianceWeights(cov) {
  const n = cov.length
  const inv = invertMatrix(cov)
  if (!inv) return null

  const rowSums = inv.map((row) => row.reduce((a, b) => a + b, 0))
  const total = rowSums.reduce((a, b) => a + b, 0)
  if (!Number.isFinite(total) || total === 0) return null

  let weights = rowSums.map((s) => s / total)
  if (weights.some((w) => w < 0)) {
    weights = weights.map((w) => Math.max(0, w))
    const sum = weights.reduce((a, b) => a + b, 0)
    if (sum <= 0) return null
    weights = weights.map((w) => w / sum)
  }
  return weights
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb کلاینت service-role
 * @param {string} userId
 * @param {string} siteUrl برای قیمت زنده (وزن فعلی)
 */
async function computePortfolioOptimization(sb, userId, siteUrl) {
  const { data: txs, error } = await sb
    .from('portfolio_transactions')
    .select('symbol, name, asset_type, side, quantity, price, commission')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)

  const stockHoldings = computeHoldings(txs ?? [])
    .filter((h) => h.assetType === 'stock' && h.qty > 0)

  if (stockHoldings.length < 2) {
    return { error: 'insufficient_symbols', eligibleCount: stockHoldings.length }
  }

  const symbols = stockHoldings.map((h) => h.symbol)
  const [closesMap, priceMap] = await Promise.all([
    fetchDailyCloses(sb, symbols),
    fetchPriceMap(siteUrl),
  ])

  const { symbols: usedSymbols, returns, excluded } = alignReturns(closesMap, symbols)
  if (usedSymbols.length < 2) {
    return { error: 'insufficient_history', excludedSymbols: excluded }
  }

  const cov = covarianceMatrix(returns)
  const weights = minVarianceWeights(cov)
  if (!weights) {
    return { error: 'singular_matrix', excludedSymbols: excluded }
  }

  const usedHoldings = stockHoldings.filter((h) => usedSymbols.includes(h.symbol))
  let totalValue = 0
  const values = usedHoldings.map((h) => {
    const px = priceMap.get(h.symbol) || 0
    const value = h.qty * px
    totalValue += value
    return value
  })

  const rows = usedSymbols.map((symbol, i) => {
    const h = usedHoldings.find((x) => x.symbol === symbol)
    const currentValue = values[i]
    const currentWeight = totalValue > 0 ? currentValue / totalValue : 0
    const suggestedWeight = weights[i]
    const suggestedValue = totalValue * suggestedWeight
    return {
      symbol,
      name: h.name,
      currentWeight,
      suggestedWeight,
      currentValue,
      suggestedValue,
      diffValue: suggestedValue - currentValue,
    }
  })
  rows.sort((a, b) => b.suggestedWeight - a.suggestedWeight)

  return { rows, excludedSymbols: excluded, totalValue }
}

module.exports = {
  fetchDailyCloses,
  alignReturns,
  covarianceMatrix,
  invertMatrix,
  minVarianceWeights,
  computePortfolioOptimization,
}
