'use client'

// ترمینال تحلیل تکنیکال — KLineChart v10
// اندیکاتورهای آماده کتابخانه + ابزار رسم تعاملی + تایم‌فریم روزانه/هفتگی/ماهانه
// تاریخ‌ها شمسی (formatter)، اعداد fa-IR

import { useEffect, useRef, useState } from 'react'
import { init, dispose, registerLocale, registerOverlay, type Chart, type KLineData, type OverlayCreate } from 'klinecharts'
import type { Candle } from '../../lib/indicators'
import { swingHighsLows, fvg, bosChoch, orderBlocks, liquidity } from '../../lib/smc'
import { GREEN, RED } from './colors'

type PeriodType = 'day' | 'week' | 'month'

const PERIODS: { type: PeriodType; label: string }[] = [
  { type: 'day', label: 'روزانه' },
  { type: 'week', label: 'هفتگی' },
  { type: 'month', label: 'ماهانه' },
]

// اندیکاتورهای روی نمودار اصلی
const MAIN_INDICATORS = [
  { name: 'MA',   label: 'میانگین متحرک (MA)' },
  { name: 'EMA',  label: 'میانگین نمایی (EMA)' },
  { name: 'BOLL', label: 'باند بولینگر' },
  { name: 'SAR',  label: 'پارابولیک سار' },
  { name: 'BBI',  label: 'BBI' },
]

// اسیلاتورها — pane جدا
const SUB_INDICATORS = [
  { name: 'VOL',  label: 'حجم معاملات' },
  { name: 'MACD', label: 'مکدی (MACD)' },
  { name: 'RSI',  label: 'شاخص قدرت نسبی (RSI)' },
  { name: 'KDJ',  label: 'استوکاستیک (KDJ)' },
  { name: 'CCI',  label: 'CCI' },
  { name: 'WR',   label: 'ویلیامز (W%R)' },
  { name: 'OBV',  label: 'حجم تعادلی (OBV)' },
]

// ابزارهای رسم — نام‌های آماده کتابخانه
const DRAW_TOOLS = [
  { name: 'segment',               label: 'خط روند' },
  { name: 'straightLine',          label: 'خط نامحدود' },
  { name: 'rayLine',               label: 'نیم‌خط' },
  { name: 'horizontalStraightLine', label: 'خط افقی' },
  { name: 'verticalStraightLine',  label: 'خط عمودی' },
  { name: 'priceLine',             label: 'خط قیمت' },
  { name: 'priceChannelLine',      label: 'کانال قیمت' },
  { name: 'parallelStraightLine',  label: 'خطوط موازی' },
  { name: 'fibonacciLine',         label: 'فیبوناچی' },
  { name: 'simpleAnnotation',      label: 'یادداشت' },
]

// ── تجمیع کندل روزانه به هفتگی (شنبه‌مبنا) / ماهانه (ماه شمسی)
function aggregate(candles: Candle[], period: PeriodType): Candle[] {
  if (period === 'day') return candles
  const buckets = new Map<string, Candle[]>()
  for (const c of candles) {
    let key: string
    if (period === 'month') {
      key = c.shamsi.slice(0, 7) // «1403/08»
    } else {
      const ts = Date.parse(c.time)
      const day = new Date(ts).getUTCDay() // شنبه=6
      const offset = (day + 1) % 7          // شنبه→0 … جمعه→6
      key = String(ts - offset * 86_400_000)
    }
    const arr = buckets.get(key)
    if (arr) arr.push(c)
    else buckets.set(key, [c])
  }
  return [...buckets.values()].map(group => ({
    time: group[0].time,
    shamsi: group[0].shamsi,
    open: group[0].open,
    high: Math.max(...group.map(g => g.high)),
    low: Math.min(...group.map(g => g.low)),
    close: group[group.length - 1].close,
    volume: group.reduce((s, g) => s + g.volume, 0),
  }))
}

// تاریخ شمسی از timestamp — با تقویم فارسی ICU
const shamsiFmt = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })
  : null
const toShamsi = (ts: number) => shamsiFmt ? shamsiFmt.format(new Date(ts)) : String(ts)

// ── اسمارت مانی — گزینه‌های منو + overlay های سفارشی رسم ناحیه/خط
const SMC_ITEMS = [
  { name: 'fvg',       label: 'گپ ارزش منصفانه (FVG)' },
  { name: 'ob',        label: 'اردر بلاک' },
  { name: 'structure', label: 'شکست ساختار (BOS/CHoCH)' },
  { name: 'liquidity', label: 'نقدینگی' },
  { name: 'swings',    label: 'سقف/کف سوئینگ' },
]

