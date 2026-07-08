'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const CATS = [
  {
    slug: 'gold',
    title: 'صندوق‌های طلا',
    desc: 'دیدبان کامل صندوق‌های سرمایه‌گذاری طلا — قیمت، جریان پول، رتبه‌بندی و تحلیل هوشمند',
    color: 'oklch(0.82 0.15 70)',
    borderColor: 'oklch(0.82 0.15 70 / 0.3)',
    bgColor: 'oklch(0.82 0.15 70 / 0.07)',
    tags: ['قیمت پایانی', 'جریان پول', 'رتبه‌بندی', 'آنومالی'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.82 0.15 70)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2 2" />
        <path d="M8.5 3.5 6 2" />
        <path d="M15.5 3.5 18 2" />
      </svg>
    ),
  },
  {
    slug: 'silver',
    title: 'صندوق‌های نقره',
    desc: 'دیدبان صندوق‌های سرمایه‌گذاری نقره — قیمت، حجم معاملات و تحلیل جریان پول حقیقی',
    color: 'oklch(0.84 0.03 240)',
    borderColor: 'oklch(0.84 0.03 240 / 0.3)',
    bgColor: 'oklch(0.84 0.03 240 / 0.07)',
    tags: ['قیمت پایانی', 'جریان پول', 'رتبه‌بندی'],
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
    title: 'صندوق‌های زعفران',
    desc: 'دیدبان صندوق‌های سرمایه‌گذاری زعفران — قیمت، حجم معاملات و تحلیل جریان پول حقیقی',
    color: 'oklch(0.74 0.19 40)',
    borderColor: 'oklch(0.74 0.19 40 / 0.3)',
    bgColor: 'oklch(0.74 0.19 40 / 0.07)',
    tags: ['قیمت پایانی', 'جریان پول', 'رتبه‌بندی'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.74 0.19 40)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 0 0 8" />
        <path d="M12 2a4 4 0 0 1 0 8" />
        <path d="M12 10v12" />
        <path d="M8 14s1 1 4 1 4-1 4-1" />
      </svg>
    ),
  },
]

const BOURSE = {
  title: 'صندوق‌های بورسی',
  desc: 'صندوق‌های سرمایه‌گذاری مبتنی بر سهام — اهرمی، بخشی و سهامی',
  color: 'oklch(0.75 0.17 155)',
  borderColor: 'oklch(0.75 0.17 155 / 0.3)',
  bgColor: 'oklch(0.75 0.17 155 / 0.07)',
  tags: ['اهرمی', 'بخشی', 'سهامی'],
  icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.75 0.17 155)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  ),
}

export default function FundsPage() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
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
          <div style={{ fontSize: 22, fontWeight: 700, color: text, marginBottom: 6 }}>دیدبان صندوق‌های کالایی</div>
          <div style={{ fontSize: 13, color: muted }}>
            مشاهده و تحلیل صندوق‌های سرمایه‌گذاری طلا، نقره و زعفران — جریان پول، رتبه‌بندی و هشدار آنومالی
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {CATS.map(cat => (
            <Link
              key={cat.slug}
              href={`/funds/${cat.slug}`}
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
                  <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 4 }}>{cat.title}</div>
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

          <Link
            href="/funds/bourse"
            style={{
              textDecoration: 'none',
              display: 'block',
              background: panel,
              border: `0.5px solid ${BOURSE.borderColor}`,
              borderRadius: 16,
              padding: '24px',
              transition: 'border-color 0.2s, background 0.2s, transform 0.15s',
              cursor: 'pointer',
              backdropFilter: 'blur(12px)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = BOURSE.bgColor
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
                background: BOURSE.bgColor,
                border: `0.5px solid ${BOURSE.borderColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {BOURSE.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 4 }}>{BOURSE.title}</div>
                <div style={{ fontSize: 12, color: muted, lineHeight: 1.6 }}>{BOURSE.desc}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {BOURSE.tags.map(tag => (
                <span key={tag} style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 6,
                  background: BOURSE.bgColor,
                  border: `0.5px solid ${BOURSE.borderColor}`,
                  color: BOURSE.color,
                }}>{tag}</span>
              ))}
            </div>
          </Link>
        </div>
      </div>
    </main>
  )
}
