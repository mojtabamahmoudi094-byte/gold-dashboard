'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  AreaSeries,
  LineSeries,
  createSeriesMarkers,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'

export interface ChartPoint {
  time: string        // gregorian "YYYY-MM-DD" (for ordering / internal)
  value: number
  shamsi?: string     // shamsi label to show on axis
}

interface Props {
  data: ChartPoint[]
  ma5: ChartPoint[]
  ma10: ChartPoint[]
  anomalies: { time: string; value: number }[]
  height?: number
}

export default function TerminalChart({ data, ma5, ma10, anomalies, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null)
  const ma5Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const ma10Ref = useRef<ISeriesApi<'Line'> | null>(null)

  // map gregorian time -> shamsi label, for axis + tooltip
  const shamsiMap = useRef<Record<string, string>>({})

  const [showMA5, setShowMA5] = useState(true)
  const [showMA10, setShowMA10] = useState(true)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#4A6B8A',
        fontFamily: 'Vazirmatn, Arial, sans-serif',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(0,200,255,0.04)' },
        horzLines: { color: 'rgba(0,200,255,0.04)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(0,200,255,0.1)',
        scaleMargins: { top: 0.15, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(0,200,255,0.1)',
        timeVisible: false,
        // show shamsi label on the axis
        tickMarkFormatter: (time: any) => {
          const key = typeof time === 'string'
            ? time
            : `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
          const s = shamsiMap.current[key]
          if (s) {
            // show "MM/DD" part of "YYYY/MM/DD"
            const parts = s.split('/')
            return parts.length === 3 ? `${parts[1]}/${parts[2]}` : s
          }
          return ''
        },
      },
      localization: {
        // shamsi label on crosshair
        timeFormatter: (time: any) => {
          const key = typeof time === 'string'
            ? time
            : `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
          return shamsiMap.current[key] || String(time)
        },
      },
    })

    chartRef.current = chart

    const area = chart.addSeries(AreaSeries, {
      lineColor: '#00C8FF',
      topColor: 'rgba(0,200,255,0.18)',
      bottomColor: 'rgba(0,200,255,0)',
      lineWidth: 2,
      priceLineVisible: false,
    })
    areaRef.current = area

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
    }
  }, [height])

  // update data
  useEffect(() => {
    if (!areaRef.current) return

    // rebuild shamsi map
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

    if (areaRef.current) {
      const markers = anomalies
        .slice()
        .sort((a, b) => String(a.time).localeCompare(String(b.time)))
        .map(a => ({
          time: a.time as Time,
          position: 'aboveBar' as const,
          color: '#FF4D6A',
          shape: 'circle' as const,
          text: '⚠',
        }))
      createSeriesMarkers(areaRef.current, markers)
    }

    chartRef.current?.timeScale().fitContent()
  }, [data, ma5, ma10, anomalies, showMA5, showMA10])

  // toggle MA visibility
  const toggleMA5 = () => {
    const next = !showMA5
    setShowMA5(next)
  }
  const toggleMA10 = () => {
    const next = !showMA10
    setShowMA10(next)
  }

  return (
    <div>
      {/* MA toggle buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button
          onClick={toggleMA5}
          style={{
            fontSize: 11,
            padding: '4px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
            background: showMA5 ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
            border: `0.5px solid ${showMA5 ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
            color: showMA5 ? '#F59E0B' : '#4A6B8A',
          }}
        >
          MA5 {showMA5 ? '●' : '○'}
        </button>
        <button
          onClick={toggleMA10}
          style={{
            fontSize: 11,
            padding: '4px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
            background: showMA10 ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
            border: `0.5px solid ${showMA10 ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
            color: showMA10 ? '#8B5CF6' : '#4A6B8A',
          }}
        >
          MA10 {showMA10 ? '●' : '○'}
        </button>
      </div>
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  )
}
