import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'
import { sma, rsi, macd, type Candle } from '../../../lib/indicators'
import { swingHighsLows, fvg, bosChoch, orderBlocks } from '../../../lib/smc'

// بک‌تست تعاملی — نسخه هم‌ارز scripts/backtest-signals.js اما فقط برای یک نماد
// و محاسبه زنده (نه از جدول تجمیعی signal_backtest_stats که روی همه‌ی نمادها میانگین است).
// عمداً الگوهای کندلی (candle_*) را پوشش نمی‌دهد — آن تابع فقط در scripts/candle-patterns.js
// (CommonJS) هست و پورت TS ندارد؛ بقیه سیگنال‌ها (SMA/RSI/MACD/حجم/۵۲هفته/SMC) کامل است.

export const dynamic = 'force-dynamic'

const HORIZONS = [5, 10, 20]
const LOOKBACK = 260
const MIN_ROWS = LOOKBACK + Math.max(...HORIZONS) + 10
const PAGE = 1000

type Row = { trade_date: string; trade_date_shamsi: string; open: number | null; high: number | null; low: number | null; close: number; volume: number | null; adj_close: number | null }

async function fetchCandles(symbol: string): Promise<Row[]> {
  const rows: Row[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from('stock_candles')
      .select('trade_date, trade_date_shamsi, open, high, low, close, volume, adj_close')
      .eq('symbol', symbol).order('trade_date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    rows.push(...(data as Row[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

type Acc = { signal_key: string; horizon_days: number; bias: 'bull' | 'bear'; count: number; winCount: number; sumReturn: number; returns: number[] }

function buildSmcEvents(rows: Row[]) {
  const n = rows.length
  const events = new Map<number, { key: string; bias: 'bull' | 'bear' }[]>()
  const add = (idx: number, key: string, bias: 'bull' | 'bear') => {
    if (Number.isNaN(idx) || idx < 0 || idx >= n) return
    let arr = events.get(idx)
    if (!arr) { arr = []; events.set(idx, arr) }
    arr.push({ key, bias })
  }
  try {
    const candles: Candle[] = rows.map(r => ({
      time: r.trade_date, shamsi: r.trade_date_shamsi,
      open: Number(r.open ?? r.close), high: Number(r.high ?? r.close),
      low: Number(r.low ?? r.close), close: Number(r.close), volume: Number(r.volume) || 0,
    }))
    const swings = swingHighsLows(candles, 10)

    const bc = bosChoch(candles, swings)
    for (let i = 0; i < n; i++) {
      const br = bc.brokenIndex[i]
      if (Number.isNaN(br)) continue
      if (!Number.isNaN(bc.bos[i])) add(br, 'smc_bos', bc.bos[i] === 1 ? 'bull' : 'bear')
      else if (!Number.isNaN(bc.choch[i])) add(br, 'smc_choch', bc.choch[i] === 1 ? 'bull' : 'bear')
    }
    const ob = orderBlocks(candles, swings)
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(ob.ob[i])) continue
      add(ob.confirmedIndex[i], 'smc_ob', ob.ob[i] === 1 ? 'bull' : 'bear')
    }
    const f = fvg(candles)
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(f.fvg[i])) continue
      add(i + 1, 'smc_fvg', f.fvg[i] === 1 ? 'bull' : 'bear')
    }
  } catch { /* SMC اختیاری است */ }
  return events
}

