/**
 * candle-patterns.js — تشخیص ۱۹ الگوی رایج کندلی (چکش، پوشا، هارامی، ستاره صبحگاهی...)
 * پیاده‌سازی هندسی خالص JS (نسبت بدنه/سایه) — بدون وابستگی native (TA-Lib)،
 * مثل smc-lib.js. آستانه‌ها فرمول‌های استاندارد کتاب‌های تحلیل تکنیکال کلاسیک هستند.
 *
 * detectCandlePattern(rows) → { key, bias } | null
 *   rows: صعودی بر اساس تاریخ، آخرین آیتم = کندل امروز، حداقل ۱۲ کندل برای context روند
 */

'use strict'

const PATTERN_LABELS = {
  hammer: 'چکش',
  hanging_man: 'مرد آویزان',
  inverted_hammer: 'چکش معکوس',
  shooting_star: 'ستاره دنباله‌دار',
  doji: 'دوجی',
  dragonfly_doji: 'دوجی سنجاقک',
  gravestone_doji: 'دوجی سنگ‌قبر',
  spinning_top: 'فرفره',
  bullish_engulfing: 'پوشای صعودی',
  bearish_engulfing: 'پوشای نزولی',
  bullish_harami: 'هارامی صعودی',
  bearish_harami: 'هارامی نزولی',
  piercing_line: 'خط نافذ',
  dark_cloud_cover: 'ابر تیره',
  tweezer_top: 'موچین سقف',
  tweezer_bottom: 'موچین کف',
  morning_star: 'ستاره صبحگاهی',
  evening_star: 'ستاره عصرگاهی',
  three_white_soldiers: 'سه سرباز سفید',
  three_black_crows: 'سه کلاغ سیاه',
}

function shape(c) {
  const range = Math.max(c.high - c.low, 1e-9)
  const body = Math.abs(c.close - c.open)
  const bodyTop = Math.max(c.open, c.close)
  const bodyBottom = Math.min(c.open, c.close)
  return {
    open: c.open, close: c.close, high: c.high, low: c.low,
    range, body,
    bodyTop, bodyBottom,
    upperShadow: c.high - bodyTop,
    lowerShadow: bodyBottom - c.low,
    isBull: c.close > c.open,
    isBear: c.close < c.open,
    // دامنه نوسان کمتر از ۰.۳٪ قیمت — یعنی نماد صف خرید/فروش قفل بوده (range≈۰)،
    // نه دوجی/الگوی واقعی؛ نادیده گرفته می‌شود تا سیگنال کاذب ندهد
    flat: (c.high - c.low) < c.close * 0.003,
  }
}

const near = (a, b, tolPct = 0.003) => Math.abs(a - b) <= tolPct * ((a + b) / 2)

/** روند ۵ کندل منتهی به patternStartIdx — 'up' / 'down' / null (بی‌روند) */
function priorTrend(rows, patternStartIdx, lookback = 5) {
  const from = Math.max(0, patternStartIdx - lookback)
  if (from >= patternStartIdx) return null
  const startClose = rows[from].close
  const endClose = rows[patternStartIdx - 1].close
  if (endClose < startClose * 0.995) return 'down'
  if (endClose > startClose * 1.005) return 'up'
  return null
}

// ───────────────────── الگوهای سه‌کندلی ─────────────────────

function threeCandle(rows, n) {
  if (n < 3) return null
  const c2 = shape(rows[n - 3]), c1 = shape(rows[n - 2]), c0 = shape(rows[n - 1])
  if (c2.flat || c1.flat || c0.flat) return null
  const trend = priorTrend(rows, n - 3)

  // ستاره صبحگاهی: نزولی بزرگ، ستاره کوچک (گپ پایین)، صعودی بزرگ که وسط بدنه اول را پس می‌گیرد
  if (trend === 'down' && c2.isBear && c2.body >= 0.5 * c2.range
    && c1.body <= 0.35 * c1.range && c1.bodyTop <= c2.bodyBottom * 1.002
    && c0.isBull && c0.body >= 0.5 * c0.range && c0.close >= c2.bodyBottom + c2.body * 0.5) {
    return { key: 'morning_star', bias: 'bull' }
  }
  // ستاره عصرگاهی: آینه‌ی بالا
  if (trend === 'up' && c2.isBull && c2.body >= 0.5 * c2.range
    && c1.body <= 0.35 * c1.range && c1.bodyBottom >= c2.bodyTop * 0.998
    && c0.isBear && c0.body >= 0.5 * c0.range && c0.close <= c2.bodyTop - c2.body * 0.5) {
    return { key: 'evening_star', bias: 'bear' }
  }
  // سه سرباز سفید: سه کندل صعودی پیاپی با close بالاتر و سایه بالایی کوچک
  if (c2.isBull && c1.isBull && c0.isBull
    && rows[n - 2].close > rows[n - 3].close && rows[n - 1].close > rows[n - 2].close
    && rows[n - 2].open > c2.bodyBottom && rows[n - 2].open < c2.bodyTop
    && rows[n - 1].open > c1.bodyBottom && rows[n - 1].open < c1.bodyTop
    && c2.upperShadow <= 0.2 * c2.range && c1.upperShadow <= 0.2 * c1.range && c0.upperShadow <= 0.2 * c0.range) {
    return { key: 'three_white_soldiers', bias: 'bull' }
  }
  // سه کلاغ سیاه: آینه‌ی بالا
  if (c2.isBear && c1.isBear && c0.isBear
    && rows[n - 2].close < rows[n - 3].close && rows[n - 1].close < rows[n - 2].close
    && rows[n - 2].open < c2.bodyTop && rows[n - 2].open > c2.bodyBottom
    && rows[n - 1].open < c1.bodyTop && rows[n - 1].open > c1.bodyBottom
    && c2.lowerShadow <= 0.2 * c2.range && c1.lowerShadow <= 0.2 * c1.range && c0.lowerShadow <= 0.2 * c0.range) {
    return { key: 'three_black_crows', bias: 'bear' }
  }
  return null
}

