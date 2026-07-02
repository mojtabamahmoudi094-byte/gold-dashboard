'use client'

import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import DateObject from 'react-date-object'
import persian from 'react-date-object/calendars/persian'
import gregorian from 'react-date-object/calendars/gregorian'

const TerminalChart = dynamic(() => import('../dashboard/TerminalChart'), { ssr: false })

const safe = (v: any) => Number(v || 0)

function shamsiToGregorian(shamsi: string): string {
  try {
    const d = new DateObject({ date: shamsi, format: 'YYYY/MM/DD', calendar: persian })
    return d.convert(gregorian).format('YYYY-MM-DD')
  } catch {
    return ''
  }
}

function calcMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) =>
    i < period - 1
      ? null
      : data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  )
}

function stdDev(arr: number[]): number {
  if (!arr.length) return 0
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((a, b) => a + (b - avg) ** 2, 0) / arr.length)
}

const CATS = [
  {
    key: 'طلا',
    label: 'ارزش کل معاملات طلا',
    color: 'oklch(0.82 0.15 70)',
    iconBg: 'oklch(0.78 0.15 70 / 0.18)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.82 0.15 70)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    key: 'نقره',
    label: 'ارزش کل معاملات نقره',
    color: 'oklch(0.84 0.03 240)',
    iconBg: 'oklch(0.8 0.03 240 / 0.24)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.84 0.03 240)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="7" height="18" rx="1" />
        <rect x="9.5" y="8" width="5" height="13" rx="1" />
        <rect x="17" y="5" width="5" height="16" rx="1" />
      </svg>
    ),
  },
  {
    key: 'زعفران',
    label: 'ارزش کل معاملات زعفران',
    color: 'oklch(0.74 0.19 40)',
    iconBg: 'oklch(0.68 0.19 40 / 0.22)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.74 0.19 40)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 0 0 8" />
        <path d="M12 2a4 4 0 0 1 0 8" />
        <path d="M12 10v12" />
        <path d="M8 14s1 1 4 1 4-1 4-1" />
      </svg>
    ),
  },
]

