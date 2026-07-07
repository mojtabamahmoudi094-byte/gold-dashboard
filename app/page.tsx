'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useIsMobile } from '../lib/useIsMobile'
import { safe, fmtCompact as fmtVal } from '../lib/format'

type TickerItem = { name: string; slug: string; price: number; changePct: number }

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

const FEATURES = [
  {
    href: '/funds',
    title: 'صندوق‌های طلا',
    desc: 'قیمت، حجم و ارزش معاملات صندوق‌های مبتنی بر طلا',
    color: 'oklch(0.82 0.15 70)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.82 0.15 70)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    href: '/funds',
    title: 'صندوق‌های نقره',
    desc: 'دیدبان جامع صندوق‌های سرمایه‌گذاری مبتنی بر نقره',
    color: 'oklch(0.84 0.03 240)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.84 0.03 240)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
    color: 'oklch(0.70 0.19 40)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.70 0.19 40)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
    color: 'oklch(0.74 0.17 155)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.74 0.17 155)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
    color: '#3b82f6',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="22" y2="22" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    ),
  },
  {
    href: '/trade-value',
    title: 'ارزش معاملات',
    desc: 'ارزش کل معاملات روزانه طلا، نقره و زعفران با نمودار تاریخی',
    color: 'oklch(0.74 0.17 155)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.74 0.17 155)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="7" height="18" rx="1" />
        <rect x="9.5" y="8" width="5" height="13" rx="1" />
        <rect x="17" y="5" width="5" height="16" rx="1" />
      </svg>
    ),
  },
  {
    href: '/compare',
    title: 'مقایسه صندوق‌ها',
    desc: 'مقایسه‌ی عملکرد دو تا پنج صندوق کنار هم به صورت بصری',
    color: '#8b5cf6',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="2" x2="12" y2="22" />
        <polyline points="3 7 7 3 11 7" />
        <line x1="7" y1="3" x2="7" y2="17" />
        <polyline points="13 17 17 21 21 17" />
        <line x1="17" y1="21" x2="17" y2="7" />
      </svg>
    ),
  },
]

// گزینه‌های کارت «نمودار» — با hover باز می‌شود
const CHART_MENU = [
  { href: '/monitor', title: 'نمودار لحظه‌ای رصد بازارها', desc: 'هیجان، تحرک، صف‌ها، سرانه‌ها و ورود پول — هر ۵ دقیقه' },
]

