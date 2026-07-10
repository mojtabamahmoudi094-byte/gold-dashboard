'use client'

// ترمینال تحلیل تکنیکال به سبک TradingView — KLineChart v10
// نوار ابزار بالا (نوع کندل، تایم‌فریم، اندیکاتورها، اسمارت مانی، مقایسه، undo/redo،
// قالب، ذخیره نما، اسکرین‌شات، تمام‌صفحه) + ریل عمودی ابزار رسم در کنار نمودار

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  init, dispose, registerLocale, registerOverlay, registerIndicator,
  type Chart, type KLineData, type OverlayCreate, type CandleType,
} from 'klinecharts'
import { supabase } from '../../lib/supabase'
import type { Candle } from '../../lib/indicators'
import { swingHighsLows, fvg, bosChoch, orderBlocks, liquidity } from '../../lib/smc'
import { registerCustomIndicators } from '../../lib/klineIndicators'
import { GREEN, RED } from './colors'

type PeriodType = 'day' | 'week' | 'month'

const PERIODS: { type: PeriodType; label: string }[] = [
  { type: 'day', label: 'روزانه' },
  { type: 'week', label: 'هفتگی' },
  { type: 'month', label: 'ماهانه' },
]

const CANDLE_TYPES: { name: CandleType; label: string }[] = [
  { name: 'candle_solid', label: 'شمعی' },
  { name: 'candle_stroke', label: 'شمعی توخالی' },
  { name: 'ohlc', label: 'میله‌ای (OHLC)' },
  { name: 'area', label: 'خطی (ناحیه‌ای)' },
  { name: 'candle_up_stroke', label: 'ستونی (صعودی توخالی)' },
]

const MAIN_INDICATORS = [
  { name: 'MA', label: 'میانگین متحرک (MA)' },
  { name: 'EMA', label: 'میانگین نمایی (EMA)' },
  { name: 'BOLL', label: 'باند بولینگر' },
  { name: 'ICHIMOKU', label: 'ابر ایچیموکو' },
  { name: 'SUPERTREND', label: 'سوپرترند' },
  { name: 'VWAP', label: 'VWAP' },
  { name: 'SAR', label: 'پارابولیک سار' },
  { name: 'BBI', label: 'BBI' },
]

const SUB_INDICATORS = [
  { name: 'VOL', label: 'حجم معاملات' },
  { name: 'MACD', label: 'مکدی (MACD)' },
  { name: 'RSI', label: 'شاخص قدرت نسبی (RSI)' },
  { name: 'KDJ', label: 'استوکاستیک (KDJ)' },
  { name: 'ATR', label: 'میانگین دامنه (ATR)' },
  { name: 'MFI', label: 'جریان نقدینگی (MFI)' },
  { name: 'CCI', label: 'CCI' },
  { name: 'WR', label: 'ویلیامز (W%R)' },
  { name: 'OBV', label: 'حجم تعادلی (OBV)' },
  { name: 'DMI', label: 'ADX / DMI' },
]

// ابزارهای رسم — ریل عمودی سمت راست (RTL) با آیکون
const DRAW_TOOLS: { name: string; label: string; icon: string }[] = [
  { name: 'segment', label: 'خط روند', icon: 'M4 20 L20 4' },
  { name: 'straightLine', label: 'خط نامحدود', icon: 'M2 22 L22 2 M5 22 L2 19 M22 5 L19 2' },
  { name: 'rayLine', label: 'نیم‌خط', icon: 'M4 20 L20 4 L20 9 M20 4 L15 4' },
  { name: 'horizontalStraightLine', label: 'خط افقی', icon: 'M3 12 L21 12' },
  { name: 'verticalStraightLine', label: 'خط عمودی', icon: 'M12 3 L12 21' },
  { name: 'priceLine', label: 'خط قیمت', icon: 'M3 14 L21 14 M4 8 L8 8' },
  { name: 'priceChannelLine', label: 'کانال قیمت', icon: 'M3 16 L17 4 M7 20 L21 8' },
  { name: 'parallelStraightLine', label: 'خطوط موازی', icon: 'M3 15 L15 3 M9 21 L21 9' },
  { name: 'fibonacciLine', label: 'فیبوناچی', icon: 'M4 6 L20 6 M4 12 L20 12 M4 18 L20 18' },
  { name: 'simpleAnnotation', label: 'یادداشت', icon: 'M5 19 L19 19 M12 5 L12 15 M8 8 L12 5 L16 8' },
]
const DRAW_TOOL_NAMES = new Set(DRAW_TOOLS.map(t => t.name))