type SmcExtend = { color: string; border?: string; label?: string; textColor?: string; dashed?: boolean }

let overlaysRegistered = false
function ensureOverlays() {
  if (overlaysRegistered) return
  overlaysRegistered = true
  // ناحیه (مستطیل) — FVG و اردر بلاک
  registerOverlay({
    name: 'smcZone',
    lock: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const d = (overlay.extendData ?? {}) as SmcExtend
      const [a, b] = coordinates
      const x = Math.min(a.x, b.x)
      const y = Math.min(a.y, b.y)
      const w = Math.max(Math.abs(b.x - a.x), 1)
      const h = Math.max(Math.abs(b.y - a.y), 1)
      const figs = [{
        type: 'rect',
        attrs: { x, y, width: w, height: h },
        styles: { style: 'stroke_fill', color: d.color, borderColor: d.border ?? d.color, borderSize: 1 },
        ignoreEvent: true,
      }]
      if (d.label) {
        figs.push({
          type: 'text',
          attrs: { x: x + 4, y: y + h / 2, text: d.label, baseline: 'middle' },
          styles: { color: d.textColor ?? '#8b93a7', size: 10, backgroundColor: 'transparent' },
          ignoreEvent: true,
        } as never)
      }
      return figs
    },
  })
  // خط سطح — BOS/CHoCH و نقدینگی
  registerOverlay({
    name: 'smcLine',
    lock: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const d = (overlay.extendData ?? {}) as SmcExtend
      const figs = [{
        type: 'line',
        attrs: { coordinates },
        styles: { color: d.color, size: 1, style: d.dashed ? 'dashed' : 'solid' },
        ignoreEvent: true,
      }]
      if (d.label) {
        figs.push({
          type: 'text',
          attrs: { x: coordinates[0].x, y: coordinates[0].y, text: d.label, align: 'left', baseline: 'bottom' },
          styles: { color: d.color, size: 10, backgroundColor: 'transparent' },
          ignoreEvent: true,
        } as never)
      }
      return figs
    },
  })
  // نشانگر سوئینگ — متن تکی
  registerOverlay({
    name: 'smcMark',
    lock: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 1) return []
      const d = (overlay.extendData ?? {}) as SmcExtend
      return [{
        type: 'text',
        attrs: { x: coordinates[0].x, y: coordinates[0].y, text: d.label ?? '', align: 'center', baseline: d.dashed ? 'top' : 'bottom' },
        styles: { color: d.color, size: 10, backgroundColor: 'transparent' },
        ignoreEvent: true,
      }]
    },
  })
}

