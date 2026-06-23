'use client'

import { useEffect, useRef } from 'react'
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
  time: string   // "YYYY-MM-DD"
  value: number
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

  // create chart once
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#4A6B8A',
        fontFamily: 'Vazirmatn, Arial, sans-serif',
        fontSize: 11,
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
      },
      crosshair: {
        mode: 1,
        vertLine: { color: 'rgba(0,200,255,0.3)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#0D1726' },
        horzLine: { color: 'rgba(0,200,255,0.3)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#0D1726' },
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

    // responsive
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

    const toSeries = (arr: ChartPoint[]) =>
      arr
        .filter(p => p.value != null && !Number.isNaN(p.value))
        .map(p => ({ time: p.time as Time, value: p.value }))

    areaRef.current.setData(toSeries(data))
    ma5Ref.current?.setData(toSeries(ma5))
    ma10Ref.current?.setData(toSeries(ma10))

    // anomaly markers
    if (areaRef.current) {
      const markers = anomalies.map(a => ({
        time: a.time as Time,
        position: 'aboveBar' as const,
        color: '#FF4D6A',
        shape: 'circle' as const,
        text: '⚠',
      }))
      createSeriesMarkers(areaRef.current, markers)
    }

    chartRef.current?.timeScale().fitContent()
  }, [data, ma5, ma10, anomalies])

  return <div ref={containerRef} style={{ width: '100%' }} />
}