const SMC_ITEMS = [
  { name: 'fvg', label: 'گپ ارزش منصفانه (FVG)' },
  { name: 'ob', label: 'اردر بلاک' },
  { name: 'structure', label: 'شکست ساختار (BOS/CHoCH)' },
  { name: 'liquidity', label: 'نقدینگی' },
  { name: 'swings', label: 'سقف/کف سوئینگ' },
]

const CMP_COLORS = ['#3b82f6', '#d97706', '#ec4899', '#0891b2', '#8b5cf6']

// ── تجمیع کندل روزانه به هفتگی (شنبه‌مبنا) / ماهانه (ماه شمسی)
function aggregate(candles: Candle[], period: PeriodType): Candle[] {
  if (period === 'day') return candles
  const buckets = new Map<string, Candle[]>()
  for (const c of candles) {
    let key: string
    if (period === 'month') {
      key = c.shamsi.slice(0, 7)
    } else {
      const ts = Date.parse(c.time)
      const day = new Date(ts).getUTCDay()
      const offset = (day + 1) % 7
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

const shamsiFmt = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })
  : null
const toShamsi = (ts: number) => shamsiFmt ? shamsiFmt.format(new Date(ts)) : String(ts)

// ── اسمارت مانی — overlay های سفارشی
type SmcExtend = { color: string; border?: string; label?: string; textColor?: string; dashed?: boolean }

let overlaysRegistered = false
function ensureOverlays() {
  if (overlaysRegistered) return
  overlaysRegistered = true
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
        extendData: { color: high ? RED : GREEN, label: high ? 'سقف' : 'کف', dashed: !high } satisfies SmcExtend,
      })
    }
  }

  return out
}

// ── مقایسه نمادها — اندیکاتور داینامیک، مقدار rebase شده روی قیمت نماد اصلی
const cmpData: Record<string, Map<number, number>> = {}
const cmpRegistered = new Set<string>()

function ensureCompareIndicator(sym: string, color: string) {
  const name = `CMP_${sym}`
  if (cmpRegistered.has(name)) return name
  cmpRegistered.add(name)
  registerIndicator<{ v?: number }>({
    name,
    shortName: sym,
    series: 'price',
    precision: 0,
    calcParams: [],
    figures: [{ key: 'v', title: `${sym}: `, type: 'line' }],
    styles: { lines: [{ color }] },
    calc: (dataList) => {
      const map = cmpData[name]
      if (!map) return dataList.map(() => ({}))
      return dataList.map(d => {
        const v = map.get(d.timestamp)
        return v !== undefined ? { v } : {}
      })
    },
  })
  return name
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
  } catch { /* اگر کلید کم بود en-US می‌ماند */ }
}

// پس‌زمینه نمودار مطابق TradingView: تیره #131722 / روشن #ffffff
export const CHART_BG = { dark: '#131722', light: '#ffffff' }

function chartStyles(isDark: boolean, candleType: CandleType) {
  const grid = isDark ? 'rgba(255,255,255,0.06)' : '#f0f3fa'
  const text = isDark ? '#8b93a7' : '#787b86'
  const axis = isDark ? 'rgba(255,255,255,0.12)' : '#e0e3eb'
  return {
    grid: { horizontal: { color: grid }, vertical: { color: grid } },
    candle: {
      type: candleType,
      bar: {
        upColor: GREEN, downColor: RED, noChangeColor: text,
        upBorderColor: GREEN, downBorderColor: RED, noChangeBorderColor: text,
        upWickColor: GREEN, downWickColor: RED, noChangeWickColor: text,
      },
      area: {
        lineColor: '#3b82f6', lineSize: 2,
        backgroundColor: [
          { offset: 0, color: 'rgba(59,130,246,0.01)' },
          { offset: 1, color: 'rgba(59,130,246,0.2)' },
        ],
      },
      priceMark: {
        high: { color: text },
        low: { color: text },
        last: { upColor: GREEN, downColor: RED, noChangeColor: text },
      },
      tooltip: {
        title: { color: isDark ? '#E8F4FF' : '#131722' },
        legend: { color: isDark ? '#E8F4FF' : '#131722' },
      },
    },
    indicator: {
      tooltip: {
        // دکمه ضربدر کنار نام هر اندیکاتور — حذف با یک کلیک (مثل TradingView)
        features: [{
          id: 'ind_close',
          position: 'right',
          type: 'path',
          content: { path: 'M2 2 L8 8 M8 2 L2 8', style: 'stroke', lineWidth: 1.5 },
          size: 9,
          color: text,
          activeColor: RED,
          backgroundColor: 'transparent',
          activeBackgroundColor: 'transparent',
          marginLeft: 6, marginRight: 2, marginTop: 0, marginBottom: 0,
          paddingLeft: 2, paddingRight: 2, paddingTop: 2, paddingBottom: 2,
        }],
      },
    },
    xAxis: { axisLine: { color: axis }, tickText: { color: text }, tickLine: { color: axis } },
    yAxis: { axisLine: { color: axis }, tickText: { color: text }, tickLine: { color: axis } },
    separator: { color: axis },
    crosshair: {
      horizontal: { line: { color: text }, text: { backgroundColor: isDark ? '#363a45' : '#131722' } },
      vertical: { line: { color: text }, text: { backgroundColor: isDark ? '#363a45' : '#131722' } },
    },
  }
}

