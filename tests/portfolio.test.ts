import { describe, it, expect } from 'vitest'
// این دو ماژول CommonJS اند — vitest مستقیم require-interop می‌کند
import { computeHoldings } from '../lib/portfolioValuation.js'
import { alignReturns, covarianceMatrix, invertMatrix, minVarianceWeights } from '../lib/portfolioOptimize.js'

const buy = (symbol: string, quantity: number, price: number, commission = 0) =>
  ({ symbol, side: 'buy', quantity, price, commission })
const sell = (symbol: string, quantity: number, price: number) =>
  ({ symbol, side: 'sell', quantity, price, commission: 0 })

describe('computeHoldings', () => {
  it('میانگین خرید موزون + کارمزد', () => {
    const h = computeHoldings([buy('فولاد', 100, 1000, 500), buy('فولاد', 100, 2000, 500)])
    expect(h).toHaveLength(1)
    expect(h[0].qty).toBe(200)
    expect(h[0].totalCost).toBe(100 * 1000 + 100 * 2000 + 1000) // شامل کارمزدها
  })
  it('فروش جزئی با میانگین (نه FIFO): بهای تمام‌شده نسبتی کم می‌شود', () => {
    const h = computeHoldings([buy('فولاد', 100, 1000), sell('فولاد', 40, 1500)])
    expect(h[0].qty).toBe(60)
    expect(h[0].totalCost).toBeCloseTo(60 * 1000, 6) // avg=1000
  })
  it('فروش بیش از موجودی → کلیپ به موجودی، منفی نمی‌شود', () => {
    const h = computeHoldings([buy('فولاد', 50, 1000), sell('فولاد', 80, 1200)])
    expect(h[0].qty).toBe(0)
    expect(h[0].totalCost).toBeCloseTo(0, 6)
  })
  it('چند نماد جدا', () => {
    const h = computeHoldings([buy('فولاد', 10, 100), buy('شستا', 20, 50)])
    expect(h).toHaveLength(2)
  })
})

describe('invertMatrix', () => {
  it('معکوس ۲×۲ شناخته‌شده', () => {
    const inv = invertMatrix([[4, 7], [2, 6]])!
    // معکوس = 1/10 × [[6,-7],[-2,4]]
    expect(inv[0][0]).toBeCloseTo(0.6, 10)
    expect(inv[0][1]).toBeCloseTo(-0.7, 10)
    expect(inv[1][0]).toBeCloseTo(-0.2, 10)
    expect(inv[1][1]).toBeCloseTo(0.4, 10)
  })
  it('ماتریس تکین → null', () => {
    expect(invertMatrix([[1, 2], [2, 4]])).toBeNull()
  })
})

describe('covarianceMatrix', () => {
  it('واریانس نمونه‌ای (n-1) و تقارن', () => {
    const returns = [[0.01, 0.02], [0.03, -0.01], [-0.02, 0.04]]
    const cov = covarianceMatrix(returns)
    expect(cov[0][1]).toBeCloseTo(cov[1][0], 12) // متقارن
    // واریانس ستون اول: mean=0.006667، sample var
    const xs = [0.01, 0.03, -0.02]
    const m = xs.reduce((a, b) => a + b, 0) / 3
    const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / 2
    expect(cov[0][0]).toBeCloseTo(v, 12)
  })
})

describe('minVarianceWeights', () => {
  it('جمع وزن‌ها ۱ و بدون وزن منفی', () => {
    const cov = [
      [0.04, 0.01, 0.0],
      [0.01, 0.09, 0.02],
      [0.0, 0.02, 0.16],
    ]
    const w = minVarianceWeights(cov)!
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    for (const x of w) expect(x).toBeGreaterThanOrEqual(0)
    // کم‌نوسان‌ترین (واریانس 0.04) باید بیشترین وزن را بگیرد
    expect(w[0]).toBeGreaterThan(w[1])
    expect(w[1]).toBeGreaterThan(w[2])
  })
  it('کوواریانس تکین → null (نه کرش)', () => {
    expect(minVarianceWeights([[0.01, 0.01], [0.01, 0.01]])).toBeNull()
  })
})

describe('alignReturns', () => {
  const mk = (pairs: [string, number][]) => new Map(pairs.map(([d, p]) => [d, p]))
  it('نماد با تاریخچه ناکافی حذف می‌شود', () => {
    const closes = new Map([
      ['الف', mk(Array.from({ length: 50 }, (_, i) => [`d${String(i).padStart(3, '0')}`, 100 + i]))],
      ['ب', mk([['d000', 10], ['d001', 11]])], // فقط ۲ روز
    ])
    const r = alignReturns(closes, ['الف', 'ب'], 40)
    expect(r.excluded).toContain('ب')
    // فقط ۱ نماد usable ماند → کمتر از ۲ → بهینه‌سازی ممکن نیست
    expect(r.returns).toEqual([])
  })
  it('بازده روزانه از تاریخ‌های مشترک', () => {
    const a = mk(Array.from({ length: 45 }, (_, i) => [`d${String(i).padStart(3, '0')}`, 100 * (1.01 ** i)]))
    const b = mk(Array.from({ length: 45 }, (_, i) => [`d${String(i).padStart(3, '0')}`, 200]))
    const r = alignReturns(new Map([['الف', a], ['ب', b]]), ['الف', 'ب'], 40)
    expect(r.symbols).toEqual(['الف', 'ب'])
    expect(r.returns).toHaveLength(44)
    expect(r.returns[0][0]).toBeCloseTo(0.01, 10) // بازده ثابت ۱٪
    expect(r.returns[0][1]).toBe(0)               // قیمت ثابت
  })
})
