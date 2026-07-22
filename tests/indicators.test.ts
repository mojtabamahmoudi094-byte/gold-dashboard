import { describe, it, expect } from 'vitest'
import { sma, ema, rsi, macd, bollinger } from '../lib/indicators'

describe('sma', () => {
  it('میانگین ساده با مقادیر مرجع', () => {
    const out = sma([1, 2, 3, 4, 5], 3)
    expect(out).toEqual([null, null, 2, 3, 4])
  })
  it('آرایه کوتاه‌تر از period → همه null', () => {
    expect(sma([1, 2], 5)).toEqual([null, null])
  })
  it('آرایه خالی', () => {
    expect(sma([], 3)).toEqual([])
  })
  it('period=1 → خود مقادیر', () => {
    expect(sma([7, 8, 9], 1)).toEqual([7, 8, 9])
  })
})

describe('ema', () => {
  it('نقطه شروع = SMA دوره اول', () => {
    const out = ema([2, 4, 6, 8], 3)
    expect(out[0]).toBeNull()
    expect(out[1]).toBeNull()
    expect(out[2]).toBe(4) // (2+4+6)/3
    // k=2/(3+1)=0.5 → 8*0.5 + 4*0.5 = 6
    expect(out[3]).toBe(6)
  })
  it('کوتاه‌تر از period → همه null', () => {
    expect(ema([1, 2], 3)).toEqual([null, null])
  })
})

describe('rsi', () => {
  it('صعود یکنواخت → RSI=100 (بدون زیان)', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    const out = rsi(closes)
    expect(out[14]).toBe(100)
    expect(out[19]).toBe(100)
  })
  it('نزول یکنواخت → RSI=0', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i)
    const out = rsi(closes)
    expect(out[19]).toBeCloseTo(0, 5)
  })
  it('سری ثابت → بدون سود و زیان → RSI=100 طبق پیاده‌سازی (avgLoss=0)', () => {
    const out = rsi(new Array(20).fill(50))
    expect(out[19]).toBe(100)
  })
  it('کوتاه‌تر یا مساوی period → همه null', () => {
    expect(rsi([1, 2, 3], 14).every(v => v === null)).toBe(true)
  })
  it('مقدار مرجع وایلدر — سری متناوب', () => {
    // نصف روزها +2 نصف -1 → RSI باید بین ۵۰ و ۱۰۰ باشد
    const closes: number[] = [100]
    for (let i = 0; i < 19; i++) closes.push(closes[closes.length - 1] + (i % 2 === 0 ? 2 : -1))
    const v = rsi(closes)[19]
    expect(v).not.toBeNull()
    expect(v as number).toBeGreaterThan(50)
    expect(v as number).toBeLessThan(100)
  })
})

describe('macd', () => {
  it('هم‌طول ورودی و ساختار درست', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10)
    const out = macd(closes)
    expect(out).toHaveLength(60)
    // قبل از slow-1 همه null
    expect(out[24].macd).toBeNull()
    expect(out[25].macd).not.toBeNull()
    // hist = macd - signal هرجا هر دو موجودند
    const p = out[59]
    expect(p.hist).toBeCloseTo((p.macd as number) - (p.signal as number), 10)
  })
  it('سری ثابت → macd صفر', () => {
    const out = macd(new Array(60).fill(100))
    expect(out[59].macd).toBeCloseTo(0, 10)
    expect(out[59].hist).toBeCloseTo(0, 10)
  })
})

describe('bollinger', () => {
  it('سری ثابت → باندها روی هم (sd=0)', () => {
    const out = bollinger(new Array(25).fill(100))
    const p = out[24]
    expect(p.middle).toBe(100)
    expect(p.upper).toBe(100)
    expect(p.lower).toBe(100)
  })
  it('باند بالا/پایین متقارن حول میانه', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 5))
    const p = bollinger(closes)[29]
    expect((p.upper as number) - (p.middle as number)).toBeCloseTo((p.middle as number) - (p.lower as number), 10)
    expect(p.upper as number).toBeGreaterThan(p.lower as number)
  })
})