/** ساخت overlay های یک لایه SMC روی کندل‌های تجمیع‌شده فعلی */
function buildSmcOverlays(kind: string, candles: Candle[]): OverlayCreate[] {
  const n = candles.length
  if (n < 30) return []
  const ts = (i: number) => Date.parse(candles[i].time)
  const lastTs = ts(n - 1)
  const swings = swingHighsLows(candles, 10)
  const out: OverlayCreate[] = []
  const base = { groupId: `smc-${kind}`, paneId: 'candle_pane', lock: true }

  if (kind === 'fvg') {
    const f = fvg(candles)
    const idx: number[] = []
    for (let i = 0; i < n; i++) if (!Number.isNaN(f.fvg[i]) && f.mitigatedIndex[i] === 0) idx.push(i)
    for (const i of idx.slice(-15)) {
      const bull = f.fvg[i] === 1
      out.push({
        ...base, name: 'smcZone',
        points: [{ timestamp: ts(i), value: f.top[i] }, { timestamp: lastTs, value: f.bottom[i] }],
        extendData: {
          color: bull ? 'rgba(38,166,154,0.14)' : 'rgba(239,83,80,0.14)',
          border: bull ? 'rgba(38,166,154,0.35)' : 'rgba(239,83,80,0.35)',
          label: 'FVG', textColor: bull ? GREEN : RED,
        } satisfies SmcExtend,
      })
    }
  }

  if (kind === 'ob') {
    const ob = orderBlocks(candles, swings)
    const idx: number[] = []
    for (let i = 0; i < n; i++) if (!Number.isNaN(ob.ob[i]) && ob.mitigatedIndex[i] === 0) idx.push(i)
    for (const i of idx.slice(-10)) {
      const bull = ob.ob[i] === 1
      out.push({
        ...base, name: 'smcZone',
        points: [{ timestamp: ts(i), value: ob.top[i] }, { timestamp: lastTs, value: ob.bottom[i] }],
        extendData: {
          color: bull ? 'rgba(38,166,154,0.22)' : 'rgba(239,83,80,0.22)',
          border: bull ? 'rgba(38,166,154,0.55)' : 'rgba(239,83,80,0.55)',
          label: `OB ${Math.round(ob.percentage[i])}٪`, textColor: bull ? GREEN : RED,
        } satisfies SmcExtend,
      })
    }
  }

  if (kind === 'structure') {
    const bc = bosChoch(candles, swings)
    const idx: number[] = []
    for (let i = 0; i < n; i++) if (!Number.isNaN(bc.bos[i]) || !Number.isNaN(bc.choch[i])) idx.push(i)
    for (const i of idx.slice(-12)) {
      const isBos = !Number.isNaN(bc.bos[i])
      const dir = isBos ? bc.bos[i] : bc.choch[i]
      const j = Number.isNaN(bc.brokenIndex[i]) ? n - 1 : bc.brokenIndex[i]
      out.push({
        ...base, name: 'smcLine',
        points: [{ timestamp: ts(i), value: bc.level[i] }, { timestamp: ts(j), value: bc.level[i] }],
        extendData: { color: dir === 1 ? GREEN : RED, label: isBos ? 'BOS' : 'CHoCH' } satisfies SmcExtend,
      })
    }
  }

  if (kind === 'liquidity') {
    const liq = liquidity(candles, swings)
    const idx: number[] = []
    for (let i = 0; i < n; i++) if (!Number.isNaN(liq.liquidity[i])) idx.push(i)
    for (const i of idx.slice(-8)) {
      const endIdx = liq.swept[i] > 0 ? liq.swept[i] : (liq.end[i] > 0 ? liq.end[i] : n - 1)
      out.push({
        ...base, name: 'smcLine',
        points: [{ timestamp: ts(i), value: liq.level[i] }, { timestamp: ts(endIdx), value: liq.level[i] }],
        extendData: {
          color: liq.liquidity[i] === 1 ? 'rgba(38,166,154,0.8)' : 'rgba(239,83,80,0.8)',
          label: liq.swept[i] > 0 ? 'نقدینگی (جمع شد)' : 'نقدینگی',
          dashed: true,
        } satisfies SmcExtend,
      })
    }
  }

  if (kind === 'swings') {
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(swings.highLow[i])) continue
      const high = swings.highLow[i] === 1
      out.push({
        ...base, name: 'smcMark',
        points: [{ timestamp: ts(i), value: swings.level[i] }],
        // dashed اینجا یعنی برچسب زیر نقطه بنشیند (کف سوئینگ)
        extendData: { color: high ? RED : GREEN, label: high ? 'سقف' : 'کف', dashed: !high } satisfies SmcExtend,
      })
    }
  }

  return out
}

// برچسب‌های فارسی تولتیپ
let localeRegistered = false
function ensureLocale() {
  if (localeRegistered) return
  try {
    registerLocale('fa-IR', {
      time: 'تاریخ:', open: 'باز:', high: 'بالا:', low: 'پایین:', close: 'پایانی:',
      volume: 'حجم:', change: 'تغییر:', turnover: 'ارزش:',
      second: 'ثانیه', minute: 'دقیقه', hour: 'ساعت', day: 'روز', week: 'هفته', month: 'ماه', year: 'سال',
    })
    localeRegistered = true
  } catch { /* در نسخه‌های بعدی اگر کلید کم بود، en-US پیش‌فرض می‌ماند */ }
}

