'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useIsMobile } from '../lib/useIsMobile'
import { safe, fmtCompact as fmtVal } from '../lib/format'
import { darkTheme, lightTheme, shouldUseDark } from '../lib/theme'

type TickerItem = { name: string; slug: string; price: number; changePct: number }

const TICKER_CACHE_KEY = 'bs-home-ticker-cache'
type StockRow = { l18: string; l30: string; pl: number; plp: number; tval: number; industry: string }
type IndustryRow = { id: number; name: string; tval: number; up: number; down: number; count: number }
type MarketStats = { tval: number; up: number; down: number; count: number; updated: string | null }
type RadarNetBuy = { n: string; sym?: string; net: number }

// واحد رادار پول: میلیارد تومان (م.ت) — از ۱۰۰۰ به بعد همت
const fmtBt = (v: number) =>
  v >= 1000
    ? `${(v / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} همت`
    : `${v.toLocaleString('fa-IR')} م.ت`

// همت = هزار میلیارد تومان (۱e13 ریال)
const fmtRial = (rial: number) =>
  rial >= 1e13
    ? `${(rial / 1e13).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} همت`
    : `${Math.round(rial / 1e10).toLocaleString('fa-IR')} میلیارد ت`

const faTime = (iso: string | null) => {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }).format(new Date(iso))
  } catch { return '' }
}

/* شمارنده‌ی نرم اعداد — با احترام به prefers-reduced-motion */
function CountUp({ value, format, duration = 900 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(value * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{format(display)}</>
}

const ICON = {
  chart: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
    </svg>
  ),
  bars: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="7" height="18" rx="1" /><rect x="9.5" y="8" width="5" height="13" rx="1" /><rect x="17" y="5" width="5" height="16" rx="1" />
    </svg>
  ),
  saffron: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 0 0 8" /><path d="M12 2a4 4 0 0 1 0 8" /><path d="M12 10v12" /><path d="M8 14s1 1 4 1 4-1 4-1" />
    </svg>
  ),
  signal: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 L4 14 L11 14 L10 22 L20 9 L13 9 Z" />
    </svg>
  ),
  candles: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="4" x2="6" y2="20" /><rect x="4" y="8" width="4" height="7" rx="1" />
      <line x1="12" y1="2" x2="12" y2="22" /><rect x="10" y="6" width="4" height="8" rx="1" />
      <line x1="18" y1="5" x2="18" y2="19" /><rect x="16" y="9" width="4" height="6" rx="1" />
    </svg>
  ),
  doc: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  ),
  radar: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /><path d="M12 12 L18 5" />
    </svg>
  ),
  search: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="22" y2="22" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
  calc: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="11" x2="8" y2="11.01" /><line x1="12" y1="11" x2="12" y2="11.01" /><line x1="16" y1="11" x2="16" y2="11.01" />
      <line x1="8" y1="15" x2="8" y2="15.01" /><line x1="12" y1="15" x2="12" y2="15.01" /><line x1="16" y1="15" x2="16" y2="18" />
    </svg>
  ),
  briefcase: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  monitor: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      <polyline points="6 12 9 9 12 11 17 6" />
    </svg>
  ),
  compare: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22" /><polyline points="3 7 7 3 11 7" /><line x1="7" y1="3" x2="7" y2="17" />
      <polyline points="13 17 17 21 21 17" /><line x1="17" y1="21" x2="17" y2="7" />
    </svg>
  ),
  futures: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" />
      <path d="M7.5 15.5 L11 13 L13.5 15 L17 12" />
    </svg>
  ),
  map: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="10" height="8" rx="1" /><rect x="15" y="3" width="6" height="5" rx="1" />
      <rect x="15" y="10" width="6" height="11" rx="1" /><rect x="3" y="13" width="10" height="8" rx="1" />
    </svg>
  ),
  bell: (c: string) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4 C8 4 6.5 8 6.5 11.5 C6.5 15.5 4.5 16.5 4.5 17.5 L19.5 17.5 C19.5 16.5 17.5 15.5 17.5 11.5 C17.5 8 16 4 12 4 Z" />
      <path d="M9.5 20.5 L14.5 20.5" />
    </svg>
  ),
}

