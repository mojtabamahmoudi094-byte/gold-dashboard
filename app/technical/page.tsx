'use client'

// هاب تحلیل تکنیکال — بنتو گرید شیشه‌ای ۲۰۲۶ (اسپک: ایجنت UI Designer + ui-ux-pro-max)
// aurora پس‌زمینه، کارت شاخص با اسپارک‌لاین، نبض بازار از دیده‌بان، مقادیر زنده BrsApi

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AuthGate from '../../components/AuthGate'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../lib/useIsMobile'
import { GREEN, RED } from './colors'

type IdxRow = { index_name: string; trade_date: string; trade_date_shamsi: string; value: number; change_pct: number | null }
type SymRow = { l18: string; pcp: number | null }
type Pulse = { up: number; down: number; oversold: number; overbought: number }

const POPULAR = ['کگل', 'فملی', 'شستا', 'خودرو', 'ذوب', 'وبملت', 'شپنا', 'اهرم']
const BRSAPI_KEY = process.env.NEXT_PUBLIC_BRSAPI_KEY ?? 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const toSlug = (s: string) => encodeURIComponent(s.replace(/\s+/g, '-'))
const cleanName = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()

// بازار تهران: شنبه تا چهارشنبه ۹:۰۰–۱۲:۳۰
function marketOpen(): boolean {
  const now = new Date()
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', weekday: 'short' }).format(now)
  if (day === 'Thu' || day === 'Fri') return false
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(now).split(':').map(Number)
  const mins = h * 60 + m
  return mins >= 540 && mins <= 750
}

// اسپارک‌لاین سبک — SVG خالص
function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null
  const w = 100
  const h = 30
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - 3 - ((v - min) / span) * (h - 6),
  ])
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const clr = up ? 'oklch(0.74 0.16 150)' : 'oklch(0.68 0.19 25)'
  const id = `sp${up ? 'u' : 'd'}`
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden style={{ display: 'block', direction: 'ltr' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={clr} stopOpacity="0.18" />
          <stop offset="100%" stopColor={clr} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={clr} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={clr} />
    </svg>
  )
}