export default function HomePage() {
  const isMobile = useIsMobile()
  const [stats, setStats] = useState<{ totalTV: number; fundCount: number; avgChange: number; positiveCount: number } | null>(null)
  const [ticker, setTicker] = useState<TickerItem[]>([])
  const [chartMenuOpen, setChartMenuOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
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
        setTicker(
          [...combined]
            .filter((f: any) => f.price > 0 && f.name)
            .sort((a: any, b: any) => b.tradeValue - a.tradeValue)
            .slice(0, 12)
            .map((f: any) => ({ name: f.name, slug: f.slug, price: f.price, changePct: f.changePct }))
        )
        const totalTV = combined.reduce((s: number, f: any) => s + f.tradeValue, 0)
        const avgChange = combined.length > 0 ? combined.reduce((s: number, f: any) => s + f.changePct, 0) / combined.length : 0
        const positiveCount = combined.filter((f: any) => f.changePct > 0).length
        setStats({ totalTV, fundCount: combined.length, avgChange, positiveCount })
      } catch {}
    }
    load()
  }, [])

  return (
    <main style={{
      minHeight: '100vh',
      background: '#0a0d14',
      color: '#eef1f8',
      fontFamily: 'Vazirmatn, Arial, sans-serif',
      direction: 'rtl',
    }}>

      {/* ═══════ TICKER TAPE (داده‌ی زنده) ═══════ */}
      <div style={{
        background: 'rgba(59,130,246,0.05)',
        borderBottom: '1px solid rgba(59,130,246,0.12)',
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
                  padding: '0 24px', fontSize: 11.5, fontFamily: 'system-ui, sans-serif',
                  borderLeft: '1px solid rgba(255,255,255,0.06)',
                  textDecoration: 'none', lineHeight: '36px',
                }}>
                  <span style={{ color: '#a9b0c2', fontWeight: 500, fontFamily: 'Vazirmatn, inherit' }}>{item.name}</span>
                  <span style={{ color: '#eef1f8', fontWeight: 700 }}>{item.price.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}</span>
                  <span style={{ fontWeight: 700, color: pos ? 'oklch(0.74 0.17 155)' : 'oklch(0.68 0.2 25)' }}>
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
        <div style={{ position: 'absolute', top: -220, right: -140, width: 640, height: 640, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.2) 0%, transparent 65%)', filter: 'blur(40px)', pointerEvents: 'none', animation: 'bs-glow 9s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: 280, left: -180, width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 65%)', filter: 'blur(46px)', pointerEvents: 'none', animation: 'bs-glow 11s ease-in-out infinite' }} />

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
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '7px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', fontSize: 13, fontWeight: 600, color: '#c7cddb', marginBottom: 24 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'oklch(0.74 0.17 155)', display: 'inline-block', animation: 'bs-pulse 2s infinite' }} />
              داده‌های زنده بورس و فرابورس
            </div>

            <h1 style={{ fontSize: isMobile ? 32 : 'clamp(38px,5vw,64px)', fontWeight: 900, lineHeight: 1.12, letterSpacing: '-0.5px', margin: '0 0 22px', color: '#eef1f8' }}>
              بازار بورس را<br />
              <span style={{ background: 'linear-gradient(120deg, #3b82f6, #8b5cf6 55%, oklch(0.74 0.17 155))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                هوشمندانه بسنجید
              </span>
            </h1>

            <p style={{ fontSize: isMobile ? 15 : 'clamp(16px,1.6vw,20px)', color: '#a9b0c2', maxWidth: 520, marginBottom: 34, lineHeight: 1.75 }}>
              رصد لحظه‌ای صندوق‌های طلا، نقره و زعفران، محاسبه آنلاین حباب، تحلیل الگوریتمی و سیگنال بازار — همه در یک سامانه‌ی تحت‌وب، سریع و ساده.
            </p>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 34, justifyContent: isMobile ? 'center' : 'flex-start' }}>
              <Link href="/funds" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 17, padding: '15px 28px', borderRadius: 15, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', boxShadow: '0 16px 40px rgba(59,130,246,0.42)', cursor: 'pointer', fontFamily: 'Vazirmatn, inherit', transition: 'transform 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8 L12 16 M9 12 L15 12"/></svg>
                حباب صندوق‌ها را ببینید
              </Link>
              <Link href="/funds" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#eef1f8', textDecoration: 'none', fontWeight: 600, fontSize: 17, padding: '15px 26px', borderRadius: 15, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontFamily: 'Vazirmatn, inherit', transition: 'background 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}>
                مشاهده نقشه بازار
              </Link>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', color: '#8b93a7', fontSize: 14, fontWeight: 500, justifyContent: isMobile ? 'center' : 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'oklch(0.74 0.17 155)', display: 'inline-block' }} />
                کاملاً تحت‌وب، بدون نیاز به نصب
              </div>
              <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.14)' }} />
              <div>داده‌ها هم‌سو با NAV رسمی صندوق‌ها</div>
            </div>
          </div>

          {/* ── Mock Dashboard Card (RTL: left side) ── */}
          {!isMobile && (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'relative', borderRadius: 26, padding: 22, background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 40px 90px rgba(0,0,0,0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', animation: 'bs-float 7s ease-in-out infinite' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12 S5 4 12 4 22 12 22 12 19 20 12 20 2 12 2 12 Z"/><circle cx="12" cy="12" r="3"/></svg>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>دیدبان من</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'oklch(0.74 0.17 155)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.74 0.17 155)', display: 'inline-block', animation: 'bs-pulse 2s infinite' }} />
                    زنده
                  </div>
                </div>

                <div style={{ position: 'relative', borderRadius: 16, background: 'rgba(0,0,0,0.25)', padding: '14px 8px 6px', marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 10px 6px' }}>
                    <span style={{ fontSize: 24, fontWeight: 800 }}>۲٬۴۸۰٬۱۲۰</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.74 0.17 155)' }}>▲ ۱٫۱٪</span>
                    <span style={{ fontSize: 12, color: '#8b93a7', marginInlineStart: 'auto' }}>شاخص کل</span>
                  </div>
                  <svg viewBox="0 0 600 200" width="100%" height="120" preserveAspectRatio="none" style={{ display: 'block' }}>
                    <defs>
                      <linearGradient id="bsArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="bsLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="oklch(0.74 0.17 155)" />
                      </linearGradient>
                    </defs>
                    <path d="M0,150 L60,132 L120,145 L180,110 L240,120 L300,86 L360,96 L420,62 L480,72 L540,40 L600,26 L600,200 L0,200 Z" fill="url(#bsArea)" />
                    <path d="M0,150 L60,132 L120,145 L180,110 L240,120 L300,86 L360,96 L420,62 L480,72 L540,40 L600,26" fill="none" stroke="url(#bsLine)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="600" cy="26" r="4.5" fill="oklch(0.74 0.17 155)" />
                  </svg>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {[
                    { icon: 'ط', iconColor: 'oklch(0.82 0.15 70)', iconBg: 'oklch(0.78 0.15 70 / 0.2)', name: 'صندوق طلا', price: '۴۲٬۵۸۰', bubble: 'حباب ۲٫۳٪', pos: true, bars: [40, 70, 55, 100] },
                    { icon: 'ن', iconColor: 'oklch(0.86 0.03 240)', iconBg: 'oklch(0.8 0.03 240 / 0.28)', name: 'صندوق نقره', price: '۳۱٬۲۴۰', bubble: 'حباب ۰٫۸٪-', pos: false, bars: [90, 60, 75, 45] },
                    { icon: 'ز', iconColor: 'oklch(0.74 0.19 40)', iconBg: 'oklch(0.68 0.19 40 / 0.22)', name: 'صندوق زعفران', price: '۲۸٬۹۷۰', bubble: 'حباب ۱٫۴٪', pos: true, bars: [50, 65, 80, 100] },
                  ].map((row, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 13, background: 'rgba(255,255,255,0.04)' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: row.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: row.iconColor, flexShrink: 0 }}>{row.icon}</div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{row.name}</div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 22, marginInlineStart: 6 }}>
                        {row.bars.map((h, j) => (
                          <span key={j} style={{ width: 3, height: `${h * 0.22}px`, background: row.pos ? 'oklch(0.74 0.17 155)' : 'oklch(0.68 0.2 25)', borderRadius: 2, display: 'inline-block' }} />
                        ))}
                      </div>
                      <div style={{ marginInlineStart: 'auto', textAlign: 'left' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{row.price}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: row.pos ? 'oklch(0.74 0.17 155)' : 'oklch(0.72 0.2 25)' }}>{row.bubble}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Floating signal badge */}
              <div style={{ position: 'absolute', top: -22, left: -26, padding: '12px 16px', borderRadius: 16, background: 'linear-gradient(135deg, oklch(0.72 0.17 155), oklch(0.7 0.15 165))', boxShadow: '0 18px 40px oklch(0.72 0.17 155 / 0.4)', display: 'flex', alignItems: 'center', gap: 10, animation: 'bs-float2 6s ease-in-out infinite' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#04140b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 L4 14 L11 14 L10 22 L20 9 L13 9 Z"/></svg>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 11, color: '#04321d', fontWeight: 600 }}>سیگنال جدید</div>
                  <div style={{ fontSize: 14, color: '#052c19', fontWeight: 800 }}>خرید صندوق طلا</div>
                </div>
              </div>

              {/* Floating alert badge */}
              <div style={{ position: 'absolute', bottom: -18, right: -22, padding: '12px 15px', borderRadius: 16, background: 'rgba(20,24,36,0.92)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 18px 40px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 10, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', animation: 'bs-float 8s ease-in-out infinite' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'oklch(0.78 0.15 70 / 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="oklch(0.82 0.15 70)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4 C8 4 7 8 7 11 C7 15 5 16 5 17 L19 17 C19 16 17 15 17 11 C17 8 16 4 12 4 Z"/><path d="M10 20 L14 20"/></svg>
                </div>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 11, color: '#8b93a7', fontWeight: 600 }}>هشدار حباب</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.68 0.2 25)' }}>حباب طلا منفی شد</div>
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
              label: 'ارزش کل معاملات',
              render: stats ? () => <><CountUp value={stats.totalTV / 1e10} format={fmtVal} /> م.ت</> : null,
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/>
                </svg>
              ),
              color: '#3b82f6',
            },
            {
              label: 'صندوق‌های فعال',
              render: stats ? () => <CountUp value={stats.fundCount} format={n => Math.round(n).toLocaleString('fa-IR')} /> : null,
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
              ),
              color: '#8b5cf6',
            },
            {
              label: 'میانگین تغییر روز',
              render: stats ? () => <CountUp value={stats.avgChange} format={n => `${stats.avgChange >= 0 ? '+' : ''}${n.toFixed(2)}٪`} /> : null,
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stats && stats.avgChange >= 0 ? 'oklch(0.74 0.17 155)' : 'oklch(0.68 0.2 25)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
                </svg>
              ),
              color: stats && stats.avgChange >= 0 ? 'oklch(0.74 0.17 155)' : 'oklch(0.68 0.2 25)',
            },
            {
              label: 'صندوق‌های مثبت',
              render: stats ? () => <><CountUp value={stats.positiveCount} format={n => String(Math.round(n))} /> از {stats.fundCount}</> : null,
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="oklch(0.82 0.15 70)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              ),
              color: 'oklch(0.82 0.15 70)',
            },
          ].map((item, i) => (
            <div key={i} style={{
              background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16, padding: '18px 20px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `${item.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.icon}
                </div>
                <span style={{ fontSize: 12, color: '#8b93a7', fontWeight: 500 }}>{item.label}</span>
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

      {/* ═══════ FEATURES ═══════ */}
      <section style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '48px 20px' : '60px 6vw', direction: 'rtl' }}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 50px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', marginBottom: 12, letterSpacing: '0.04em' }}>امکانات بورس سنج</div>
          <h2 style={{ fontSize: isMobile ? 26 : 'clamp(30px,4vw,46px)', fontWeight: 900, letterSpacing: '-0.5px', margin: '0 0 16px', color: '#eef1f8' }}>هرآنچه یک معامله‌گر حرفه‌ای نیاز دارد</h2>
          <p style={{ color: '#a9b0c2', fontSize: 18 }}>ابزارهای قدرتمند برای تصمیم‌گیری سریع‌تر و دقیق‌تر در بازار سرمایه.</p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: isMobile ? 12 : 20,
        }}>
          {/* کارت «نمودار» — منوی بازشو با hover */}
          <div className="animate-rise" style={{ position: 'relative' }}
            onMouseEnter={() => setChartMenuOpen(true)}
            onMouseLeave={() => setChartMenuOpen(false)}>
            <div style={{
              display: 'flex', flexDirection: 'column',
              background: 'linear-gradient(165deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
              border: `1px solid ${chartMenuOpen ? '#22d3ee66' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 22, padding: isMobile ? '22px 18px' : '30px',
              transition: 'transform 0.3s, border-color 0.3s',
              transform: chartMenuOpen ? 'translateY(-6px)' : 'translateY(0)',
              cursor: 'pointer', height: '100%', boxSizing: 'border-box',
            }}
            onClick={() => { if (isMobile) setChartMenuOpen(o => !o) }}>
              <div style={{
                width: 52, height: 52, borderRadius: 15, background: '#22d3ee28',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, flexShrink: 0,
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18" />
                  <path d="M7 15l4-5 3 3 5-7" />
                </svg>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px', color: '#eef1f8', display: 'flex', alignItems: 'center', gap: 8 }}>
                نمودار
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a9b0c2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: chartMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </h3>
              <p style={{ color: '#a9b0c2', fontSize: 15, lineHeight: 1.7, margin: 0 }}>نمودارهای لحظه‌ای و تحلیلی بازار — روی کارت بروید و گزینه را انتخاب کنید</p>
            </div>
            {chartMenuOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 30,
                paddingTop: 8,
              }}>
                <div style={{
                  background: '#141927', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 16, padding: 8, boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
                }}>
                  {CHART_MENU.map((m, j) => (
                    <Link key={j} href={m.href} style={{
                      display: 'block', textDecoration: 'none', borderRadius: 11, padding: '13px 15px',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,211,238,0.10)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <div style={{ color: '#eef1f8', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{m.title}</div>
                      <div style={{ color: '#a9b0c2', fontSize: 12.5, lineHeight: 1.6 }}>{m.desc}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {FEATURES.map((feat, i) => (
            <Link key={i} href={feat.href} className="animate-rise" style={{
              textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 0,
              background: 'linear-gradient(165deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 22, padding: isMobile ? '22px 18px' : '30px',
              transition: 'transform 0.3s, border-color 0.3s',
              cursor: 'pointer',
              animationDelay: `${i * 70}ms`,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-6px)'
              e.currentTarget.style.borderColor = `${feat.color}66`
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 15,
                background: `${feat.color}28`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 20, flexShrink: 0,
              }}>
                {feat.icon}
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px', color: '#eef1f8' }}>{feat.title}</h3>
              <p style={{ color: '#a9b0c2', fontSize: 15, lineHeight: 1.7, margin: 0 }}>{feat.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '60px 20px 70px' : '80px 6vw 90px', textAlign: 'center', direction: 'rtl' }}>
        <h2 style={{ fontSize: isMobile ? 26 : 'clamp(30px,4.4vw,52px)', fontWeight: 900, letterSpacing: '-0.6px', margin: '0 0 18px', color: '#eef1f8' }}>
          همین حالا رایگان با{' '}
          <span style={{ background: 'linear-gradient(120deg, #3b82f6, oklch(0.74 0.17 155))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>بورس سنج</span>
          {' '}شروع کنید
        </h2>
        <p style={{ color: '#a9b0c2', fontSize: 19, maxWidth: 560, margin: '0 auto 38px', lineHeight: 1.7 }}>
          کاملاً تحت‌وب و بدون نصب. حساب بسازید و همین حالا حباب و NAV صندوق‌ها را زیر نظر بگیرید.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 17, padding: '16px 32px', borderRadius: 15, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', boxShadow: '0 16px 42px rgba(59,130,246,0.42)', fontFamily: 'Vazirmatn, inherit', cursor: 'pointer', transition: 'transform 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5 L12 19 M5 12 L19 12"/></svg>
            ثبت‌نام رایگان
          </Link>
          <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#eef1f8', textDecoration: 'none', fontWeight: 600, fontSize: 17, padding: '16px 30px', borderRadius: 15, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', fontFamily: 'Vazirmatn, inherit', cursor: 'pointer', transition: 'background 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}>
            ورود به حساب کاربری
          </Link>
        </div>
      </section>

    </main>
  )
}
