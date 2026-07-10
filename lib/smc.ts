// اسمارت مانی (Smart Money Concepts) — پورت TypeScript از کتابخانه
// joshyattridge/smart-money-concepts نسخه 0.0.27 (MIT)
// رفتار عمداً یک‌به‌یک با نسخه پایتون حفظ شده تا خروجی قابل‌مقایسه باشد.

import type { Candle } from './indicators'

const NaNv = Number.NaN
const isNum = (v: number) => !Number.isNaN(v)

export type SwingResult = { highLow: number[]; level: number[] } // 1=سقف سوئینگ، -1=کف
export type FvgResult = { fvg: number[]; top: number[]; bottom: number[]; mitigatedIndex: number[] }
export type BosChochResult = { bos: number[]; choch: number[]; level: number[]; brokenIndex: number[] }
export type ObResult = { ob: number[]; top: number[]; bottom: number[]; obVolume: number[]; mitigatedIndex: number[]; percentage: number[] }
export type LiquidityResult = { liquidity: number[]; level: number[]; end: number[]; swept: number[] }

/** سقف/کف سوئینگ — بالاترین/پایین‌ترین در پنجره swingLength کندل قبل و بعد */
export function swingHighsLows(candles: Candle[], swingLength = 10): SwingResult {
  const n = candles.length
  const w = swingLength * 2
  const half = swingLength
  const highLow: number[] = new Array(n).fill(NaNv)

  // پنجره rolling معادل پانداس: high[i] == max(high[i-half+1 .. i+half])
  for (let i = 0; i < n; i++) {
    const lo = i - half + 1
    const hi = i + half
    if (i < w - 1 || hi > n - 1 || lo < 0) continue
    let maxH = -Infinity
    let minL = Infinity
    for (let j = lo; j <= hi; j++) {
      if (candles[j].high > maxH) maxH = candles[j].high
      if (candles[j].low < minL) minL = candles[j].low
    }
    if (candles[i].high === maxH) highLow[i] = 1
    else if (candles[i].low === minL) highLow[i] = -1
  }

  // حذف سوئینگ‌های هم‌نوع پشت‌سرهم — ضعیف‌تر حذف می‌شود
  for (;;) {
    const positions: number[] = []
    for (let i = 0; i < n; i++) if (isNum(highLow[i])) positions.push(i)
    if (positions.length < 2) break

    const remove = new Array(positions.length).fill(false)
    for (let k = 0; k < positions.length - 1; k++) {
      const cur = highLow[positions[k]]
      const nxt = highLow[positions[k + 1]]
      if (cur === 1 && nxt === 1) {
        if (candles[positions[k]].high < candles[positions[k + 1]].high) remove[k] = true
        else remove[k + 1] = true
      } else if (cur === -1 && nxt === -1) {
        if (candles[positions[k]].low > candles[positions[k + 1]].low) remove[k] = true
        else remove[k + 1] = true
      }
    }
    if (!remove.some(Boolean)) break
    for (let k = 0; k < positions.length; k++) if (remove[k]) highLow[positions[k]] = NaNv
  }

  // ابتدای و انتهای آرایه سوئینگ مخالف اولین/آخرین سوئینگ می‌گیرند (رفتار کتابخانه اصلی)
  const positions: number[] = []
  for (let i = 0; i < n; i++) if (isNum(highLow[i])) positions.push(i)
  if (positions.length > 0) {
    if (highLow[positions[0]] === 1) highLow[0] = -1
    if (highLow[positions[0]] === -1) highLow[0] = 1
    if (highLow[positions[positions.length - 1]] === -1) highLow[n - 1] = 1
    if (highLow[positions[positions.length - 1]] === 1) highLow[n - 1] = -1
  }

  const level = highLow.map((v, i) => (isNum(v) ? (v === 1 ? candles[i].high : candles[i].low) : NaNv))
  return { highLow, level }
}

