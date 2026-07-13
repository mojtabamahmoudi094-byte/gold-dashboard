'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const TerminalChart = dynamic(() => import('../dashboard/TerminalChart'), { ssr: false })

type DailyTotalRow = { date: string; total: number; stocks: number; gold: number; silver: number; saffron: number }

const gregorianToShamsi = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  } catch { return iso }
}

// مقادیر market_watch به ریال‌اند — به میلیارد تومان برای نمایش
const toBT = (rial: number) => rial / 1e10
const fmtBT = (rial: number) => toBT(rial).toLocaleString('fa-IR', { maximumFractionDigits: 1 })

const CATS = [
  {
    slug: 'gold',
    title: 'ارزش معاملات طلا',
    desc: 'ارزش کل معاملات روزانه صندوق‌های سرمایه‌گذاری طلا به میلیارد تومان',
    color: 'oklch(0.82 0.15 70)',
    borderColor: 'oklch(0.82 0.15 70 / 0.3)',
    bgColor: 'oklch(0.82 0.15 70 / 0.07)',
    tags: ['صندوق طلا', 'ارزش روزانه', 'میانگین متحرک', 'آنومالی'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.82 0.15 70)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    slug: 'silver',
    title: 'ارزش معاملات نقره',
    desc: 'ارزش کل معاملات روزانه صندوق‌های سرمایه‌گذاری نقره به میلیارد تومان',
    color: 'oklch(0.84 0.03 240)',
    borderColor: 'oklch(0.84 0.03 240 / 0.3)',
    bgColor: 'oklch(0.84 0.03 240 / 0.07)',
    tags: ['صندوق نقره', 'ارزش روزانه', 'میانگین متحرک'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.84 0.03 240)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="7" height="18" rx="1" />
        <rect x="9.5" y="8" width="5" height="13" rx="1" />
        <rect x="17" y="5" width="5" height="16" rx="1" />
      </svg>
    ),
  },
  {
    slug: 'saffron',
    title: 'ارزش معاملات زعفران',
    desc: 'ارزش کل معاملات روزانه صندوق‌های سرمایه‌گذاری زعفران به میلیارد تومان',
    color: 'oklch(0.74 0.19 40)',
    borderColor: 'oklch(0.74 0.19 40 / 0.3)',
    bgColor: 'oklch(0.74 0.19 40 / 0.07)',
    tags: ['صندوق زعفران', 'ارزش روزانه', 'میانگین متحرک'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.74 0.19 40)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 0 0 8" />
        <path d="M12 2a4 4 0 0 1 0 8" />
        <path d="M12 10v12" />
        <path d="M8 14s1 1 4 1 4-1 4-1" />
      </svg>
    ),
  },
  {
    slug: 'bourse',
    title: 'ارزش معاملات صندوق‌های بورسی',
    desc: 'ارزش کل معاملات روزانه صندوق‌های اهرمی، بخشی و سهامی به میلیارد تومان',
    color: 'oklch(0.72 0.19 25)',
    borderColor: 'oklch(0.72 0.19 25 / 0.3)',
    bgColor: 'oklch(0.72 0.19 25 / 0.07)',
    tags: ['اهرمی', 'بخشی', 'سهامی', 'میانگین متحرک'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.72 0.19 25)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>
    ),
  },
  {
    slug: 'capital-market',
    title: 'ارزش معاملات کل بازار سرمایه',
    desc: 'مجموع ارزش معاملات سهام بورس + فرابورس + صندوق‌های اهرمی/بخشی/سهامی (بدون طلا/نقره/زعفران)',
    color: 'oklch(0.75 0.16 155)',
    borderColor: 'oklch(0.75 0.16 155 / 0.3)',
    bgColor: 'oklch(0.75 0.16 155 / 0.07)',
    tags: ['بورس', 'فرابورس', 'صندوق‌های بورسی', 'میانگین متحرک'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.75 0.16 155)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <path d="M5 21V10M10 21V6M15 21V13M20 21V3" />
      </svg>
    ),
  },
  {
    slug: 'tse',
    title: 'ارزش معاملات بورس',
    desc: 'ارزش کل معاملات روزانه نمادهای پذیرفته‌شده در بورس اوراق بهادار تهران — طبقه‌بندی بر پایه ISIN',
    color: 'oklch(0.7 0.18 20)',
    borderColor: 'oklch(0.7 0.18 20 / 0.3)',
    bgColor: 'oklch(0.7 0.18 20 / 0.07)',
    tags: ['بورس تهران', 'ارزش روزانه', 'میانگین متحرک'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.7 0.18 20)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M7 15l3-4 3 2 4-6" />
      </svg>
    ),
  },
  {
    slug: 'ifb',
    title: 'ارزش معاملات فرابورس',
    desc: 'ارزش کل معاملات روزانه نمادهای پذیرفته‌شده در فرابورس ایران — طبقه‌بندی بر پایه ISIN',
    color: 'oklch(0.72 0.14 260)',
    borderColor: 'oklch(0.72 0.14 260 / 0.3)',
    bgColor: 'oklch(0.72 0.14 260 / 0.07)',
    tags: ['فرابورس', 'ارزش روزانه', 'میانگین متحرک'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.72 0.14 260)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9h6v6H9z" />
      </svg>
    ),
  },
]

