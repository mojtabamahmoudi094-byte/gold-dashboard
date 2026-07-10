// اندیکاتورهای سفارشی KLineChart — فرمول‌ها مطابق کتابخانه bukosabino/ta (MIT)
// ایچیموکو، سوپرترند، VWAP (روی نمودار اصلی) + ATR، MFI (pane جدا)

import { registerIndicator, type KLineData } from 'klinecharts'

const nan = Number.NaN

function wilderAtr(dataList: KLineData[], period: number): number[] {
  const n = dataList.length
  const tr: number[] = new Array(n).fill(nan)
  for (let i = 0; i < n; i++) {
    const c = dataList[i]
    if (i === 0) { tr[i] = c.high - c.low; continue }
    const pc = dataList[i - 1].close
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc))
  }
  const atr: number[] = new Array(n).fill(nan)
  if (n < period) return atr
  let sum = 0
  for (let i = 0; i < period; i++) sum += tr[i]
  atr[period - 1] = sum / period
  for (let i = period; i < n; i++) atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
  return atr
}

const hh = (dataList: KLineData[], i: number, p: number) => {
  let m = -Infinity
  for (let j = i - p + 1; j <= i; j++) m = Math.max(m, dataList[j].high)
  return m
}
const ll = (dataList: KLineData[], i: number, p: number) => {
  let m = Infinity
  for (let j = i - p + 1; j <= i; j++) m = Math.min(m, dataList[j].low)
  return m
}

let registered = false