/** گپ ارزش منصفانه (FVG) — شکاف بین سقف کندل قبل و کف کندل بعد */
export function fvg(candles: Candle[], joinConsecutive = false): FvgResult {
  const n = candles.length
  const out: number[] = new Array(n).fill(NaNv)
  const top: number[] = new Array(n).fill(NaNv)
  const bottom: number[] = new Array(n).fill(NaNv)

  for (let i = 1; i < n - 1; i++) {
    const bull = candles[i - 1].high < candles[i + 1].low && candles[i].close > candles[i].open
    const bear = candles[i - 1].low > candles[i + 1].high && candles[i].close < candles[i].open
    if (bull) {
      out[i] = 1
      top[i] = candles[i + 1].low
      bottom[i] = candles[i - 1].high
    } else if (bear) {
      out[i] = -1
      top[i] = candles[i - 1].low
      bottom[i] = candles[i + 1].high
    }
  }

  if (joinConsecutive) {
    for (let i = 0; i < n - 1; i++) {
      if (isNum(out[i]) && out[i] === out[i + 1]) {
        top[i + 1] = Math.max(top[i], top[i + 1])
        bottom[i + 1] = Math.min(bottom[i], bottom[i + 1])
        out[i] = top[i] = bottom[i] = NaNv
      }
    }
  }

  const mitigatedIndex: number[] = new Array(n).fill(NaNv)
  for (let i = 0; i < n; i++) {
    if (!isNum(out[i])) continue
    let m = 0
    for (let j = i + 2; j < n; j++) {
      if ((out[i] === 1 && candles[j].low <= top[i]) || (out[i] === -1 && candles[j].high >= bottom[i])) {
        m = j
        break
      }
    }
    mitigatedIndex[i] = m
  }

  return { fvg: out, top, bottom, mitigatedIndex }
}