export default function TechnicalIndexPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [q, setQ] = useState('')
  const [symbols, setSymbols] = useState<SymRow[]>([])
  const [indices, setIndices] = useState<IdxRow[]>([])
  const [spark, setSpark] = useState<Map<string, number[]>>(new Map())
  const [idxHistory, setIdxHistory] = useState<IdxRow[]>([])
  const [selIndex, setSelIndex] = useState('شاخص کل')
  const [pulse, setPulse] = useState<Pulse | null>(null)
  const [live, setLive] = useState<Map<string, { value: number; pct: number | null }>>(new Map())
  const chartRef = useRef<HTMLDivElement>(null)
  const isOpen = marketOpen()

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  // فهرست نمادها برای جست‌وجو
  useEffect(() => {
    fetch('/api/stocks-industries')
      .then(r => r.json())
      .then((d: { industries?: { symbols: SymRow[] }[] }) => {
        setSymbols((d.industries ?? []).flatMap(i => i.symbols))
      })
      .catch(() => {})
  }, [])

  // آخرین مقدار + اسپارک‌لاین ۴۵ روزه هر شاخص — یک کوئری
  useEffect(() => {
    supabase
      .from('index_candles')
      .select('index_name, trade_date, trade_date_shamsi, value, change_pct')
      .order('trade_date', { ascending: false })
      .limit(600)
      .then(({ data }) => {
        if (!data) return
        const latest = new Map<string, IdxRow>()
        const hist = new Map<string, number[]>()
        for (const r of data as IdxRow[]) {
          if (!latest.has(r.index_name)) latest.set(r.index_name, r)
          const arr = hist.get(r.index_name) ?? []
          if (arr.length < 45) { arr.unshift(r.value); hist.set(r.index_name, arr) }
        }
        setIndices([...latest.values()])
        setSpark(hist)
      })
  }, [])

  // نبض بازار از دیده‌بان
  useEffect(() => {
    supabase
      .from('stock_screener')
      .select('trade_date')
      .order('trade_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: latest }) => {
        const latestDate = (latest as { trade_date: string } | null)?.trade_date
        if (!latestDate) return
        return supabase
          .from('stock_screener')
          .select('trend, rsi_oversold, rsi_overbought, change_pct')
          .eq('trade_date', latestDate)
          .range(0, 999)
          .then(({ data }) => {
            if (!data || data.length === 0) return
            setPulse({
              up: data.filter(r => (r.change_pct ?? 0) > 0).length,
              down: data.filter(r => (r.change_pct ?? 0) < 0).length,
              oversold: data.filter(r => r.rsi_oversold).length,
              overbought: data.filter(r => r.rsi_overbought).length,
            })
          })
      })
  }, [])

  // مقادیر زنده شاخص‌ها از BrsApi (فقط IP ایران جواب می‌دهد — خطا بی‌صدا)
  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const [sel, fara] = await Promise.allSettled([
          fetch(`https://Api.BrsApi.ir/Tsetmc/Index.php?key=${BRSAPI_KEY}&type=3`, { cache: 'no-store', signal: AbortSignal.timeout(8000) }),
          fetch(`https://Api.BrsApi.ir/Tsetmc/Index.php?key=${BRSAPI_KEY}&type=2`, { cache: 'no-store', signal: AbortSignal.timeout(8000) }),
        ])
        if (stop) return
        const map = new Map<string, { value: number; pct: number | null }>()
        if (sel.status === 'fulfilled' && sel.value.ok) {
          const items = await sel.value.json()
          for (const it of Array.isArray(items) ? items : []) {
            const v = parseFloat(String(it?.index).replace(/,/g, ''))
            if (Number.isFinite(v)) map.set(cleanName(String(it?.name ?? '')), { value: v, pct: parseFloat(it?.index_change_percent) || null })
          }
        }
        if (fara.status === 'fulfilled' && fara.value.ok) {
          const o = await fara.value.json()
          const v = parseFloat(String(o?.index).replace(/,/g, ''))
          if (Number.isFinite(v)) map.set('شاخص کل فرابورس', { value: v, pct: null })
        }
        if (map.size) setLive(map)
      } catch { /* خارج از ایران */ }
    }
    load()
    const t = isOpen ? setInterval(load, 60_000) : null
    return () => { stop = true; if (t) clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // نمودار ناحیه‌ای شاخص انتخابی
  useEffect(() => {
    const el = chartRef.current
    if (!el || idxHistory.length === 0) return
    let chart: import('lightweight-charts').IChartApi | null = null
    let disposed = false
    import('lightweight-charts').then(({ createChart, AreaSeries }) => {
      if (disposed || !chartRef.current) return
      const text = isDark ? '#8b93a7' : '#787b86'
      const grid = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,30,46,0.05)'
      const shamsiOf = new Map(idxHistory.map(r => [r.trade_date, r.trade_date_shamsi]))
      chart = createChart(el, {
        width: el.clientWidth, height: isMobile ? 240 : 330,
        layout: { background: { color: 'transparent' }, textColor: text, fontFamily: 'Vazirmatn, Arial, sans-serif' },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } },
        rightPriceScale: { borderColor: 'transparent' },
        timeScale: { borderColor: 'transparent' },
        localization: {
          timeFormatter: (t: unknown) => shamsiOf.get(String(t)) ?? String(t),
          priceFormatter: (p: number) => p.toLocaleString('fa-IR', { maximumFractionDigits: 0 }),
        },
      })
      const s = chart.addSeries(AreaSeries, {
        lineColor: '#3b82f6', lineWidth: 2,
        topColor: 'rgba(59,130,246,0.28)', bottomColor: 'rgba(59,130,246,0)',
        priceLineVisible: false,
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
  }, [idxHistory, isDark, isMobile])

  const matches = useMemo(() => {
    const query = q.trim()
    if (!query) return []
    return symbols.filter(s => s.l18.includes(query)).slice(0, 8)
  }, [q, symbols])

  // ── توکن‌های سطح (اسپک ایجنت طراح)
  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#475569'
  const glass: React.CSSProperties = {
    background: isDark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.82)',
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    border: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)'}`,
    borderRadius: 16,
    boxShadow: isDark
      ? '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)'
      : '0 8px 24px rgba(59,130,246,0.08)',
  }
  const cardHover = (e: React.MouseEvent<HTMLElement>, on: boolean) => {
    e.currentTarget.style.transform = on ? 'translateY(-3px)' : 'translateY(0)'
    e.currentTarget.style.borderColor = on
      ? (isDark ? 'rgba(148,163,184,0.28)' : 'rgba(15,23,42,0.16)')
      : (isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)')
  }
  const enter = (i: number): React.CSSProperties => ({
    animation: `taIn 450ms cubic-bezier(0.22,1,0.36,1) both`,
    animationDelay: `${i * 60}ms`,
  })

  const selRow = indices.find(ix => ix.index_name === selIndex)
  const liveSel = live.get(cleanName(selIndex))

  const pulseItems = pulse ? [
    { label: 'نماد مثبت', value: pulse.up, clr: GREEN },
    { label: 'نماد منفی', value: pulse.down, clr: RED },
    { label: 'اشباع فروش', value: pulse.oversold, clr: GREEN },
    { label: 'اشباع خرید', value: pulse.overbought, clr: RED },
  ] : []

  return (
    <AuthGate title="تحلیل تکنیکال">
      <main style={{
        minHeight: '100vh', background: bg, color: text,
        fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
        position: 'relative', overflow: 'hidden',
      }}>
      {/* keyframes سراسری صفحه */}
      <style>{`
        @keyframes taIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes taPing { 0% { transform: scale(1); opacity: 0.7 } 100% { transform: scale(2.4); opacity: 0 } }
        @keyframes taBlob1 { from { transform: translate(0,0) scale(1) } to { transform: translate(-60px,50px) scale(1.15) } }
        @keyframes taBlob2 { from { transform: translate(0,0) scale(1.1) } to { transform: translate(70px,-40px) scale(0.95) } }
        @keyframes taBlob3 { from { transform: translate(0,0) scale(1) } to { transform: translate(40px,60px) scale(1.2) } }
        @media (prefers-reduced-motion: reduce) {
          .ta-anim, .ta-anim * { animation: none !important }
        }
      `}</style>

      {/* aurora پس‌زمینه */}
      <div aria-hidden className="ta-anim" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: isDark ? 1 : 0.35 }}>
        <div style={{ position: 'absolute', top: '4%', right: '8%', width: 480, height: 480, borderRadius: '50%', background: '#3b82f6', opacity: 0.16, filter: 'blur(90px)', animation: 'taBlob1 18s ease-in-out infinite alternate' }} />
        <div style={{ position: 'absolute', top: '32%', left: '22%', width: 420, height: 420, borderRadius: '50%', background: '#8b5cf6', opacity: 0.12, filter: 'blur(90px)', animation: 'taBlob2 24s ease-in-out infinite alternate' }} />
        <div style={{ position: 'absolute', bottom: '-6%', left: '-4%', width: 360, height: 360, borderRadius: '50%', background: '#06b6d4', opacity: 0.08, filter: 'blur(90px)', animation: 'taBlob3 30s ease-in-out infinite alternate' }} />
      </div>

      <div className="ta-anim" style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '26px 14px' : '40px 24px', position: 'relative' }}>

        {/* ── سطر ۱: عنوان + چیپ زنده | جست‌وجو */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16, ...enter(0) }}>
          <h1 style={{
            fontSize: isMobile ? 23 : 28, fontWeight: 800, margin: 0,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            تحلیل تکنیکال
          </h1>

          {/* چیپ ضربان بازار */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 11.5, fontWeight: 700, padding: '6px 13px',
            ...glass, borderRadius: 99,
            color: isOpen ? GREEN : muted,
          }}>
            <span style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: isOpen ? GREEN : (isDark ? '#4b5563' : '#9ca3af') }} />
              {isOpen && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: GREEN, animation: 'taPing 2s ease-out infinite' }} />}
            </span>
            {isOpen ? 'بازار باز' : 'بازار بسته'}
            {(liveSel || selRow) && (
              <span style={{ color: text, fontVariantNumeric: 'tabular-nums' }}>
                · شاخص کل {fa((live.get('شاخص کل')?.value) ?? indices.find(i => i.index_name === 'شاخص کل')?.value ?? 0)}
              </span>
            )}
          </span>

          {/* جست‌وجو */}
          <div style={{ position: 'relative', marginInlineStart: 'auto', minWidth: isMobile ? '100%' : 320 }}>
            <label htmlFor="ta-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>جست‌وجوی نماد</label>
            <input
              id="ta-search"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && matches.length > 0) router.push(`/technical/${toSlug(matches[0].l18)}`) }}
              placeholder="جست‌وجوی نماد… مثلاً فولاد"
              style={{
                width: '100%', boxSizing: 'border-box', fontSize: 13.5, fontFamily: 'inherit',
                padding: '12px 16px', outline: 'none',
                ...glass, borderRadius: 99, color: text, transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.55)' }}
              onBlur={e => { e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)' }}
            />
            {matches.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 60, marginTop: 8,
                ...glass, padding: 6,
                background: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.97)',
              }}>
                {matches.map(m => (
                  <Link key={m.l18} href={`/technical/${toSlug(m.l18)}`} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 13px', borderRadius: 10, textDecoration: 'none',
                    fontSize: 13, color: text, fontFamily: 'inherit', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.12)' }}
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
        </div>

        {/* ── سطر ۲: نبض بازار */}
        {pulseItems.length > 0 && (
          <div style={{
            display: 'grid', gap: 10, marginBottom: 16,
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            ...enter(1),
          }}>
            {pulseItems.map(p => (
              <div key={p.label} style={{ ...glass, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, transition: 'transform 0.2s, border-color 0.2s' }}
                onMouseEnter={e => cardHover(e, true)} onMouseLeave={e => cardHover(e, false)}>
                <span style={{ width: 4, height: 30, borderRadius: 3, background: p.clr, display: 'inline-block', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 19, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: text, lineHeight: 1.2 }}>{fa(p.value)}</div>
                  <div style={{ fontSize: 11.5, color: muted }}>{p.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── سطر ۳: کارت شاخص‌ها با اسپارک‌لاین */}
        {indices.length > 0 && (
          <div style={{
            display: 'grid', gap: 12, marginBottom: 16,
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          }}>
            {indices.map((ix, i) => {
              const lv = live.get(cleanName(ix.index_name))
              const value = lv?.value ?? ix.value
              const pct = lv?.pct ?? ix.change_pct
              const up = (pct ?? 0) >= 0
              const active = ix.index_name === selIndex
              const inner = (
                <button onClick={() => setSelIndex(ix.index_name)} style={{
                  ...glass,
                  ...(active ? { border: '1px solid transparent', boxShadow: '0 0 24px rgba(139,92,246,0.25)' } : {}),
                  width: '100%', textAlign: 'right', cursor: 'pointer', fontFamily: 'inherit',
                  padding: '13px 15px 8px', transition: 'transform 0.2s, border-color 0.2s',
                }}
                onMouseEnter={e => { if (!active) cardHover(e, true) }}
                onMouseLeave={e => { if (!active) cardHover(e, false) }}>
                  <div style={{
                    fontSize: 11.5, fontWeight: 600, marginBottom: 7,
                    color: active ? '#3b82f6' : muted,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ix.index_name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: isMobile ? 16 : 21, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums' }}>{fa(value)}</span>
                    {pct !== null && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        color: up ? GREEN : RED,
                        background: up ? 'rgba(38,166,154,0.12)' : 'rgba(239,83,80,0.12)',
                      }}>
                        {up ? '▲' : '▼'} {fa(Math.abs(pct), 2)}٪
                      </span>
                    )}
                  </div>
                  <Sparkline values={spark.get(ix.index_name) ?? []} up={up} />
                </button>
              )
              return active ? (
                <div key={ix.index_name} style={{ borderRadius: 17, padding: 1, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', ...enter(2 + i) }}>
                  {inner}
                </div>
              ) : (
                <div key={ix.index_name} style={enter(2 + i)}>{inner}</div>
              )
            })}
          </div>
        )}

        {/* ── سطر ۴: نمودار شاخص + کارت CTA دیده‌بان */}
        <div style={{
          display: 'grid', gap: 12, marginBottom: 16,
          gridTemplateColumns: isMobile ? '1fr' : '3fr 1fr',
        }}>
          <div style={{ ...glass, borderRadius: 20, padding: isMobile ? '14px 8px' : '18px 14px', ...enter(3) }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 10px 10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14.5, fontWeight: 800 }}>روند {selIndex}</span>
              <span style={{ fontSize: 11, color: muted }}>۳ سال اخیر · قیمت پایانی روزانه</span>
              {selRow && <span style={{ fontSize: 11, color: muted, marginInlineStart: 'auto' }}>{selRow.trade_date_shamsi}</span>}
            </div>
            {idxHistory.length === 0 ? (
              <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>در حال بارگذاری…</div>
            ) : (
              <div ref={chartRef} style={{ direction: 'ltr', width: '100%' }} />
            )}
          </div>

          <Link href="/technical/screener" style={{
            ...glass, borderRadius: 20, textDecoration: 'none', color: text,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            padding: 20, minHeight: isMobile ? 150 : undefined,
            transition: 'transform 0.2s, box-shadow 0.2s', ...enter(4),
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(139,92,246,0.4)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = (glass.boxShadow as string) }}>
            <div>
              <div style={{
                width: 38, height: 38, borderRadius: 11, marginBottom: 14,
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                  <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
                </svg>
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 6 }}>دیده‌بان تکنیکال</div>
              <div style={{ fontSize: 12, color: muted, lineHeight: 1.8 }}>
                فیلتر ترکیبی سیگنال‌ها روی ~۱٬۰۰۰ نماد — RSI، کراس‌ها، اسمارت مانی
              </div>
            </div>
            <div style={{
              fontSize: 12.5, fontWeight: 700, color: '#3b82f6',
              display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14,
            }}>
              مشاهده سیگنال‌ها
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none', transform: 'scaleX(-1)' }}>
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </Link>
        </div>

        {/* ── سطر ۵: نمادهای پرطرفدار */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', ...enter(5) }}>
          <span style={{ fontSize: 12, color: muted, alignSelf: 'center' }}>نمادهای پرجست‌وجو:</span>
          {POPULAR.map(s => (
            <Link key={s} href={`/technical/${toSlug(s)}`} style={{
              fontSize: 12.5, padding: '7px 15px', borderRadius: 99, minHeight: 32,
              textDecoration: 'none', color: '#22d3ee', fontFamily: 'inherit',
              background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,211,238,0.16)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,211,238,0.08)' }}>
              {s}
            </Link>
          ))}
        </div>

        <p style={{ fontSize: 11, color: muted, lineHeight: 1.9, marginTop: 22 }}>
          این ابزار صرفاً جنبه اطلاع‌رسانی دارد و توصیه خرید یا فروش نیست.
        </p>
      </div>
    </main>
    </AuthGate>
  )
}
