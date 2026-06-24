'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  AreaSeries,
  LineSeries,
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'

export interface ChartPoint {
  time: string
  value: number
  shamsi?: string
}

interface Props {
  data: ChartPoint[]
  ma5: ChartPoint[]
  ma10: ChartPoint[]
  anomalies: { time: string; value: number }[]
  height?: number
  isDark?: boolean
}

export default function TerminalChart({ data, ma5, ma10, anomalies, height = 360, isDark = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null)
  const ma5Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const ma10Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const shamsiMap = useRef<Record<string, string>>({})

  const [showMA5, setShowMA5] = useState(true)
  const [showMA10, setShowMA10] = useState(true)
  const [showAnomaly, setShowAnomaly] = useState(true)

  const colors = isDark
    ? { text: '#7B93AC', grid: 'rgba(0,200,255,0.04)', border: 'rgba(0,200,255,0.1)', accent: '#00C8FF', cross: 'rgba(0,200,255,0.3)', crossBg: '#0D1726' }
    : { text: '#5A6B7E', grid: 'rgba(0,120,170,0.06)', border: 'rgba(0,120,170,0.15)', accent: '#0095C8', cross: 'rgba(0,120,170,0.4)', crossBg: '#FFFFFF' }

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.text,
        fontFamily: 'Vazirmatn, Arial, sans-serif',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: { top: 0.15, bottom: 0.1 },
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: false,
        tickMarkFormatter: (time: any) => {
          const key = typeof time === 'string'
            ? time
            : `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
          const s = shamsiMap.current[key]
          if (s) {
            const parts = s.split('/')
            return parts.length === 3 ? `${parts[1]}/${parts[2]}` : s
          }
          return ''
        },
      },
      localization: {
        timeFormatter: (time: any) => {
          const key = typeof time === 'string'
            ? time
            : `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
          return shamsiMap.current[key] || String(time)
        },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: colors.cross, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.crossBg },
        horzLine: { color: colors.cross, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.crossBg },
      },
    })

    chartRef.current = chart

    const area = chart.addSeries(AreaSeries, {
      lineColor: colors.accent,
      topColor: isDark ? 'rgba(0,200,255,0.18)' : 'rgba(0,149,200,0.18)',
      bottomColor: isDark ? 'rgba(0,200,255,0)' : 'rgba(0,149,200,0)',
      lineWidth: 2,
      priceLineVisible: false,
    })
    areaRef.current = area

    // create the markers plugin ONCE and keep a handle to it
    markersRef.current = createSeriesMarkers(area, [])

    const ma5Series = chart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    })
    ma5Ref.current = ma5Series

    const ma10Series = chart.addSeries(LineSeries, {
      color: '#8B5CF6',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    })
    ma10Ref.current = ma10Series

    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      chart.applyOptions({ width: w })
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      markersRef.current = null
    }
  }, [height, isDark])

  // update line data
  useEffect(() => {
    if (!areaRef.current) return

    const map: Record<string, string> = {}
    data.forEach(p => { if (p.time && p.shamsi) map[p.time] = p.shamsi })
    shamsiMap.current = map

    const toSeries = (arr: ChartPoint[]) =>
      arr
        .filter(p => p.value != null && !Number.isNaN(p.value) && p.time)
        .map(p => ({ time: p.time as Time, value: p.value }))
        .sort((a, b) => String(a.time).localeCompare(String(b.time)))

    areaRef.current.setData(toSeries(data))
    ma5Ref.current?.setData(showMA5 ? toSeries(ma5) : [])
    ma10Ref.current?.setData(showMA10 ? toSeries(ma10) : [])

    chartRef.current?.timeScale().fitContent()
  }, [data, ma5, ma10, showMA5, showMA10, isDark])

  // update anomaly markers separately (so toggle works reliably)
  useEffect(() => {
    if (!markersRef.current) return

    const markers = showAnomaly
      ? anomalies
          .slice()
          .sort((a, b) => String(a.time).localeCompare(String(b.time)))
          .map(a => ({
            time: a.time as Time,
            position: 'aboveBar' as const,
            color: '#FF4D6A',
            shape: 'circle' as const,
            text: '⚠',
          }))
      : []

    markersRef.current.setMarkers(markers)
  }, [anomalies, showAnomaly, isDark])

  const btnStyle = (active: boolean, activeColor: string) => ({
    fontSize: 11, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' as const,
    background: active ? `${activeColor}26` : 'rgba(128,128,128,0.08)',
    border: `0.5px solid ${active ? `${activeColor}80` : 'rgba(128,128,128,0.25)'}`,
    color: active ? activeColor : colors.text,
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button onClick={() => setShowMA5(!showMA5)} style={btnStyle(showMA5, '#F59E0B')}>
          میانگین ۵ {showMA5 ? '●' : '○'}
        </button>
        <button onClick={() => setShowMA10(!showMA10)} style={btnStyle(showMA10, '#8B5CF6')}>
          میانگین ۱۰ {showMA10 ? '●' : '○'}
        </button>
        <button onClick={() => setShowAnomaly(!showAnomaly)} style={btnStyle(showAnomaly, '#FF4D6A')}>
          ناهنجاری {showAnomaly ? '●' : '○'}
        </button>
      </div>
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  )
}
