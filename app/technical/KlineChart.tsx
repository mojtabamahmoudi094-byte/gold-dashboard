'use client'

// ترمینال تحلیل تکنیکال به سبک TradingView — KLineChart v10
// چیدمان مثل TradingView: ریل ابزار رسم سمت چپ، محور قیمت سمت راست،
// هدر بالایی (جست‌وجوی نماد، تعدیل، منبع قیمت، تایم‌فریم، اندیکاتور، بازپخش، AutoSave،
// تنظیمات، تم، اشتراک‌گذاری، تمام‌صفحه) و نوار پایینی (بازه‌ها، ٪/لگاریتمی، ساعت تهران)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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

// ابزارهای رسم — ریل عمودی سمت چپ (مثل TradingView)
const DRAW_TOOLS: { name: string; label: string; icon: string; fill?: boolean }[] = [
  { name: 'segment', label: 'خط روند', icon: 'M4 20 L20 4 M4 20 l0.01 0 M20 4 l0.01 0' },
  { name: 'rayLine', label: 'نیم‌خط', icon: 'M4 20 L20 4 L20 9 M20 4 L15 4' },
  { name: 'straightLine', label: 'خط نامحدود', icon: 'M2 22 L22 2 M5 22 L2 19 M22 5 L19 2' },
  { name: 'horizontalStraightLine', label: 'خط افقی', icon: 'M3 12 L21 12' },
  { name: 'verticalStraightLine', label: 'خط عمودی', icon: 'M12 3 L12 21' },
  { name: 'priceLine', label: 'خط قیمت', icon: 'M3 14 L21 14 M4 8 L8 8' },
  { name: 'priceChannelLine', label: 'کانال قیمت', icon: 'M3 16 L17 4 M7 20 L21 8' },
  { name: 'parallelStraightLine', label: 'خطوط موازی', icon: 'M3 15 L15 3 M9 21 L21 9' },
  { name: 'fibonacciLine', label: 'فیبوناچی', icon: 'M4 5 L20 5 M4 10 L20 10 M4 15 L20 15 M4 20 L20 20' },
  { name: 'drawRect', label: 'مستطیل', icon: 'M4 6 L20 6 L20 18 L4 18 Z' },
  { name: 'drawCircle', label: 'دایره', icon: 'M12 4 A8 8 0 1 0 12 20 A8 8 0 1 0 12 4' },
  { name: 'drawArrow', label: 'پیکان', icon: 'M4 20 L18 6 M18 6 L11 7 M18 6 L17 13' },
  { name: 'brush', label: 'قلم آزاد', icon: 'M4 20 C7 12 10 18 13 10 C15 5 18 8 20 4' },
  { name: 'simpleAnnotation', label: 'یادداشت', icon: 'M5 19 L19 19 M12 5 L12 15 M8 8 L12 5 L16 8' },
  { name: 'simpleTag', label: 'برچسب قیمت', icon: 'M3 12 L21 12 M17 8 L21 12 L17 16' },
  { name: 'measureRuler', label: 'خط‌کش (اندازه‌گیری)', icon: 'M3 17 L17 3 L21 7 L7 21 Z M7 13 L9 15 M10 10 L12 12 M13 7 L15 9' },
]
const DRAW_TOOL_NAMES = new Set(DRAW_TOOLS.map(t => t.name))

const SMC_ITEMS = [
  { name: 'fvg', label: 'گپ ارزش منصفانه (FVG)' },
  { name: 'ob', label: 'اردر بلاک' },
  { name: 'structure', label: 'شکست ساختار (BOS/CHoCH)' },
  { name: 'liquidity', label: 'نقدینگی' },
  { name: 'swings', label: 'سقف/کف سوئینگ' },
]

const CMP_COLORS = ['#d9b45b', '#d97706', '#ec4899', '#0891b2', '#f4d795']

// سرعت‌های بازپخش — فاصله هر کندل به میلی‌ثانیه
const REPLAY_SPEEDS = [
  { label: '۰٫۵×', ms: 1200 },
  { label: '۱×', ms: 650 },
  { label: '۲×', ms: 320 },
  { label: '۴×', ms: 150 },
]

// بازه‌های نوار پایین — ماه شمسی حدودی
const RANGES: { label: string; months: number | 'all' }[] = [
  { label: 'همه', months: 'all' },
  { label: '۳س', months: 36 },
  { label: '۱س', months: 12 },
  { label: '۶م', months: 6 },
  { label: '۳م', months: 3 },
  { label: '۱م', months: 1 },
]

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })

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

  // ── ابزارهای رسمی که کتابخانه ندارد — مستطیل، دایره، پیکان، خط‌کش
  registerOverlay({
    name: 'drawRect',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return []
      const [a, b] = coordinates
      return [{
        type: 'rect',
        attrs: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) },
        styles: { style: 'stroke_fill', color: 'rgba(217,180,91,0.12)', borderColor: '#d9b45b', borderSize: 1 },
      }]
    },
  })
  registerOverlay({
    name: 'drawCircle',
    totalStep: 3,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return []
      const [a, b] = coordinates
      const r = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
      return [{
        type: 'circle',
        attrs: { x: a.x, y: a.y, r },
        styles: { style: 'stroke_fill', color: 'rgba(244,215,149,0.12)', borderColor: '#f4d795', borderSize: 1 },
      }]
    },
  })
  registerOverlay({
    name: 'drawArrow',
    totalStep: 3,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return []
      const [a, b] = coordinates
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const L = 13
      const p1 = { x: b.x - L * Math.cos(ang - Math.PI / 7), y: b.y - L * Math.sin(ang - Math.PI / 7) }
      const p2 = { x: b.x - L * Math.cos(ang + Math.PI / 7), y: b.y - L * Math.sin(ang + Math.PI / 7) }
      return [
        { type: 'line', attrs: { coordinates: [a, b] }, styles: { color: '#d9b45b', size: 2 } },
        { type: 'polygon', attrs: { coordinates: [b, p1, p2] }, styles: { style: 'fill', color: '#d9b45b' } },
      ]
    },
  })
  registerOverlay({
    name: 'measureRuler',
    totalStep: 3,
    needDefaultPointFigure: false,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const [a, b] = coordinates
      const [pa, pb] = overlay.points
      const v1 = pa?.value ?? 0
      const v2 = pb?.value ?? 0
      const diff = v2 - v1
      const pct = v1 !== 0 ? (diff / v1) * 100 : 0
      const bars = Math.abs((pb?.dataIndex ?? 0) - (pa?.dataIndex ?? 0))
      const up = diff >= 0
      const rgb = up ? '38,166,154' : '239,83,80'
      const txt = `${diff >= 0 ? '+' : '−'}${fa(Math.abs(Math.round(diff)))} (${fa(Math.abs(pct), 2)}٪) · ${fa(bars)} کندل`
      return [
        {
          type: 'rect',
          attrs: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) },
          styles: { style: 'stroke_fill', color: `rgba(${rgb},0.12)`, borderColor: `rgba(${rgb},0.55)`, borderSize: 1 },
        },
        {
          type: 'text',
          attrs: { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 6, text: txt, align: 'center', baseline: 'bottom' },
          styles: {
            color: '#fff', backgroundColor: up ? '#26a69a' : '#ef5350', size: 11,
            paddingLeft: 7, paddingRight: 7, paddingTop: 4, paddingBottom: 4, borderRadius: 4,
          },
        },
      ]
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