const FEATURES: { href: string; title: string; desc: string; color: string; icon: (c: string) => ReactNode; badge?: string }[] = [
  {
    href: '/stocks',
    title: 'سهام بازار',
    desc: 'قیمت لحظه‌ای بیش از ۶۰۰ نماد در ۴۵ صنعت — هر ۵ دقیقه در ساعت بازار به‌روز می‌شود',
    color: '#d9b45b',
    icon: ICON.candles,
    badge: 'جدید',
  },
  {
    href: '/stocks',
    title: 'گزارش‌های کدال',
    desc: 'گزارش ماهانه و صورت‌های مالی ناشران، خودکار از کدال — با خلاصه‌ی تحلیلی هر گزارش',
    color: 'oklch(0.78 0.14 200)',
    icon: ICON.doc,
    badge: 'جدید',
  },
  {
    href: '/signals',
    title: 'سیگنال‌های بازار',
    desc: 'سیگنال‌های هوشمند خرید و فروش بر اساس تحلیل داده‌های بازار و گزارش‌های کدال',
    color: 'oklch(0.74 0.17 155)',
    icon: ICON.signal,
  },
  {
    href: '/funds/gold',
    title: 'صندوق‌های طلا',
    desc: 'قیمت، NAV، حباب و ارزش معاملات صندوق‌های مبتنی بر طلا',
    color: 'oklch(0.82 0.15 70)',
    icon: ICON.chart,
  },
  {
    href: '/funds/silver',
    title: 'صندوق‌های نقره',
    desc: 'دیدبان جامع صندوق‌های سرمایه‌گذاری مبتنی بر نقره',
    color: 'oklch(0.84 0.03 240)',
    icon: ICON.bars,
  },
  {
    href: '/funds/saffron',
    title: 'صندوق‌های زعفران',
    desc: 'رصد صندوق‌های کالایی مبتنی بر زعفران و کالاهای کشاورزی',
    color: 'oklch(0.70 0.19 40)',
    icon: ICON.saffron,
  },
  {
    href: '/funds/radar',
    title: 'رادار پول هوشمند',
    desc: 'ردیابی ورود و خروج پول حقیقی به صندوق‌های کالایی',
    color: '#f472b6',
    icon: ICON.radar,
  },
  {
    href: '/analysis',
    title: 'تحلیل طلا و نقره',
    desc: 'قیمت لحظه‌ای طلا، نقره، سکه و دلار به‌همراه محاسبه‌ی حباب سکه',
    color: '#60a5fa',
    icon: ICON.search,
  },
  {
    href: '/technical',
    title: 'تحلیل تکنیکال',
    desc: 'شاخص‌های بازار، نبض تکنیکال و نمادهای پرجست‌وجو با داده‌ی زنده',
    color: '#22d3ee',
    icon: ICON.candles,
  },
  {
    href: '/technical/screener',
    title: 'دیده‌بان تکنیکال',
    desc: 'اسکرین نمادها با RSI، مکدی، الگوی کندل و استراتژی‌های آماده',
    color: 'oklch(0.76 0.16 190)',
    icon: ICON.search,
    badge: 'جدید',
  },
  {
    href: '/technical/backtest',
    title: 'بک‌تست سیگنال‌ها',
    desc: 'بازدهی تاریخی هر سیگنال روی نمادهای مختلف پیش از اتکا بهش',
    color: 'oklch(0.72 0.17 145)',
    icon: ICON.chart,
    badge: 'جدید',
  },
  {
    href: '/track-record',
    title: 'ترک‌رکورد سیگنال‌ها',
    desc: 'عملکرد واقعی سیگنال‌های صادرشده در طول زمان',
    color: 'oklch(0.75 0.15 60)',
    icon: ICON.signal,
  },
  {
    href: '/valuation',
    title: 'ماشین‌حساب ارزش‌گذاری',
    desc: 'ارزش‌گذاری سریع سهام با روش‌های P/E، P/S و نسبت‌های بنیادی',
    color: '#a78bfa',
    icon: ICON.calc,
  },
  {
    href: '/portfolio',
    title: 'پورتفوی من',
    desc: 'ثبت دارایی‌ها و رصد سود و زیان سبد شخصی به‌صورت زنده',
    color: 'oklch(0.8 0.14 120)',
    icon: ICON.briefcase,
  },
  {
    href: '/monitor',
    title: 'نمودار رصد بازارها',
    desc: 'نمودار لحظه‌ای سهام، طلا و نقره در طول ساعت معاملات',
    color: 'oklch(0.78 0.15 300)',
    icon: ICON.monitor,
  },
  {
    href: '/compare',
    title: 'مقایسه صندوق‌ها',
    desc: 'مقایسه‌ی عملکرد دو تا پنج صندوق کنار هم به صورت بصری',
    color: '#f4d795',
    icon: ICON.compare,
  },
  {
    href: '/compare/stocks',
    title: 'مقایسه سهام',
    desc: 'مقایسه‌ی هم‌زمان تا ۴ نماد با نمودار بازدهی نرمال‌شده و جدول RSI',
    color: 'oklch(0.75 0.14 230)',
    icon: ICON.compare,
  },
  {
    href: '/futures',
    title: 'قراردادهای آتی',
    desc: 'قیمت جهانی طلا، نقره، نفت و مس به‌همراه قراردادهای آتی بورس کالای ایران',
    color: '#fb923c',
    icon: ICON.futures,
  },
  {
    href: '/market-map',
    title: 'نقشه بازار',
    desc: 'نمای بصری صنایع و نمادهای بازار بر اساس ارزش معاملات و درصد رشد قیمت',
    color: 'oklch(0.7 0.14 250)',
    icon: ICON.map,
  },
  {
    href: '/alerts',
    title: 'هشدارها',
    desc: 'هشدار قیمت سهم و صندوق یا حباب طلا/نقره روی تلگرام، به‌محض رسیدن به هدف',
    color: 'oklch(0.72 0.19 25)',
    icon: ICON.bell,
    badge: 'جدید',
  },
]

