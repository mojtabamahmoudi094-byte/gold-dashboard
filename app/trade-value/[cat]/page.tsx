'use client'

import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import DateObject from 'react-date-object'
import persian from 'react-date-object/calendars/persian'
import gregorian from 'react-date-object/calendars/gregorian'
import { supabase } from '../../../lib/supabase'
import { Skeleton } from '../../components/ui/Skeleton'
import { useIsMobile } from '../../../lib/useIsMobile'
import { safe } from '../../../lib/format'

const TerminalChart = dynamic(() => import('../../dashboard/TerminalChart'), { ssr: false })


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

const CAT_MAP: Record<string, {
  category: string
  aggregateSlug: string | null   // null = aggregate from individual fund rows
  label: string
  color: string
  iconBg: string
  borderColor: string
  icon: React.ReactNode
}> = {
  gold: {
    category: 'طلا',
    aggregateSlug: 'gold',          // pre-aggregated by sync-funds.js
    label: 'ارزش کل معاملات طلا',
    color: 'oklch(0.82 0.15 70)',
    iconBg: 'oklch(0.78 0.15 70 / 0.18)',
    borderColor: 'oklch(0.82 0.15 70 / 0.3)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.82 0.15 70)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  silver: {
    category: 'نقره',
    aggregateSlug: null,
    label: 'ارزش کل معاملات نقره',
    color: 'oklch(0.84 0.03 240)',
    iconBg: 'oklch(0.8 0.03 240 / 0.24)',
    borderColor: 'oklch(0.84 0.03 240 / 0.3)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.84 0.03 240)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="7" height="18" rx="1" />
        <rect x="9.5" y="8" width="5" height="13" rx="1" />
        <rect x="17" y="5" width="5" height="16" rx="1" />
      </svg>
    ),
  },
  saffron: {
    category: 'زعفران',
    aggregateSlug: null,
    label: 'ارزش کل معاملات زعفران',
    color: 'oklch(0.74 0.19 40)',
    iconBg: 'oklch(0.68 0.19 40 / 0.22)',
    borderColor: 'oklch(0.74 0.19 40 / 0.3)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.74 0.19 40)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 0 0 8" />
        <path d="M12 2a4 4 0 0 1 0 8" />
        <path d="M12 10v12" />
        <path d="M8 14s1 1 4 1 4-1 4-1" />
      </svg>
    ),
  },
  leveraged: {
    category: 'اهرمی',
    aggregateSlug: null,
    label: 'ارزش کل معاملات صندوق‌های اهرمی',
    color: 'oklch(0.72 0.19 25)',
    iconBg: 'oklch(0.72 0.19 25 / 0.18)',
    borderColor: 'oklch(0.72 0.19 25 / 0.3)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.72 0.19 25)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>
    ),
  },
  sector: {
    category: 'بخشی',
    aggregateSlug: null,
    label: 'ارزش کل معاملات صندوق‌های بخشی',
    color: 'oklch(0.76 0.14 210)',
    iconBg: 'oklch(0.76 0.14 210 / 0.18)',
    borderColor: 'oklch(0.76 0.14 210 / 0.3)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.76 0.14 210)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v9l6.5 6.2" />
        <path d="M12 12 4 8" />
      </svg>
    ),
  },
  equity: {
    category: 'سهامی',
    aggregateSlug: null,
    label: 'ارزش کل معاملات صندوق‌های سهامی',
    color: 'oklch(0.78 0.13 300)',
    iconBg: 'oklch(0.78 0.13 300 / 0.18)',
    borderColor: 'oklch(0.78 0.13 300 / 0.3)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.78 0.13 300)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="12" width="4" height="9" rx="1" />
        <rect x="10" y="7" width="4" height="14" rx="1" />
        <rect x="17" y="3" width="4" height="18" rx="1" />
      </svg>
    ),
  },
}

