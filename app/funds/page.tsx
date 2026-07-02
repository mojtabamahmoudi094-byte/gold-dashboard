'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { darkTheme, lightTheme } from '../../lib/theme'

const safe = (v: any) => Number(v || 0)
const fmtVal = (v: any) => {
  const n = safe(v)
  if (n === 0) return '—'
  const len = String(Math.floor(n)).length
  if (len <= 5) return n.toLocaleString('fa-IR', { maximumFractionDigits: 0 })
  const div = Math.pow(10, len - 5)
  return Math.round(n / div).toLocaleString('fa-IR', { maximumFractionDigits: 0 })
}

export default function FundsPage() {
  const [isDark, setIsDark] = useState(true)
  const [allFunds, setAllFunds] = useState<any[]>([])
  const [anomalies, setAnomalies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<string>('trade_value')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [isMobile, setIsMobile] = useState(false)
  const [category, setCategory] = useState<string>('طلا')
  const [searchQuery, setSearchQuery] = useState('')

  const router = useRouter()
  const t: any = isDark ? darkTheme : lightTheme

  const CATEGORIES = [
    { key: 'طلا', label: 'طلا' },
    { key: 'نقره', label: 'نقره' },
    { key: 'زعفران', label: 'زعفران' },
  ]

  // خواندن قالب از حافظه
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
      const res = await fetch('/api/funds', { cache: 'no-store' })
      if (!res.ok) { setLoading(false); return }
      const { assets, records, histRows } = await res.json()

      if (!assets || assets.length === 0) { setLoading(false); return }
      if (!records || records.length === 0) { setLoading(false); return }

      // ترکیب داده‌ها — pick highest id per asset (latest insert wins)
      const recordsDesc = [...records].sort((a: any, b: any) => b.id - a.id)
      const combined = assets.map((asset: any) => {
        const rec = recordsDesc.find((r: any) => r.asset_id === asset.id)
        return {
          symbol: asset.name,
          slug: asset.slug,
          category: asset.category || 'طلا',
          tradeValue: safe(rec?.trade_value),
          priceClose: safe(rec?.price_close),
          priceLast: safe(rec?.price_last),
          changePct: safe(rec?.price_change_pct),
          marketValue: safe(rec?.market_value),
          volume: safe(rec?.volume),
          buyCountI: safe(rec?.buy_count_i),
          sellCountI: safe(rec?.sell_count_i),
          buyIVolume: safe(rec?.buy_i_volume),
          sellIVolume: safe(rec?.sell_i_volume),
          date: rec?.trade_date_shamsi || '',
        }
      }).filter((f: any) => f.tradeValue > 0) // فقط صندوق‌هایی که داده دارن

      setAllFunds(combined)

      // ---- تشخیص ورود/خروج پول غیرعادی (۷ روز اخیر) ----
      const uniqueHistDates = [...new Set((histRows || []).map((r: any) => r.trade_date_shamsi))].slice(0, 6)

      if (uniqueHistDates.length >= 4) {
        const detectedAnomalies: any[] = []

        for (const asset of assets) {
          const todayRec = records.find((r: any) => r.asset_id === asset.id)
          if (!todayRec) continue

          const hist = (histRows || []).filter((r: any) =>
            r.asset_id === asset.id && uniqueHistDates.includes(r.trade_date_shamsi)
          )
          if (hist.length < 4) continue

          const histFlows = hist.map((r: any) =>
            (safe(r.buy_i_volume) - safe(r.sell_i_volume)) * safe(r.price_close)
          )
          const histAvg = histFlows.reduce((a: number, b: number) => a + b, 0) / histFlows.length
          const histStd = Math.sqrt(
            histFlows.reduce((a: number, b: number) => a + (b - histAvg) ** 2, 0) / histFlows.length
          )

          const todayFlow = (safe(todayRec.buy_i_volume) - safe(todayRec.sell_i_volume)) * safe(todayRec.price_close)

          if (histStd > 0 && Math.abs(todayFlow - histAvg) > 2 * histStd) {
            const magnitude = Math.abs(todayFlow - histAvg) / histStd
            const direction: 'inflow' | 'outflow' = todayFlow > histAvg ? 'inflow' : 'outflow'
            const flowBT = Math.round(todayFlow / 1_000_000_000 * 10) / 10
            const avgBT = Math.round(histAvg / 1_000_000_000 * 10) / 10
            detectedAnomalies.push({
              symbol: asset.name,
              slug: asset.slug,
              category: asset.category || 'طلا',
              direction,
              magnitude,
              flowBT,
              avgBT,
            })
          }
        }

        setAnomalies(
          detectedAnomalies.sort((a, b) => b.magnitude - a.magnitude).slice(0, 5)
        )
      }
      // ---- پایان تشخیص ----

      setLoading(false)
    }
    load()
  }, [])

  // فیلتر بر اساس دسته‌بندی و جستجو
  const q = searchQuery.trim()
  const funds = allFunds
    .filter(f => f.category === category)
    .filter(f => !q || f.symbol.includes(q) || f.slug.toLowerCase().includes(q.toLowerCase()))

  // محاسبه‌ی امتیاز هوشمند هر صندوق
  const calcScore = (f: any) => {
    let score = 0
    // تغییر قیمت (۲۰ امتیاز) — مثبت‌تر = بهتر
    score += Math.min(Math.max((f.changePct + 3) / 6 * 20, 0), 20)
    // جریان پول (۲۵ امتیاز)
    const netFlow = (f.buyIVolume - f.sellIVolume) * f.priceClose
    const maxFlow = Math.max(...funds.map(x => Math.abs((x.buyIVolume - x.sellIVolume) * x.priceClose)), 1)
    score += Math.min(Math.max(((netFlow / maxFlow) + 1) / 2 * 25, 0), 25)
    // قدرت خریدار (۲۰ امتیاز)
    const buyAvg = f.buyCountI > 0 ? (f.buyIVolume * f.priceClose) / f.buyCountI : 0
    const sellAvg = f.sellCountI > 0 ? (f.sellIVolume * f.priceClose) / f.sellCountI : 0
    const power = sellAvg > 0 ? buyAvg / sellAvg : 1
    score += Math.min(Math.max(power / 2 * 20, 0), 20)
    // ارزش معاملات (۱۵ امتیاز)
    const maxTrade = Math.max(...funds.map(x => x.tradeValue), 1)
    score += (f.tradeValue / maxTrade) * 15
    // نسبت خریدار به فروشنده (۲۰ امتیاز)
    const total = f.buyCountI + f.sellCountI
    const buyRatio = total > 0 ? f.buyCountI / total : 0.5
    score += buyRatio * 20
    return Math.round(score)
  }

  // اضافه کردن امتیاز به هر صندوق
  const fundsWithScore = funds.map(f => ({ ...f, score: calcScore(f) }))

  // مرتب‌سازی
  const sorted = [...fundsWithScore].sort((a, b) => {
    const av = (a as any)[sortBy] ?? 0
    const bv = (b as any)[sortBy] ?? 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const sortArrow = (col: string) => sortBy === col ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''

  // محاسبه‌ی خلاصه‌ی بازار
  const totalTradeValue = funds.reduce((s, f) => s + f.tradeValue, 0)
  const avgChange = funds.length > 0 ? funds.reduce((s, f) => s + f.changePct, 0) / funds.length : 0
  const positiveCount = funds.filter(f => f.changePct > 0).length
  const negativeCount = funds.filter(f => f.changePct < 0).length

  // ورود و خروج پول حقیقی (میلیارد تومان)
  const netFlow = funds.reduce((s, f) => {
    const buyValue = f.buyIVolume * (f.priceClose || 1)
    const sellValue = f.sellIVolume * (f.priceClose || 1)
    return s + (buyValue - sellValue)
  }, 0)

  const FEATURES = [
    {
      href: '/funds',
      title: 'صندوق‌های طلا',
      desc: 'قیمت، حجم و ارزش معاملات صندوق‌های مبتنی بر طلا',
      color: '#D4A847',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4A847" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      ),
    },
    {
      href: '/funds',
      title: 'صندوق‌های نقره',
      desc: 'دیدبان جامع صندوق‌های سرمایه‌گذاری مبتنی بر نقره',
      color: '#00C8FF',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00C8FF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="7" height="18" rx="1" />
          <rect x="9.5" y="8" width="5" height="13" rx="1" />
          <rect x="17" y="5" width="5" height="16" rx="1" />
        </svg>
      ),
    },
    {
      href: '/funds',
      title: 'صندوق‌های زعفران',
      desc: 'رصد صندوق‌های کالایی مبتنی بر زعفران و کالاهای کشاورزی',
      color: '#F59E0B',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a4 4 0 0 0 0 8" />
          <path d="M12 2a4 4 0 0 1 0 8" />
          <path d="M12 10v12" />
          <path d="M8 14s1 1 4 1 4-1 4-1" />
        </svg>
      ),
    },
    {
      href: '/signals',
      title: 'سیگنال‌های بازار',
      desc: 'سیگنال‌های هوشمند خرید و فروش بر اساس تحلیل داده‌های بازار',
      color: '#10B981',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
      ),
    },
    {
      href: '/analysis/gold',
      title: 'تحلیل طلا',
      desc: 'قیمت لحظه‌ای طلا، سکه، دلار و محاسبه‌ی حباب سکه',
      color: '#D4A847',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4A847" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="22" y2="22" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      ),
    },
    {
      href: '/compare',
      title: 'مقایسه صندوق‌ها',
      desc: 'مقایسه‌ی عملکرد دو تا پنج صندوق کنار هم به صورت بصری',
      color: '#00C8FF',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00C8FF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="2" x2="12" y2="22" />
          <polyline points="3 7 7 3 11 7" />
          <line x1="7" y1="3" x2="7" y2="17" />
          <polyline points="13 17 17 21 21 17" />
          <line x1="17" y1="21" x2="17" y2="7" />
        </svg>
      ),
    },
  ]

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      transition: 'background 0.3s, color 0.3s',
    }}>

      {/* ═══════ HERO ═══════ */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        padding: isMobile ? '56px 20px 48px' : '88px 6vw 72px',
        textAlign: 'center', direction: 'rtl',
      }}>
        {/* Glows */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 900px 420px at 50% 0%, rgba(212,168,71,0.07) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', top: 60, right: isMobile ? '5%' : '18%', width: 220, height: 220, background: 'radial-gradient(circle, rgba(0,200,255,0.045) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative' }}>
          {/* Eyebrow badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: isDark ? 'rgba(212,168,71,0.08)' : 'rgba(184,150,42,0.1)', border: `1px solid ${isDark ? 'rgba(212,168,71,0.2)' : 'rgba(184,150,42,0.25)'}`, borderRadius: 20, padding: '5px 16px', marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D4A847', boxShadow: '0 0 8px rgba(212,168,71,0.8)', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: isDark ? 'rgba(212,168,71,0.9)' : '#B8962A', fontWeight: 600, letterSpacing: '0.06em' }}>
              ترمینال هوشمند بورس ایران
            </span>
          </div>

          {/* H1 */}
          <h1 style={{ fontSize: isMobile ? 30 : 48, fontWeight: 900, color: t.textBright, margin: '0 0 18px', lineHeight: 1.25, letterSpacing: '-0.025em' }}>
            رصد هوشمند{' '}
            <span style={{ color: '#D4A847' }}>طلا، نقره و زعفران</span>
          </h1>

          {/* Subtitle */}
          <p style={{ fontSize: isMobile ? 14 : 17, color: t.muted, lineHeight: 1.85, margin: '0 auto 40px', maxWidth: 540 }}>
            دیدبان لحظه‌ای صندوق‌های کالایی بورس ایران — ارزش معاملات، جریان پول حقیقی، و سیگنال‌های خرید و فروش
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#fund-list" style={{
              fontSize: 14, padding: '12px 28px', borderRadius: 10, cursor: 'pointer',
              background: isDark ? 'linear-gradient(135deg, rgba(212,168,71,0.18), rgba(212,168,71,0.09))' : 'linear-gradient(135deg, rgba(212,168,71,0.22), rgba(212,168,71,0.12))',
              border: `1px solid ${isDark ? 'rgba(212,168,71,0.38)' : 'rgba(184,150,42,0.45)'}`,
              color: '#D4A847', textDecoration: 'none', fontWeight: 700,
              fontFamily: 'Vazirmatn, inherit',
              boxShadow: '0 0 20px rgba(212,168,71,0.09)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 32px rgba(212,168,71,0.2)'; e.currentTarget.style.borderColor = 'rgba(212,168,71,0.65)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 20px rgba(212,168,71,0.09)'; e.currentTarget.style.borderColor = isDark ? 'rgba(212,168,71,0.38)' : 'rgba(184,150,42,0.45)' }}>
              مشاهده صندوق‌ها
            </a>
            <Link href="/signals" style={{
              fontSize: 14, padding: '12px 28px', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(0,200,255,0.07)',
              border: '1px solid rgba(0,200,255,0.22)',
              color: '#00C8FF', textDecoration: 'none', fontWeight: 600,
              fontFamily: 'inherit', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,200,255,0.13)'; e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,200,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(0,200,255,0.22)' }}>
              سیگنال‌های بازار
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════ FEATURES ═══════ */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '0 16px 40px' : '0 24px 56px', direction: 'rtl' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
          gap: isMobile ? 10 : 14,
        }}>
          {FEATURES.map((feat, i) => (
            <Link key={i} href={feat.href} style={{
              textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : 10,
              background: t.panel,
              border: `1px solid ${t.border}`,
              borderRadius: 14, padding: isMobile ? '14px 12px' : '20px 18px',
              backdropFilter: 'blur(12px)',
              transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = `${feat.color}44`
              e.currentTarget.style.boxShadow = `0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px ${feat.color}22`
              e.currentTarget.style.background = isDark ? 'rgba(10,24,46,0.95)' : 'rgba(255,252,244,0.98)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = t.border
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.background = t.panel
            }}>
              <div style={{
                width: isMobile ? 36 : 42, height: isMobile ? 36 : 42,
                borderRadius: 10,
                background: `${feat.color}12`,
                border: `1px solid ${feat.color}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {feat.icon}
              </div>
              <div>
                <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 700, color: t.textBright, marginBottom: 4 }}>{feat.title}</div>
                <div style={{ fontSize: isMobile ? 11 : 12, color: t.muted, lineHeight: 1.65 }}>{feat.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Separator */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', marginBottom: 24 }}>
        <div style={{ height: 1, background: isDark ? 'linear-gradient(90deg, transparent, rgba(212,168,71,0.12) 40%, rgba(0,200,255,0.08) 70%, transparent)' : 'linear-gradient(90deg, transparent, rgba(180,140,40,0.18) 50%, transparent)' }} />
      </div>

      <div id="fund-list" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* نوار ابزار */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.textBright }}>
            دیدبان صندوق‌های کالایی
            <span style={{ fontSize: 11, color: t.muted, fontWeight: 400, marginRight: 10 }}>
              {funds.length > 0 ? `${funds[0].date} · ${funds.length} صندوق` : ''}
            </span>
          </div>
        </div>

        {/* خلاصه روزانه بازار */}
        {!loading && funds.length > 0 && (() => {
          const topInflow = [...funds].sort((a, b) => {
            const an = (a.buyIVolume - a.sellIVolume) * a.priceClose
            const bn = (b.buyIVolume - b.sellIVolume) * b.priceClose
            return bn - an
          })[0]
          const topGainer = [...funds].sort((a, b) => b.changePct - a.changePct)[0]
          const topLoser = [...funds].sort((a, b) => a.changePct - b.changePct)[0]
          const inflowMT = Math.round((topInflow.buyIVolume - topInflow.sellIVolume) * topInflow.priceClose / (topInflow.tradeValue > 1e6 ? 1e10 : 1e9) * 10) / 10
          const isPositiveDay = avgChange >= 0
          const items = [
            { label: 'مثبت', val: positiveCount.toLocaleString('fa-IR'), color: '#00E5A0' },
            { label: 'منفی', val: negativeCount.toLocaleString('fa-IR'), color: '#FF4D6A' },
            { label: 'بیشترین رشد', val: `${topGainer.symbol} ${topGainer.changePct > 0 ? '+' : ''}${topGainer.changePct.toFixed(2)}٪`, color: '#00E5A0' },
            { label: 'بیشترین افت', val: `${topLoser.symbol} ${topLoser.changePct.toFixed(2)}٪`, color: '#FF4D6A' },
            { label: 'بیشترین ورود', val: `${topInflow.symbol} ${inflowMT > 0 ? '+' : ''}${inflowMT} م.ت`, color: inflowMT >= 0 ? '#00E5A0' : '#FF4D6A' },
          ]
          return (
            <div className="animate-fade-in" style={{
              background: isPositiveDay
                ? 'linear-gradient(135deg, rgba(0,229,160,0.05), rgba(0,229,160,0.02))'
                : 'linear-gradient(135deg, rgba(255,77,106,0.05), rgba(255,77,106,0.02))',
              border: `0.5px solid ${isPositiveDay ? 'rgba(0,229,160,0.2)' : 'rgba(255,77,106,0.2)'}`,
              borderRadius: 10,
              padding: '10px 16px',
              display: 'flex', flexWrap: 'wrap', gap: isMobile ? '8px 14px' : '4px 20px',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 10, color: t.faint, letterSpacing: '0.04em', marginLeft: 4 }}>
                امروز
              </span>
              {items.map((item, i) => (
                <span key={i} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
                  <span style={{ color: t.faint }}>{item.label}:</span>
                  <span style={{ fontWeight: 700, color: item.color, fontFamily: 'system-ui, sans-serif' }}>{item.val}</span>
                </span>
              ))}
            </div>
          )
        })()}

        {/* نوار جستجو + دسته‌بندی */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, direction: 'rtl' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                style={{
                  flex: isMobile ? '1' : undefined,
                  fontSize: 12, padding: '9px 16px',
                  borderRadius: 10, cursor: 'pointer',
                  background: category === cat.key ? `${t.accent}1A` : 'transparent',
                  border: `0.5px solid ${category === cat.key ? `${t.accent}66` : t.border}`,
                  color: category === cat.key ? t.accent : t.muted,
                  fontFamily: 'inherit', fontWeight: category === cat.key ? 700 : 500,
                  transition: 'all 0.2s',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
          {/* جستجوی نماد */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              placeholder="جستجوی نماد..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                background: t.inputBg, border: `0.5px solid ${searchQuery ? t.accent : t.border}`,
                borderRadius: 8, padding: '9px 14px', color: t.text,
                fontSize: 12, fontFamily: 'Vazirmatn, inherit', outline: 'none',
                width: isMobile ? '100%' : 160, flex: isMobile ? 1 : undefined,
                direction: 'rtl', transition: 'border 0.2s',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  fontSize: 11, padding: '7px 12px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(255,77,106,0.1)', border: '0.5px solid rgba(255,77,106,0.3)',
                  color: '#FF4D6A', fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
              >پاک کن</button>
            )}
          </div>
        </div>

        {/* کارت‌های خلاصه */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12 }}>
          <SummaryCard t={t} label="ارزش کل معاملات" value={`${fmtVal(totalTradeValue / 1e10)} م.ت`} tooltip="مجموع ارزش معاملات همه‌ی صندوق‌ها — میلیارد تومان" />
          <SummaryCard t={t} label="میانگین تغییر" value={`${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}٪`}
            color={avgChange >= 0 ? '#00E5A0' : '#FF4D6A'} tooltip="میانگین درصد تغییر قیمت پایانی همه‌ی صندوق‌ها" />
          <SummaryCard t={t} label="مثبت / منفی" value={`${positiveCount.toLocaleString('fa-IR')} / ${negativeCount.toLocaleString('fa-IR')}`}
            tooltip="تعداد صندوق‌هایی که قیمت‌شان مثبت یا منفی شده" />
          <SummaryCard t={t} label="جریان پول حقیقی" value={netFlow >= 0 ? 'ورودی' : 'خروجی'}
            color={netFlow >= 0 ? '#00E5A0' : '#FF4D6A'} tooltip="تفاوت حجم خرید و فروش حقیقی‌ها — نشان‌دهنده‌ی جهت پول هوشمند" />
        </div>

        {/* هشدارهای ورود/خروج پول غیرعادی */}
        {!loading && anomalies.filter(a => a.category === category).length > 0 && (
          <div style={{ background: t.panel, border: `0.5px solid rgba(245,158,11,0.35)`, borderRadius: 12, padding: '16px 20px', backdropFilter: 'blur(12px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>هشدار جریان پول غیرعادی</span>
              <span style={{ fontSize: 9, color: t.faint, background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 6 }}>بر اساس ۷ روز اخیر</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {anomalies.filter(a => a.category === category).map((a, i) => {
                const isIn = a.direction === 'inflow'
                const color = isIn ? '#00E5A0' : '#FF4D6A'
                const bg = isIn ? 'rgba(0,229,160,0.08)' : 'rgba(255,77,106,0.08)'
                const border = isIn ? 'rgba(0,229,160,0.25)' : 'rgba(255,77,106,0.25)'
                return (
                  <div key={i} style={{
                    background: bg, border: `0.5px solid ${border}`, borderRadius: 10,
                    padding: '10px 16px', minWidth: 160, flex: '1 1 160px', maxWidth: 220,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color }}>{a.symbol}</span>
                      <span style={{ fontSize: 10, color, fontWeight: 700 }}>{isIn ? '▲ ورود' : '▼ خروج'}</span>
                    </div>
                    <div style={{ fontSize: 11, color: t.muted, marginBottom: 2 }}>
                      امروز: <span style={{ fontWeight: 700, color }}>{a.flowBT > 0 ? '+' : ''}{a.flowBT.toLocaleString('fa-IR', { maximumFractionDigits: 1 })} م.ت</span>
                    </div>
                    <div style={{ fontSize: 10, color: t.muted }}>
                      میانگین ۷ روز: {a.avgBT.toLocaleString('fa-IR', { maximumFractionDigits: 1 })} م.ت
                    </div>
                    <div style={{ fontSize: 10, color: t.muted, marginTop: 2 }}>
                      شدت: {a.magnitude.toFixed(1)}σ
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* رتبه‌بندی صندوق‌ها */}
        {!loading && fundsWithScore.length >= 3 && (() => {
          const top5Score   = [...fundsWithScore].sort((a, b) => b.score - a.score).slice(0, 5)
          const top5Inflow  = [...fundsWithScore].sort((a, b) => {
            const an = (a.buyIVolume - a.sellIVolume) * a.priceClose / (a.tradeValue > 1e6 ? 1e10 : 1e9)
            const bn = (b.buyIVolume - b.sellIVolume) * b.priceClose / (b.tradeValue > 1e6 ? 1e10 : 1e9)
            return bn - an
          }).slice(0, 5)
          const top5Worst   = [...fundsWithScore].sort((a, b) => a.changePct - b.changePct).slice(0, 5)

          const medals = ['🥇', '🥈', '🥉', '④', '⑤']
          const divFlow = (f: any) => (f.buyIVolume - f.sellIVolume) * f.priceClose / (f.tradeValue > 1e6 ? 1e10 : 1e9)

          const Col = ({ title, color, rows, renderVal }: {
            title: string; color: string;
            rows: typeof fundsWithScore;
            renderVal: (f: typeof fundsWithScore[0]) => string;
          }) => (
            <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '14px 16px', flex: 1, minWidth: isMobile ? '100%' : 200 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 12, letterSpacing: '0.02em' }}>{title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rows.map((f, i) => (
                  <Link key={f.slug} href={`/fund/${f.slug}`} style={{ textDecoration: 'none' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 8px', borderRadius: 8, margin: '0 -8px', transition: 'background 0.15s' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = `${color}15`)}
                      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
                    >
                      <span style={{ fontSize: 14, minWidth: 22, textAlign: 'center', lineHeight: 1 }}>{medals[i]}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.textBright, flex: 1 }}>{f.symbol}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'system-ui, sans-serif' }}>{renderVal(f)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )

          return (
            <div className="animate-fade-in">
              <div style={{ fontSize: 11, color: t.faint, marginBottom: 8, letterSpacing: '0.04em' }}>رتبه‌بندی</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Col title="🏆 بهترین امتیاز" color="#F59E0B" rows={top5Score}
                  renderVal={f => `${f.score}`} />
                <Col title="💰 بیشترین ورود پول" color="#00E5A0" rows={top5Inflow}
                  renderVal={f => {
                    const v = divFlow(f)
                    return `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10} م.ت`
                  }} />
                <Col title="📉 بیشترین افت" color="#FF4D6A" rows={top5Worst}
                  renderVal={f => `${f.changePct.toFixed(2)}٪`} />
              </div>
            </div>
          )
        })()}

        {/* تحلیل هوشمند بازار */}
        {!loading && funds.length > 0 && (
          <div style={{ background: t.panel, border: `0.5px solid ${t.accent}22`, borderRadius: 12, padding: '18px 20px', backdropFilter: 'blur(12px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 18 }}>🤖</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.textBright }}>تحلیل هوشمند بازار</span>
              <span style={{ fontSize: 9, color: t.faint, background: `${t.accent}15`, padding: '2px 8px', borderRadius: 6 }}>خودکار</span>
            </div>
            <div style={{ fontSize: 12, color: t.text, lineHeight: 2.2, direction: 'rtl' }}>
              {(() => {
                // محاسبات
                const topGainer = [...funds].sort((a, b) => b.changePct - a.changePct)[0]
                const topLoser = [...funds].sort((a, b) => a.changePct - b.changePct)[0]
                const topVolume = [...funds].sort((a, b) => b.tradeValue - a.tradeValue)[0]

                const topInflow = [...funds].sort((a, b) => {
                  const aNet = (a.buyIVolume * a.priceClose) - (a.sellIVolume * a.priceClose)
                  const bNet = (b.buyIVolume * b.priceClose) - (b.sellIVolume * b.priceClose)
                  return bNet - aNet
                })[0]
                const topOutflow = [...funds].sort((a, b) => {
                  const aNet = (a.buyIVolume * a.priceClose) - (a.sellIVolume * a.priceClose)
                  const bNet = (b.buyIVolume * b.priceClose) - (b.sellIVolume * b.priceClose)
                  return aNet - bNet
                })[0]

                const topInflowVal = Math.round(((topInflow.buyIVolume * topInflow.priceClose) - (topInflow.sellIVolume * topInflow.priceClose)) / (topInflow.tradeValue > 1e6 ? 1e10 : 1e9) * 10) / 10
                const topOutflowVal = Math.round(((topOutflow.buyIVolume * topOutflow.priceClose) - (topOutflow.sellIVolume * topOutflow.priceClose)) / (topOutflow.tradeValue > 1e6 ? 1e10 : 1e9) * 10) / 10

                // تشخیص روند
                const trend = avgChange > 0.5 ? 'صعودی قوی' : avgChange > 0 ? 'صعودی ملایم' : avgChange > -0.5 ? 'نزولی ملایم' : 'نزولی قوی'
                const trendColor = avgChange > 0 ? '#00E5A0' : '#FF4D6A'
                const trendEmoji = avgChange > 0.5 ? '🚀' : avgChange > 0 ? '📈' : avgChange > -0.5 ? '📉' : '🔻'

                const catLabel = CATEGORIES.find(c => c.key === category)?.label || 'صندوق‌ها'

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ margin: 0 }}>
                      {trendEmoji} بازار {catLabel} امروز <span style={{ color: trendColor, fontWeight: 700 }}>{trend}</span> بود.
                      از <span style={{ fontWeight: 700 }}>{funds.length.toLocaleString('fa-IR')}</span> صندوق،{' '}
                      <span style={{ color: '#00E5A0', fontWeight: 700 }}>{positiveCount.toLocaleString('fa-IR')} مثبت</span> و{' '}
                      <span style={{ color: '#FF4D6A', fontWeight: 700 }}>{negativeCount.toLocaleString('fa-IR')} منفی</span> بودند.
                    </p>
                    <p style={{ margin: 0 }}>
                      🏆 بیشترین رشد: <span style={{ color: '#00E5A0', fontWeight: 700 }}>{topGainer.symbol} ({topGainer.changePct > 0 ? '+' : ''}{topGainer.changePct.toFixed(2)}٪)</span>
                      {' · '}بیشترین افت: <span style={{ color: '#FF4D6A', fontWeight: 700 }}>{topLoser.symbol} ({topLoser.changePct.toFixed(2)}٪)</span>
                    </p>
                    <p style={{ margin: 0 }}>
                      💰 بیشترین ورود پول حقیقی: <span style={{ color: '#00E5A0', fontWeight: 700 }}>{topInflow.symbol} (+{topInflowVal} میلیارد)</span>
                      {' · '}بیشترین خروج: <span style={{ color: '#FF4D6A', fontWeight: 700 }}>{topOutflow.symbol} ({topOutflowVal} میلیارد)</span>
                    </p>
                    <p style={{ margin: 0 }}>
                      📊 بیشترین ارزش معاملات: <span style={{ fontWeight: 700, color: t.accent }}>{topVolume.symbol} ({fmtVal(topVolume.tradeValue / 1e10)} م.ت)</span>
                    </p>
                    <p style={{ margin: 0 }}>
                      🧭 جمع‌بندی: {avgChange > 0
                        ? `فضای بازار مثبت است. ${positiveCount > negativeCount * 2 ? 'اکثریت قاطع صندوق‌ها مثبتند و نشانه‌ی اعتماد بالای بازار است.' : 'اما تعداد قابل‌توجهی منفی‌ هستند. احتیاط لازم است.'}`
                        : `فضای بازار منفی است. ${negativeCount > positiveCount * 2 ? 'اکثریت صندوق‌ها منفی‌اند و فشار فروش بالاست.' : 'اما تعدادی صندوق مثبت هستند. ممکن است بازار در حال تغییر جهت باشد.'}`
                      }
                      {topInflowVal > 50 && ` ورود پول سنگین به ${topInflow.symbol} نشانه‌ی توجه حقیقی‌ها به این صندوق است.`}
                    </p>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* جدول / کارت اصلی */}
        <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: isMobile ? '12px' : '16px 18px', backdropFilter: 'blur(12px)' }}>

          {loading ? (
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, padding: '11px 8px',
                  borderBottom: `0.5px solid ${t.border}`,
                  alignItems: 'center',
                  opacity: 1 - i * 0.07,
                }}>
                  <div className="skeleton" style={{ width: 32, height: 22, borderRadius: 6, flexShrink: 0 }} />
                  <div className="skeleton" style={{ width: 52 + (i % 3) * 14, height: 14 }} />
                  <div className="skeleton" style={{ width: 60, height: 14 }} />
                  <div className="skeleton" style={{ width: 60, height: 14 }} />
                  <div className="skeleton" style={{ width: 44, height: 20, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 50, height: 14 }} />
                  <div className="skeleton" style={{ width: 50, height: 14 }} />
                  <div className="skeleton" style={{ width: 40, height: 14, marginRight: 'auto' }} />
                </div>
              ))}
            </div>
          ) : funds.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: t.muted }}>داده‌ای یافت نشد</div>
          ) : isMobile ? (
            /* ── کارت موبایل ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* مرتب‌سازی موبایل */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                {[
                  { key: 'score', label: 'امتیاز' },
                  { key: 'changePct', label: 'تغییر' },
                  { key: 'tradeValue', label: 'ارزش' },
                ].map(col => (
                  <button
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    style={{
                      fontSize: 11, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                      background: sortBy === col.key ? `${t.accent}15` : 'transparent',
                      border: `0.5px solid ${sortBy === col.key ? `${t.accent}50` : t.border}`,
                      color: sortBy === col.key ? t.accent : t.muted,
                      fontFamily: 'inherit', transition: 'all 0.15s',
                    }}
                  >
                    {col.label}{sortArrow(col.key)}
                  </button>
                ))}
              </div>

              {sorted.map((f, i) => {
                const isPositive = f.changePct > 0
                const isNegative = f.changePct < 0
                const chgColor = isPositive ? '#00E5A0' : isNegative ? '#FF4D6A' : t.muted
                const scoreColor = f.score >= 60 ? '#00E5A0' : f.score >= 40 ? '#F59E0B' : '#FF4D6A'
                const scoreBg = f.score >= 60 ? 'rgba(0,229,160,0.1)' : f.score >= 40 ? 'rgba(245,158,11,0.1)' : 'rgba(255,77,106,0.1)'
                const netFlow = (f.buyIVolume - f.sellIVolume) * f.priceClose
                const netFlowBT = Math.round(netFlow / 1_000_000_000 * 10) / 10
                return (
                  <Link
                    key={i}
                    href={`/fund/${f.slug}`}
                    style={{
                      textDecoration: 'none',
                      display: 'block',
                      background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                      border: `0.5px solid ${t.border}`,
                      borderRadius: 10,
                      padding: '12px 14px',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = isDark ? 'rgba(0,200,255,0.05)' : 'rgba(0,120,170,0.05)'
                      e.currentTarget.style.borderColor = `${t.accent}40`
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'
                      e.currentTarget.style.borderColor = t.border
                    }}
                  >
                    {/* ردیف اول: نماد + امتیاز + تغییر */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: t.accent }}>{f.symbol}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 700, color: chgColor,
                          background: isPositive ? 'rgba(0,229,160,0.1)' : isNegative ? 'rgba(255,77,106,0.1)' : `${t.accent}10`,
                          padding: '2px 10px', borderRadius: 6,
                        }}>
                          {isPositive ? '+' : ''}{f.changePct.toFixed(2)}٪
                        </span>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: scoreColor,
                          background: scoreBg, padding: '2px 8px', borderRadius: 6,
                        }}>
                          {f.score}
                        </span>
                      </div>
                    </div>

                    {/* ردیف دوم: شبکه متریک‌ها */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                      <div>
                        <div style={{ fontSize: 10, color: t.faint, marginBottom: 2 }}>قیمت پایانی</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{f.priceClose.toLocaleString('fa-IR')}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: t.faint, marginBottom: 2 }}>ارزش معاملات</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{fmtVal(f.tradeValue / 1e10)} <span style={{ fontSize: 10, color: t.faint }}>م.ت</span></div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: t.faint, marginBottom: 2 }}>خریدار / فروشنده</div>
                        <div style={{ fontSize: 13 }}>
                          <span style={{ color: '#00E5A0', fontWeight: 600 }}>{f.buyCountI.toLocaleString('fa-IR')}</span>
                          <span style={{ color: t.faint }}> / </span>
                          <span style={{ color: '#FF4D6A', fontWeight: 600 }}>{f.sellCountI.toLocaleString('fa-IR')}</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: t.faint, marginBottom: 2 }}>جریان پول حقیقی</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: netFlow >= 0 ? '#00E5A0' : '#FF4D6A' }}>
                          {netFlow >= 0 ? '+' : ''}{netFlowBT.toLocaleString('fa-IR', { maximumFractionDigits: 1 })} م.ت
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            /* ── جدول دسکتاپ ── */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {[
                      { key: 'score', label: 'امتیاز' },
                      { key: 'symbol', label: 'نماد' },
                      { key: 'priceClose', label: 'قیمت پایانی' },
                      { key: 'priceLast', label: 'آخرین قیمت' },
                      { key: 'changePct', label: 'تغییر٪' },
                      { key: 'tradeValue', label: 'ارزش معاملات' },
                      { key: 'marketValue', label: 'ارزش بازار' },
                      { key: 'volume', label: 'حجم' },
                      { key: 'buyCountI', label: 'خریدار حقیقی' },
                      { key: 'sellCountI', label: 'فروشنده حقیقی' },
                    ].map(col => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        style={{
                          color: sortBy === col.key ? t.accent : t.muted,
                          fontWeight: 600, textAlign: 'right', padding: '10px 8px',
                          borderBottom: `0.5px solid ${t.border}`,
                          cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
                          fontSize: 11,
                        }}
                      >
                        {col.label}{sortArrow(col.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((f, i) => {
                    const isPositive = f.changePct > 0
                    const isNegative = f.changePct < 0
                    return (
                      <tr key={i} style={{
                        borderBottom: `0.5px solid ${t.border}`,
                        transition: 'background 0.15s',
                        cursor: 'pointer',
                      }}
                        onClick={() => router.push(`/fund/${f.slug}`)}
                        onMouseEnter={e => (e.currentTarget.style.background = `${t.accent}0D`)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <span title="امتیاز هوشمند از ۰ تا ۱۰۰" style={{
                            display: 'inline-block', padding: '3px 10px', borderRadius: 6,
                            fontSize: 12, fontWeight: 800, cursor: 'help',
                            fontFamily: 'system-ui, sans-serif',
                            background: f.score >= 60 ? 'rgba(0,229,160,0.12)' : f.score >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(255,77,106,0.12)',
                            color: f.score >= 60 ? '#00E5A0' : f.score >= 40 ? '#F59E0B' : '#FF4D6A',
                          }}>
                            {f.score}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: 700 }}>
                          <Link href={`/fund/${f.slug}`} style={{ color: t.accent, textDecoration: 'none' }}>{f.symbol}</Link>
                        </td>
                        <td style={{ padding: '10px 8px', color: t.text }}>{f.priceClose.toLocaleString('fa-IR')}</td>
                        <td style={{ padding: '10px 8px', color: t.text }}>{f.priceLast.toLocaleString('fa-IR')}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{
                            display: 'inline-block',
                            background: isPositive ? 'rgba(0,229,160,0.1)' : isNegative ? 'rgba(255,77,106,0.1)' : `${t.accent}10`,
                            color: isPositive ? '#00E5A0' : isNegative ? '#FF4D6A' : t.muted,
                            borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                          }}>
                            {isPositive ? '+' : ''}{f.changePct.toFixed(2)}٪
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', color: t.text }}>{fmtVal(f.tradeValue / 1e10)} <span style={{ color: t.faint, fontSize: 10 }}>م.ت</span></td>
                        <td style={{ padding: '10px 8px', color: t.text }}>{fmtVal(f.marketValue)} <span style={{ color: t.faint, fontSize: 10 }}>م.ر</span></td>
                        <td style={{ padding: '10px 8px', color: t.text }}>{f.volume.toLocaleString('fa-IR')}</td>
                        <td style={{ padding: '10px 8px', color: '#00E5A0' }}>{f.buyCountI.toLocaleString('fa-IR')}</td>
                        <td style={{ padding: '10px 8px', color: '#FF4D6A' }}>{f.sellCountI.toLocaleString('fa-IR')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* نقشه‌ی بازار */}
        {!loading && funds.length > 0 && (
          <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
            <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em', marginBottom: 12 }}>
              نقشه‌ی بازار صندوق‌های کالایی
              <span style={{ fontSize: 10, color: t.faint, marginRight: 8 }}>اندازه: ارزش معاملات · رنگ: درصد تغییر</span>
            </div>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 2,
              borderRadius: 8, overflow: 'hidden',
              minHeight: 300,
            }}>
              {(() => {
                const sortedByValue = [...funds].sort((a, b) => b.tradeValue - a.tradeValue)
                const totalLog = sortedByValue.reduce((s, f) => s + Math.log(f.tradeValue + 1), 0)
                return sortedByValue.map((f, i) => {
                  const pct = (Math.log(f.tradeValue + 1) / totalLog) * 100
                  const changePct = f.changePct

                  // رنگ بر اساس درصد تغییر
                  let bgColor: string
                  let textColor: string
                  if (changePct > 1.5) { bgColor = '#00A86B'; textColor = '#FFFFFF' }
                  else if (changePct > 0.5) { bgColor = '#2E8B57'; textColor = '#FFFFFF' }
                  else if (changePct > 0) { bgColor = '#1A5C38'; textColor = '#C0E8D0' }
                  else if (changePct === 0) { bgColor = '#333333'; textColor = '#AAAAAA' }
                  else if (changePct > -0.5) { bgColor = '#6B1A1A'; textColor = '#E8C0C0' }
                  else if (changePct > -1.5) { bgColor = '#8B2E2E'; textColor = '#FFFFFF' }
                  else { bgColor = '#C0392B'; textColor = '#FFFFFF' }

                  const isLarge = pct > 5
                  const isMedium = pct > 3

                  return (
                    <Link
                      href={`/fund/${f.slug}`}
                      key={i}
                      title={`${f.symbol}\nتغییر: ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}٪\nارزش معاملات: ${fmtVal(f.tradeValue / 1e10)} م.ت`}
                      style={{
                        textDecoration: 'none',
                        flexBasis: `${Math.max(pct, 2.5)}%`,
                        flexGrow: 1,
                        minWidth: 50,
                        minHeight: isLarge ? 90 : isMedium ? 70 : 50,
                        background: bgColor,
                        borderRadius: 4,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        padding: '6px 4px',
                        cursor: 'pointer',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'scale(1.03)'
                        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4)'
                        e.currentTarget.style.zIndex = '10'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'scale(1)'
                        e.currentTarget.style.boxShadow = 'none'
                        e.currentTarget.style.zIndex = '1'
                      }}
                    >
                      <div style={{
                        fontSize: isLarge ? 13 : isMedium ? 11 : 9,
                        fontWeight: 700, color: textColor,
                        textAlign: 'center',
                        lineHeight: 1.2,
                      }}>
                        {f.symbol}
                      </div>
                      <div style={{
                        fontSize: isLarge ? 12 : isMedium ? 10 : 8,
                        fontWeight: 600, color: textColor,
                        opacity: 0.9,
                        marginTop: 2,
                      }}>
                        {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}٪
                      </div>
                      {isLarge && (
                        <div style={{ fontSize: 9, color: textColor, opacity: 0.6, marginTop: 2 }}>
                          {fmtVal(f.tradeValue / 1e10)} م.ت
                        </div>
                      )}
                    </Link>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {/* نمودار ورود و خروج پول حقیقی */}
        {!loading && funds.length > 0 && (
          <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
            <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em', marginBottom: 16 }}>
              ورود و خروج پول حقیقی
              <span style={{ fontSize: 10, color: t.faint, marginRight: 8 }}>میلیارد تومان</span>
            </div>
            {(() => {
              const flows = funds.map(f => {
                const buyVal = f.buyIVolume * f.priceClose
                const sellVal = f.sellIVolume * f.priceClose
                const net = Math.round((buyVal - sellVal) / 1000000000 * 10) / 10
                return { symbol: f.symbol, net, slug: f.slug }
              }).sort((a, b) => b.net - a.net)

              const maxAbs = Math.max(...flows.map(f => Math.abs(f.net)), 1)
              const barMaxH = 120

              return (
                <div style={{ overflowX: 'auto' }}>
                  {/* میله‌ها */}
                  <div style={{ display: 'flex', alignItems: 'center', minWidth: flows.length * 30, height: barMaxH * 2 + 50, position: 'relative', paddingTop: 25 }}>
                    {/* خط صفر */}
                    <div style={{ position: 'absolute', left: 0, right: 0, top: barMaxH + 35, height: 1, background: `${t.muted}33` }} />

                    {flows.map((f, i) => {
                      const isPos = f.net >= 0
                      const h = Math.max((Math.abs(f.net) / maxAbs) * barMaxH, 3)
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', height: '100%' }}>
                          {/* عدد */}
                          <div style={{
                            position: 'absolute',
                            top: isPos ? barMaxH + 35 - h - 20 : barMaxH + 35 + h + 4,
                            fontSize: 9, fontWeight: 800,
                            color: isPos ? '#00E5A0' : '#FF4D6A',
                            whiteSpace: 'nowrap',
                            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                          }}>
                            {isPos ? '+' : ''}{f.net}
                          </div>
                          {/* میله */}
                          <div style={{
                            position: 'absolute',
                            top: isPos ? barMaxH + 35 - h : barMaxH + 36,
                            width: '60%', maxWidth: 22,
                            height: h,
                            borderRadius: isPos ? '3px 3px 0 0' : '0 0 3px 3px',
                            background: isPos
                              ? 'linear-gradient(0deg, rgba(0,229,160,0.4), rgba(0,229,160,0.8))'
                              : 'linear-gradient(180deg, rgba(255,77,106,0.4), rgba(255,77,106,0.8))',
                            cursor: 'pointer',
                          }}
                            title={`${f.symbol}: ${isPos ? '+' : ''}${f.net} میلیارد تومان`}
                          />
                        </div>
                      )
                    })}
                  </div>
                  {/* اسم‌ها */}
                  <div style={{ display: 'flex', minWidth: flows.length * 30, marginTop: 4 }}>
                    {flows.map((f, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: t.muted, lineHeight: 1.2 }}>
                        {f.symbol}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* نمودار سرانه‌ی خرید و فروش حقیقی */}
        {!loading && funds.length > 0 && (
          <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em' }}>
                سرانه‌ی خرید و فروش حقیقی
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 10 }}>
                <span style={{ color: '#00E5A0' }}>■ سرانه خریدار</span>
                <span style={{ color: '#FF4D6A' }}>■ سرانه فروشنده</span>
              </div>
            </div>
            {(() => {
              const caps = funds.map(f => {
                const buyAvg = f.buyCountI > 0 ? Math.round((f.buyIVolume * f.priceClose) / f.buyCountI / 1000000) : 0
                const sellAvg = f.sellCountI > 0 ? Math.round((f.sellIVolume * f.priceClose) / f.sellCountI / 1000000) : 0
                const power = sellAvg > 0 ? Math.round((buyAvg / sellAvg) * 100) / 100 : 0
                return { symbol: f.symbol, buyAvg, sellAvg, power, slug: f.slug }
              }).sort((a, b) => b.power - a.power)

              const maxVal = Math.max(...caps.map(f => Math.max(f.buyAvg, f.sellAvg)), 1)
              const barMaxH = 120

              return (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ display: 'flex', minWidth: caps.length * 40, height: barMaxH + 50, position: 'relative', alignItems: 'flex-end', paddingBottom: 30 }}>
                    {caps.map((f, i) => {
                      const buyH = Math.max((f.buyAvg / maxVal) * barMaxH, 2)
                      const sellH = Math.max((f.sellAvg / maxVal) * barMaxH, 2)
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                          {/* دو میله با عدد بالای هر کدوم */}
                          <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ fontSize: 7, fontWeight: 800, color: '#00E5A0', marginBottom: 2, fontFamily: 'system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                                {f.buyAvg}
                              </div>
                              <div
                                title={`${f.symbol} سرانه خرید: ${f.buyAvg.toLocaleString('fa-IR')} میلیون تومان`}
                                style={{
                                  width: isMobile ? 8 : 10, height: buyH, borderRadius: '3px 3px 0 0',
                                  background: 'linear-gradient(0deg, rgba(0,229,160,0.4), rgba(0,229,160,0.8))',
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ fontSize: 7, fontWeight: 800, color: '#FF4D6A', marginBottom: 2, fontFamily: 'system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                                {f.sellAvg}
                              </div>
                              <div
                                title={`${f.symbol} سرانه فروش: ${f.sellAvg.toLocaleString('fa-IR')} میلیون تومان`}
                                style={{
                                  width: isMobile ? 8 : 10, height: sellH, borderRadius: '3px 3px 0 0',
                                  background: 'linear-gradient(0deg, rgba(255,77,106,0.4), rgba(255,77,106,0.8))',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* اسم‌ها */}
                  <div style={{ display: 'flex', minWidth: caps.length * 40 }}>
                    {caps.map((f, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: t.muted }}>
                        {f.symbol}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

      </div>

    </main>
  )
}

function SummaryCard({ t, label, value, color, tooltip }: any) {
  return (
    <div title={tooltip || ''} style={{
      background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12,
      padding: '14px 16px', backdropFilter: 'blur(12px)', cursor: tooltip ? 'help' : 'default',
    }}>
      <div style={{ fontSize: 10, color: t.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || t.textBright }}>{value}</div>
    </div>
  )
}