type ChartConfig = {
  candleType: CandleType
  period: PeriodType
  mainInds: string[]
  subInds: string[]
  smcActive: string[]
  compares: string[]
}

type DrawingSave = { name: string; points: { timestamp?: number; value?: number }[] }
type SavedLayout = { id?: string; name: string; config: ChartConfig }
type SavedSnapshot = { id?: string; name: string; symbol: string; config: ChartConfig; drawings: DrawingSave[] }

type Props = {
  symbol: string
  candles: Candle[]
  isDark: boolean
}

export default function KlineChart({ symbol, candles, isDark }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)

  const [period, setPeriod] = useState<PeriodType>('day')
  const [candleType, setCandleType] = useState<CandleType>('candle_solid')
  const [mainInds, setMainInds] = useState<string[]>(['MA'])
  const [subInds, setSubInds] = useState<string[]>(['VOL', 'MACD'])
  const [smcActive, setSmcActive] = useState<string[]>([])
  const [compares, setCompares] = useState<string[]>([])
  const [cmpInput, setCmpInput] = useState('')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [isFull, setIsFull] = useState(false)
  const [toast, setToast] = useState('')
  const [layouts, setLayouts] = useState<SavedLayout[]>([])
  const [snapshots, setSnapshots] = useState<SavedSnapshot[]>([])
  const [layoutName, setLayoutName] = useState('')
  const [, setStackVersion] = useState(0)
  const [rebuildKey, setRebuildKey] = useState(0)

  const aggregatedRef = useRef<Candle[]>([])
  const stateRef = useRef({ mainInds, subInds, smcActive, compares })
  stateRef.current = { mainInds, subInds, smcActive, compares }
  const undoStack = useRef<Array<DrawingSave & { id: string }>>([])
  const redoStack = useRef<Array<DrawingSave & { id: string }>>([])
  const pendingDrawings = useRef<DrawingSave[] | null>(null)
  const cmpCandles = useRef<Map<string, Candle[]>>(new Map())
  const userId = useRef<string | null>(null)

  const bump = () => setStackVersion(v => v + 1)
  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2600) }

  // ── کاربر + قالب‌ها و نماهای ذخیره‌شده
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      userId.current = data.user?.id ?? null
      if (userId.current) {
        supabase.from('chart_layouts').select('id, kind, name, symbol, config')
          .order('created_at', { ascending: false })
          .then(({ data: rows }) => {
            if (!rows) return
            setLayouts(rows.filter(r => r.kind === 'layout').map(r => ({ id: r.id, name: r.name, config: r.config as ChartConfig })))
            setSnapshots(rows.filter(r => r.kind === 'snapshot').map(r => ({
              id: r.id, name: r.name, symbol: r.symbol ?? '',
              config: (r.config as { config: ChartConfig }).config ?? (r.config as ChartConfig),
              drawings: (r.config as { drawings?: DrawingSave[] }).drawings ?? [],
            })))
          })
      } else {
        try {
          setLayouts(JSON.parse(localStorage.getItem('ta-layouts') ?? '[]'))
          setSnapshots(JSON.parse(localStorage.getItem('ta-snapshots') ?? '[]'))
        } catch { /* خراب بود — خالی */ }
      }
    })
  }, [])

  // ── ساخت نمودار
  useEffect(() => {
    const el = containerRef.current
    if (!el || candles.length === 0) return
    ensureLocale()
    ensureOverlays()
    registerCustomIndicators()

    const chart = init(el, {
      locale: localeRegistered ? 'fa-IR' : 'en-US',
      timezone: 'UTC',
      styles: chartStyles(isDark, candleType) as never,
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

    const st = stateRef.current
    for (const name of st.mainInds) chart.createIndicator({ name, paneId: 'candle_pane' }, true)
    for (const name of st.subInds) chart.createIndicator(name)
    for (const kind of st.smcActive) {
      const ovs = buildSmcOverlays(kind, aggregated)
      if (ovs.length) chart.createOverlay(ovs)
    }
    for (const sym of st.compares) applyCompare(chart, sym, aggregated)

    // حذف اندیکاتور با ضربدر تولتیپ
    chart.subscribeAction('onIndicatorTooltipFeatureClick', (raw: unknown) => {
      const d = raw as { indicator?: { name?: string; paneId?: string }; feature?: { id?: string }; featureId?: string }
      const fid = d.feature?.id ?? d.featureId
      const name = d.indicator?.name
      if (fid !== 'ind_close' || !name) return
      chart.removeIndicator({ name, paneId: d.indicator?.paneId })
      if (name.startsWith('CMP_')) setCompares(v => v.filter(x => `CMP_${x}` !== name))
      else {
        setMainInds(v => v.filter(x => x !== name))
        setSubInds(v => v.filter(x => x !== name))
      }
    })

    // بازگردانی رسم‌های نمای ذخیره‌شده
    if (pendingDrawings.current) {
      for (const dr of pendingDrawings.current) {
        chart.createOverlay({ name: dr.name, points: dr.points })
      }
      pendingDrawings.current = null
    }

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      dispose(el)
      chartRef.current = null
      undoStack.current = []
      redoStack.current = []
    }
    // اندیکاتور/رسم‌ها جدا مدیریت می‌شوند تا toggle باعث پاک‌شدن بقیه نشود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, isDark, period, symbol, rebuildKey])

  // نوع کندل بدون بازسازی
  useEffect(() => {
    chartRef.current?.setStyles({ candle: { type: candleType } })
  }, [candleType])

  // ── مقایسه
  const rebaseCompare = (sym: string, aggregated: Candle[]) => {
    const raw = cmpCandles.current.get(sym)
    if (!raw || aggregated.length === 0) return null
    const cAgg = aggregate(raw, period)
    const cMap = new Map(cAgg.map(c => [Date.parse(c.time), c.close]))
    let factor: number | null = null
    for (const m of aggregated) {
      const ts = Date.parse(m.time)
      const cv = cMap.get(ts)
      if (cv !== undefined && cv > 0) { factor = m.close / cv; break }
    }
    if (factor === null) return null
    const out = new Map<number, number>()
    for (const [ts, cv] of cMap) out.set(ts, cv * factor)
    return out
  }

  function applyCompare(chart: Chart, sym: string, aggregated: Candle[]) {
    const map = rebaseCompare(sym, aggregated)
    if (!map) return
    const color = CMP_COLORS[stateRef.current.compares.indexOf(sym) % CMP_COLORS.length]
    const name = ensureCompareIndicator(sym, color)
    cmpData[name] = map
    chart.createIndicator({ name, paneId: 'candle_pane' }, true)
  }

  const addCompare = async () => {
    const sym = cmpInput.trim().replace(/\s+/g, ' ')
    if (!sym || sym === symbol || compares.includes(sym)) { setCmpInput(''); return }
    if (!cmpCandles.current.has(sym)) {
      const { data } = await supabase
        .from('stock_candles')
        .select('trade_date, trade_date_shamsi, open, high, low, close, volume')
        .eq('symbol', sym)
        .order('trade_date', { ascending: true })
      if (!data || data.length === 0) { notify(`داده‌ای برای «${sym}» پیدا نشد`); return }
      cmpCandles.current.set(sym, data.map(r => ({
        time: r.trade_date as string, shamsi: r.trade_date_shamsi as string,
        open: (r.open ?? r.close) as number, high: (r.high ?? r.close) as number,
        low: (r.low ?? r.close) as number, close: r.close as number, volume: (r.volume ?? 0) as number,
      })))
    }
    setCompares(v => [...v, sym])
    setCmpInput('')
    const chart = chartRef.current
    if (chart) {
      stateRef.current = { ...stateRef.current, compares: [...compares, sym] }
      applyCompare(chart, sym, aggregatedRef.current)
    }
  }

  const removeCompare = (sym: string) => {
    chartRef.current?.removeIndicator({ name: `CMP_${sym}` })
    setCompares(v => v.filter(x => x !== sym))
  }

  // ── toggle ها
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

  // ── رسم + undo/redo بی‌نهایت
  const startDraw = (name: string) => {
    chartRef.current?.createOverlay({
      name,
      onDrawEnd: (e: unknown) => {
        const o = (e as { overlay?: { id: string; name: string; points: DrawingSave['points'] } }).overlay
        if (!o) return
        undoStack.current.push({ id: o.id, name: o.name, points: o.points.map(p => ({ ...p })) })
        redoStack.current = []
        bump()
      },
    })
  }
  const undo = () => {
    const it = undoStack.current.pop()
    if (!it) return
    chartRef.current?.removeOverlay({ id: it.id })
    redoStack.current.push(it)
    bump()
  }
  const redo = () => {
    const it = redoStack.current.pop()
    if (!it) return
    const id = chartRef.current?.createOverlay({ name: it.name, points: it.points })
    if (typeof id === 'string') it.id = id
    undoStack.current.push(it)
    bump()
  }
  const clearDrawings = () => {
    const chart = chartRef.current
    if (!chart) return
    for (const o of chart.getOverlays({})) {
      if (DRAW_TOOL_NAMES.has(o.name)) chart.removeOverlay({ id: o.id })
    }
    undoStack.current = []
    redoStack.current = []
    bump()
  }

  // ── قالب و نمای ذخیره‌شده
  const currentConfig = (): ChartConfig => ({ candleType, period, mainInds, subInds, smcActive, compares })

  const applyConfig = useCallback((cfg: ChartConfig, drawings?: DrawingSave[]) => {
    setCandleType(cfg.candleType)
    setPeriod(cfg.period)
    setMainInds(cfg.mainInds)
    setSubInds(cfg.subInds)
    setSmcActive(cfg.smcActive)
    setCompares(cfg.compares ?? [])
    stateRef.current = {
      mainInds: cfg.mainInds, subInds: cfg.subInds,
      smcActive: cfg.smcActive, compares: cfg.compares ?? [],
    }
    if (drawings) pendingDrawings.current = drawings
    setRebuildKey(k => k + 1)
    setOpenMenu(null)
  }, [])

  const persistLayouts = async (next: SavedLayout[]) => {
    setLayouts(next)
    if (!userId.current) localStorage.setItem('ta-layouts', JSON.stringify(next))
  }
  const saveLayout = async () => {
    const name = layoutName.trim() || `قالب ${layouts.length + 1}`
    const item: SavedLayout = { name, config: currentConfig() }
    if (userId.current) {
      const { data } = await supabase.from('chart_layouts')
        .insert({ user_id: userId.current, kind: 'layout', name, config: item.config })
        .select('id').single()
      item.id = data?.id
    }
    await persistLayouts([item, ...layouts])
    setLayoutName('')
    notify(`قالب «${name}» ذخیره شد`)
  }
  const deleteLayout = async (i: number) => {
    const it = layouts[i]
    if (it.id && userId.current) await supabase.from('chart_layouts').delete().eq('id', it.id)
    await persistLayouts(layouts.filter((_, k) => k !== i))
  }

  const collectDrawings = (): DrawingSave[] => {
    const chart = chartRef.current
    if (!chart) return []
    return chart.getOverlays({})
      .filter(o => DRAW_TOOL_NAMES.has(o.name))
      .map(o => ({ name: o.name, points: o.points.map(p => ({ timestamp: p.timestamp, value: p.value })) }))
  }
  const saveSnapshot = async () => {
    const now = new Date()
    const name = `${symbol} ${toShamsi(now.getTime())} ${now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`
    const item: SavedSnapshot = { name, symbol, config: currentConfig(), drawings: collectDrawings() }
    if (userId.current) {
      const { data } = await supabase.from('chart_layouts')
        .insert({ user_id: userId.current, kind: 'snapshot', name, symbol, config: { config: item.config, drawings: item.drawings } })
        .select('id').single()
      item.id = data?.id
    }
    const next = [item, ...snapshots]
    setSnapshots(next)
    if (!userId.current) localStorage.setItem('ta-snapshots', JSON.stringify(next))
    notify(`نما ذخیره شد: ${name}`)
  }
  const deleteSnapshot = async (i: number) => {
    const it = snapshots[i]
    if (it.id && userId.current) await supabase.from('chart_layouts').delete().eq('id', it.id)
    const next = snapshots.filter((_, k) => k !== i)
    setSnapshots(next)
    if (!userId.current) localStorage.setItem('ta-snapshots', JSON.stringify(next))
  }

  // ── اسکرین‌شات
  const screenshotUrl = () =>
    chartRef.current?.getConvertPictureUrl(true, 'png', isDark ? CHART_BG.dark : CHART_BG.light) ?? ''
  const shotFileName = () => `${symbol}-${toShamsi(Date.now()).replace(/\//g, '-')}.png`

  const downloadShot = () => {
    const url = screenshotUrl()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = shotFileName()
    a.click()
    setOpenMenu(null)
  }
  const copyShot = async () => {
    try {
      const url = screenshotUrl()
      const blob = await (await fetch(url)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      notify('تصویر کپی شد')
    } catch {
      notify('کپی تصویر در این مرورگر پشتیبانی نمی‌شود')
    }
    setOpenMenu(null)
  }
  const copyShotLink = async () => {
    try {
      const url = screenshotUrl()
      const blob = await (await fetch(url)).blob()
      const path = `${symbol}-${Date.now()}.png`
      const { error } = await supabase.storage.from('chart-images').upload(path, blob, { contentType: 'image/png' })
      if (error) throw error
      const { data } = supabase.storage.from('chart-images').getPublicUrl(path)
      await navigator.clipboard.writeText(data.publicUrl)
      notify('لینک تصویر کپی شد')
    } catch {
      notify('آپلود نشد — برای لینک باید وارد شده باشید و باکت chart-images ساخته شده باشد')
    }
    setOpenMenu(null)
  }

  const toggleFullscreen = () => {
    const el = wrapperRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }
  useEffect(() => {
    const h = () => setIsFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  // ── استایل‌ها
  const panel = isDark ? '#1e222d' : '#ffffff'
  const text  = isDark ? '#d1d4dc' : '#131722'
  const muted = isDark ? '#8b93a7' : '#787b86'
  const line  = isDark ? '#2a2e39' : '#e0e3eb'
  const chartBg = isDark ? CHART_BG.dark : CHART_BG.light

  const btn = (active: boolean): React.CSSProperties => ({
    fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
    padding: '6px 10px', borderRadius: 6, minHeight: 32,
    border: '1px solid transparent',
    background: active ? (isDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.12)') : 'transparent',
    color: active ? '#3b82f6' : muted,
    transition: 'all 0.15s',
  })

  const menuBox: React.CSSProperties = {
    position: 'absolute', top: '100%', right: 0, zIndex: 80, marginTop: 4,
    minWidth: 230, maxHeight: 340, overflowY: 'auto',
    background: panel, borderRadius: 8, padding: 5,
    border: `1px solid ${line}`,
    boxShadow: isDark ? '0 12px 40px rgba(0,0,0,0.6)' : '0 8px 30px rgba(0,0,0,0.14)',
  }

  const menuItem = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    width: '100%', textAlign: 'right', cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 12.5, padding: '9px 11px', borderRadius: 6, border: 'none',
    background: 'transparent',
    color: active ? '#3b82f6' : text,
  })

  const sectionTitle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, color: muted, padding: '7px 11px 4px',
  }

  const Check = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none', flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
  const XIcon = () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ pointerEvents: 'none', flexShrink: 0 }}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
  const Chevron = () => (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )

  const menuBtn = (key: string, label: React.ReactNode, active = false) => (
    <button onClick={() => setOpenMenu(openMenu === key ? null : key)} aria-expanded={openMenu === key}
      style={{ ...btn(openMenu === key || active), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {label}
      <Chevron />
    </button>
  )

  const checkItem = (it: { name: string; label: string }, activeSet: string[], onPick: (n: string) => void) => (
    <button key={it.name} onClick={() => onPick(it.name)} style={menuItem(activeSet.includes(it.name))}
      onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(19,23,34,0.05)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
      <span>{it.label}</span>
      {activeSet.includes(it.name) && <Check />}
    </button>
  )

  const canUndo = undoStack.current.length > 0
  const canRedo = redoStack.current.length > 0

  return (
    <div ref={wrapperRef} style={{
      display: 'flex', flexDirection: 'column', position: 'relative',
      height: isFull ? '100vh' : undefined,
      background: chartBg,
      border: `1px solid ${line}`, borderRadius: isFull ? 0 : 10, overflow: 'hidden',
    }}>
      {/* ── نوار ابزار بالا */}
      <div style={{
        display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center',
        padding: '6px 10px', background: panel, borderBottom: `1px solid ${line}`,
        position: 'relative', zIndex: 40,
      }}>
        {/* نوع کندل */}
        <div style={{ position: 'relative' }}>
          {menuBtn('ctype', CANDLE_TYPES.find(c => c.name === candleType)?.label ?? 'شمعی')}
          {openMenu === 'ctype' && (
            <div style={menuBox}>
              {CANDLE_TYPES.map(c => (
                <button key={c.name} onClick={() => { setCandleType(c.name); setOpenMenu(null) }} style={menuItem(candleType === c.name)}
                  onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(19,23,34,0.05)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <span>{c.label}</span>
                  {candleType === c.name && <Check />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 18, background: line, margin: '0 4px' }} />

        {PERIODS.map(p => (
          <button key={p.type} onClick={() => { setPeriod(p.type); setOpenMenu(null) }} style={btn(period === p.type)}>
            {p.label}
          </button>
        ))}

        <div style={{ width: 1, height: 18, background: line, margin: '0 4px' }} />

        {/* اندیکاتورها — یک دکمه مثل TradingView */}
        <div style={{ position: 'relative' }}>
          {menuBtn('inds', (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                <path d="M3 17 L9 11 L13 15 L21 7" /><circle cx="9" cy="11" r="1.5" /><circle cx="13" cy="15" r="1.5" />
              </svg>
              اندیکاتورها
            </>
          ), mainInds.length + subInds.length > 0)}
          {openMenu === 'inds' && (
            <div style={menuBox}>
              <div style={sectionTitle}>روی نمودار</div>
              {MAIN_INDICATORS.map(it => checkItem(it, mainInds, toggleMain))}
              <div style={{ height: 1, background: line, margin: '4px 0' }} />
              <div style={sectionTitle}>اسیلاتورها (پنل جدا)</div>
              {SUB_INDICATORS.map(it => checkItem(it, subInds, toggleSub))}
            </div>
          )}
        </div>

        {/* اسمارت مانی */}
        <div style={{ position: 'relative' }}>
          {menuBtn('smc', 'اسمارت مانی', smcActive.length > 0)}
          {openMenu === 'smc' && (
            <div style={menuBox}>
              {SMC_ITEMS.map(it => checkItem(it, smcActive, toggleSmc))}
            </div>
          )}
        </div>

        {/* مقایسه نمادها */}
        <div style={{ position: 'relative' }}>
          {menuBtn('cmp', (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              مقایسه{compares.length > 0 ? ` (${compares.length})` : ''}
            </>
          ), compares.length > 0)}
          {openMenu === 'cmp' && (
            <div style={{ ...menuBox, minWidth: 260 }}>
              <div style={{ display: 'flex', gap: 6, padding: 6 }}>
                <input
                  value={cmpInput}
                  onChange={e => setCmpInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCompare() }}
                  placeholder="نماد… مثلاً فملی"
                  style={{
                    flex: 1, fontSize: 12.5, fontFamily: 'inherit', padding: '8px 10px',
                    borderRadius: 6, outline: 'none', background: 'transparent',
                    color: text, border: `1px solid ${line}`,
                  }}
                />
                <button onClick={addCompare} style={{ ...btn(true), border: `1px solid rgba(59,130,246,0.4)` }}>افزودن</button>
              </div>
              {compares.map((sym, i) => (
                <div key={sym} style={{ ...menuItem(false), cursor: 'default' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 10, height: 3, borderRadius: 2, background: CMP_COLORS[i % CMP_COLORS.length], display: 'inline-block' }} />
                    {sym}
                  </span>
                  <button onClick={() => removeCompare(sym)} aria-label={`حذف ${sym}`}
                    style={{ background: 'transparent', border: 'none', color: muted, cursor: 'pointer', padding: 3 }}>
                    <XIcon />
                  </button>
                </div>
              ))}
              {compares.length === 0 && (
                <div style={{ fontSize: 11.5, color: muted, padding: '4px 11px 8px', lineHeight: 1.8 }}>
                  نماد دوم به‌صورت خط هم‌مقیاس‌شده روی نمودار می‌آید
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 18, background: line, margin: '0 4px' }} />

        {/* undo / redo */}
        <button onClick={undo} disabled={!canUndo} aria-label="واگرد" title="واگرد رسم"
          style={{ ...btn(false), opacity: canUndo ? 1 : 0.35, cursor: canUndo ? 'pointer' : 'default' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
            <polyline points="9 14 4 9 9 4" /><path d="M4 9 H15 a5 5 0 0 1 0 10 H12" />
          </svg>
        </button>
        <button onClick={redo} disabled={!canRedo} aria-label="ازنو" title="ازنو"
          style={{ ...btn(false), opacity: canRedo ? 1 : 0.35, cursor: canRedo ? 'pointer' : 'default' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none', transform: 'scaleX(-1)' }}>
            <polyline points="9 14 4 9 9 4" /><path d="M4 9 H15 a5 5 0 0 1 0 10 H12" />
          </svg>
        </button>

        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 2, alignItems: 'center' }}>
          {/* قالب‌ها */}
          <div style={{ position: 'relative' }}>
            {menuBtn('layout', 'قالب')}
            {openMenu === 'layout' && (
              <div style={{ ...menuBox, right: 'auto', left: 0, minWidth: 250 }}>
                <div style={{ display: 'flex', gap: 6, padding: 6 }}>
                  <input value={layoutName} onChange={e => setLayoutName(e.target.value)} placeholder="نام قالب…"
                    onKeyDown={e => { if (e.key === 'Enter') saveLayout() }}
                    style={{
                      flex: 1, fontSize: 12.5, fontFamily: 'inherit', padding: '8px 10px',
                      borderRadius: 6, outline: 'none', background: 'transparent',
                      color: text, border: `1px solid ${line}`,
                    }} />
                  <button onClick={saveLayout} style={{ ...btn(true), border: '1px solid rgba(59,130,246,0.4)' }}>ذخیره</button>
                </div>
                {layouts.map((l, i) => (
                  <div key={`${l.name}-${i}`} style={{ ...menuItem(false), cursor: 'default' }}>
                    <button onClick={() => applyConfig(l.config)} style={{ background: 'transparent', border: 'none', color: text, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, flex: 1, textAlign: 'right', padding: 0 }}>
                      {l.name}
                    </button>
                    <button onClick={() => deleteLayout(i)} aria-label={`حذف ${l.name}`}
                      style={{ background: 'transparent', border: 'none', color: muted, cursor: 'pointer', padding: 3 }}>
                      <XIcon />
                    </button>
                  </div>
                ))}
                {layouts.length === 0 && <div style={{ fontSize: 11.5, color: muted, padding: '4px 11px 8px' }}>قالبی ذخیره نشده</div>}
                {!userId.current && <div style={{ fontSize: 10.5, color: muted, padding: '2px 11px 7px' }}>برای همگام‌سازی بین دستگاه‌ها وارد شوید</div>}
              </div>
            )}
          </div>

          {/* نمای ذخیره‌شده */}
          <div style={{ position: 'relative' }}>
            {menuBtn('snap', 'ذخیره نما')}
            {openMenu === 'snap' && (
              <div style={{ ...menuBox, right: 'auto', left: 0, minWidth: 280 }}>
                <button onClick={saveSnapshot} style={{ ...menuItem(true), justifyContent: 'center', fontWeight: 700 }}>
                  ذخیره نمای فعلی (با رسم‌ها)
                </button>
                <div style={{ height: 1, background: line, margin: '4px 0' }} />
                {snapshots.filter(s => s.symbol === symbol).map((s) => {
                  const gi = snapshots.indexOf(s)
                  return (
                    <div key={`${s.name}-${gi}`} style={{ ...menuItem(false), cursor: 'default' }}>
                      <button onClick={() => applyConfig(s.config, s.drawings)} style={{ background: 'transparent', border: 'none', color: text, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, flex: 1, textAlign: 'right', padding: 0 }}>
                        {s.name}
                      </button>
                      <button onClick={() => deleteSnapshot(gi)} aria-label="حذف نما"
                        style={{ background: 'transparent', border: 'none', color: muted, cursor: 'pointer', padding: 3 }}>
                        <XIcon />
                      </button>
                    </div>
                  )
                })}
                {snapshots.filter(s => s.symbol === symbol).length === 0 && (
                  <div style={{ fontSize: 11.5, color: muted, padding: '4px 11px 8px' }}>نمایی برای «{symbol}» ذخیره نشده</div>
                )}
              </div>
            )}
          </div>

          {/* اسکرین‌شات */}
          <div style={{ position: 'relative' }}>
            {menuBtn('shot', (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
            ))}
            {openMenu === 'shot' && (
              <div style={{ ...menuBox, right: 'auto', left: 0, minWidth: 200 }}>
                <button onClick={downloadShot} style={menuItem(false)}>دانلود تصویر (PNG)</button>
                <button onClick={copyShot} style={menuItem(false)}>کپی تصویر</button>
                <button onClick={copyShotLink} style={menuItem(false)}>کپی لینک تصویر</button>
              </div>
            )}
          </div>

          <button onClick={toggleFullscreen} style={btn(isFull)} aria-label={isFull ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'} title="تمام‌صفحه">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              {isFull
                ? <><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></>
                : <><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>}
            </svg>
          </button>
        </div>
      </div>

      {/* ── بدنه: ریل ابزار رسم (راست در RTL) + نمودار */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center',
          padding: '8px 4px', borderInlineEnd: `1px solid ${line}`, background: panel,
          overflowY: 'auto', flexShrink: 0,
        }}>
          {DRAW_TOOLS.map(t => (
            <button key={t.name} onClick={() => startDraw(t.name)} title={t.label} aria-label={t.label}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 6, cursor: 'pointer',
                background: 'transparent', border: 'none', color: muted, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(19,23,34,0.06)'; e.currentTarget.style.color = '#3b82f6' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = muted }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
                <path d={t.icon} />
              </svg>
            </button>
          ))}
          <div style={{ height: 1, alignSelf: 'stretch', background: line, margin: '4px 2px' }} />
          <button onClick={clearDrawings} title="حذف همه رسم‌ها" aria-label="حذف همه رسم‌ها"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: 'none', color: muted, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = RED }}
            onMouseLeave={e => { e.currentTarget.style.color = muted }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>

        <div ref={containerRef} style={{
          direction: 'ltr', flex: 1, minWidth: 0,
          height: isFull ? 'auto' : 560, minHeight: 320,
          background: chartBg,
        }} />
      </div>

      {/* توست */}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
          background: isDark ? '#2a2e39' : '#131722', color: '#fff',
          fontSize: 12.5, padding: '9px 18px', borderRadius: 8, zIndex: 90,
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
