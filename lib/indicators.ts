// اندیکاتورهای تحلیل تکنیکال — ورودی: آرایه صعودی بر اساس تاریخ
// خروجی هر تابع هم‌طول ورودی است؛ نقاطی که هنوز محاسبه‌پذیر نیستند null می‌گیرند

export type Candle = {
  time: string          // yyyy-mm-dd میلادی — فرمت lightweight-charts
  shamsi: string        // 1403/08/08 برای نمایش
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

// RSI با میانگین‌گیری وایلدر (استاندارد)
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gain += d
    else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export type MacdPoint = { macd: number | null; signal: number | null; hist: number | null }

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdPoint[] {
  const emaFast = ema(closes, fast)
  const emaSlow = ema(closes, slow)
  const macdLine: (number | null)[] = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? (emaFast[i] as number) - (emaSlow[i] as number) : null
  )
  // سیگنال = EMA خطِ MACD روی بخش معتبر
  const firstIdx = macdLine.findIndex(v => v !== null)
  const out: MacdPoint[] = closes.map(() => ({ macd: null, signal: null, hist: null }))
  if (firstIdx === -1) return out
  const valid = macdLine.slice(firstIdx) as number[]
  const sig = ema(valid, signalPeriod)
  for (let i = 0; i < valid.length; i++) {
    const j = firstIdx + i
    const s = sig[i]
    out[j] = {
      macd: valid[i],
      signal: s,
      hist: s !== null ? valid[i] - s : null,
    }
  }
  return out
}

export type BollingerPoint = { upper: number | null; middle: number | null; lower: number | null }

export function bollinger(closes: number[], period = 20, mult = 2): BollingerPoint[] {
  const mid = sma(closes, period)
  return closes.map((_, i) => {
    if (mid[i] === null) return { upper: null, middle: null, lower: null }
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - (mid[i] as number)) ** 2
    const sd = Math.sqrt(variance / period)
    return {
      upper: (mid[i] as number) + mult * sd,
      middle: mid[i],
      lower: (mid[i] as number) - mult * sd,
    }
  })
}
