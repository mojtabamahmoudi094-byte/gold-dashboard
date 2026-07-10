'use client'

// نمودار تحلیل تکنیکال — lightweight-charts v5
// pane 0: کندل + حجم (overlay) + MA/بولینگر — pane 1: RSI — pane 2: MACD
// پالت خطوط با اسکریپت dataviz روی سطح #060B14 اعتبارسنجی شده:
// MA20 آبی #3b82f6، MA50 نارنجی #d97706، بولینگر فیروزه‌ای #0891b2

import { useEffect, useRef } from 'react'
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries,
  type IChartApi, type Time,
} from 'lightweight-charts'
import { sma, rsi, macd, bollinger, type Candle } from '../../lib/indicators'

export const GREEN = 'oklch(0.74 0.16 150)'
export const RED   = 'oklch(0.68 0.19 25)'
export const LINE_COLORS = { ma20: '#3b82f6', ma50: '#d97706', boll: '#0891b2' }

export type IndicatorToggles = {
  ma20: boolean
  ma50: boolean
  bollinger: boolean
  rsi: boolean
  macd: boolean
}

type Props = {
  candles: Candle[]
  toggles: IndicatorToggles
  isDark: boolean
  height?: number
}

export default function TechnicalChart({ candles, toggles, isDark, height = 460 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || candles.length === 0) return

    const text  = isDark ? '#8b93a7' : '#6B7F90'
    const grid  = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,30,46,0.06)'
    const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,30,46,0.12)'

    const shamsiOf = new Map(candles.map(c => [c.time, c.shamsi]))
    const paneCount = 1 + (toggles.rsi ? 1 : 0) + (toggles.macd ? 1 : 0)
    const chart = createChart(el, {
      width: el.clientWidth,
      height: height + (paneCount - 1) * 120,
      layout: {
        background: { color: 'transparent' },
        textColor: text,
        fontFamily: 'Vazirmatn, Arial, sans-serif',
        panes: { separatorColor: border, enableResize: false },
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, rightOffset: 4 },
      crosshair: { mode: 0 },
      localization: {
        // برچسب کراس‌هر: تاریخ شمسی همان روز
        timeFormatter: (t: Time) => shamsiOf.get(String(t)) ?? String(t),
        priceFormatter: (p: number) => p.toLocaleString('fa-IR', { maximumFractionDigits: 0 }),
      },
    })
    chartRef.current = chart

    const closes = candles.map(c => c.close)

    // ── pane 0: کندل
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: GREEN, downColor: RED,
      wickUpColor: GREEN, wickDownColor: RED,
      borderVisible: false,
    })
    candleSeries.setData(candles.map(c => ({
      time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
    })))

    // حجم — overlay پایین pane 0
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    volSeries.setData(candles.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open
        ? (isDark ? 'rgba(52,199,123,0.35)' : 'rgba(52,199,123,0.5)')
        : (isDark ? 'rgba(239,83,80,0.35)' : 'rgba(239,83,80,0.5)'),
    })))

    const lineData = (vals: (number | null)[]) =>
      candles.flatMap((c, i) => (vals[i] === null ? [] : [{ time: c.time as Time, value: vals[i] as number }]))

    if (toggles.ma20) {
      chart.addSeries(LineSeries, {
        color: LINE_COLORS.ma20, lineWidth: 2, lastValueVisible: false, priceLineVisible: false,
      }).setData(lineData(sma(closes, 20)))
    }
    if (toggles.ma50) {
      chart.addSeries(LineSeries, {
        color: LINE_COLORS.ma50, lineWidth: 2, lastValueVisible: false, priceLineVisible: false,
      }).setData(lineData(sma(closes, 50)))
    }
    if (toggles.bollinger) {
      const bb = bollinger(closes)
      for (const key of ['upper', 'lower'] as const) {
        chart.addSeries(LineSeries, {
          color: LINE_COLORS.boll, lineWidth: 1, lineStyle: 2, // خط‌چین
          lastValueVisible: false, priceLineVisible: false,
        }).setData(lineData(bb.map(b => b[key])))
      }
    }

    // ── pane 1: RSI
    let paneIdx = 1
    if (toggles.rsi) {
      const rsiSeries = chart.addSeries(LineSeries, {
        color: '#ec4899', lineWidth: 2, lastValueVisible: true, priceLineVisible: false,
      }, paneIdx)
      rsiSeries.setData(lineData(rsi(closes)))
      rsiSeries.createPriceLine({ price: 70, color: RED,   lineWidth: 1, lineStyle: 3, axisLabelVisible: false, title: '' })
      rsiSeries.createPriceLine({ price: 30, color: GREEN, lineWidth: 1, lineStyle: 3, axisLabelVisible: false, title: '' })
      paneIdx++
    }

    // ── pane بعدی: MACD
    if (toggles.macd) {
      const m = macd(closes)
      const histSeries = chart.addSeries(HistogramSeries, {
        lastValueVisible: false, priceLineVisible: false,
      }, paneIdx)
      histSeries.setData(candles.flatMap((c, i) => (m[i].hist === null ? [] : [{
        time: c.time as Time,
        value: m[i].hist as number,
        color: (m[i].hist as number) >= 0
          ? (isDark ? 'rgba(52,199,123,0.6)' : 'rgba(52,199,123,0.75)')
          : (isDark ? 'rgba(239,83,80,0.6)' : 'rgba(239,83,80,0.75)'),
      }])))
      chart.addSeries(LineSeries, {
        color: LINE_COLORS.ma20, lineWidth: 2, lastValueVisible: false, priceLineVisible: false,
      }, paneIdx).setData(lineData(m.map(x => x.macd)))
      chart.addSeries(LineSeries, {
        color: LINE_COLORS.ma50, lineWidth: 2, lastValueVisible: false, priceLineVisible: false,
      }, paneIdx).setData(lineData(m.map(x => x.signal)))
    }

    chart.timeScale().fitContent()

    const onResize = () => chart.applyOptions({ width: el.clientWidth })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
      chartRef.current = null
    }
  }, [candles, toggles, isDark, height])

  // نمودار کانواسی LTR است — راست‌به‌چپ شدن container محور زمان را می‌شکند
  return <div ref={containerRef} style={{ direction: 'ltr', width: '100%' }} />
}
