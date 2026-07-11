// اسمارت مانی برای اسکریپت‌های سرور — پورت JS از lib/smc.ts (که خودش پورت
// joshyattridge/smart-money-concepts نسخه 0.0.27 است، MIT).
// هر تغییر منطقی باید هم‌زمان در lib/smc.ts هم اعمال شود.

'use strict'

const NaNv = Number.NaN
const isNum = (v) => !Number.isNaN(v)

/** سقف/کف سوئینگ — بالاترین/پایین‌ترین در پنجره swingLength کندل قبل و بعد */
function swingHighsLows(candles, swingLength = 10) {
  const n = candles.length
  const w = swingLength * 2
  const half = swingLength
  const highLow = new Array(n).fill(NaNv)

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

  for (;;) {
    const positions = []
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

  const positions = []
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

/** گپ ارزش منصفانه (FVG) */
function fvg(candles, joinConsecutive = false) {
  const n = candles.length
  const out = new Array(n).fill(NaNv)
  const top = new Array(n).fill(NaNv)
  const bottom = new Array(n).fill(NaNv)

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

  const mitigatedIndex = new Array(n).fill(NaNv)
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
function bosChoch(candles, swings, closeBreak = true) {
  const n = candles.length
  const bos = new Array(n).fill(0)
  const choch = new Array(n).fill(0)
  const level = new Array(n).fill(0)

  const levelOrder = []
  const hlOrder = []
  const lastPositions = []

  const eq = (arr, pat) => arr.length >= 4 && pat.every((p, k) => arr[arr.length - 4 + k] === p)
  const asc = (a, b, c, d) => a < b && b < c && c < d

  for (let i = 0; i < n; i++) {
    if (!isNum(swings.highLow[i])) continue
    levelOrder.push(swings.level[i])
    hlOrder.push(swings.highLow[i])
    if (levelOrder.length >= 4) {
      const p = lastPositions[lastPositions.length - 2]
      const L = levelOrder
      const l4 = L[L.length - 4], l3 = L[L.length - 3], l2 = L[L.length - 2], l1 = L[L.length - 1]

      bos[p] = eq(hlOrder, [-1, 1, -1, 1]) && asc(l4, l2, l3, l1) ? 1 : 0
      level[p] = bos[p] !== 0 ? l3 : 0
      bos[p] = eq(hlOrder, [1, -1, 1, -1]) && asc(l1, l3, l2, l4) ? -1 : bos[p]
      level[p] = bos[p] !== 0 ? l3 : 0
      choch[p] = eq(hlOrder, [-1, 1, -1, 1]) && asc(l2, l4, l3, l1) ? 1 : 0
      level[p] = choch[p] !== 0 ? l3 : level[p]
      choch[p] = eq(hlOrder, [1, -1, 1, -1]) && asc(l1, l3, l4, l2) ? -1 : choch[p]
      level[p] = choch[p] !== 0 ? l3 : level[p]
    }
    lastPositions.push(i)
  }

  const broken = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    if (bos[i] === 0 && choch[i] === 0) continue
    let j = 0
    for (let k = i + 2; k < n; k++) {
      const v = closeBreak ? candles[k].close : (bos[i] === 1 || choch[i] === 1 ? candles[k].high : candles[k].low)
      if ((bos[i] === 1 || choch[i] === 1) ? v > level[i] : v < level[i]) { j = k; break }
    }
    if (j !== 0) {
      broken[i] = j
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

/** اردر بلاک */
function orderBlocks(candles, swings, closeMitigation = false) {
  const n = candles.length
  const ob = new Array(n).fill(0)
  const top = new Array(n).fill(0)
  const bottom = new Array(n).fill(0)
  const obVolume = new Array(n).fill(0)
  const lowVol = new Array(n).fill(0)
  const highVol = new Array(n).fill(0)
  const percentage = new Array(n).fill(0)
  const mitigatedIndex = new Array(n).fill(0)
  const breaker = new Array(n).fill(false)
  const crossed = new Array(n).fill(false)

  const swingHighIdx = []
  const swingLowIdx = []
  for (let i = 0; i < n; i++) {
    if (swings.highLow[i] === 1) swingHighIdx.push(i)
    else if (swings.highLow[i] === -1) swingLowIdx.push(i)
  }
  const lastBelow = (arr, x) => {
    let lo = 0, hi = arr.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid }
    return lo > 0 ? arr[lo - 1] : null
  }

  const reset = (idx) => {
    ob[idx] = 0; top[idx] = 0; bottom[idx] = 0; obVolume[idx] = 0
    lowVol[idx] = 0; highVol[idx] = 0; mitigatedIndex[idx] = 0; percentage[idx] = 0
  }
  const setVolumes = (obIdx, i, bullish) => {
    const v0 = candles[i].volume
    const v1 = i >= 1 ? candles[i - 1].volume : 0
    const v2 = i >= 2 ? candles[i - 2].volume : 0
    obVolume[obIdx] = v0 + v1 + v2
    if (bullish) { lowVol[obIdx] = v2; highVol[obIdx] = v0 + v1 }
    else { lowVol[obIdx] = v0 + v1; highVol[obIdx] = v2 }
    const mx = Math.max(highVol[obIdx], lowVol[obIdx])
    percentage[obIdx] = mx !== 0 ? (Math.min(highVol[obIdx], lowVol[obIdx]) / mx) * 100 : 100
  }

  const activeBull = []
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

  const activeBear = []
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

module.exports = { swingHighsLows, fvg, bosChoch, orderBlocks }