export default function TradeValuePage() {
  const [isDark, setIsDark] = useState(true)
  const [series, setSeries] = useState<DailyTotalRow[]>([])
  const [today, setToday] = useState<DailyTotalRow | null>(null)
  const [loadingTotal, setLoadingTotal] = useState(true)
  const [showTrend, setShowTrend] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    fetch('/api/market-watch/daily-total')
      .then(r => r.json())
      .then(d => { setSeries(d.series ?? []); setToday(d.today ?? null) })
      .catch(() => {})
      .finally(() => setLoadingTotal(false))
  }, [])

  const chartData = useMemo(
    () => series.map(r => ({ time: r.date, value: toBT(r.total), shamsi: gregorianToShamsi(r.date) })),
    [series]
  )
  const prevTotal = series.length >= 2 ? series[series.length - 2].total : null
  const dayChange = prevTotal && today ? ((today.total - prevTotal) / prevTotal) * 100 : null

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const panel = isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.9)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px' }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: text, marginBottom: 6 }}>ارزش معاملات</div>
          <div style={{ fontSize: 13, color: muted }}>
            ارزش کل معاملات روزانه صندوق‌های طلا، نقره و زعفران — نمودار تاریخی با میانگین متحرک
          </div>
        </div>

        {/* کارت ارزش معاملات کل بازار — سهام + همه صندوق‌ها */}
        <div style={{
          background: panel, border: '0.5px solid rgba(59,130,246,0.3)', borderRadius: 18,
          padding: '22px 26px', marginBottom: 20, backdropFilter: 'blur(12px)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 3, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, transparent)' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 6 }}>ارزش کل معاملات بازار</div>
              <div style={{ fontSize: 11, color: muted, marginBottom: 10 }}>سهام + صندوق‌های اهرمی/بخشی/سهامی + طلا + نقره + زعفران — امروز</div>
              {loadingTotal ? (
                <div style={{ width: 160, height: 30, borderRadius: 8, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />
              ) : today ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: '#60A5FA', fontFamily: 'system-ui, sans-serif' }}>
                    {fmtBT(today.total)}
                  </span>
                  <span style={{ fontSize: 12, color: muted }}>میلیارد تومان</span>
                  {dayChange != null && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      color: dayChange >= 0 ? '#10B981' : '#EF4444',
                      background: dayChange >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    }}>
                      {dayChange >= 0 ? '+' : ''}{dayChange.toFixed(1)}٪
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: 13, color: muted }}>داده‌ای در دسترس نیست</span>
              )}
              {today && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {[
                    ['سهام + بورسی', today.stocks],
                    ['طلا', today.gold],
                    ['نقره', today.silver],
                    ['زعفران', today.saffron],
                  ].map(([label, v]) => (
                    <span key={label as string} style={{
                      fontSize: 10.5, color: muted, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                      border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                      borderRadius: 6, padding: '3px 9px',
                    }}>
                      {label as string}: {fmtBT(v as number)} م.ت
                    </span>
                  ))}
                </div>
              )}
            </div>
            {chartData.length > 1 && (
              <button
                type="button"
                onClick={() => setShowTrend(true)}
                style={{
                  padding: '10px 20px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', border: 'none',
                  fontFamily: 'inherit', flexShrink: 0,
                }}
              >
                نمایش روند 📈
              </button>
            )}
          </div>
        </div>

        {/* پاپ‌آپ روند کل ارزش معاملات بازار */}
        {showTrend && (
          <div
            onClick={() => setShowTrend(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: panel, border: '0.5px solid rgba(59,130,246,0.3)', borderRadius: 18,
                padding: '22px 26px', maxWidth: 760, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: text }}>روند ارزش کل معاملات بازار (میلیارد تومان)</span>
                <button
                  type="button"
                  onClick={() => setShowTrend(false)}
                  aria-label="بستن"
                  style={{ width: 30, height: 30, borderRadius: 8, cursor: 'pointer', background: 'transparent', border: `1px solid ${muted}`, color: muted, fontFamily: 'inherit' }}
                >✕</button>
              </div>
              <TerminalChart data={chartData} ma5={[]} ma10={[]} anomalies={[]} height={320} isDark={isDark} />
              <p style={{ fontSize: 10.5, color: muted, marginTop: 10, lineHeight: 1.7 }}>
                داده از تاریخ شروع ثبت «رصد لحظه‌ای بازار» موجود است و هر روز به‌صورت خودکار افزوده می‌شود.
              </p>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {CATS.map(cat => (
            <Link
              key={cat.slug}
              href={`/trade-value/${cat.slug}`}
              style={{
                textDecoration: 'none',
                display: 'block',
                background: panel,
                border: `0.5px solid ${cat.borderColor}`,
                borderRadius: 16,
                padding: '24px',
                transition: 'border-color 0.2s, background 0.2s, transform 0.15s',
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = cat.bgColor
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = panel
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: cat.bgColor,
                  border: `0.5px solid ${cat.borderColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {cat.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: text }}>{cat.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: muted, lineHeight: 1.6 }}>{cat.desc}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cat.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 6,
                    background: cat.bgColor,
                    border: `0.5px solid ${cat.borderColor}`,
                    color: cat.color,
                  }}>{tag}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