export default function TradeValuePage() {
  const [isDark, setIsDark] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [allAssets, setAllAssets] = useState<any[]>([])
  const [allRecords, setAllRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => {
      window.removeEventListener('themechange', handler)
      window.removeEventListener('resize', checkMobile)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/funds', { cache: 'no-store' })
        if (!res.ok) { setLoading(false); return }
        const { assets, records } = await res.json()
        setAllAssets(assets || [])
        setAllRecords(records || [])
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const categoryData = useMemo(() => {
    if (!allAssets.length || !allRecords.length) return {}

    const result: Record<string, {
      chartData: any[]
      ma5Data: any[]
      ma10Data: any[]
      anomalyData: { time: string; value: number }[]
      stats: { last: number; change: number; n: number; latestDate: string }
    }> = {}

    for (const cat of CATS) {
      const catAssetIds = allAssets.filter((a: any) => a.category === cat.key).map((a: any) => a.id)
      const catRecords = allRecords.filter((r: any) => catAssetIds.includes(r.asset_id))

      // aggregate: sum trade_value per shamsi date
      const dateMap: Record<string, number> = {}
      for (const r of catRecords) {
        const d = r.trade_date_shamsi
        if (!d) continue
        dateMap[d] = (dateMap[d] || 0) + safe(r.trade_value)
      }

      const dateKeys = Object.keys(dateMap).sort()
      // convert ریال→ میلیارد تومان
      const vals = dateKeys.map(d => dateMap[d] / 1e10)

      const ma5arr = calcMA(vals, 5)
      const ma10arr = calcMA(vals, 10)

      // anomaly: >2σ from 7-day window
      const anomalyFlags = vals.map((v, i) => {
        const window = vals.slice(Math.max(0, i - 6), i)
        if (window.length < 3) return false
        const sd = stdDev(window)
        const avg = window.reduce((a, b) => a + b, 0) / window.length
        return sd > 0 && Math.abs(v - avg) > 2 * sd
      })

      const chartData = dateKeys.map((d, i) => ({
        time: shamsiToGregorian(d),
        value: vals[i],
        shamsi: d,
      })).filter(p => p.time)

      const ma5Data = dateKeys.map((d, i) => ({
        time: shamsiToGregorian(d),
        value: ma5arr[i] as number,
        shamsi: d,
      })).filter(p => p.time && p.value != null)

      const ma10Data = dateKeys.map((d, i) => ({
        time: shamsiToGregorian(d),
        value: ma10arr[i] as number,
        shamsi: d,
      })).filter(p => p.time && p.value != null)

      const anomalyData = dateKeys
        .map((d, i) => anomalyFlags[i] ? { time: shamsiToGregorian(d), value: vals[i] } : null)
        .filter(Boolean) as { time: string; value: number }[]

      const last = vals.at(-1) || 0
      const prev = vals.at(-2) || 0
      const change = prev ? ((last - prev) / prev) * 100 : 0

      result[cat.key] = {
        chartData,
        ma5Data,
        ma10Data,
        anomalyData,
        stats: { last, change, n: vals.length, latestDate: dateKeys.at(-1) || '' },
      }
    }

    return result
  }, [allAssets, allRecords])

  const t = isDark
    ? { bg: '#0a0d14', text: '#eef1f8', card: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', muted: '#8b93a7', bright: '#eef1f8', cardInner: 'rgba(255,255,255,0.025)' }
    : { bg: '#f1f5f9', text: '#0f172a', card: 'rgba(0,0,0,0.03)', border: 'rgba(0,0,0,0.08)', muted: '#64748b', bright: '#0f172a', cardInner: 'rgba(0,0,0,0.02)' }

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '24px 16px 48px' : '36px 6vw 64px' }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <Link href="/" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            بازگشت به خانه
          </Link>
          <h1 style={{ fontSize: isMobile ? 26 : 34, fontWeight: 900, margin: '0 0 10px', color: t.bright }}>ارزش معاملات</h1>
          <p style={{ color: t.muted, fontSize: 15, margin: 0 }}>ارزش کل معاملات روزانه صندوق‌های طلا، نقره و زعفران به میلیارد تومان</p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: 380, background: t.card, border: `1px solid ${t.border}`, borderRadius: 20, animation: 'bs-pulse 1.8s ease-in-out infinite' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {CATS.map(cat => {
              const data = categoryData[cat.key]
              if (!data) return null
              const { chartData, ma5Data, ma10Data, anomalyData, stats } = data
              const isUp = stats.change >= 0

              return (
                <div key={cat.key} style={{
                  background: t.card,
                  border: `1px solid ${t.border}`,
                  borderRadius: 20,
                  padding: isMobile ? '20px 16px' : '28px 32px',
                }}>

                  {/* Section header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 14, marginBottom: 24,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 46, height: 46, borderRadius: 14, background: cat.iconBg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {cat.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, color: t.bright }}>{cat.label}</div>
                        <div style={{ fontSize: 12, color: t.muted, marginTop: 3 }}>
                          {stats.n > 0 ? `${stats.n} روز معاملاتی` : 'داده موجود نیست'}
                          {stats.latestDate ? ` · آخرین: ${stats.latestDate}` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Stat chips */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{
                        padding: '10px 18px', borderRadius: 12,
                        background: `${cat.color.replace(')', ' / 0.12)').replace('oklch(', 'oklch(')}`,
                        border: `1px solid ${cat.color.replace(')', ' / 0.35)').replace('oklch(', 'oklch(')}`,
                      }}>
                        <div style={{ fontSize: 11, color: t.muted, marginBottom: 3 }}>آخرین روز</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: cat.color, fontFamily: 'system-ui, sans-serif' }}>
                          {stats.last > 0
                            ? `${stats.last.toLocaleString('fa-IR', { maximumFractionDigits: 1 })} م.ت`
                            : '—'}
                        </div>
                      </div>
                      <div style={{
                        padding: '10px 18px', borderRadius: 12,
                        background: isUp ? 'rgba(0,229,160,0.08)' : 'rgba(255,77,106,0.08)',
                        border: `1px solid ${isUp ? 'rgba(0,229,160,0.3)' : 'rgba(255,77,106,0.3)'}`,
                      }}>
                        <div style={{ fontSize: 11, color: t.muted, marginBottom: 3 }}>تغییر روز</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: isUp ? '#00E5A0' : '#FF4D6A', fontFamily: 'system-ui, sans-serif' }}>
                          {stats.n >= 2 ? `${isUp ? '+' : ''}${stats.change.toFixed(2)}٪` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Chart */}
                  {chartData.length > 0 ? (
                    <TerminalChart
                      data={chartData}
                      ma5={ma5Data}
                      ma10={ma10Data}
                      anomalies={anomalyData}
                      height={isMobile ? 220 : 300}
                      isDark={isDark}
                    />
                  ) : (
                    <div style={{
                      height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: t.muted, fontSize: 14, background: t.cardInner, borderRadius: 12,
                    }}>
                      داده‌ای برای نمایش وجود ندارد
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