type ChartSettings = { grid: boolean; lastLine: boolean; hilo: boolean }
const DEFAULT_SETTINGS: ChartSettings = { grid: true, lastLine: true, hilo: true }

function chartStyles(isDark: boolean, candleType: CandleType, s: ChartSettings) {
  const grid = isDark ? 'rgba(255,255,255,0.06)' : '#f0f3fa'
  const text = isDark ? '#8b93a7' : '#787b86'
  const axis = isDark ? 'rgba(255,255,255,0.12)' : '#e0e3eb'
  return {
    grid: { show: s.grid, horizontal: { color: grid }, vertical: { color: grid } },
    candle: {
      type: candleType,
      bar: {
        upColor: GREEN, downColor: RED, noChangeColor: text,
        upBorderColor: GREEN, downBorderColor: RED, noChangeBorderColor: text,
        upWickColor: GREEN, downWickColor: RED, noChangeWickColor: text,
      },
      area: {
        lineColor: '#d9b45b', lineSize: 2,
        backgroundColor: [
          { offset: 0, color: 'rgba(217,180,91,0.01)' },
          { offset: 1, color: 'rgba(217,180,91,0.2)' },
        ],
      },
      priceMark: {
        high: { show: s.hilo, color: text },
        low: { show: s.hilo, color: text },
        last: { show: s.lastLine, upColor: GREEN, downColor: RED, noChangeColor: text },
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
type AutoSaveData = { config: ChartConfig; drawings: DrawingSave[] }

type ScaleMode = 'normal' | 'percentage' | 'logarithm'

type SymItem = { l18: string; pcp: number | null }

type AdjMode = 'raw' | 'adj' | 'capital' | 'dividend' | 'additive'
const ADJ_MODE_KEYS = ['raw', 'adj', 'capital', 'dividend', 'additive'] as const
const ADJ_MODE_LABELS: Record<AdjMode, string> = {
  raw: 'بدون تعدیل',
  adj: 'نسبی — افزایش سرمایه + سود نقدی',
  capital: 'نسبی — فقط افزایش سرمایه',
  dividend: 'نسبی — فقط سود نقدی',
  additive: 'جمعی — افزایش سرمایه + سود نقدی',
}

type Props = {
  symbol: string
  candles: Candle[]
  isDark: boolean
  symbols?: SymItem[]
  livePrice?: { pl: number; plp: number } | null
  /** سری تعدیل‌شده نسبی ترکیبی (adj_* از stock_candles) — undefined یعنی هنوز داده‌ای نیست */
  candlesAdj?: Candle[]
  /** تعدیل نسبی فقط افزایش سرمایه (coef_capital) */
  candlesAdjCapital?: Candle[]
  /** تعدیل نسبی فقط سود نقدی (coef_dividend) */
  candlesAdjDividend?: Candle[]
  /** تعدیل جمعی/نقطه‌ای ترکیبی (offset_combined) */
  candlesAdjAdditive?: Candle[]
}

const readAuto = (symbol: string): AutoSaveData | null => {
  try {
    const raw = localStorage.getItem(`ta-auto-${symbol}`)
    return raw ? JSON.parse(raw) as AutoSaveData : null
  } catch { return null }
}

const toSlug = (s: string) => encodeURIComponent(s.replace(/\s+/g, '-'))

export default function KlineChart({ symbol, candles, isDark, symbols = [], livePrice = null, candlesAdj, candlesAdjCapital, candlesAdjDividend, candlesAdjAdditive }: Props) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)

  // AutoSave مثل TradingView — روشن به‌صورت پیش‌فرض؛ نمای هر نماد خودکار برمی‌گردد
  const [autoSave, setAutoSave] = useState(() => {
    try { return localStorage.getItem('ta-autosave') !== 'off' } catch { return true }
  })
  const initialAuto = useRef<AutoSaveData | null>(null)
  if (initialAuto.current === null && typeof window !== 'undefined') {
    initialAuto.current = readAuto(symbol)
  }
  const savedCfg = autoSave ? initialAuto.current?.config : undefined

  const [period, setPeriod] = useState<PeriodType>(savedCfg?.period ?? 'day')
  const [candleType, setCandleType] = useState<CandleType>(savedCfg?.candleType ?? 'candle_solid')
  // چارت خام باز می‌شود — فقط کندل + حجم؛ اندیکاتور با انتخاب خود کاربر اضافه می‌شود
  const [mainInds, setMainInds] = useState<string[]>(savedCfg?.mainInds ?? [])
  const [subInds, setSubInds] = useState<string[]>(savedCfg?.subInds ?? ['VOL'])
  const [smcActive, setSmcActive] = useState<string[]>(savedCfg?.smcActive ?? [])
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

  // ابزار فعال + مگنت + قفل/نمایش رسم‌ها
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [magnetOn, setMagnetOn] = useState(false)
  const [locked, setLocked] = useState(false)
  const [drawingsHidden, setDrawingsHidden] = useState(false)

  // منبع قیمت (پایانی / آخرین) + تعدیل + مقیاس محور + تنظیمات نمایش
  const [priceSrc, setPriceSrc] = useState<'close' | 'last'>(() => {
    try { return localStorage.getItem('ta-price-src') === 'last' ? 'last' : 'close' } catch { return 'close' }
  })
  const [adjMode, setAdjMode] = useState<AdjMode>(() => {
    try {
      const v = localStorage.getItem('ta-adj')
      return (ADJ_MODE_KEYS as readonly string[]).includes(v ?? '') ? (v as AdjMode) : 'raw'
    } catch { return 'raw' }
  })
  const [scaleMode, setScaleMode] = useState<ScaleMode>('normal')
  const [settings, setSettings] = useState<ChartSettings>(() => {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('ta-settings') ?? '{}') } } catch { return DEFAULT_SETTINGS }
  })

  // بازپخش
  const [replayOn, setReplayOn] = useState(false)
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [replaySpeed, setReplaySpeed] = useState(1)
  const [replayIdx, setReplayIdx] = useState(0)
  const replayCutRef = useRef<number | null>(null)
  const replayTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // جست‌وجوی نماد داخل هدر نمودار
  const [searchQ, setSearchQ] = useState('')

  // ساعت تهران — نوار پایین
  const [clock, setClock] = useState('')

  const aggregatedRef = useRef<Candle[]>([])
  const dataFullRef = useRef<KLineData[]>([])
  const stateRef = useRef({ mainInds, subInds, smcActive, compares })
  stateRef.current = { mainInds, subInds, smcActive, compares }
  const undoStack = useRef<Array<DrawingSave & { id: string }>>([])
  const redoStack = useRef<Array<DrawingSave & { id: string }>>([])
  const pendingDrawings = useRef<DrawingSave[] | null>(
    autoSave && initialAuto.current?.drawings?.length ? initialAuto.current.drawings : null
  )
  // رسم‌های نگه‌داشته‌شده فقط به نماد خودشان برمی‌گردند
  const pendingSymbol = useRef(symbol)
  const pendingDrawId = useRef<string | null>(null)
  const cmpCandles = useRef<Map<string, Candle[]>>(new Map())
  const userId = useRef<string | null>(null)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // ── ساعت زنده تهران
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Tehran' })
    const tick = () => setClock(fmt.format(new Date()))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  // ── تعدیل: سری روش انتخاب‌شده اگر موجود است؛ وگرنه خام
  const adjSeries: Record<Exclude<AdjMode, 'raw'>, Candle[] | undefined> = {
    adj: candlesAdj, capital: candlesAdjCapital, dividend: candlesAdjDividend, additive: candlesAdjAdditive,
  }
  const hasMode = (m: AdjMode) => m === 'raw' || Boolean(adjSeries[m] && (adjSeries[m] as Candle[]).length > 0)
  const hasAdj = hasMode(adjMode)
  const baseCandles = adjMode !== 'raw' && hasAdj ? (adjSeries[adjMode] as Candle[]) : candles

  // ── منبع قیمت «آخرین» — کندل امروز با آخرین معامله لحظه‌ای جایگزین می‌شود
  const livePl = livePrice?.pl ?? null
  const effCandles = useMemo(() => {
    if (priceSrc !== 'last' || livePl == null || baseCandles.length === 0) return baseCandles
    const out = baseCandles.slice()
    const l = { ...out[out.length - 1] }
    l.close = livePl
    l.high = Math.max(l.high, livePl)
    l.low = Math.min(l.low, livePl)
    out[out.length - 1] = l
    return out
  }, [baseCandles, priceSrc, livePl])

  // ── ساخت نمودار
  useEffect(() => {
    const el = containerRef.current
    if (!el || effCandles.length === 0) return
    ensureLocale()
    ensureOverlays()
    registerCustomIndicators()

    const chart = init(el, {
      locale: localeRegistered ? 'fa-IR' : 'en-US',
      timezone: 'UTC',
      styles: chartStyles(isDark, candleType, settings) as never,
      formatter: {
        formatDate: ({ timestamp }: { timestamp: number }) => toShamsi(timestamp),
      },
    })
    if (!chart) return
    chartRef.current = chart

    chart.setSymbol({ ticker: symbol, pricePrecision: 0, volumePrecision: 0 })
    chart.setPeriod({ type: period, span: 1 })

    const aggregated = aggregate(effCandles, period)
    aggregatedRef.current = aggregated
    dataFullRef.current = aggregated.map(c => ({
      timestamp: Date.parse(c.time),
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    }))
    // بازپخش با برش دادن همین آرایه کار می‌کند — resetData دوباره getBars را صدا می‌زند
    chart.setDataLoader({
      getBars: ({ callback }) => {
        const cut = replayCutRef.current
        const arr = cut == null ? dataFullRef.current : dataFullRef.current.slice(0, cut)
        callback(arr, { backward: false, forward: false })
      },
    })

    if (scaleMode !== 'normal') {
      chart.overrideYAxis({ name: scaleMode, paneId: 'candle_pane' })
    }

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

    // بازگردانی رسم‌ها (نمای ذخیره‌شده، AutoSave، یا بازسازی‌های داخلی)
    if (pendingDrawings.current && pendingSymbol.current === symbol) {
      for (const dr of pendingDrawings.current) {
        chart.createOverlay({ name: dr.name, points: dr.points })
      }
    }
    pendingDrawings.current = null

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    return () => {
      // رسم‌های کاربر بین بازسازی‌ها (تغییر تم/تایم‌فریم/منبع قیمت) حفظ می‌شوند
      pendingDrawings.current = chart.getOverlays({})
        .filter(o => DRAW_TOOL_NAMES.has(o.name))
        .map(o => ({ name: o.name, points: o.points.map(p => ({ timestamp: p.timestamp, value: p.value })) }))
      pendingSymbol.current = symbol
      ro.disconnect()
      dispose(el)
      chartRef.current = null
      undoStack.current = []
      redoStack.current = []
      pendingDrawId.current = null
    }
    // اندیکاتور/رسم‌ها جدا مدیریت می‌شوند تا toggle باعث پاک‌شدن بقیه نشود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effCandles, isDark, period, symbol, rebuildKey])

  // نوع کندل بدون بازسازی
  useEffect(() => {
    chartRef.current?.setStyles({ candle: { type: candleType } })
  }, [candleType])

  // ── AutoSave — نما و رسم‌های هر نماد خودکار ذخیره می‌شود (با debounce)
  const collectDrawings = useCallback((): DrawingSave[] => {
    const chart = chartRef.current
    if (!chart) return []
    return chart.getOverlays({})
      .filter(o => DRAW_TOOL_NAMES.has(o.name))
      .map(o => ({ name: o.name, points: o.points.map(p => ({ timestamp: p.timestamp, value: p.value })) }))
  }, [])

  const scheduleAutoSave = useCallback(() => {
    if (!autoSave) return
    if (autoTimer.current) clearTimeout(autoTimer.current)
    autoTimer.current = setTimeout(() => {
      try {
        const data: AutoSaveData = {
          config: { candleType, period, mainInds, subInds, smcActive, compares },
          drawings: collectDrawings(),
        }
        localStorage.setItem(`ta-auto-${symbol}`, JSON.stringify(data))
      } catch { /* حافظه پر — بی‌خیال */ }
    }, 700)
  }, [autoSave, candleType, period, mainInds, subInds, smcActive, compares, symbol, collectDrawings])

  useEffect(() => { scheduleAutoSave() }, [scheduleAutoSave])

  // سوییچ نماد بدون خروج از صفحه — نمای ذخیره‌شدهٔ نماد جدید برمی‌گردد
  const prevSymbol = useRef(symbol)
  useEffect(() => {
    if (prevSymbol.current === symbol) return
    prevSymbol.current = symbol
    if (!autoSave) return
    const saved = readAuto(symbol)
    if (saved) {
      pendingSymbol.current = symbol
      applyConfig(saved.config, saved.drawings)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  const toggleAutoSave = () => {
    const next = !autoSave
    setAutoSave(next)
    try { localStorage.setItem('ta-autosave', next ? 'on' : 'off') } catch { /* — */ }
    if (!next) { try { localStorage.removeItem(`ta-auto-${symbol}`) } catch { /* — */ } }
    notify(next ? 'ذخیره خودکار روشن شد' : 'ذخیره خودکار خاموش شد')
  }

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
    const chart = chartRef.current
    if (!chart) return
    // شروع ابزار جدید = لغو ابزار نیمه‌کاره قبلی
    if (pendingDrawId.current) {
      chart.removeOverlay({ id: pendingDrawId.current })
      pendingDrawId.current = null
    }
    setActiveTool(name)
    const id = chart.createOverlay({
      name,
      mode: magnetOn ? 'weak_magnet' : 'normal',
      onDrawEnd: (e: unknown) => {
        const o = (e as { overlay?: { id: string; name: string; points: DrawingSave['points'] } }).overlay
        pendingDrawId.current = null
        setActiveTool(null)
        if (!o) return
        undoStack.current.push({ id: o.id, name: o.name, points: o.points.map(p => ({ ...p })) })
        redoStack.current = []
        bump()
        scheduleAutoSave()
      },
    })
    if (typeof id === 'string') pendingDrawId.current = id
  }
  // دکمه نشانگر (cursor) — لغو رسم فعال، مثل Esc در TradingView
  const cancelDraw = () => {
    const chart = chartRef.current
    if (chart && pendingDrawId.current) {
      chart.removeOverlay({ id: pendingDrawId.current })
      pendingDrawId.current = null
    }
    setActiveTool(null)
  }
  const undo = () => {
    const it = undoStack.current.pop()
    if (!it) return
    chartRef.current?.removeOverlay({ id: it.id })
    redoStack.current.push(it)
    bump()
    scheduleAutoSave()
  }
  const redo = () => {
    const it = redoStack.current.pop()
    if (!it) return
    const id = chartRef.current?.createOverlay({ name: it.name, points: it.points })
    if (typeof id === 'string') it.id = id
    undoStack.current.push(it)
    bump()
    scheduleAutoSave()
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
    scheduleAutoSave()
  }

  // قفل / پنهان‌سازی همه رسم‌ها — مثل TradingView
  const toggleLockAll = () => {
    const chart = chartRef.current
    if (!chart) return
    const next = !locked
    setLocked(next)
    for (const o of chart.getOverlays({})) {
      if (DRAW_TOOL_NAMES.has(o.name)) chart.overrideOverlay({ id: o.id, lock: next } as never)
    }
  }
  const toggleHideAll = () => {
    const chart = chartRef.current
    if (!chart) return
    const next = !drawingsHidden
    setDrawingsHidden(next)
    for (const o of chart.getOverlays({})) {
      if (DRAW_TOOL_NAMES.has(o.name)) chart.overrideOverlay({ id: o.id, visible: !next } as never)
    }
  }

  // ── بازپخش (Replay) — پخش کندل‌به‌کندل تاریخچه
  const stopReplayTimer = () => {
    if (replayTimer.current) { clearInterval(replayTimer.current); replayTimer.current = null }
    setReplayPlaying(false)
  }
  const stepReplay = useCallback(() => {
    const n = dataFullRef.current.length
    if (replayCutRef.current == null) return
    if (replayCutRef.current >= n) { stopReplayTimer(); return }
    replayCutRef.current += 1
    setReplayIdx(replayCutRef.current)
    chartRef.current?.resetData()
  }, [])
  const enterReplay = () => {
    const n = dataFullRef.current.length
    if (n < 30) { notify('داده برای بازپخش کافی نیست'); return }
    replayCutRef.current = Math.max(25, Math.floor(n * 0.35))
    setReplayIdx(replayCutRef.current)
    setReplayOn(true)
    setOpenMenu(null)
    chartRef.current?.resetData()
  }
  const exitReplay = () => {
    stopReplayTimer()
    replayCutRef.current = null
    setReplayOn(false)
    chartRef.current?.resetData()
  }
  const toggleReplayPlay = () => {
    if (replayPlaying) { stopReplayTimer(); return }
    setReplayPlaying(true)
    replayTimer.current = setInterval(stepReplay, REPLAY_SPEEDS[replaySpeed].ms)
  }
  const changeReplaySpeed = () => {
    const next = (replaySpeed + 1) % REPLAY_SPEEDS.length
    setReplaySpeed(next)
    if (replayTimer.current) {
      clearInterval(replayTimer.current)
      replayTimer.current = setInterval(stepReplay, REPLAY_SPEEDS[next].ms)
    }
  }
  const scrubReplay = (v: number) => {
    replayCutRef.current = v
    setReplayIdx(v)
    chartRef.current?.resetData()
  }
  // تغییر تایم‌فریم/نماد = خروج از بازپخش (داده عوض می‌شود)
  useEffect(() => {
    stopReplayTimer()
    replayCutRef.current = null
    setReplayOn(false)
  }, [period, symbol, effCandles])
  useEffect(() => () => stopReplayTimer(), [])

  // ── مقیاس محور قیمت: عادی / درصدی / لگاریتمی
  const applyScale = (m: ScaleMode) => {
    setScaleMode(m)
    chartRef.current?.overrideYAxis({ name: m, paneId: 'candle_pane' })
  }

  // ── بازه‌های نوار پایین — فاصله کندل‌ها طوری تنظیم می‌شود که بازه در قاب جا شود
  const applyRange = (months: number | 'all') => {
    const chart = chartRef.current
    if (!chart) return
    const agg = aggregatedRef.current
    if (agg.length === 0) return
    let count = agg.length
    if (months !== 'all') {
      const cutoff = Date.now() - months * 30.44 * 86_400_000
      count = Math.max(agg.filter(c => Date.parse(c.time) >= cutoff).length, 5)
    }
    const width = chart.getSize('candle_pane', 'main')?.width ?? 800
    const space = Math.min(50, Math.max(1, Math.floor(width / count)))
    chart.setBarSpace(space)
    chart.scrollToRealTime()
  }

  // ── تنظیمات نمایش (چرخ‌دنده)
  const updateSetting = (key: keyof ChartSettings) => {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    try { localStorage.setItem('ta-settings', JSON.stringify(next)) } catch { /* — */ }
    chartRef.current?.setStyles(chartStyles(isDark, candleType, next) as never)
  }

  // ── تم — همان مکانیزم سراسری سایت (هدر گوش می‌دهد)
  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark'
    try {
      window.localStorage.setItem('theme', next)
      window.dispatchEvent(new Event('themechange'))
    } catch { /* — */ }
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

  // ── اسکرین‌شات و اشتراک‌گذاری
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
  const copyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      notify('لینک صفحه کپی شد')
    } catch { notify('کپی لینک ممکن نشد') }
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

  // ── جست‌وجوی نماد
  const symMatches = useMemo(() => {
    const q = searchQ.trim()
    if (!q) return []
    return symbols.filter(s => s.l18.includes(q) && s.l18 !== symbol).slice(0, 8)
  }, [searchQ, symbols, symbol])

  const gotoSymbol = (l18: string) => {
    setSearchQ('')
    setOpenMenu(null)
    router.push(`/technical/${toSlug(l18)}`)
  }

  // ── استایل‌ها — زبان شیشه‌ای ۲۰۲۶ (هماهنگ با uiTokens.ts)
  const glassBg = isDark ? 'rgba(19,23,34,0.72)' : 'rgba(255,255,255,0.82)'
  const panel = isDark ? 'rgba(19,23,34,0.96)' : 'rgba(255,255,255,0.97)'
  const text  = isDark ? '#d1d4dc' : '#131722'
  const muted = isDark ? '#8b93a7' : '#787b86'
  const line  = isDark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.08)'
  const chartBg = isDark ? CHART_BG.dark : CHART_BG.light

  const btn = (active: boolean): React.CSSProperties => ({
    fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
    padding: '7px 12px', borderRadius: 9, minHeight: 32,
    border: '1px solid transparent',
    background: active ? 'linear-gradient(135deg, rgba(217,180,91,0.22), rgba(244,215,149,0.18))' : 'transparent',
    color: active ? '#d9b45b' : muted,
    transition: 'all 0.15s',
  })

  const iconBtn = (active: boolean): React.CSSProperties => ({
    ...btn(active),
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 32, padding: 0,
  })

  const menuBox: React.CSSProperties = {
    position: 'absolute', top: '100%', right: 0, zIndex: 80, marginTop: 6,
    minWidth: 230, maxHeight: 340, overflowY: 'auto',
    background: panel, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    borderRadius: 12, padding: 5,
    border: `1px solid ${line}`,
    boxShadow: isDark ? '0 16px 48px rgba(0,0,0,0.55)' : '0 10px 32px rgba(15,23,42,0.14)',
  }

  const menuItem = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    width: '100%', textAlign: 'right', cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 12.5, padding: '9px 11px', borderRadius: 6, border: 'none',
    background: 'transparent',
    color: active ? '#d9b45b' : text,
  })

  const sectionTitle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, color: muted, padding: '7px 11px 4px',
  }

  const railBtn = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 34, height: 34, borderRadius: 10, cursor: 'pointer',
    background: active ? 'linear-gradient(135deg, rgba(217,180,91,0.22), rgba(244,215,149,0.18))' : 'transparent',
    border: '1px solid transparent',
    color: active ? '#d9b45b' : muted,
    transition: 'all 0.15s', flexShrink: 0,
  })

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

  const hoverBg = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(19,23,34,0.05)' }
  const leaveBg = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = 'transparent' }

  const canUndo = undoStack.current.length > 0
  const canRedo = redoStack.current.length > 0
  const totalBars = dataFullRef.current.length

  return (
    <div ref={wrapperRef} style={{
      display: 'flex', flexDirection: 'column', position: 'relative',
      height: isFull ? '100vh' : undefined,
      background: chartBg,
      border: `1px solid ${line}`, borderRadius: isFull ? 0 : 16, overflow: 'hidden',
      boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.35)' : '0 8px 24px rgba(217,180,91,0.08)',
    }}>
      {/* ── هدر بالا — مثل TradingView */}
      <div style={{
        display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center',
        padding: '8px 12px', background: glassBg,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${line}`,
        position: 'relative', zIndex: 40,
      }}>
        {/* جست‌وجوی نماد */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setOpenMenu(openMenu === 'sym' ? null : 'sym')} aria-expanded={openMenu === 'sym'}
            style={{
              ...btn(openMenu === 'sym'), display: 'inline-flex', alignItems: 'center', gap: 7,
              border: `1px solid ${line}`, fontWeight: 700, color: text, minWidth: 96, justifyContent: 'center',
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ pointerEvents: 'none', opacity: 0.7 }}>
              <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
            {symbol}
          </button>
          {openMenu === 'sym' && (
            <div style={{ ...menuBox, minWidth: 250 }}>
              <div style={{ padding: 6 }}>
                <input
                  autoFocus
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && symMatches.length > 0) gotoSymbol(symMatches[0].l18) }}
                  placeholder="جست‌وجوی نماد…"
                  style={{
                    width: '100%', boxSizing: 'border-box', fontSize: 12.5, fontFamily: 'inherit',
                    padding: '9px 11px', borderRadius: 6, outline: 'none', background: 'transparent',
                    color: text, border: `1px solid ${line}`,
                  }}
                />
              </div>
              {symMatches.map(m => (
                <button key={m.l18} onClick={() => gotoSymbol(m.l18)} style={menuItem(false)}
                  onMouseEnter={hoverBg} onMouseLeave={leaveBg}>
                  <span style={{ fontWeight: 700 }}>{m.l18}</span>
                  {m.pcp !== null && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: m.pcp >= 0 ? GREEN : RED }}>
                      {m.pcp >= 0 ? '▲' : '▼'} {fa(Math.abs(m.pcp), 2)}٪
                    </span>
                  )}
                </button>
              ))}
              {searchQ.trim() && symMatches.length === 0 && (
                <div style={{ fontSize: 11.5, color: muted, padding: '4px 11px 8px' }}>نمادی پیدا نشد</div>
              )}
            </div>
          )}
        </div>

        {/* تعدیل قیمت */}
        <div style={{ position: 'relative' }}>
          {menuBtn('adj', adjMode === 'raw' ? 'بدون تعدیل' : ADJ_MODE_LABELS[adjMode], adjMode !== 'raw' && hasAdj)}
          {openMenu === 'adj' && (
            <div style={{ ...menuBox, minWidth: 260 }}>
              {ADJ_MODE_KEYS.map(key => {
                const avail = hasMode(key)
                return (
                  <button key={key}
                    onClick={() => {
                      if (key !== 'raw' && !avail) {
                        notify('این روش تعدیل برای این نماد هنوز آماده نیست')
                        setOpenMenu(null)
                        return
                      }
                      setAdjMode(key)
                      try { localStorage.setItem('ta-adj', key) } catch { /* — */ }
                      setOpenMenu(null)
                    }}
                    style={{ ...menuItem(adjMode === key), ...(key !== 'raw' && !avail ? { opacity: 0.45 } : {}) }}
                    onMouseEnter={hoverBg} onMouseLeave={leaveBg}>
                    <span>{ADJ_MODE_LABELS[key]}</span>
                    {adjMode === key && (key === 'raw' || avail) && <Check />}
                  </button>
                )
              })}
              <div style={{ fontSize: 10.5, color: muted, padding: '4px 11px 8px', lineHeight: 1.8 }}>
                نسبی = ضرب در ضریب (روش رایج نمودار)، جمعی = کم‌کردن مبلغ ثابت (روش نرم‌افزارهای معاملاتی مثل MetaStock).
                منبع tsetmc، هر شب به‌روز می‌شود.
              </div>
            </div>
          )}
        </div>

        {/* منبع قیمت */}
        <div style={{ position: 'relative' }}>
          {menuBtn('psrc', priceSrc === 'last' ? 'آخرین قیمت' : 'قیمت پایانی', priceSrc === 'last')}
          {openMenu === 'psrc' && (
            <div style={{ ...menuBox, minWidth: 220 }}>
              {([
                { key: 'close', label: 'قیمت پایانی' },
                { key: 'last', label: 'آخرین قیمت' },
              ] as const).map(o => (
                <button key={o.key}
                  onClick={() => {
                    setPriceSrc(o.key)
                    try { localStorage.setItem('ta-price-src', o.key) } catch { /* — */ }
                    setOpenMenu(null)
                  }}
                  style={menuItem(priceSrc === o.key)} onMouseEnter={hoverBg} onMouseLeave={leaveBg}>
                  <span>{o.label}</span>
                  {priceSrc === o.key && <Check />}
                </button>
              ))}
              <div style={{ fontSize: 10.5, color: muted, padding: '4px 11px 8px', lineHeight: 1.8 }}>
                «آخرین قیمت» فقط کندل امروز را در ساعت بازار با آخرین معامله به‌روز می‌کند؛ تاریخچه بر اساس پایانی است.
              </div>
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

        {/* نوع کندل */}
        <div style={{ position: 'relative' }}>
          {menuBtn('ctype', CANDLE_TYPES.find(c => c.name === candleType)?.label ?? 'شمعی')}
          {openMenu === 'ctype' && (
            <div style={menuBox}>
              {CANDLE_TYPES.map(c => (
                <button key={c.name} onClick={() => { setCandleType(c.name); setOpenMenu(null) }} style={menuItem(candleType === c.name)}
                  onMouseEnter={hoverBg} onMouseLeave={leaveBg}>
                  <span>{c.label}</span>
                  {candleType === c.name && <Check />}
                </button>
              ))}
            </div>
          )}
        </div>

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
                <button onClick={addCompare} style={{ ...btn(true), border: `1px solid rgba(217,180,91,0.4)` }}>افزودن</button>
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

        {/* بازپخش */}
        <button onClick={replayOn ? exitReplay : enterReplay} style={{ ...btn(replayOn), display: 'inline-flex', alignItems: 'center', gap: 5 }} title="بازپخش تاریخچه">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
            <polygon points="11 5 2 12 11 19" /><polygon points="22 5 13 12 22 19" />
          </svg>
          بازپخش
        </button>

        {/* undo / redo */}
        <button onClick={undo} disabled={!canUndo} aria-label="واگرد" title="واگرد رسم"
          style={{ ...iconBtn(false), opacity: canUndo ? 1 : 0.35, cursor: canUndo ? 'pointer' : 'default' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
            <polyline points="9 14 4 9 9 4" /><path d="M4 9 H15 a5 5 0 0 1 0 10 H12" />
          </svg>
        </button>
        <button onClick={redo} disabled={!canRedo} aria-label="ازنو" title="ازنو"
          style={{ ...iconBtn(false), opacity: canRedo ? 1 : 0.35, cursor: canRedo ? 'pointer' : 'default' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none', transform: 'scaleX(-1)' }}>
            <polyline points="9 14 4 9 9 4" /><path d="M4 9 H15 a5 5 0 0 1 0 10 H12" />
          </svg>
        </button>

        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 2, alignItems: 'center' }}>
          {/* AutoSave — مثل TradingView */}
          <button onClick={toggleAutoSave} title="ذخیره خودکار نما و رسم‌ها"
            style={{ ...btn(autoSave), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {autoSave && <Check />}
            ذخیره خودکار
          </button>

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
                  <button onClick={saveLayout} style={{ ...btn(true), border: '1px solid rgba(217,180,91,0.4)' }}>ذخیره</button>
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

          {/* تنظیمات نمودار */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setOpenMenu(openMenu === 'cfg' ? null : 'cfg')} aria-label="تنظیمات نمودار" title="تنظیمات نمودار"
              style={iconBtn(openMenu === 'cfg')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            {openMenu === 'cfg' && (
              <div style={{ ...menuBox, right: 'auto', left: 0, minWidth: 230 }}>
                {([
                  { key: 'grid', label: 'خطوط شبکه' },
                  { key: 'lastLine', label: 'خط آخرین قیمت' },
                  { key: 'hilo', label: 'برچسب سقف و کف' },
                ] as const).map(o => (
                  <button key={o.key} onClick={() => updateSetting(o.key)} style={menuItem(settings[o.key])}
                    onMouseEnter={hoverBg} onMouseLeave={leaveBg}>
                    <span>{o.label}</span>
                    {settings[o.key] && <Check />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* تم روز/شب */}
          <button onClick={toggleTheme} aria-label={isDark ? 'حالت روز' : 'حالت شب'} title={isDark ? 'حالت روز' : 'حالت شب'} style={iconBtn(false)}>
            {isDark ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* اشتراک‌گذاری */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setOpenMenu(openMenu === 'share' ? null : 'share')} aria-label="اشتراک‌گذاری" title="اشتراک‌گذاری" style={iconBtn(openMenu === 'share')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
              </svg>
            </button>
            {openMenu === 'share' && (
              <div style={{ ...menuBox, right: 'auto', left: 0, minWidth: 210 }}>
                <button onClick={copyPageLink} style={menuItem(false)} onMouseEnter={hoverBg} onMouseLeave={leaveBg}>کپی لینک صفحه</button>
                <button onClick={downloadShot} style={menuItem(false)} onMouseEnter={hoverBg} onMouseLeave={leaveBg}>دانلود تصویر (PNG)</button>
                <button onClick={copyShot} style={menuItem(false)} onMouseEnter={hoverBg} onMouseLeave={leaveBg}>کپی تصویر</button>
                <button onClick={copyShotLink} style={menuItem(false)} onMouseEnter={hoverBg} onMouseLeave={leaveBg}>کپی لینک تصویر</button>
              </div>
            )}
          </div>

          <button onClick={toggleFullscreen} style={iconBtn(isFull)} aria-label={isFull ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'} title="تمام‌صفحه">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              {isFull
                ? <><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></>
                : <><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>}
            </svg>
          </button>
        </div>
      </div>

      {/* ── نوار کنترل بازپخش */}
      {replayOn && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
          background: glassBg, borderBottom: `1px solid ${line}`,
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        }}>
          <button onClick={exitReplay} aria-label="خروج از بازپخش" title="خروج از بازپخش" style={iconBtn(false)}>
            <XIcon />
          </button>
          <button onClick={toggleReplayPlay} aria-label={replayPlaying ? 'توقف' : 'پخش'} title={replayPlaying ? 'توقف' : 'پخش'} style={iconBtn(replayPlaying)}>
            {replayPlaying ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ pointerEvents: 'none' }}>
                <rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ pointerEvents: 'none', transform: 'scaleX(-1)' }}>
                <polygon points="6 4 20 12 6 20" />
              </svg>
            )}
          </button>
          <button onClick={stepReplay} aria-label="کندل بعدی" title="کندل بعدی" style={iconBtn(false)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ pointerEvents: 'none', transform: 'scaleX(-1)' }}>
              <polygon points="5 4 15 12 5 20" /><rect x="17" y="4" width="3" height="16" rx="1" />
            </svg>
          </button>
          <button onClick={changeReplaySpeed} title="سرعت پخش" style={{ ...btn(false), fontWeight: 700, minWidth: 44 }}>
            {REPLAY_SPEEDS[replaySpeed].label}
          </button>
          <input
            type="range"
            min={25}
            max={Math.max(totalBars, 26)}
            value={replayIdx}
            onChange={e => scrubReplay(Number(e.target.value))}
            aria-label="پیمایش بازپخش"
            style={{ flex: 1, accentColor: '#d9b45b', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 11, color: muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {fa(replayIdx)} / {fa(totalBars)}
          </span>
        </div>
      )}

      {/* ── بدنه: ریل ابزار رسم سمت چپ + نمودار (محور قیمت سمت راست) */}
      {/* ارتفاع روی همین ردیف است تا ریلِ بلند، ستون نمودار را کش ندهد */}
      <div style={{ display: 'flex', flex: isFull ? 1 : undefined, minHeight: 0, direction: 'ltr', height: isFull ? undefined : 560 }}>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center',
          padding: '10px 6px', borderRight: `1px solid ${line}`,
          background: glassBg, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          overflowY: 'auto', flexShrink: 0, direction: 'rtl',
        }}>
          {/* نشانگر — لغو ابزار فعال */}
          <button onClick={cancelDraw} title="نشانگر (لغو ابزار)" aria-label="نشانگر"
            style={railBtn(activeTool === null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <path d="M4 3 L11 21 L13.5 13.5 L21 11 Z" />
            </svg>
          </button>
          <div style={{ height: 1, alignSelf: 'stretch', background: line, margin: '5px 4px' }} />

          {DRAW_TOOLS.map(t => (
            <button key={t.name} onClick={() => startDraw(t.name)} title={t.label} aria-label={t.label}
              style={railBtn(activeTool === t.name)}
              onMouseEnter={e => {
                if (activeTool === t.name) return
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(217,180,91,0.16), rgba(244,215,149,0.12))'
                e.currentTarget.style.color = '#d9b45b'
              }}
              onMouseLeave={e => {
                if (activeTool === t.name) return
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = muted
              }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
                <path d={t.icon} />
              </svg>
            </button>
          ))}

          <div style={{ height: 1, alignSelf: 'stretch', background: line, margin: '5px 4px' }} />

          {/* مگنت — چسبیدن نقاط رسم به OHLC کندل */}
          <button onClick={() => setMagnetOn(v => !v)} title={magnetOn ? 'مگنت روشن' : 'مگنت خاموش'} aria-label="مگنت"
            style={railBtn(magnetOn)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <path d="M5 4 L5 12 a7 7 0 0 0 14 0 L19 4" /><path d="M5 4 L9 4 L9 11 M19 4 L15 4 L15 11" />
            </svg>
          </button>

          {/* قفل همه رسم‌ها */}
          <button onClick={toggleLockAll} title={locked ? 'باز کردن قفل رسم‌ها' : 'قفل همه رسم‌ها'} aria-label="قفل رسم‌ها"
            style={railBtn(locked)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <rect x="4" y="11" width="16" height="10" rx="2" />
              {locked ? <path d="M8 11 V7 a4 4 0 0 1 8 0 v4" /> : <path d="M8 11 V7 a4 4 0 0 1 7.7 -1.5" />}
            </svg>
          </button>

          {/* نمایش/پنهان‌سازی رسم‌ها */}
          <button onClick={toggleHideAll} title={drawingsHidden ? 'نمایش رسم‌ها' : 'پنهان‌کردن رسم‌ها'} aria-label="نمایش/پنهان رسم‌ها"
            style={railBtn(drawingsHidden)}>
            {drawingsHidden ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
                <path d="M17.94 17.94 A10.07 10.07 0 0 1 12 20 c-7 0-10-8-10-8 a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24 A9.12 9.12 0 0 1 12 4 c7 0 10 8 10 8 a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
                <path d="M2 12 S5 4 12 4 22 12 22 12 19 20 12 20 2 12 2 12 Z" /><circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>

          <button onClick={clearDrawings} title="حذف همه رسم‌ها" aria-label="حذف همه رسم‌ها"
            style={railBtn(false)}
            onMouseEnter={e => { e.currentTarget.style.color = RED; e.currentTarget.style.background = 'rgba(239,83,80,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.background = 'transparent' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>

        <div ref={containerRef} style={{
          direction: 'ltr', flex: 1, minWidth: 0, minHeight: 320,
          background: chartBg,
        }} />
      </div>

      {/* ── نوار پایین — بازه‌ها + مقیاس + ساعت تهران (مثل TradingView) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
        padding: '5px 12px', background: glassBg,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderTop: `1px solid ${line}`,
      }}>
        {RANGES.map(r => (
          <button key={r.label} onClick={() => applyRange(r.months)} style={{ ...btn(false), padding: '4px 9px', minHeight: 26 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#d9b45b' }}
            onMouseLeave={e => { e.currentTarget.style.color = muted }}>
            {r.label}
          </button>
        ))}

        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', padding: '0 6px' }}>
            {clock} (UTC+3:30)
          </span>
          <div style={{ width: 1, height: 14, background: line, margin: '0 5px' }} />
          <button onClick={() => applyScale(scaleMode === 'percentage' ? 'normal' : 'percentage')}
            title="مقیاس درصدی" style={{ ...btn(scaleMode === 'percentage'), padding: '4px 9px', minHeight: 26 }}>
            ٪
          </button>
          <button onClick={() => applyScale(scaleMode === 'logarithm' ? 'normal' : 'logarithm')}
            title="مقیاس لگاریتمی" style={{ ...btn(scaleMode === 'logarithm'), padding: '4px 9px', minHeight: 26 }}>
            لگاریتمی
          </button>
          <button onClick={() => applyScale('normal')}
            title="مقیاس خودکار" style={{ ...btn(scaleMode === 'normal'), padding: '4px 9px', minHeight: 26 }}>
            خودکار
          </button>
        </div>
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
