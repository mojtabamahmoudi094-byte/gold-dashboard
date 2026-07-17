'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { shouldUseDark } from '../../../lib/theme'

const SUBCATS = [
  {
    slug: 'leveraged',
    num: '۱',
    title: 'ارزش معاملات صندوق‌های اهرمی',
    desc: 'ارزش کل معاملات روزانه صندوق‌های اهرمی به میلیارد تومان',
    color: 'oklch(0.72 0.19 25)',
    borderColor: 'oklch(0.72 0.19 25 / 0.3)',
    bgColor: 'oklch(0.72 0.19 25 / 0.07)',
    tags: ['ارزش روزانه', 'میانگین متحرک', 'آنومالی'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.72 0.19 25)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>
    ),
  },
  {
    slug: 'sector',
    num: '۲',
    title: 'ارزش معاملات صندوق‌های بخشی',
    desc: 'ارزش کل معاملات روزانه صندوق‌های بخشی به میلیارد تومان',
    color: 'oklch(0.76 0.14 210)',
    borderColor: 'oklch(0.76 0.14 210 / 0.3)',
    bgColor: 'oklch(0.76 0.14 210 / 0.07)',
    tags: ['ارزش روزانه', 'میانگین متحرک', 'آنومالی'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.76 0.14 210)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v9l6.5 6.2" />
        <path d="M12 12 4 8" />
      </svg>
    ),
  },
  {
    slug: 'equity',
    num: '۳',
    title: 'ارزش معاملات صندوق‌های سهامی',
    desc: 'ارزش کل معاملات روزانه صندوق‌های سهامی به میلیارد تومان',
    color: 'oklch(0.78 0.13 300)',
    borderColor: 'oklch(0.78 0.13 300 / 0.3)',
    bgColor: 'oklch(0.78 0.13 300 / 0.07)',
    tags: ['ارزش روزانه', 'میانگین متحرک', 'آنومالی'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.78 0.13 300)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="12" width="4" height="9" rx="1" />
        <rect x="10" y="7" width="4" height="14" rx="1" />
        <rect x="17" y="3" width="4" height="18" rx="1" />
      </svg>
    ),
  },
]

export default function BourseTradeValuePage() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

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
          <Link href="/trade-value" style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>
            ← بازگشت به ارزش معاملات
          </Link>
          <div style={{ fontSize: 22, fontWeight: 700, color: text, margin: '10px 0 6px' }}>ارزش معاملات صندوق‌های بورسی</div>
          <div style={{ fontSize: 13, color: muted }}>
            ارزش کل معاملات روزانه به تفکیک نوع صندوق — اهرمی، بخشی و سهامی
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {SUBCATS.map(sub => (
            <Link
              key={sub.slug}
              href={`/trade-value/${sub.slug}`}
              style={{
                textDecoration: 'none',
                display: 'block',
                background: panel,
                border: `0.5px solid ${sub.borderColor}`,
                borderRadius: 16,
                padding: '24px',
                transition: 'border-color 0.2s, background 0.2s, transform 0.15s',
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = sub.bgColor
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
                  background: sub.bgColor,
                  border: `0.5px solid ${sub.borderColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {sub.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 4 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 20, height: 20, borderRadius: 6, marginLeft: 8,
                      fontSize: 11, background: sub.bgColor,
                      border: `0.5px solid ${sub.borderColor}`, color: sub.color,
                    }}>{sub.num}</span>
                    {sub.title}
                  </div>
                  <div style={{ fontSize: 12, color: muted, lineHeight: 1.6 }}>{sub.desc}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sub.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 6,
                    background: sub.bgColor,
                    border: `0.5px solid ${sub.borderColor}`,
                    color: sub.color,
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
