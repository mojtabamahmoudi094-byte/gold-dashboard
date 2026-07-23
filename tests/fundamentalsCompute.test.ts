import { describe, it, expect } from 'vitest'
// نسخهٔ اسکریپت cron (CommonJS) — جدا از lib/fundamentalRatios.ts سایت
import { latestAnnual, computeFundamentals, percentileOf, median, div } from '../scripts/fundamentals-compute.js'
import { computeFundamentals as computeFundamentalsSite } from '../lib/fundamentalRatios'
import type { RQuarter } from '../lib/stockInsights'

const annual = {
  period: '1403/12/29', months: 12, audited: true,
  eps: 500, net: 3_000_000, revenue: 10_000_000, op: 4_000_000,
  assets: 20_000_000, liabilities: 8_000_000, equity: 12_000_000,
  capital: 6_000_000, debt_lt: 1_000_000, debt_st: 2_000_000, cash: 500_000,
}

describe('latestAnnual', () => {
  it('آخرین سالانه با net، نه فصلی و نه بدون سود', () => {
    const old = { ...annual, period: '1402/12/29' }
    const q9 = { ...annual, period: '1404/09/30', months: 9 }
    const noNet = { ...annual, period: '1404/12/29', net: null }
    expect(latestAnnual([old, annual, q9, noNet])!.period).toBe('1403/12/29')
    expect(latestAnnual([q9])).toBeNull()
    expect(latestAnnual(null)).toBeNull()
  })
})

describe('computeFundamentals (اسکریپت cron)', () => {
  it('همان اعداد مرجع دستی', () => {
    const fr = computeFundamentals([annual], 4000)!
    expect(fr.pe).toBeCloseTo(8, 10)
    expect(fr.bookValuePerShare).toBeCloseTo(2000, 10)
    expect(fr.pb).toBeCloseTo(2, 10)
    expect(fr.roe).toBeCloseTo(0.25, 10)
    expect(fr.marketCap).toBeCloseTo(24_000_000, 5)
    expect(fr.enterpriseValue).toBeCloseTo(26_500_000, 5)
  })

  it('گارد drift: خروجی اسکریپت cron با lib سایت روی ورودی یکسان یکی است', () => {
    // دو پیاده‌سازی موازی (scripts/fundamentals-compute.js و lib/fundamentalRatios.ts) —
    // اگر یکی تغییر کرد و دیگری نه، این تست می‌شکند و جلوی دوگانگی آمار سایت/cron را می‌گیرد.
    const price = 4000
    const a = computeFundamentals([annual], price)!
    const b = computeFundamentalsSite([annual as unknown as RQuarter], price)!
    const keys = ['period', 'pe', 'pb', 'roe', 'roa', 'netMargin', 'opMargin', 'assetTurnover',
      'equityMultiplier', 'debtToEquity', 'bookValuePerShare', 'marketCap', 'enterpriseValue', 'evToEbit'] as const
    for (const k of keys) {
      const av = a[k], bv = (b as Record<string, unknown>)[k]
      if (typeof av === 'number' && typeof bv === 'number') expect(av, k).toBeCloseTo(bv, 8)
      else expect(av, k).toBe(bv)
    }
  })

  it('بدون سالانه → null؛ price=null → نسبت‌های قیمتی null', () => {
    expect(computeFundamentals([{ ...annual, months: 6 }], 4000)).toBeNull()
    const fr = computeFundamentals([annual], null)!
    expect(fr.pe).toBeNull()
    expect(fr.roe).toBeCloseTo(0.25, 10)
  })
})

describe('percentileOf / median / div', () => {
  it('صدک روی آرایه مرتب', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(percentileOf(xs, 5)).toBe(50)
    expect(percentileOf(xs, 10)).toBe(100)
    expect(percentileOf(xs, 0.5)).toBe(0)
    expect(percentileOf([], 5)).toBeNull()
  })
  it('میانه زوج/فرد/خالی', () => {
    expect(median([1, 2, 3])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
  })
  it('div: تقسیم امن', () => {
    expect(div(10, 4)).toBe(2.5)
    expect(div(10, 0)).toBeNull()
    expect(div(null, 4)).toBeNull()
  })
})