// ───────────────────── الگوهای دوکندلی ─────────────────────

function twoCandle(rows, n) {
  if (n < 2) return null
  const c1 = shape(rows[n - 2]), c0 = shape(rows[n - 1])
  if (c1.flat || c0.flat) return null
  const trend = priorTrend(rows, n - 2)

  if (trend === 'down' && c1.isBear && c0.isBull
    && c0.open <= c1.bodyBottom * 1.002 && c0.close >= c1.bodyTop * 0.998
    && c0.body > c1.body) {
    return { key: 'bullish_engulfing', bias: 'bull' }
  }
  if (trend === 'up' && c1.isBull && c0.isBear
    && c0.open >= c1.bodyTop * 0.998 && c0.close <= c1.bodyBottom * 1.002
    && c0.body > c1.body) {
    return { key: 'bearish_engulfing', bias: 'bear' }
  }
  if (trend === 'down' && c1.isBear && c1.body >= 0.4 * c1.range && c0.isBull
    && c0.open < c1.bodyBottom && c0.close > c1.bodyBottom + c1.body * 0.5 && c0.close < c1.bodyTop) {
    return { key: 'piercing_line', bias: 'bull' }
  }
  if (trend === 'up' && c1.isBull && c1.body >= 0.4 * c1.range && c0.isBear
    && c0.open > c1.bodyTop && c0.close < c1.bodyTop - c1.body * 0.5 && c0.close > c1.bodyBottom) {
    return { key: 'dark_cloud_cover', bias: 'bear' }
  }
  if (trend === 'down' && c1.isBear && c1.body >= 0.4 * c1.range
    && c0.body <= 0.5 * c1.body && c0.bodyTop <= c1.bodyTop && c0.bodyBottom >= c1.bodyBottom) {
    return { key: 'bullish_harami', bias: 'bull' }
  }
  if (trend === 'up' && c1.isBull && c1.body >= 0.4 * c1.range
    && c0.body <= 0.5 * c1.body && c0.bodyTop <= c1.bodyTop && c0.bodyBottom >= c1.bodyBottom) {
    return { key: 'bearish_harami', bias: 'bear' }
  }
  if (trend === 'up' && near(rows[n - 2].high, rows[n - 1].high) && c1.isBull !== c0.isBull) {
    return { key: 'tweezer_top', bias: 'bear' }
  }
  if (trend === 'down' && near(rows[n - 2].low, rows[n - 1].low) && c1.isBull !== c0.isBull) {
    return { key: 'tweezer_bottom', bias: 'bull' }
  }
  return null
}

// ───────────────────── الگوهای تک‌کندلی ─────────────────────

function oneCandle(rows, n) {
  const c0 = shape(rows[n - 1])
  if (c0.flat) return null
  const trend = priorTrend(rows, n - 1)
  const isDoji = c0.body <= 0.1 * c0.range

  if (isDoji && c0.lowerShadow >= 0.6 * c0.range && c0.upperShadow <= 0.1 * c0.range) {
    return { key: 'dragonfly_doji', bias: trend === 'down' ? 'bull' : 'bear' }
  }
  if (isDoji && c0.upperShadow >= 0.6 * c0.range && c0.lowerShadow <= 0.1 * c0.range) {
    return { key: 'gravestone_doji', bias: trend === 'up' ? 'bear' : 'bull' }
  }
  if (isDoji) return { key: 'doji', bias: null }

  const hammerShape = c0.body <= 0.35 * c0.range && c0.lowerShadow >= 2 * c0.body && c0.upperShadow <= 0.15 * c0.range
  if (hammerShape && trend === 'down') return { key: 'hammer', bias: 'bull' }
  if (hammerShape && trend === 'up') return { key: 'hanging_man', bias: 'bear' }

  const starShape = c0.body <= 0.35 * c0.range && c0.upperShadow >= 2 * c0.body && c0.lowerShadow <= 0.15 * c0.range
  if (starShape && trend === 'down') return { key: 'inverted_hammer', bias: 'bull' }
  if (starShape && trend === 'up') return { key: 'shooting_star', bias: 'bear' }

  if (c0.body <= 0.3 * c0.range && c0.body > 0.1 * c0.range
    && c0.upperShadow >= 0.25 * c0.range && c0.lowerShadow >= 0.25 * c0.range) {
    return { key: 'spinning_top', bias: null }
  }
  return null
}

/** الگوی امروز — اولویت با سه‌کندلی > دوکندلی > تک‌کندلی (سیگنال قوی‌تر اول) */
function detectCandlePattern(rows) {
  const clean = (rows ?? []).filter(r =>
    r.open > 0 && r.high > 0 && r.low > 0 && r.close > 0 && r.high >= r.low)
  const n = clean.length
  if (n < 3) return null
  return threeCandle(clean, n) ?? twoCandle(clean, n) ?? oneCandle(clean, n)
}

module.exports = { detectCandlePattern, PATTERN_LABELS }