function chartStyles(isDark: boolean) {
  const grid = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.07)'
  const text = isDark ? '#8b93a7' : '#6B7F90'
  const axis = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,30,46,0.15)'
  return {
    grid: {
      horizontal: { color: grid },
      vertical: { color: grid },
    },
    candle: {
      bar: {
        upColor: GREEN, downColor: RED, noChangeColor: text,
        upBorderColor: GREEN, downBorderColor: RED, noChangeBorderColor: text,
        upWickColor: GREEN, downWickColor: RED, noChangeWickColor: text,
      },
      priceMark: {
        high: { color: text },
        low: { color: text },
        last: { upColor: GREEN, downColor: RED, noChangeColor: text },
      },
      tooltip: {
        title: { color: isDark ? '#E8F4FF' : '#0F1E2E' },
        legend: { color: isDark ? '#E8F4FF' : '#0F1E2E' },
      },
    },
    xAxis: { axisLine: { color: axis }, tickText: { color: text }, tickLine: { color: axis } },
    yAxis: { axisLine: { color: axis }, tickText: { color: text }, tickLine: { color: axis } },
    separator: { color: axis },
    crosshair: {
      horizontal: { line: { color: text }, text: { backgroundColor: isDark ? '#1f2937' : '#334155' } },
      vertical: { line: { color: text }, text: { backgroundColor: isDark ? '#1f2937' : '#334155' } },
    },
  }
}

type Props = {
  symbol: string
  candles: Candle[]   // روزانه، صعودی
  isDark: boolean
}