export default function HomePage() {
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [stats, setStats] = useState<{ totalTV: number; fundCount: number } | null>(null)
  const [ticker, setTicker] = useState<TickerItem[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const cached = window.sessionStorage.getItem(TICKER_CACHE_KEY)
      return cached ? JSON.parse(cached) : []
    } catch { return [] }
  })
  const [market, setMarket] = useState<MarketStats | null>(null)
  const [gainers, setGainers] = useState<StockRow[]>([])
  const [liquid, setLiquid] = useState<StockRow[]>([])
  const [industries, setIndustries] = useState<IndustryRow[]>([])
  const [radarTop, setRadarTop] = useState<RadarNetBuy[]>([])

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    const loadFunds = async () => {
      try {
        const res = await fetch('/api/funds', { cache: 'no-store' })
        if (!res.ok) return
        const { assets, records } = await res.json()
        if (!assets || !records) return
        const recordsDesc = [...records].sort((a: any, b: any) => b.id - a.id)
        const combined = assets.map((asset: any) => {
          const rec = recordsDesc.find((r: any) => r.asset_id === asset.id)
          return {
            name: String(asset.name || ''),
            slug: String(asset.slug || ''),
            price: safe(rec?.price_close),
            tradeValue: safe(rec?.trade_value),
            changePct: safe(rec?.price_change_pct),
          }
        }).filter((f: any) => f.tradeValue > 0)
        const nextTicker = [...combined]
          .filter((f: any) => f.price > 0 && f.name)
          .sort((a: any, b: any) => b.tradeValue - a.tradeValue)
          .slice(0, 12)
          .map((f: any) => ({ name: f.name, slug: f.slug, price: f.price, changePct: f.changePct }))
        setTicker(nextTicker)
        try { window.sessionStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(nextTicker)) } catch {}
        const totalTV = combined.reduce((s: number, f: any) => s + f.tradeValue, 0)
        setStats({ totalTV, fundCount: combined.length })
      } catch {}
    }
    const loadStocks = async () => {
      try {
        const res = await fetch('/api/stocks-industries', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        const inds: any[] = json?.industries || []
        if (!inds.length) return
        const all: StockRow[] = inds.flatMap((ind: any) =>
          (ind.symbols || []).map((s: any) => ({
            l18: String(s.l18 || ''), l30: String(s.l30 || ''),
            pl: safe(s.pl), plp: safe(s.plp), tval: safe(s.tval),
            industry: String(ind.name || ''),
          }))
        )
        // فقط نمادهای نقدشونده (ارزش معاملات بالای ~۱ میلیارد تومان) در برترین‌ها بیایند
        const tradable = all.filter(s => s.l18 && s.tval > 1e10)
        setGainers([...tradable].sort((a, b) => b.plp - a.plp).slice(0, 5))
        setLiquid([...tradable].sort((a, b) => b.tval - a.tval).slice(0, 5))
        setIndustries(
          inds
            .map((i: any) => ({ id: safe(i.id), name: String(i.name || ''), tval: safe(i.tval), up: safe(i.up), down: safe(i.down), count: safe(i.count) }))
            .sort((a, b) => b.tval - a.tval)
            .slice(0, 5)
        )
        setMarket({
          tval: inds.reduce((s: number, i: any) => s + safe(i.tval), 0),
          up: inds.reduce((s: number, i: any) => s + safe(i.up), 0),
          down: inds.reduce((s: number, i: any) => s + safe(i.down), 0),
          count: inds.reduce((s: number, i: any) => s + safe(i.count), 0),
          updated: json?.updated ?? null,
        })
      } catch {}
    }
    const loadRadar = async () => {
      try {
        const res = await fetch('/portfolio/_radar.json', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        const stocks: any[] = json?.stocks || []
        const netBuy = stocks
          .map((s: any) => ({ n: String(s.n || ''), sym: s.sym as string | undefined, net: safe(s.b) - safe(s.s) }))
          .filter(s => s.net > 1)
          .sort((a, b) => b.net - a.net)
          .slice(0, 5)
        setRadarTop(netBuy)
      } catch {}
    }
    loadFunds()
    loadStocks()
    loadRadar()
  }, [])

  const t = isDark ? darkTheme : lightTheme
  // قانون خوانایی تم تیره: متن ثانویه کرم، نه خاکستری کم‌کنتراست
  const muted = isDark ? '#ddd5bd' : '#6B5A3A'
  const softMuted = isDark ? 'rgba(221,213,189,0.75)' : '#7a6845'
  const cardBg = isDark ? 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))' : t.panel
  const cardBorder = isDark ? '1px solid rgba(255,255,255,0.08)' : `1px solid ${t.border}`
  const rowBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(217,180,91,0.05)'
  const divider = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(217,180,91,0.1)'

  return (
    <main style={{
      minHeight: '100vh',
      background: t.bg,
      color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif',
      direction: 'rtl',
      transition: 'background 0.3s, color 0.3s',
    }}>

      {/* ═══════ TICKER TAPE (داده‌ی زنده صندوق‌ها) ═══════ */}
      <div style={{
        background: isDark ? 'rgba(217,180,91,0.05)' : 'rgba(184,134,11,0.05)',
        borderBottom: `1px solid ${isDark ? 'rgba(217,180,91,0.12)' : 'rgba(184,134,11,0.14)'}`,
        height: 36, overflow: 'hidden', display: 'flex', alignItems: 'center',
      }}>
        {ticker.length === 0 ? (
          <div style={{ display: 'flex', gap: 28, padding: '0 24px', width: '100%', overflow: 'hidden' }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={i} className="skeleton" style={{ width: 120, height: 12, flexShrink: 0 }} />
            ))}
          </div>
        ) : (
          <div style={{
            display: 'inline-flex', gap: 0,
            animation: 'bs-marquee 40s linear infinite',
            willChange: 'transform',
            whiteSpace: 'nowrap',
          }}>
            {[...ticker, ...ticker].map((item, i) => {
              const pos = item.changePct >= 0
              return (
                <Link key={i} href={item.slug ? `/fund/${item.slug}` : '/funds'} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '0 24px', fontSize: 12.5, fontFamily: 'system-ui, sans-serif',
                  borderLeft: `1px solid ${divider}`,
                  textDecoration: 'none', lineHeight: '36px', cursor: 'pointer',
                }}>
                  <span style={{ color: muted, fontWeight: 500, fontFamily: 'Vazirmatn, inherit' }}>{item.name}</span>
                  <span style={{ color: t.text, fontWeight: 700 }}>{item.price.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}</span>
                  <span style={{ fontWeight: 700, color: pos ? t.green : t.red }}>
                    {pos ? '▲' : '▼'} {Math.abs(item.changePct).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* ═══════ HERO ═══════ */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        padding: isMobile ? '48px 20px 40px' : '56px 6vw 40px',
        direction: 'rtl',
      }}>
        <div style={{ position: 'absolute', top: -220, right: -140, width: 640, height: 640, borderRadius: '50%', background: `radial-gradient(circle, rgba(217,180,91,${isDark ? 0.2 : 0.1}) 0%, transparent 65%)`, filter: 'blur(40px)', pointerEvents: 'none', animation: 'bs-glow 9s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: 280, left: -180, width: 560, height: 560, borderRadius: '50%', background: `radial-gradient(circle, rgba(244,215,149,${isDark ? 0.18 : 0.09}) 0%, transparent 65%)`, filter: 'blur(46px)', pointerEvents: 'none', animation: 'bs-glow 11s ease-in-out infinite' }} />

        <div style={{
          maxWidth: 1400, margin: '0 auto', position: 'relative',
          display: isMobile ? 'flex' : 'grid',
          flexDirection: isMobile ? 'column' : undefined,
          gridTemplateColumns: isMobile ? undefined : '1.05fr .95fr',
          gap: isMobile ? 40 : 56,
          alignItems: 'center',
        }}>
          {/* ── Text (RTL: right side) ── */}
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '7px 14px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(184,134,11,0.06)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.09)' : 'rgba(184,134,11,0.16)'}`, fontSize: 13, fontWeight: 600, color: muted, marginBottom: 24 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.green, display: 'inline-block', animation: 'bs-pulse 2s infinite' }} />
              سهام لحظه‌ای + صندوق‌های کالایی + گزارش‌های کدال
            </div>

            <h1 style={{ fontSize: isMobile ? 32 : 'clamp(38px,5vw,64px)', fontWeight: 900, lineHeight: 1.12, letterSpacing: '-0.5px', margin: '0 0 22px', color: t.text }}>
              بازار بورس را<br />
              <span style={{ backgroundImage: `linear-gradient(120deg, ${t.brand}, ${t.brand2} 55%, ${t.green})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                هوشمندانه بسنجید
              </span>
            </h1>

            <p style={{ fontSize: isMobile ? 15 : 'clamp(16px,1.6vw,20px)', color: muted, maxWidth: 520, marginBottom: 34, lineHeight: 1.75 }}>
              قیمت لحظه‌ای بیش از ۶۰۰ سهم در ۴۵ صنعت، گزارش‌های کدال با خلاصه‌ی تحلیلی، رصد صندوق‌های طلا و نقره و زعفران، محاسبه آنلاین حباب و سیگنال بازار — همه در یک سامانه‌ی تحت‌وب، سریع و ساده.
            </p>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 34, justifyContent: isMobile ? 'center' : 'flex-start' }}>
              <Link href="/funds" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 17, padding: '15px 28px', borderRadius: 15, background: `linear-gradient(135deg, ${t.brand}, ${t.brand2})`, boxShadow: '0 16px 40px rgba(217,180,91,0.42)', cursor: 'pointer', fontFamily: 'Vazirmatn, inherit', transition: 'transform 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8 L12 16 M9 12 L15 12"/></svg>
                حباب صندوق‌ها را ببینید
              </Link>
              <Link href="/stocks" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: t.text, textDecoration: 'none', fontWeight: 600, fontSize: 17, padding: '15px 26px', borderRadius: 15, border: `1px solid ${isDark ? 'rgba(255,255,255,0.14)' : t.borderStrong}`, background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(184,134,11,0.04)', cursor: 'pointer', fontFamily: 'Vazirmatn, inherit', transition: 'background 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(184,134,11,0.09)' }}
              onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(184,134,11,0.04)' }}>
                نبض بازار سهام
              </Link>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', color: softMuted, fontSize: 14, fontWeight: 500, justifyContent: isMobile ? 'center' : 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.green, display: 'inline-block' }} />
                کاملاً تحت‌وب، بدون نیاز به نصب
              </div>
              <div style={{ width: 1, height: 16, background: divider }} />
              <div>داده‌ها هم‌سو با NAV رسمی صندوق‌ها و کدال</div>
            </div>
          </div>

          {/* ── Live Dashboard Card (RTL: left side) ── */}
          {!isMobile && (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'relative', borderRadius: 26, padding: 22, background: cardBg, border: cardBorder, boxShadow: t.cardShadow, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', animation: 'bs-float 7s ease-in-out infinite' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${t.brand}, ${t.brand2})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12 S5 4 12 4 22 12 22 12 19 20 12 20 2 12 2 12 Z"/><circle cx="12" cy="12" r="3"/></svg>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>دیدبان من</div>
                  </div>
                  <div style={{ fontSize: 12, color: t.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.green, display: 'inline-block', animation: 'bs-pulse 2s infinite' }} />
                    زنده
                  </div>
                </div>

                <div style={{ position: 'relative', borderRadius: 16, background: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(184,134,11,0.06)', padding: '14px 8px 6px', marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 10px 6px' }}>
                    <span style={{ fontSize: 22, fontWeight: 800 }}>{market ? fmtRial(market.tval) : '—'}</span>
                    {market && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: market.up >= market.down ? t.green : t.red }}>
                        {market.up >= market.down ? '▲' : '▼'} {market.up.toLocaleString('fa-IR')} نماد مثبت
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: softMuted, marginInlineStart: 'auto' }}>ارزش معاملات سهام</span>
                  </div>
                  <svg viewBox="0 0 600 200" width="100%" height="120" preserveAspectRatio="none" style={{ display: 'block' }}>
                    <defs>
                      <linearGradient id="bsArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d9b45b" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#d9b45b" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="bsLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#d9b45b" />
                        <stop offset="100%" stopColor="oklch(0.74 0.17 155)" />
                      </linearGradient>
                    </defs>
                    <path d="M0,150 L60,132 L120,145 L180,110 L240,120 L300,86 L360,96 L420,62 L480,72 L540,40 L600,26 L600,200 L0,200 Z" fill="url(#bsArea)" />
                    <path d="M0,150 L60,132 L120,145 L180,110 L240,120 L300,86 L360,96 L420,62 L480,72 L540,40 L600,26" fill="none" stroke="url(#bsLine)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="600" cy="26" r="4.5" fill="oklch(0.74 0.17 155)" />
                  </svg>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {(ticker.length >= 3 ? ticker.slice(0, 3) : []).map((row, i) => {
                    const pos = row.changePct >= 0
                    const iconColors = ['oklch(0.82 0.15 70)', 'oklch(0.86 0.03 240)', 'oklch(0.74 0.19 40)']
                    return (
                      <Link key={i} href={row.slug ? `/fund/${row.slug}` : '/funds'} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 13, background: rowBg, textDecoration: 'none', color: t.text, cursor: 'pointer' }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(184,134,11,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: iconColors[i], flexShrink: 0 }}>{row.name.slice(0, 1)}</div>
                        <div style={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{row.name}</div>
                        <div style={{ marginInlineStart: 'auto', textAlign: 'left' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'system-ui, sans-serif' }}>{row.price.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: pos ? t.green : t.red }}>
                            {pos ? '▲' : '▼'} {Math.abs(row.changePct).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                  {ticker.length < 3 && Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 52, borderRadius: 13 }} />
                  ))}
                </div>
              </div>

              {/* Floating badge — گزارش کدال */}
              <div style={{ position: 'absolute', top: -22, left: -26, padding: '12px 16px', borderRadius: 16, background: 'linear-gradient(135deg, oklch(0.72 0.17 155), oklch(0.7 0.15 165))', boxShadow: '0 18px 40px oklch(0.72 0.17 155 / 0.4)', display: 'flex', alignItems: 'center', gap: 10, animation: 'bs-float2 6s ease-in-out infinite' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#04140b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 11, color: '#04321d', fontWeight: 600 }}>کدال</div>
                  <div style={{ fontSize: 14, color: '#052c19', fontWeight: 800 }}>گزارش تازه رسید</div>
                </div>
              </div>

              {/* Floating alert badge */}
              <div style={{ position: 'absolute', bottom: -18, right: -22, padding: '12px 15px', borderRadius: 16, background: isDark ? 'rgba(20,24,36,0.92)' : 'rgba(255,252,244,0.96)', border: cardBorder, boxShadow: t.cardShadow, display: 'flex', alignItems: 'center', gap: 10, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', animation: 'bs-float 8s ease-in-out infinite' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'oklch(0.78 0.15 70 / 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="oklch(0.82 0.15 70)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4 C8 4 7 8 7 11 C7 15 5 16 5 17 L19 17 C19 16 17 15 17 11 C17 8 16 4 12 4 Z"/><path d="M10 20 L14 20"/></svg>
                </div>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 11, color: softMuted, fontWeight: 600 }}>هشدار حباب</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.red }}>حباب طلا منفی شد</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════ STATS STRIP ═══════ */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '0 20px 40px' : '0 6vw 40px', direction: 'rtl' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 14 }}>
          {[
            {
              label: 'ارزش معاملات بازار سهام',
              render: market ? () => <CountUp value={market.tval / 1e13} format={n => `${n.toLocaleString('fa-IR', { maximumFractionDigits: 1 })} همت`} /> : null,
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d9b45b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/>
                </svg>
              ),
              color: '#d9b45b',
            },
            {
              label: 'نمادهای مثبت بازار',
              render: market ? () => <><CountUp value={market.up} format={n => Math.round(n).toLocaleString('fa-IR')} /> از {market.count.toLocaleString('fa-IR')}</> : null,
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="oklch(0.74 0.17 155)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
                </svg>
              ),
              color: 'oklch(0.74 0.17 155)',
            },
            {
              label: 'ارزش معاملات صندوق‌های کالایی',
              render: stats ? () => <><CountUp value={stats.totalTV / 1e10} format={fmtVal} /> م.ت</> : null,
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f4d795" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
              ),
              color: '#f4d795',
            },
            {
              label: 'صندوق‌های فعال',
              render: stats ? () => <CountUp value={stats.fundCount} format={n => Math.round(n).toLocaleString('fa-IR')} /> : null,
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="oklch(0.82 0.15 70)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              ),
              color: 'oklch(0.82 0.15 70)',
            },
          ].map((item, i) => (
            <div key={i} style={{
              background: cardBg,
              border: cardBorder,
              borderRadius: 16, padding: '18px 20px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `${item.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.icon}
                </div>
                <span style={{ fontSize: 12, color: softMuted, fontWeight: 500 }}>{item.label}</span>
              </div>
              {item.render ? (
                <div className="animate-fade-in" style={{ fontSize: 22, fontWeight: 800, color: item.color, fontFamily: 'system-ui, sans-serif' }}>
                  {item.render()}
                </div>
              ) : (
                <div className="skeleton" style={{ width: '60%', height: 24 }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ═══════ نبض بازار سهام (داده‌ی زنده) ═══════ */}
      <section style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '8px 20px 48px' : '10px 6vw 60px', direction: 'rtl' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, margin: 0, color: t.text }}>نبض بازار سهام</h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: t.green, padding: '4px 10px', borderRadius: 999, background: isDark ? 'oklch(0.74 0.17 155 / 0.12)' : 'rgba(5,150,105,0.1)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.green, display: 'inline-block', animation: 'bs-pulse 2s infinite' }} />
              زنده
            </span>
            {market?.updated && (
              <span style={{ fontSize: 12, color: softMuted }}>به‌روزرسانی {faTime(market.updated)}</span>
            )}
          </div>
          <Link href="/stocks" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: t.brand, textDecoration: 'none', cursor: 'pointer' }}>
            مشاهده همه‌ی صنایع
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.brand} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18 L9 12 L15 6"/></svg>
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 12 : 18 }}>
          {/* برترین رشد روز */}
          <div style={{ background: cardBg, border: cardBorder, borderRadius: 18, padding: '18px 18px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: isDark ? 'oklch(0.74 0.17 155 / 0.15)' : 'rgba(5,150,105,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.green} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
              </span>
              <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: 0, color: t.text }}>برترین رشد روز</h3>
            </div>
            {gainers.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 11 }} />)}
              </div>
            ) : gainers.map((s, i) => (
              <Link key={s.l18} href={`/stock/${encodeURIComponent(s.l18)}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 11, textDecoration: 'none', color: t.text, cursor: 'pointer', marginBottom: 6, background: i % 2 === 0 ? rowBg : 'transparent', overflow: 'hidden', transition: 'background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(184,134,11,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? rowBg : 'transparent' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: softMuted, width: 16, flexShrink: 0, fontFamily: 'system-ui, sans-serif' }}>{(i + 1).toLocaleString('fa-IR')}</span>
                <span style={{ fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{s.l18}</span>
                <span style={{ fontSize: 12.5, color: softMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{s.l30}</span>
                <span style={{ marginInlineStart: 'auto', flexShrink: 0, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>{s.pl.toLocaleString('fa-IR')}</span>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: t.green }}>▲ {s.plp.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪</span>
                </span>
              </Link>
            ))}
          </div>

          {/* بیشترین ارزش معاملات */}
          <div style={{ background: cardBg, border: cardBorder, borderRadius: 18, padding: '18px 18px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: isDark ? 'rgba(217,180,91,0.15)' : 'rgba(184,134,11,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.brand} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>
              </span>
              <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: 0, color: t.text }}>بیشترین ارزش معاملات</h3>
            </div>
            {liquid.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 11 }} />)}
              </div>
            ) : liquid.map((s, i) => {
              const pos = s.plp >= 0
              return (
                <Link key={s.l18} href={`/stock/${encodeURIComponent(s.l18)}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 11, textDecoration: 'none', color: t.text, cursor: 'pointer', marginBottom: 6, background: i % 2 === 0 ? rowBg : 'transparent', overflow: 'hidden', transition: 'background 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(184,134,11,0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? rowBg : 'transparent' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: softMuted, width: 16, flexShrink: 0, fontFamily: 'system-ui, sans-serif' }}>{(i + 1).toLocaleString('fa-IR')}</span>
                  <span style={{ fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{s.l18}</span>
                  <span style={{ fontSize: 12.5, color: softMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{s.l30}</span>
                  <span style={{ marginInlineStart: 'auto', flexShrink: 0, textAlign: 'left' }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>{fmtRial(s.tval)}</span>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: pos ? t.green : t.red }}>{pos ? '▲' : '▼'} {Math.abs(s.plp).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪</span>
                  </span>
                </Link>
              )
            })}
          </div>

          {/* صنایع پیشرو */}
          <div style={{ background: cardBg, border: cardBorder, borderRadius: 18, padding: '18px 18px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: isDark ? 'rgba(244,215,149,0.15)' : 'rgba(212,160,23,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.brand2} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="7" height="18" rx="1"/><rect x="9.5" y="8" width="5" height="13" rx="1"/><rect x="17" y="5" width="5" height="16" rx="1"/></svg>
              </span>
              <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: 0, color: t.text }}>صنایع پیشروی امروز</h3>
            </div>
            {industries.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 11 }} />)}
              </div>
            ) : industries.map((ind, i) => {
              const total = ind.up + ind.down
              const upRatio = total > 0 ? ind.up / total : 0.5
              return (
                <Link key={ind.id || ind.name} href={`/stocks/${ind.id ?? encodeURIComponent(ind.name)}`} style={{ display: 'block', padding: '9px 10px', borderRadius: 11, textDecoration: 'none', color: t.text, cursor: 'pointer', marginBottom: 6, background: i % 2 === 0 ? rowBg : 'transparent', transition: 'background 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(184,134,11,0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? rowBg : 'transparent' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, flexShrink: 0 }}>{ind.name}</span>
                    <span style={{ marginInlineStart: 'auto', flexShrink: 0, fontWeight: 700, fontSize: 12.5, fontFamily: 'system-ui, sans-serif', color: softMuted }}>{fmtRial(ind.tval)}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                    <span style={{ flex: 1, height: 5, borderRadius: 3, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', overflow: 'hidden', display: 'flex' }}>
                      <span style={{ width: `${upRatio * 100}%`, background: t.green, display: 'block' }} />
                      <span style={{ width: `${(1 - upRatio) * 100}%`, background: t.red, display: 'block', opacity: 0.75 }} />
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: 'system-ui, sans-serif' }}>
                      <span style={{ color: t.green }}>{ind.up.toLocaleString('fa-IR')}</span>
                      <span style={{ color: softMuted }}> / </span>
                      <span style={{ color: t.red }}>{ind.down.toLocaleString('fa-IR')}</span>
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* ═══════ رادار پول هوشمند (پیش‌نمایش) ═══════ */}
      {radarTop.length > 0 && (
        <section style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '0 20px 48px' : '0 6vw 60px', direction: 'rtl' }}>
          <div style={{ background: cardBg, border: cardBorder, borderRadius: 18, padding: '18px 18px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(244,114,182,0.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {ICON.radar('#f472b6')}
                </span>
                <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: 0, color: t.text }}>رادار پول هوشمند — بیشترین خرید خالص صندوق‌ها این ماه</h3>
              </div>
              <Link href="/funds/radar" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: t.brand, textDecoration: 'none' }}>
                مشاهده رادار کامل
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.brand} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18 L9 12 L15 6" /></svg>
              </Link>
            </div>
            {radarTop.map((s, i) => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 11, marginBottom: 6, background: i % 2 === 0 ? rowBg : 'transparent' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: softMuted, width: 16, flexShrink: 0, fontFamily: 'system-ui, sans-serif' }}>{(i + 1).toLocaleString('fa-IR')}</span>
                <span style={{ fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{s.sym || s.n}</span>
                {s.sym && <span style={{ fontSize: 12.5, color: softMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{s.n}</span>}
                <span style={{ marginInlineStart: 'auto', flexShrink: 0, fontWeight: 700, fontSize: 13, color: t.green, fontFamily: 'system-ui, sans-serif' }}>+{fmtBt(s.net)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══════ FEATURES ═══════ */}
      <section style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '0 20px 48px' : '0 6vw 60px', direction: 'rtl' }}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 50px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.brand, marginBottom: 12, letterSpacing: '0.04em' }}>امکانات بورس سنج</div>
          <h2 style={{ fontSize: isMobile ? 26 : 'clamp(30px,4vw,46px)', fontWeight: 900, letterSpacing: '-0.5px', margin: '0 0 16px', color: t.text }}>هرآنچه یک معامله‌گر حرفه‌ای نیاز دارد</h2>
          <p style={{ color: muted, fontSize: 18 }}>از سهام لحظه‌ای و گزارش‌های کدال تا حباب صندوق‌ها — ابزارهای قدرتمند برای تصمیم‌گیری سریع‌تر و دقیق‌تر.</p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: isMobile ? 12 : 20,
        }}>
          {FEATURES.map((feat, i) => (
            <Link key={i} href={feat.href} className="animate-rise" style={{
              position: 'relative',
              textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 0,
              background: cardBg,
              border: cardBorder,
              borderRadius: 22, padding: isMobile ? '22px 18px' : '28px',
              transition: 'transform 0.3s, border-color 0.3s',
              cursor: 'pointer',
              animationDelay: `${i * 60}ms`,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-6px)'
              e.currentTarget.style.borderColor = `${feat.color.startsWith('#') ? feat.color + '66' : feat.color}`
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(217,180,91,0.14)'
            }}>
              {feat.badge && (
                <span style={{ position: 'absolute', top: 16, left: 16, fontSize: 11, fontWeight: 800, color: '#04140b', background: `linear-gradient(135deg, oklch(0.78 0.16 155), oklch(0.85 0.14 150))`, padding: '3px 10px', borderRadius: 999 }}>{feat.badge}</span>
              )}
              <div style={{
                width: 52, height: 52, borderRadius: 15,
                background: feat.color.startsWith('#') ? `${feat.color}28` : `color-mix(in oklab, ${feat.color} 16%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 20, flexShrink: 0,
              }}>
                {feat.icon(feat.color)}
              </div>
              <h3 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 10px', color: t.text }}>{feat.title}</h3>
              <p style={{ color: muted, fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{feat.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '40px 20px 70px' : '50px 6vw 90px', textAlign: 'center', direction: 'rtl' }}>
        <h2 style={{ fontSize: isMobile ? 26 : 'clamp(30px,4.4vw,52px)', fontWeight: 900, letterSpacing: '-0.6px', margin: '0 0 18px', color: t.text }}>
          همین حالا رایگان با{' '}
          <span style={{ backgroundImage: `linear-gradient(120deg, ${t.brand}, ${t.green})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>بورس سنج</span>
          {' '}شروع کنید
        </h2>
        <p style={{ color: muted, fontSize: 19, maxWidth: 560, margin: '0 auto 38px', lineHeight: 1.7 }}>
          کاملاً تحت‌وب و بدون نصب. حساب بسازید و همین حالا سهام، گزارش‌های کدال و حباب صندوق‌ها را زیر نظر بگیرید.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 17, padding: '16px 32px', borderRadius: 15, background: `linear-gradient(135deg, ${t.brand}, ${t.brand2})`, boxShadow: '0 16px 42px rgba(217,180,91,0.42)', fontFamily: 'Vazirmatn, inherit', cursor: 'pointer', transition: 'transform 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5 L12 19 M5 12 L19 12"/></svg>
            ثبت‌نام رایگان
          </Link>
          <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: t.text, textDecoration: 'none', fontWeight: 600, fontSize: 17, padding: '16px 30px', borderRadius: 15, border: `1px solid ${isDark ? 'rgba(255,255,255,0.14)' : t.borderStrong}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(184,134,11,0.04)', fontFamily: 'Vazirmatn, inherit', cursor: 'pointer', transition: 'background 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(184,134,11,0.09)' }}
          onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(184,134,11,0.04)' }}>
            ورود به حساب کاربری
          </Link>
        </div>
      </section>

    </main>
  )
}
