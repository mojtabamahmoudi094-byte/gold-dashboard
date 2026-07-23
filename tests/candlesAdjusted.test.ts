import { describe, it, expect } from 'vitest'
// CommonJS — vitest خودش interop می‌کند
import { parseHistory, parseSharesBlob, computeMethodCoefs } from '../scripts/candles-adjusted.js'

// ترتیب فیلدهای InstTradeHistory: date@high@low@close@last@first@yesterday@value@volume@count
const row = (date: string, o: {
  high?: number; low?: number; close?: number; last?: number; first?: number
  yesterday?: number; value?: number; volume?: number; count?: number
} = {}) => [
  date, o.high ?? 1100, o.low ?? 900, o.close ?? 1000, o.last ?? 1000,
  o.first ?? 950, o.yesterday ?? 990, o.value ?? 5e9, o.volume ?? 1e6, o.count ?? 200,
].join('@')

describe('parseHistory', () => {
  it('ترتیب فیلدها: open=first، close=close، yesterday جدا', () => {
    const rows = parseHistory(row('20240115', { first: 950, close: 1000, high: 1100, low: 900, yesterday: 990 }))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      trade_date: '2024-01-15', open: 950, high: 1100, low: 900, close: 1000, yesterday: 990,
    })
  })
  it('روز بدون معامله (volume=0) حذف می‌شود', () => {
    const rows = parseHistory([row('20240115'), row('20240116', { volume: 0 })].join(';'))
    expect(rows).toHaveLength(1)
  })
  it('ردیف ناقص/تاریخ خراب حذف؛ ورودی null کرش نمی‌کند', () => {
    expect(parseHistory('خراب@فقط@سه')).toEqual([])
    expect(parseHistory('abc' + row('99', {}).slice(8))).toEqual([])
    expect(parseHistory(null)).toEqual([])
  })
})

describe('parseSharesBlob', () => {
  it('idn,insCode,deven,newShares,oldShares', () => {
    const rows = parseSharesBlob('7,123456,20240115,2000000,1000000;8,123456,20240301,4000000,2000000')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ idn: 7, insCode: '123456', deven: '20240115', newShares: 2000000, oldShares: 1000000 })
  })
  it('ردیف ناقص حذف، ورودی خالی/null امن', () => {
    expect(parseSharesBlob('1,2,3')).toEqual([])
    expect(parseSharesBlob(null)).toEqual([])
  })
})

describe('computeMethodCoefs', () => {
  const mk = (trade_date: string, close: number, yesterday: number) => ({ trade_date, close, yesterday })

  it('بدون شکاف: همهٔ ضرایب ۱ و افست ۰', () => {
    const rows = [mk('2024-01-01', 1000, 990), mk('2024-01-02', 1010, 1000), mk('2024-01-03', 1005, 1010)]
    const out = computeMethodCoefs(rows, new Map())
    for (const c of out) {
      expect(c.coef_capital).toBe(1)
      expect(c.coef_dividend).toBe(1)
      expect(c.offset_combined).toBe(0)
    }
  })

  it('افزایش سرمایه (رکورد سهام موجود): فقط coef_capital', () => {
    // close=1000 → فردا yesterday=500 (دوبرابر شدن سهام)
    const rows = [mk('2024-01-01', 1000, 990), mk('2024-01-02', 510, 500)]
    const shares = new Map([['20240102', { oldShares: 1_000_000, newShares: 2_000_000 }]])
    const out = computeMethodCoefs(rows, shares)
    expect(out[1]).toEqual({ trade_date: '2024-01-02', coef_capital: 1, coef_dividend: 1, offset_combined: 0 })
    expect(out[0].coef_capital).toBeCloseTo(0.5, 12)   // old/new
    expect(out[0].coef_dividend).toBe(1)               // سود نقدی نبوده
    expect(out[0].offset_combined).toBeCloseTo(500, 10) // 1000-500
  })

  it('سود نقدی (بدون رکورد سهام): فقط coef_dividend', () => {
    // close=1000 → فردا yesterday=900 (تقسیم سود ۱۰۰)
    const rows = [mk('2024-01-01', 1000, 990), mk('2024-01-02', 910, 900)]
    const out = computeMethodCoefs(rows, new Map())
    expect(out[0].coef_capital).toBe(1)
    expect(out[0].coef_dividend).toBeCloseTo(0.9, 12) // yesterday/close
    expect(out[0].offset_combined).toBeCloseTo(100, 10)
  })

  it('دو رویداد پشت‌سرهم: ضرایب تجمعی، افست جمعی', () => {
    const rows = [
      mk('2024-01-01', 1000, 990),  // بعدش سود نقدی 100
      mk('2024-01-02', 910, 900),   // بعدش افزایش سرمایه نصف‌کننده
      mk('2024-01-03', 460, 455),
    ]
    const shares = new Map([['20240103', { oldShares: 1, newShares: 2 }]])
    const out = computeMethodCoefs(rows, shares)
    // روز آخر مرجع
    expect(out[2].coef_capital).toBe(1)
    // روز وسط: فقط رویداد افزایش سرمایه بعدش
    expect(out[1].coef_capital).toBeCloseTo(0.5, 12)
    expect(out[1].coef_dividend).toBe(1)
    expect(out[1].offset_combined).toBeCloseTo(910 - 455, 10)
    // روز اول: هر دو رویداد
    expect(out[0].coef_capital).toBeCloseTo(0.5, 12)
    expect(out[0].coef_dividend).toBeCloseTo(0.9, 12)
    expect(out[0].offset_combined).toBeCloseTo((910 - 455) + (1000 - 900), 10)
  })

  it('آرایه خالی و تک‌روزه', () => {
    expect(computeMethodCoefs([], new Map())).toEqual([])
    const one = computeMethodCoefs([mk('2024-01-01', 1000, 990)], new Map())
    expect(one[0]).toEqual({ trade_date: '2024-01-01', coef_capital: 1, coef_dividend: 1, offset_combined: 0 })
  })
})