export default function KlineChart({ symbol, candles, isDark }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)

  const [period, setPeriod] = useState<PeriodType>('day')
  const [mainInds, setMainInds] = useState<string[]>(['MA'])
  const [subInds, setSubInds] = useState<string[]>(['VOL', 'MACD'])
  const [smcActive, setSmcActive] = useState<string[]>([])
  const [openMenu, setOpenMenu] = useState<'main' | 'sub' | 'draw' | 'smc' | null>(null)
  const [isFull, setIsFull] = useState(false)
  const aggregatedRef = useRef<Candle[]>([])
  const smcRef = useRef<string[]>([])
  smcRef.current = smcActive

  // ساخت نمودار + دیتا — با تغییر دیتا/تم/تایم‌فریم از نو
  useEffect(() => {
    const el = containerRef.current
    if (!el || candles.length === 0) return
    ensureLocale()
    ensureOverlays()

    const chart = init(el, {
      locale: localeRegistered ? 'fa-IR' : 'en-US',
      timezone: 'UTC',
      styles: chartStyles(isDark),
      formatter: {
        formatDate: ({ timestamp }: { timestamp: number }) => toShamsi(timestamp),
      },
    })
    if (!chart) return
    chartRef.current = chart

    chart.setSymbol({ ticker: symbol, pricePrecision: 0, volumePrecision: 0 })
    chart.setPeriod({ type: period, span: 1 })

    const aggregated = aggregate(candles, period)
    aggregatedRef.current = aggregated
    const data: KLineData[] = aggregated.map(c => ({
      timestamp: Date.parse(c.time),
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    }))
    chart.setDataLoader({
      getBars: ({ callback }) => callback(data, { backward: false, forward: false }),
    })

    for (const name of mainInds) chart.createIndicator({ name, paneId: 'candle_pane' }, true)
    for (const name of subInds) chart.createIndicator(name)
    for (const kind of smcRef.current) {
      const ovs = buildSmcOverlays(kind, aggregated)
      if (ovs.length) chart.createOverlay(ovs)
    }

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      dispose(el)
      chartRef.current = null
    }
    // اندیکاتورها جدا مدیریت می‌شوند تا رسم‌های کاربر با هر toggle پاک نشود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, isDark, period, symbol])

  const toggleMain = (name: string) => {
    const chart = chartRef.current
    if (!chart) return
    if (mainInds.includes(name)) {
      chart.removeIndicator({ name })
      setMainInds(v => v.filter(x => x !== name))
    } else {
      chart.createIndicator({ name, paneId: 'candle_pane' }, true)
      setMainInds(v => [...v, name])
    }
  }

  const toggleSub = (name: string) => {
    const chart = chartRef.current
    if (!chart) return
    if (subInds.includes(name)) {
      chart.removeIndicator({ name })
      setSubInds(v => v.filter(x => x !== name))
    } else {
      chart.createIndicator(name)
      setSubInds(v => [...v, name])
    }
  }

  const toggleSmc = (kind: string) => {
    const chart = chartRef.current
    if (!chart) return
    if (smcActive.includes(kind)) {
      chart.removeOverlay({ groupId: `smc-${kind}` })
      setSmcActive(v => v.filter(x => x !== kind))
    } else {
      const ovs = buildSmcOverlays(kind, aggregatedRef.current)
      if (ovs.length) chart.createOverlay(ovs)
      setSmcActive(v => [...v, kind])
    }
  }

  const startDraw = (name: string) => {
    chartRef.current?.createOverlay(name)
    setOpenMenu(null)
  }

  const clearDrawings = () => {
    chartRef.current?.removeOverlay()
    setOpenMenu(null)
  }

  const toggleFullscreen = () => {
    const el = wrapperRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
      setIsFull(false)
    } else {
      el.requestFullscreen?.()
      setIsFull(true)
    }
  }
  useEffect(() => {
    const h = () => setIsFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  // ── استایل‌های تولبار
  const panel = isDark ? 'rgba(10,18,30,0.95)' : 'rgba(255,255,255,0.95)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'
  const line  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,30,46,0.1)'

  const btn = (active: boolean): React.CSSProperties => ({
    fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
    padding: '7px 12px', borderRadius: 8, minHeight: 34,
    border: `1px solid ${active ? 'rgba(59,130,246,0.5)' : line}`,
    background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
    color: active ? '#3b82f6' : muted,
    transition: 'all 0.2s',
  })

  const menuBox: React.CSSProperties = {
    position: 'absolute', top: '100%', right: 0, zIndex: 60, marginTop: 6,
    minWidth: 220, maxHeight: 320, overflowY: 'auto',
    background: isDark ? '#12161f' : '#fffdf8', borderRadius: 12, padding: 6,
    border: `1px solid ${line}`,
    boxShadow: isDark ? '0 18px 50px rgba(0,0,0,0.6)' : '0 14px 40px rgba(0,0,0,0.14)',
  }

  const menuItem = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    width: '100%', textAlign: 'right', cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 12.5, padding: '10px 12px', borderRadius: 8, border: 'none',
    background: 'transparent',
    color: active ? '#3b82f6' : text,
  })

  const Check = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )

  const dropdown = (
    key: 'main' | 'sub' | 'draw' | 'smc',
    label: string,
    items: { name: string; label: string }[],
    activeSet: string[] | null,
    onPick: (name: string) => void,
  ) => (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpenMenu(openMenu === key ? null : key)} aria-expanded={openMenu === key}
        style={{ ...btn(openMenu === key || Boolean(activeSet && activeSet.length > 0)), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {openMenu === key && (
        <div style={menuBox}>
          {items.map(it => {
            const active = activeSet ? activeSet.includes(it.name) : false
            return (
              <button key={it.name} onClick={() => onPick(it.name)} style={menuItem(active)}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <span>{it.label}</span>
                {active && <Check />}
              </button>
            )
          })}
          {key === 'draw' && (
            <button onClick={clearDrawings} style={{ ...menuItem(false), color: RED, borderTop: `1px solid ${line}`, borderRadius: 0, marginTop: 4 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,83,80,0.1)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <span>پاک کردن همه رسم‌ها</span>
            </button>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div ref={wrapperRef} style={{
      background: isFull ? (isDark ? '#060B14' : '#F4F7FB') : 'transparent',
      display: 'flex', flexDirection: 'column',
      height: isFull ? '100vh' : undefined,
    }}>
      {/* تولبار */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        padding: '10px 12px', borderRadius: isFull ? 0 : 14, marginBottom: 10,
        background: panel, border: `1px solid ${line}`,
        position: 'relative', zIndex: 20,
      }}>
        {PERIODS.map(p => (
          <button key={p.type} onClick={() => { setPeriod(p.type); setOpenMenu(null) }} style={btn(period === p.type)}>
            {p.label}
          </button>
        ))}
        <div style={{ width: 1, height: 20, background: line }} />
        {dropdown('main', 'اندیکاتور', MAIN_INDICATORS, mainInds, toggleMain)}
        {dropdown('sub', 'اسیلاتور', SUB_INDICATORS, subInds, toggleSub)}
        {dropdown('smc', 'اسمارت مانی', SMC_ITEMS, smcActive, toggleSmc)}
        {dropdown('draw', 'ابزار رسم', DRAW_TOOLS, null, startDraw)}
        <button onClick={toggleFullscreen} style={{ ...btn(isFull), marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          aria-label={isFull ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
            {isFull
              ? <><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></>
              : <><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>}
          </svg>
          {isFull ? 'خروج' : 'تمام‌صفحه'}
        </button>
      </div>

      {/* بوم نمودار — کانواس LTR */}
      <div ref={containerRef} style={{
        direction: 'ltr', width: '100%',
        height: isFull ? 'auto' : 560, flex: isFull ? 1 : undefined, minHeight: 320,
      }} />
    </div>
  )
}
