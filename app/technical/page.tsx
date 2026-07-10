'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../lib/useIsMobile'
import { GREEN, RED } from './TechnicalChart'

type IdxRow = { index_name: string; trade_date: string; trade_date_shamsi: string; value: number; change_pct: number | null }
type SymRow = { l18: string; pcp: number | null }

const POPULAR = ['فولاد', 'فملی', 'شستا', 'خودرو', 'ذوب', 'وبملت', 'شپنا', 'اهرم']
const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const toSlug = (s: string) => encodeURIComponent(s.replace(/\s+/g, '-'))

export default function TechnicalIndexPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [q, setQ] = useState('')
  const [symbols, setSymbols] = useState<SymRow[]>([])
  const [indices, setIndices] = useState<IdxRow[]>([])
  const [idxHistory, setIdxHistory] = useState<IdxRow[]>([])
  const [selIndex, setSelIndex] = useState('شاخص کل')
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  // فهرست نمادها برای جست‌وجو — از payload موجود رصد بازار
  useEffect(() => {
    fetch('/api/stocks-industries')
      .then(r => r.json())
      .then((d: { industries?: { symbols: SymRow[] }[] }) => {
        const all = (d.industries ?? []).flatMap(i => i.symbols)
        setSymbols(all)
      })
      .catch(() => {})
  }, [])

  // آخرین مقدار هر شاخص (برای کارت‌ها)
  useEffect(() => {
    supabase
      .from('index_candles')
      .select('index_name, trade_date, trade_date_shamsi, value, change_pct')
      .order('trade_date', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!data) return
        const seen = new Map<string, IdxRow>()
        for (const r of data as IdxRow[]) if (!seen.has(r.index_name)) seen.set(r.index_name, r)
        setIndices([...seen.values()])
      })
  }, [])

  // تاریخچه شاخص انتخابی
  useEffect(() => {
    supabase
      .from('index_candles')
      .select('index_name, trade_date, trade_date_shamsi, value, change_pct')
      .eq('index_name', selIndex)
      .order('trade_date', { ascending: true })
      .then(({ data }) => setIdxHistory((data as IdxRow[]) ?? []))
  }, [selIndex])

  // نمودار خطی شاخص — lightweight-charts فقط سمت کلاینت
  useEffect(() => {
    const el = chartRef.current
    if (!el || idxHistory.length === 0) return
    let chart: import('lightweight-charts').IChartApi | null = null
    let disposed = false
    import('lightweight-charts').then(({ createChart, AreaSeries }) => {
      if (disposed || !chartRef.current) return
      const text = isDark ? '#8b93a7' : '#6B7F90'
      const grid = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,30,46,0.06)'
      const shamsiOf = new Map(idxHistory.map(r => [r.trade_date, r.trade_date_shamsi]))
      chart = createChart(el, {
        width: el.clientWidth, height: 300,
        layout: { background: { color: 'transparent' }, textColor: text, fontFamily: 'Vazirmatn, Arial, sans-serif' },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } },
        rightPriceScale: { borderColor: grid },
        timeScale: { borderColor: grid },
        localization: {
          timeFormatter: (t: unknown) => shamsiOf.get(String(t)) ?? String(t),
          priceFormatter: (p: number) => p.toLocaleString('fa-IR', { maximumFractionDigits: 0 }),
        },
      })
      const s = chart.addSeries(AreaSeries, {
        lineColor: '#3b82f6', lineWidth: 2,
        topColor: 'rgba(59,130,246,0.3)', bottomColor: 'rgba(59,130,246,0)',
      })
      s.setData(idxHistory.map(r => ({ time: r.trade_date as import('lightweight-charts').Time, value: r.value })))
      chart.timeScale().fitContent()
    })
    const onResize = () => { if (chartRef.current && chart) chart.applyOptions({ width: chartRef.current.clientWidth }) }
    window.addEventListener('resize', onResize)
    return () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      chart?.remove()
    }
  }, [idxHistory, isDark])

  const matches = useMemo(() => {
    const query = q.trim()
    if (!query) return []
    return symbols.filter(s => s.l18.includes(query)).slice(0, 8)
  }, [q, symbols])

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const panel = isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.9)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px' : '40px 24px' }}>

        <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: '0 0 6px' }}>تحلیل تکنیکال</h1>
        <p style={{ fontSize: 13.5, color: muted, margin: '0 0 22px', lineHeight: 1.8 }}>
          نمودار کندلی ۳ سال اخیر همه نمادهای بورس و فرابورس با اندیکاتورهای RSI، MACD،
          میانگین متحرک و باند بولینگر
        </p>

        {/* جست‌وجوی نماد */}
        <div style={{ position: 'relative', marginBottom: 26 }}>
          <label htmlFor="ta-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            جست‌وجوی نماد
          </label>
          <input
            id="ta-search"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && matches.length > 0) router.push(`/technical/${toSlug(matches[0].l18)}`) }}
            placeholder="جست‌وجوی نماد… (مثلاً فولاد)"
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: 15, fontFamily: 'inherit',
              padding: '14px 18px', borderRadius: 14, outline: 'none',
              background: panel, color: text, border: `1px solid ${line}`,
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)' }}
            onBlur={e => { e.currentTarget.style.borderColor = '' }}
          />
          {matches.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 50, marginTop: 6,
              background: isDark ? '#12161f' : '#fffdf8', borderRadius: 14, padding: 6,
              border: `1px solid ${line}`,
              boxShadow: isDark ? '0 18px 50px rgba(0,0,0,0.6)' : '0 14px 40px rgba(0,0,0,0.14)',
            }}>
              {matches.map(m => (
                <Link key={m.l18} href={`/technical/${toSlug(m.l18)}`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '11px 14px', borderRadius: 9, textDecoration: 'none',
                  fontSize: 13.5, color: text, fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <span>{m.l18}</span>
                  {m.pcp !== null && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: m.pcp >= 0 ? GREEN : RED }}>
                      {m.pcp >= 0 ? '▲' : '▼'} {fa(Math.abs(m.pcp), 2)}٪
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* نمادهای پرطرفدار */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 30 }}>
          {POPULAR.map(s => (
            <Link key={s} href={`/technical/${toSlug(s)}`} style={{
              fontSize: 13, padding: '8px 16px', borderRadius: 10, minHeight: 34,
              textDecoration: 'none', color: '#3b82f6', fontFamily: 'inherit',
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.16)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.08)' }}>
              {s}
            </Link>
          ))}
        </div>

        {/* کارت‌های شاخص */}
        {indices.length > 0 && (
          <div style={{
            display: 'grid', gap: 10, marginBottom: 14,
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          }}>
            {indices.map(ix => {
              const active = ix.index_name === selIndex
              const up = (ix.change_pct ?? 0) >= 0
              return (
                <button key={ix.index_name} onClick={() => setSelIndex(ix.index_name)} style={{
                  textAlign: 'right', cursor: 'pointer', fontFamily: 'inherit',
                  padding: '12px 14px', borderRadius: 12,
                  background: active ? 'rgba(59,130,246,0.1)' : panel,
                  border: `1px solid ${active ? 'rgba(59,130,246,0.45)' : line}`,
                  transition: 'all 0.2s',
                }}>
                  <div style={{
                    fontSize: 11.5, color: active ? '#3b82f6' : muted, marginBottom: 6,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ix.index_name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: text }}>{fa(ix.value)}</span>
                    {ix.change_pct !== null && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: up ? GREEN : RED }}>
                        {up ? '▲' : '▼'} {fa(Math.abs(ix.change_pct), 2)}٪
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* نمودار شاخص انتخابی */}
        <div style={{
          background: panel, border: `1px solid ${line}`, borderRadius: 16,
          padding: isMobile ? '14px 8px' : '18px 14px',
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, margin: '0 8px 10px' }}>
            روند {selIndex} — ۳ سال اخیر
          </div>
          {idxHistory.length === 0 ? (
            <div style={{ color: muted, fontSize: 13, padding: '50px 0', textAlign: 'center' }}>
              در حال بارگذاری…
            </div>
          ) : (
            <div ref={chartRef} style={{ direction: 'ltr', width: '100%' }} />
          )}
        </div>

        <p style={{ fontSize: 11, color: muted, lineHeight: 1.9, marginTop: 14 }}>
          این ابزار صرفاً جنبه اطلاع‌رسانی دارد و توصیه خرید یا فروش نیست.
        </p>
      </div>
    </main>
  )
}