/** شکست ساختار (BOS) و تغییر کاراکتر (CHoCH) */
export function bosChoch(candles: Candle[], swings: SwingResult, closeBreak = true): BosChochResult {
  const n = candles.length
  const bos: number[] = new Array(n).fill(0)
  const choch: number[] = new Array(n).fill(0)
  const level: number[] = new Array(n).fill(0)

  const levelOrder: number[] = []
  const hlOrder: number[] = []
  const lastPositions: number[] = []

  const eq = (arr: number[], pat: number[]) => arr.length >= 4 && pat.every((p, k) => arr[arr.length - 4 + k] === p)
  const asc = (a: number, b: number, c: number, d: number) => a < b && b < c && c < d

  for (let i = 0; i < n; i++) {
    if (!isNum(swings.highLow[i])) continue
    levelOrder.push(swings.level[i])
    hlOrder.push(swings.highLow[i])
    if (levelOrder.length >= 4) {
      const p = lastPositions[lastPositions.length - 2]
      const L = levelOrder
      const l4 = L[L.length - 4], l3 = L[L.length - 3], l2 = L[L.length - 2], l1 = L[L.length - 1]

      // BOS صعودی: کف/سقف/کف/سقف با ترتیب سطح l4 < l2 < l3 < l1
      bos[p] = eq(hlOrder, [-1, 1, -1, 1]) && asc(l4, l2, l3, l1) ? 1 : 0
      level[p] = bos[p] !== 0 ? l3 : 0
      // BOS نزولی
      bos[p] = eq(hlOrder, [1, -1, 1, -1]) && asc(l1, l3, l2, l4) ? -1 : bos[p]
      level[p] = bos[p] !== 0 ? l3 : 0
      // CHoCH صعودی: l1 > l3 > l4 > l2
      choch[p] = eq(hlOrder, [-1, 1, -1, 1]) && asc(l2, l4, l3, l1) ? 1 : 0
      level[p] = choch[p] !== 0 ? l3 : level[p]
      // CHoCH نزولی
      choch[p] = eq(hlOrder, [1, -1, 1, -1]) && asc(l1, l3, l4, l2) ? -1 : choch[p]
      level[p] = choch[p] !== 0 ? l3 : level[p]
    }
    lastPositions.push(i)
  }

  const broken: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    if (bos[i] === 0 && choch[i] === 0) continue
    let j = 0
    for (let k = i + 2; k < n; k++) {
      const v = closeBreak ? candles[k].close : (bos[i] === 1 || choch[i] === 1 ? candles[k].high : candles[k].low)
      if ((bos[i] === 1 || choch[i] === 1) ? v > level[i] : v < level[i]) { j = k; break }
    }
    if (j !== 0) {
      broken[i] = j
      // ساختارهای قدیمی‌تر که شکستشان بعد از این است حذف می‌شوند
      for (let k = 0; k < n; k++) {
        if ((bos[k] !== 0 || choch[k] !== 0) && k < i && broken[k] >= j) {
          bos[k] = 0; choch[k] = 0; level[k] = 0
        }
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if ((bos[i] !== 0 || choch[i] !== 0) && broken[i] === 0) { bos[i] = 0; choch[i] = 0; level[i] = 0 }
  }

  return {
    bos: bos.map(v => (v !== 0 ? v : NaNv)),
    choch: choch.map(v => (v !== 0 ? v : NaNv)),
    level: level.map(v => (v !== 0 ? v : NaNv)),
    brokenIndex: broken.map(v => (v !== 0 ? v : NaNv)),
  }
}

/** اردر بلاک — ناحیه سفارش‌های نهادی قبل از شکست سوئینگ */
export function orderBlocks(candles: Candle[], swings: SwingResult, closeMitigation = false): ObResult {
  const n = candles.length
  const ob: number[] = new Array(n).fill(0)
  const top: number[] = new Array(n).fill(0)
  const bottom: number[] = new Array(n).fill(0)
  const obVolume: number[] = new Array(n).fill(0)
  const lowVol: number[] = new Array(n).fill(0)
  const highVol: number[] = new Array(n).fill(0)
  const percentage: number[] = new Array(n).fill(0)
  const mitigatedIndex: number[] = new Array(n).fill(0)
  const breaker: boolean[] = new Array(n).fill(false)
  const crossed: boolean[] = new Array(n).fill(false)

  const swingHighIdx: number[] = []
  const swingLowIdx: number[] = []
  for (let i = 0; i < n; i++) {
    if (swings.highLow[i] === 1) swingHighIdx.push(i)
    else if (swings.highLow[i] === -1) swingLowIdx.push(i)
  }
  const lastBelow = (arr: number[], x: number) => {
    let lo = 0, hi = arr.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid }
    return lo > 0 ? arr[lo - 1] : null
  }

  const reset = (idx: number) => {
    ob[idx] = 0; top[idx] = 0; bottom[idx] = 0; obVolume[idx] = 0
    lowVol[idx] = 0; highVol[idx] = 0; mitigatedIndex[idx] = 0; percentage[idx] = 0
  }
  const setVolumes = (obIdx: number, i: number, bullish: boolean) => {
    const v0 = candles[i].volume
    const v1 = i >= 1 ? candles[i - 1].volume : 0
    const v2 = i >= 2 ? candles[i - 2].volume : 0
    obVolume[obIdx] = v0 + v1 + v2
    if (bullish) { lowVol[obIdx] = v2; highVol[obIdx] = v0 + v1 }
    else { lowVol[obIdx] = v0 + v1; highVol[obIdx] = v2 }
    const mx = Math.max(highVol[obIdx], lowVol[obIdx])
    percentage[obIdx] = mx !== 0 ? (Math.min(highVol[obIdx], lowVol[obIdx]) / mx) * 100 : 100
  }

  // اردر بلاک‌های صعودی
  const activeBull: number[] = []
  for (let i = 0; i < n; i++) {
    for (const idx of [...activeBull]) {
      if (breaker[idx]) {
        if (candles[i].high > top[idx]) { reset(idx); activeBull.splice(activeBull.indexOf(idx), 1) }
      } else if (
        (!closeMitigation && candles[i].low < bottom[idx]) ||
        (closeMitigation && Math.min(candles[i].open, candles[i].close) < bottom[idx])
      ) {
        breaker[idx] = true
        mitigatedIndex[idx] = i - 1
      }
    }
    const lastTop = lastBelow(swingHighIdx, i)
    if (lastTop !== null && candles[i].close > candles[lastTop].high && !crossed[lastTop]) {
      crossed[lastTop] = true
      let obIdx = i - 1
      let obBtm = candles[obIdx].high
      let obTop = candles[obIdx].low
      if (i - lastTop > 1) {
        let minVal = Infinity, cand = -1
        for (let j = lastTop + 1; j < i; j++) if (candles[j].low <= minVal) { minVal = candles[j].low; cand = j }
        if (cand >= 0) { obBtm = candles[cand].low; obTop = candles[cand].high; obIdx = cand }
      }
      ob[obIdx] = 1; top[obIdx] = obTop; bottom[obIdx] = obBtm
      setVolumes(obIdx, i, true)
      activeBull.push(obIdx)
    }
  }

  // اردر بلاک‌های نزولی
  const activeBear: number[] = []
  for (let i = 0; i < n; i++) {
    for (const idx of [...activeBear]) {
      if (breaker[idx]) {
        if (candles[i].low < bottom[idx]) { reset(idx); activeBear.splice(activeBear.indexOf(idx), 1) }
      } else if (
        (!closeMitigation && candles[i].high > top[idx]) ||
        (closeMitigation && Math.max(candles[i].open, candles[i].close) > top[idx])
      ) {
        breaker[idx] = true
        mitigatedIndex[idx] = i
      }
    }
    const lastBtm = lastBelow(swingLowIdx, i)
    if (lastBtm !== null && candles[i].close < candles[lastBtm].low && !crossed[lastBtm]) {
      crossed[lastBtm] = true
      let obIdx = i - 1
      let obTop = candles[obIdx].high
      let obBtm = candles[obIdx].low
      if (i - lastBtm > 1) {
        let maxVal = -Infinity, cand = -1
        for (let j = lastBtm + 1; j < i; j++) if (candles[j].high >= maxVal) { maxVal = candles[j].high; cand = j }
        if (cand >= 0) { obTop = candles[cand].high; obBtm = candles[cand].low; obIdx = cand }
      }
      ob[obIdx] = -1; top[obIdx] = obTop; bottom[obIdx] = obBtm
      setVolumes(obIdx, i, false)
      activeBear.push(obIdx)
    }
  }

  return {
    ob: ob.map(v => (v !== 0 ? v : NaNv)),
    top: top.map((v, i) => (ob[i] !== 0 ? v : NaNv)),
    bottom: bottom.map((v, i) => (ob[i] !== 0 ? v : NaNv)),
    obVolume: obVolume.map((v, i) => (ob[i] !== 0 ? v : NaNv)),
    mitigatedIndex: mitigatedIndex.map((v, i) => (ob[i] !== 0 ? v : NaNv)),
    percentage: percentage.map((v, i) => (ob[i] !== 0 ? v : NaNv)),
  }
}