export default function TradeValueDetailPage() {
  const params = useParams()
  const slug = (params?.cat as string) || 'gold'
  const cat = CAT_MAP[slug] || CAT_MAP.gold

  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  // raw rows: { trade_date_shamsi, trade_value }
  const [rawRows, setRawRows] = useState<{ trade_date_shamsi: string; trade_value: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => {
      window.removeEventListener('themechange', handler)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setRawRows([])
    const load = async () => {
      try {
        if (cat.aggregateSlug) {
          // Gold: use pre-aggregated asset (stored in billion Tomans by sync-funds.js)
          const { data: assetRow } = await supabase
            .from('assets')
            .select('id')
            .eq('slug', cat.aggregateSlug)
            .single()

          if (!assetRow) { setLoading(false); return }

          const { data: rows } = await supabase
            .from('gold_funds')
            .select('trade_date_shamsi, trade_value')
            .eq('asset_id', assetRow.id)
            .order('id', { ascending: true })

          setRawRows(rows ?? [])
        } else {
          // Silver / Saffron: aggregate individual fund rows
          const { data: catAssets } = await supabase
            .from('assets')
            .select('id')
            .eq('category', cat.category)
            .neq('slug', 'gold')

          if (!catAssets?.length) { setLoading(false); return }
          const ids = catAssets.map((a: any) => a.id)

          // صفحه‌بندی — Supabase هر درخواست را به ۱۰۰۰ ردیف محدود می‌کند
          // (مثلاً سهامی: ۷۸ صندوق × ۴۴ روز تاریخچه)
          const all: { trade_date_shamsi: string; trade_value: number }[] = []
          for (let from = 0; from < 20000; from += 1000) {
            const { data: page } = await supabase
              .from('gold_funds')
              .select('trade_date_shamsi, trade_value')
              .in('asset_id', ids)
              .order('trade_date_shamsi', { ascending: true })
              .range(from, from + 999)
            if (!page || page.length === 0) break
            all.push(...page)
            if (page.length < 1000) break
          }

          setRawRows(all)
        }
      } catch (e) {
        console.error('[trade-value] load error:', e)
      }
      setLoading(false)
    }
    load()
  }, [slug])

  const chartState = useMemo(() => {
    if (!rawRows.length) return null

    let dateMap: Record<string, number> = {}

    if (cat.aggregateSlug) {
      // Gold aggregate rows: trade_value already in billion Tomans
      for (const r of rawRows) {
        if (!r.trade_date_shamsi) continue
        // last write wins (sync upserts same date)
        dateMap[r.trade_date_shamsi] = safe(r.trade_value)
      }
    } else {
      // Individual fund rows: trade_value in Rial → ÷1e10 → billion Tomans
      for (const r of rawRows) {
        if (!r.trade_date_shamsi) continue
        dateMap[r.trade_date_shamsi] = (dateMap[r.trade_date_shamsi] || 0) + safe(r.trade_value)
      }
      for (const k of Object.keys(dateMap)) {
        dateMap[k] = dateMap[k] / 1e10
      }
    }

    const dateKeys = Object.keys(dateMap).sort()
    const vals = dateKeys.map(d => dateMap[d])

    const ma5arr  = calcMA(vals, 5)
    const ma10arr = calcMA(vals, 10)

    const anomalyFlags = vals.map((v, i) => {
      const win = vals.slice(Math.max(0, i - 6), i)
      if (win.length < 3) return false
      const sd  = stdDev(win)
      const avg = win.reduce((a, b) => a + b, 0) / win.length
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

    const last   = vals.at(-1) || 0
    const prev   = vals.at(-2) || 0
    const change = prev ? ((last - prev) / prev) * 100 : 0

    return {
      chartData, ma5Data, ma10Data, anomalyData,
      stats: { last, change, n: vals.length, latestDate: dateKeys.at(-1) || '' },
    }
  }, [rawRows, slug])

  const t = isDark
    ? { bg: '#060B14', text: '#E8F4FF', card: 'rgba(10,18,30,0.88)', border: `0.5px solid ${cat.borderColor}`, muted: '#5A7088', cardInner: 'rgba(255,255,255,0.025)' }
    : { bg: '#F4F7FB', text: '#0F1E2E', card: 'rgba(255,255,255,0.9)', border: `0.5px solid ${cat.borderColor}`, muted: '#6B7F90', cardInner: 'rgba(0,0,0,0.02)' }

  const isUp = (chartState?.stats.change ?? 0) >= 0

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '24px 16px 48px' : '36px 6vw 64px' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28, fontSize: 13, color: t.muted }}>
          <Link href="/" style={{ color: '#3b82f6', textDecoration: 'none' }}>خانه</Link>
          <span>/</span>
          <Link href="/trade-value" style={{ color: '#3b82f6', textDecoration: 'none' }}>ارزش معاملات</Link>
          <span>/</span>
          {['leveraged', 'sector', 'equity'].includes(slug) && (
            <>
              <Link href="/trade-value/bourse" style={{ color: '#3b82f6', textDecoration: 'none' }}>صندوق‌های بورسی</Link>
              <span>/</span>
            </>
          )}
          <span style={{ color: t.text }}>{cat.label}</span>
        </div>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: cat.iconBg,
            border: t.border,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {cat.icon}
          </div>
          <div>
            <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, margin: '0 0 4px', color: t.text }}>{cat.label}</h1>
            {loading ? (
              <Skeleton width={170} height={13} style={{ marginTop: 2 }} />
            ) : (
              <p style={{ color: t.muted, fontSize: 13, margin: 0 }}>
                {chartState
                  ? `${chartState.stats.n} روز معاملاتی · آخرین: ${chartState.stats.latestDate}`
                  : 'داده‌ای یافت نشد'}
              </p>
            )}
          </div>
        </div>

        {/* Stat chips */}
        {chartState && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
            <div style={{
              padding: '12px 20px', borderRadius: 12,
              background: cat.iconBg, border: t.border,
            }}>
              <div style={{ fontSize: 11, color: t.muted, marginBottom: 3 }}>آخرین روز</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: cat.color, fontFamily: 'system-ui, sans-serif' }}>
                {chartState.stats.last > 0
                  ? `${chartState.stats.last.toLocaleString('fa-IR', { maximumFractionDigits: 1 })} م.ت`
                  : '—'}
              </div>
            </div>
            <div style={{
              padding: '12px 20px', borderRadius: 12,
              background: isUp ? 'rgba(0,229,160,0.08)' : 'rgba(255,77,106,0.08)',
              border: `0.5px solid ${isUp ? 'rgba(0,229,160,0.3)' : 'rgba(255,77,106,0.3)'}`,
            }}>
              <div style={{ fontSize: 11, color: t.muted, marginBottom: 3 }}>تغییر روز</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: isUp ? '#00E5A0' : '#FF4D6A', fontFamily: 'system-ui, sans-serif' }}>
                {chartState.stats.n >= 2 ? `${isUp ? '+' : ''}${chartState.stats.change.toFixed(2)}٪` : '—'}
              </div>
            </div>
          </div>
        )}

        {/* Chart card */}
        <div style={{
          background: t.card,
          border: t.border,
          borderRadius: 20,
          padding: isMobile ? '20px 16px' : '28px 32px',
          backdropFilter: 'blur(12px)',
        }}>
          {loading ? (
            <div style={{ height: isMobile ? 260 : 400, background: t.cardInner, borderRadius: 12, animation: 'bs-pulse 1.8s ease-in-out infinite' }} />
          ) : chartState && chartState.chartData.length > 0 ? (
            <TerminalChart
              data={chartState.chartData}
              ma5={chartState.ma5Data}
              ma10={chartState.ma10Data}
              anomalies={chartState.anomalyData}
              height={isMobile ? 260 : 400}
              isDark={isDark}
            />
          ) : (
            <div style={{
              height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: t.muted, fontSize: 14, background: t.cardInner, borderRadius: 12,
            }}>
              داده‌ای برای نمایش وجود ندارد
            </div>
          )}
        </div>

      </div>
    </main>
  )
}