export function registerCustomIndicators() {
  if (registered) return
  registered = true

  // ── ابر ایچیموکو (۹، ۲۶، ۵۲) — سنکو‌ها ۲۶ کندل جلو شیفت می‌شوند
  registerIndicator<{ tenkan?: number; kijun?: number; senkouA?: number; senkouB?: number; chikou?: number }>({
    name: 'ICHIMOKU',
    shortName: 'Ichimoku',
    series: 'price',
    precision: 0,
    calcParams: [9, 26, 52],
    shouldOhlc: true,
    figures: [
      { key: 'tenkan', title: 'تنکان: ', type: 'line' },
      { key: 'kijun', title: 'کیجون: ', type: 'line' },
      { key: 'senkouA', title: 'سنکو A: ', type: 'line' },
      { key: 'senkouB', title: 'سنکو B: ', type: 'line' },
      { key: 'chikou', title: 'چیکو: ', type: 'line' },
    ],
    styles: {
      lines: [
        { color: '#3b82f6' }, { color: '#d97706' },
        { color: 'rgba(38,166,154,0.9)' }, { color: 'rgba(239,83,80,0.9)' },
        { color: '#8b93a7' },
      ],
    },
    calc: (dataList, indicator) => {
      const [p1, p2, p3] = indicator.calcParams as number[]
      const n = dataList.length
      const conv = (i: number, p: number) => (i >= p - 1 ? (hh(dataList, i, p) + ll(dataList, i, p)) / 2 : nan)
      return dataList.map((_, i) => {
        const r: Record<string, number> = {}
        const tenkan = conv(i, p1)
        const kijun = conv(i, p2)
        if (!Number.isNaN(tenkan)) r.tenkan = tenkan
        if (!Number.isNaN(kijun)) r.kijun = kijun
        // سنکوها: مقدار محاسبه‌شده در i-p2، رسم در i
        const j = i - p2
        if (j >= 0) {
          const a = (conv(j, p1) + conv(j, p2)) / 2
          const b = conv(j, p3)
          if (!Number.isNaN(a)) r.senkouA = a
          if (!Number.isNaN(b)) r.senkouB = b
        }
        // چیکو: close امروز، رسم ۲۶ کندل عقب → در i مقدار close[i+p2]
        if (i + p2 < n) r.chikou = dataList[i + p2].close
        return r
      })
    },
  })

  // ── سوپرترند (ATR 10، ضریب 3)
  registerIndicator<{ up?: number; down?: number }>({
    name: 'SUPERTREND',
    shortName: 'SuperTrend',
    series: 'price',
    precision: 0,
    calcParams: [10, 3],
    shouldOhlc: true,
    figures: [
      { key: 'up', title: 'صعودی: ', type: 'line' },
      { key: 'down', title: 'نزولی: ', type: 'line' },
    ],
    styles: { lines: [{ color: '#26a69a' }, { color: '#ef5350' }] },
    calc: (dataList, indicator) => {
      const [period, mult] = indicator.calcParams as number[]
      const n = dataList.length
      const atr = wilderAtr(dataList, period)
      const out: { up?: number; down?: number }[] = new Array(n).fill(null).map(() => ({}))
      let prevUpper = nan
      let prevLower = nan
      let trendUp = true
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(atr[i])) continue
        const hl2 = (dataList[i].high + dataList[i].low) / 2
        const upper = hl2 + mult * atr[i]
        const lower = hl2 - mult * atr[i]
        const close = dataList[i].close
        const prevClose = i > 0 ? dataList[i - 1].close : close
        const finalUpper = Number.isNaN(prevUpper) || upper < prevUpper || prevClose > prevUpper ? upper : prevUpper
        const finalLower = Number.isNaN(prevLower) || lower > prevLower || prevClose < prevLower ? lower : prevLower
        if (close > finalUpper) trendUp = true
        else if (close < finalLower) trendUp = false
        if (trendUp) out[i].up = finalLower
        else out[i].down = finalUpper
        prevUpper = finalUpper
        prevLower = finalLower
      }
      return out
    },
  })

  // ── VWAP تجمعی از ابتدای بازه بارگذاری‌شده
  registerIndicator<{ vwap?: number }>({
    name: 'VWAP',
    shortName: 'VWAP',
    series: 'price',
    precision: 0,
    calcParams: [],
    figures: [{ key: 'vwap', title: 'VWAP: ', type: 'line' }],
    styles: { lines: [{ color: '#ec4899' }] },
    calc: (dataList) => {
      let cumPV = 0
      let cumV = 0
      return dataList.map(d => {
        const tp = (d.high + d.low + d.close) / 3
        const v = d.volume ?? 0
        cumPV += tp * v
        cumV += v
        return cumV > 0 ? { vwap: cumPV / cumV } : {}
      })
    },
  })

  // ── ATR (۱۴) — میانگین‌گیری وایلدر
  registerIndicator<{ atr?: number }>({
    name: 'ATR',
    shortName: 'ATR',
    series: 'price',
    precision: 0,
    calcParams: [14],
    figures: [{ key: 'atr', title: 'ATR: ', type: 'line' }],
    styles: { lines: [{ color: '#d97706' }] },
    calc: (dataList, indicator) => {
      const [period] = indicator.calcParams as number[]
      return wilderAtr(dataList, period).map(v => (Number.isNaN(v) ? {} : { atr: v }))
    },
  })

  // ── MFI (۱۴) — شاخص جریان نقدینگی
  registerIndicator<{ mfi?: number }>({
    name: 'MFI',
    shortName: 'MFI',
    series: 'normal',
    precision: 2,
    calcParams: [14],
    figures: [{ key: 'mfi', title: 'MFI: ', type: 'line' }],
    styles: { lines: [{ color: '#3b82f6' }] },
    calc: (dataList, indicator) => {
      const [period] = indicator.calcParams as number[]
      const n = dataList.length
      const tp = dataList.map(d => (d.high + d.low + d.close) / 3)
      const pos: number[] = new Array(n).fill(0)
      const neg: number[] = new Array(n).fill(0)
      for (let i = 1; i < n; i++) {
        const mf = tp[i] * (dataList[i].volume ?? 0)
        if (tp[i] > tp[i - 1]) pos[i] = mf
        else if (tp[i] < tp[i - 1]) neg[i] = mf
      }
      return dataList.map((_, i) => {
        if (i < period) return {}
        let p = 0
        let m = 0
        for (let j = i - period + 1; j <= i; j++) { p += pos[j]; m += neg[j] }
        if (p + m === 0) return {}
        return { mfi: m === 0 ? 100 : 100 - 100 / (1 + p / m) }
      })
    },
  })
}