function backtest(rows: Row[]): Acc[] {
  const acc = new Map<string, Acc>()
  const n = rows.length
  if (n < MIN_ROWS) return []

  const closes = rows.map(r => Number(r.close))
  const vols = rows.map(r => Number(r.volume) || 0)
  const adjCloses = rows.map(r => (r.adj_close != null && Number(r.adj_close) > 0) ? Number(r.adj_close) : Number(r.close))

  const s50 = sma(closes, 50)
  const s200 = sma(closes, 200)
  const rArr = rsi(closes)
  const macdPts = macd(closes)
  const smcEvents = buildSmcEvents(rows)
  const maxHorizon = Math.max(...HORIZONS)

  for (let i = LOOKBACK; i < n - maxHorizon; i++) {
    const signals: { key: string; bias: 'bull' | 'bear' }[] = []

    if (s50[i] !== null && s50[i - 1] !== null && s200[i] !== null && s200[i - 1] !== null) {
      if (s50[i]! > s200[i]! && s50[i - 1]! <= s200[i - 1]!) signals.push({ key: 'golden_cross', bias: 'bull' })
      if (s50[i]! < s200[i]! && s50[i - 1]! >= s200[i - 1]!) signals.push({ key: 'death_cross', bias: 'bear' })
    }
    if (rArr[i] !== null) {
      if (rArr[i]! <= 30) signals.push({ key: 'rsi_oversold', bias: 'bull' })
      if (rArr[i]! >= 70) signals.push({ key: 'rsi_overbought', bias: 'bear' })
    }
    const h0 = macdPts[i]?.hist, h1 = macdPts[i - 1]?.hist
    if (h0 != null && h1 != null) {
      if (h0 > 0 && h1 <= 0) signals.push({ key: 'macd_cross_up', bias: 'bull' })
      if (h0 < 0 && h1 >= 0) signals.push({ key: 'macd_cross_down', bias: 'bear' })
    }
    if (i >= 20) {
      let sum = 0
      for (let j = i - 20; j < i; j++) sum += vols[j]
      const avg20 = sum / 20
      if (avg20 > 0 && vols[i] / avg20 >= 2.5) signals.push({ key: 'vol_spike', bias: closes[i] >= closes[i - 1] ? 'bull' : 'bear' })
    }
    {
      const from = Math.max(0, i - 252 + 1)
      let maxClose = -Infinity, minClose = Infinity
      for (let j = from; j < i; j++) { if (closes[j] > maxClose) maxClose = closes[j]; if (closes[j] < minClose) minClose = closes[j] }
      if (maxClose > -Infinity) {
        if (closes[i] > maxClose) signals.push({ key: 'new_high_52w', bias: 'bull' })
        if (closes[i] < minClose) signals.push({ key: 'new_low_52w', bias: 'bear' })
      }
    }
    const smcHere = smcEvents.get(i)
    if (smcHere) for (const s of smcHere) signals.push(s)

    if (signals.length === 0) continue
    const entry = adjCloses[i]
    if (!(entry > 0)) continue

    for (const sig of signals) {
      for (const h of HORIZONS) {
        const exit = adjCloses[i + h]
        if (!(exit > 0)) continue
        const ret = (exit - entry) / entry * 100
        const win = sig.bias === 'bull' ? ret > 0 : ret < 0
        const accKey = `${sig.key}|${h}`
        let a = acc.get(accKey)
        if (!a) { a = { signal_key: sig.key, horizon_days: h, bias: sig.bias, count: 0, winCount: 0, sumReturn: 0, returns: [] }; acc.set(accKey, a) }
        a.count++
        if (win) a.winCount++
        a.sumReturn += ret
        a.returns.push(ret)
      }
    }
  }
  return [...acc.values()]
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim()
  if (!symbol) return NextResponse.json({ error: 'symbol الزامی است' }, { status: 400 })

  const rows = await fetchCandles(symbol)
  if (rows.length < MIN_ROWS) {
    return NextResponse.json({ symbol, rows: [], error: 'داده تاریخی کافی برای این نماد نیست' })
  }

  const acc = backtest(rows)
  const stats = acc.map(a => ({
    signal_key: a.signal_key, horizon_days: a.horizon_days, bias: a.bias,
    sample_count: a.count, win_rate: (a.winCount / a.count) * 100,
    avg_return_pct: a.sumReturn / a.count, median_return_pct: median(a.returns),
  }))
  return NextResponse.json({ symbol, rows: stats })
}
