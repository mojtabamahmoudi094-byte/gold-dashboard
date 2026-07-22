import { describe, it, expect } from 'vitest'
import { computeFundamentals } from '../lib/fundamentalRatios'
import type { RQuarter } from '../lib/stockInsights'

// یک گزارش سالانهٔ ساختگی با اعداد گرد برای راستی‌آزمایی دستی فرمول‌ها
// واحدها: مبالغ میلیون ریال، capital هزار سهم، قیمت ریال
const annual: RQuarter = {
  period: '1403/12/29', months: 12, audited: true,
  eps: 500, net: 3_000_000, revenue: 10_000_000, op: 4_000_000,
  assets: 20_000_000, liabilities: 8_000_000, equity: 12_000_000,
  capital: 6_000_000, debt_lt: 1_000_000, debt_st: 2_000_000, cash: 500_000,
} as RQuarter

describe('computeFundamentals', () => {
  it('فرمول‌های اصلی با مقادیر مرجع دستی', () => {
    const price = 4000 // ریال
    const fr = computeFundamentals([annual], price)!
    expect(fr).not.toBeNull()
    expect(fr.pe).toBeCloseTo(4000 / 500, 10)                       // ۸
    // bookValue/share = equity(م.ریال)×1e6 / (capital×1000 سهم) = 12e6×1e6 / 6e9 = 2000 ریال
    expect(fr.bookValuePerShare).toBeCloseTo(2000, 10)
    expect(fr.pb).toBeCloseTo(2, 10)
    expect(fr.roe).toBeCloseTo(3_000_000 / 12_000_000, 10)          // ۰.۲۵
    expect(fr.roa).toBeCloseTo(0.15, 10)
    expect(fr.netMargin).toBeCloseTo(0.3, 10)
    expect(fr.opMargin).toBeCloseTo(0.4, 10)
    expect(fr.assetTurnover).toBeCloseTo(0.5, 10)
    expect(fr.equityMultiplier).toBeCloseTo(20 / 12, 10)
    expect(fr.debtToEquity).toBeCloseTo(8 / 12, 10)
    // marketCap = price×capital/1000 = 4000×6e6/1000 = 24e6 م.ریال
    expect(fr.marketCap).toBeCloseTo(24_000_000, 5)
    // EV = 24e6 + (1e6+2e6-0.5e6) = 26.5e6
    expect(fr.enterpriseValue).toBeCloseTo(26_500_000, 5)
    expect(fr.evToEbit).toBeCloseTo(26_500_000 / 4_000_000, 10)
  })

  it('آخرین سالانه انتخاب می‌شود نه فصلی و نه سالانهٔ قدیمی', () => {
    const old = { ...annual, period: '1402/12/29', eps: 100 }
    const q3 = { ...annual, period: '1404/09/30', months: 9 }
    const fr = computeFundamentals([old, annual, q3], 4000)!
    expect(fr.period).toBe('1403/12/29')
    expect(fr.pe).toBeCloseTo(8, 10)
  })

  it('بدون گزارش سالانه (فقط فصلی) → null', () => {
    const q = { ...annual, months: 3 }
    expect(computeFundamentals([q], 4000)).toBeNull()
  })

  it('price=null → نسبت‌های قیمتی null ولی سودآوری محاسبه می‌شود', () => {
    const fr = computeFundamentals([annual], null)!
    expect(fr.pe).toBeNull()
    expect(fr.pb).toBeNull()
    expect(fr.marketCap).toBeNull()
    expect(fr.roe).toBeCloseTo(0.25, 10)
  })

  it('equity صفر → تقسیم امن، null نه Infinity', () => {
    const z = { ...annual, equity: 0 }
    const fr = computeFundamentals([z], 4000)!
    expect(fr.roe).toBeNull()
    expect(fr.equityMultiplier).toBeNull()
    expect(fr.debtToEquity).toBeNull()
  })
})
