import { describe, it, expect } from 'vitest'
import { findTradingGaps, detectDilutionEvents, applyDilution, type CandleGap, type QuarterCapital } from '../lib/dilutionAdjust'

const row = (g: string, sh: string, close: number) => ({ trade_date: g, trade_date_shamsi: sh, close })

describe('findTradingGaps', () => {
  it('توقف ≥۲۰ روز شکاف است، تعطیلی عادی نه', () => {
    const rows = [
      row('2026-01-01', '1404/10/11', 1000),
      row('2026-01-05', '1404/10/15', 1010), // ۴ روز — عادی
      row('2026-02-10', '1404/11/21', 500),  // ۳۶ روز — توقف مجمع
      row('2026-02-11', '1404/11/22', 505),
    ]
    const gaps = findTradingGaps(rows)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toEqual({
      beforeDateShamsi: '1404/10/15', afterDateShamsi: '1404/11/21',
      beforeClose: 1010, afterClose: 500,
    })
  })
  it('بدون توقف → خالی', () => {
    const rows = [row('2026-01-01', '1404/10/11', 100), row('2026-01-02', '1404/10/12', 101)]
    expect(findTradingGaps(rows)).toEqual([])
  })
  it('آرایه خالی/تک‌عضوی', () => {
    expect(findTradingGaps([])).toEqual([])
    expect(findTradingGaps([row('2026-01-01', '1404/10/11', 100)])).toEqual([])
  })
})

describe('detectDilutionEvents', () => {
  const gap: CandleGap = {
    beforeDateShamsi: '1404/05/01', afterDateShamsi: '1404/06/15',
    beforeClose: 9000, afterClose: 3000,
  }
  it('جهش سرمایه واقعی (۳ برابر) → factor=1/3 روی تاریخ شکاف', () => {
    const quarters: QuarterCapital[] = [
      { period: '1404/03/31', capital: 6_000_000 },
      { period: '1404/06/31', capital: 18_000_000 },
    ]
    const ev = detectDilutionEvents([gap], quarters)
    expect(ev).toHaveLength(1)
    expect(ev[0].atDateShamsi).toBe('1404/06/15')
    expect(ev[0].factor).toBeCloseTo(1 / 3, 10)
  })
  it('سرمایه ثابت (توقف بدون افزایش سرمایه) → بدون رویداد', () => {
    const quarters: QuarterCapital[] = [
      { period: '1404/03/31', capital: 6_000_000 },
      { period: '1404/06/31', capital: 6_000_000 },
    ]
    expect(detectDilutionEvents([gap], quarters)).toEqual([])
  })
  it('جهش زیر ۲٪ (گردکردن گزارش) → بدون رویداد', () => {
    const quarters: QuarterCapital[] = [
      { period: '1404/03/31', capital: 6_000_000 },
      { period: '1404/06/31', capital: 6_060_000 }, // +۱٪
    ]
    expect(detectDilutionEvents([gap], quarters)).toEqual([])
  })
  it('گزارش جدید هنوز منتشر نشده (فقط قبل موجود) → بدون حدس، بدون رویداد', () => {
    const quarters: QuarterCapital[] = [{ period: '1404/03/31', capital: 6_000_000 }]
    expect(detectDilutionEvents([gap], quarters)).toEqual([])
  })
  it('capital null نادیده گرفته می‌شود', () => {
    const quarters: QuarterCapital[] = [
      { period: '1404/03/31', capital: null },
      { period: '1404/06/31', capital: 18_000_000 },
    ]
    expect(detectDilutionEvents([gap], quarters)).toEqual([])
  })
})

describe('applyDilution', () => {
  const events = [
    { atDateShamsi: '1404/06/15', factor: 0.5 },
    { atDateShamsi: '1404/09/10', factor: 0.8 },
  ]
  it('قبل از هر دو رویداد → هر دو ضریب (تجمعی)', () => {
    expect(applyDilution('1404/05/01', 1000, events)).toBeCloseTo(1000 * 0.5 * 0.8, 10)
  })
  it('بین دو رویداد → فقط ضریب دوم', () => {
    expect(applyDilution('1404/07/01', 1000, events)).toBeCloseTo(800, 10)
  })
  it('بعد از هر دو → بدون تغییر', () => {
    expect(applyDilution('1404/10/01', 1000, events)).toBe(1000)
  })
  it('دقیقاً روی تاریخ رویداد → تعدیل نمی‌شود (قیمت جدید است)', () => {
    expect(applyDilution('1404/06/15', 1000, [events[0]])).toBe(1000)
  })
  it('بدون رویداد → قیمت خام', () => {
    expect(applyDilution('1404/05/01', 1234, [])).toBe(1234)
  })
})