/** نقدینگی — چند سقف/کف سوئینگ در محدوده کوچک کنار هم */
export function liquidity(candles: Candle[], swings: SwingResult, rangePercent = 0.01): LiquidityResult {
  const n = candles.length
  let maxH = -Infinity, minL = Infinity
  for (const c of candles) { if (c.high > maxH) maxH = c.high; if (c.low < minL) minL = c.low }
  const pipRange = (maxH - minL) * rangePercent

  const hl = [...swings.highLow]
  const lvl = swings.level
  const liq: number[] = new Array(n).fill(NaNv)
  const liqLevel: number[] = new Array(n).fill(NaNv)
  const liqEnd: number[] = new Array(n).fill(NaNv)
  const liqSwept: number[] = new Array(n).fill(NaNv)

  const run = (dir: 1 | -1) => {
    const indices: number[] = []
    for (let i = 0; i < n; i++) if (hl[i] === dir) indices.push(i)
    for (const i of indices) {
      if (hl[i] !== dir) continue
      const base = lvl[i]
      const rangeLow = base - pipRange
      const rangeHigh = base + pipRange
      const group = [base]
      let groupEnd = i

      let swept = 0
      for (let j = i + 1; j < n; j++) {
        if ((dir === 1 && candles[j].high >= rangeHigh) || (dir === -1 && candles[j].low <= rangeLow)) { swept = j; break }
      }
      for (const j of indices) {
        if (j <= i) continue
        if (swept && j >= swept) break
        if (hl[j] === dir && lvl[j] >= rangeLow && lvl[j] <= rangeHigh) {
          group.push(lvl[j])
          groupEnd = j
          hl[j] = 0
        }
      }
      if (group.length > 1) {
        liq[i] = dir
        liqLevel[i] = group.reduce((a, b) => a + b, 0) / group.length
        liqEnd[i] = groupEnd
        liqSwept[i] = swept
      }
    }
  }
  run(1)
  run(-1)

  return { liquidity: liq, level: liqLevel, end: liqEnd, swept: liqSwept }
}
