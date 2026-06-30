'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'

const TelegramIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.944 0A12 12 0 1 0 23.888 12 12 12 0 0 0 11.944 0zm5.992 8.198-1.974 9.3c-.148.658-.537.818-1.087.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.37 14.41l-2.93-.916c-.638-.2-.65-.638.136-.946l11.57-4.461c.53-.193 1.001.13.79.11z"/>
  </svg>
)

const GlobeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
)

const ChartIcon = () => (
  <svg width="13" height="11" viewBox="0 0 26 22" fill="none">
    <defs>
      <linearGradient id="ftLg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#D4A847"/>
        <stop offset="100%" stopColor="#00C8FF"/>
      </linearGradient>
    </defs>
    <polyline points="2,20 8,12 14,15 22,5"
      stroke="url(#ftLg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="22" cy="5" r="2.2" fill="#D4A847"/>
  </svg>
)

const LINKS = [
  { label: 'صفحه اصلی',        href: '/' },
  { label: 'صندوق‌های کالایی', href: '/funds' },
  { label: 'تحلیل طلا',        href: '/analysis/gold' },
  { label: 'تاریخچه سیگنال',   href: '/signals' },
  { label: 'مقایسه',           href: '/compare' },
]

export default function Footer() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  const BG       = isDark ? '#030A16' : '#F0EDE4'
  const BORDER   = isDark ? 'rgba(212,168,71,0.08)' : 'rgba(180,140,40,0.12)'
  const TEXT      = isDark ? '#E0E8F0' : '#2A1E0A'
  const TEXT_MUTED = isDark ? '#4B6278' : '#8A7A60'
  const TEXT_LINK  = isDark ? '#6B829A' : '#7A6A50'
  const TEXT_LINK_HOVER = '#D4A847'

  return (
    <footer style={{
      background: BG,
      borderTop: `1px solid ${BORDER}`,
      fontFamily: 'Vazirmatn, Arial, sans-serif',
      direction: 'rtl',
      marginTop: 56,
    }}>

      {/* Top gradient line */}
      <div style={{
        height: 1,
        background: isDark
          ? 'linear-gradient(90deg, transparent 0%, rgba(212,168,71,0.2) 30%, rgba(0,200,255,0.15) 70%, transparent 100%)'
          : 'linear-gradient(90deg, transparent 0%, rgba(180,140,40,0.25) 50%, transparent 100%)',
      }} />

      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '40px 24px 24px',
      }}>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 40,
        }}>

          {/* Brand */}
          <div style={{ maxWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <ChartIcon />
              <span style={{ fontSize: 17, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>
                بورسنج
              </span>
              <span style={{
                fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
                background: 'rgba(212,168,71,0.12)',
                border: '1px solid rgba(212,168,71,0.22)',
                color: isDark ? 'rgba(212,168,71,0.8)' : '#B8962A',
                borderRadius: 5, padding: '2px 7px',
              }}>BETA</span>
            </div>
            <p style={{
              fontSize: 12.5,
              color: TEXT_MUTED,
              lineHeight: 1.9,
              margin: '0 0 20px',
            }}>
              پلتفرم تحلیل هوشمند صندوق‌های کالایی بورس ایران.
              ارزش معاملات، ورود پول حقیقی، تحلیل طلا و سیگنال بازار.
            </p>
            {/* Disclaimer */}
            <div style={{
              fontSize: 10.5, color: TEXT_MUTED, lineHeight: 1.7,
              padding: '8px 12px',
              background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)',
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
            }}>
              داده‌ها صرفاً جنبه اطلاع‌رسانی دارند و توصیه سرمایه‌گذاری نیستند.
            </div>
          </div>

          {/* Quick links */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700,
              color: isDark ? '#D4A847' : '#B8962A',
              marginBottom: 18,
              letterSpacing: '0.06em',
            }}>
              دسترسی سریع
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {LINKS.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    fontSize: 13, color: TEXT_LINK,
                    textDecoration: 'none',
                    transition: 'color 0.18s',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = TEXT_LINK_HOVER)}
                  onMouseLeave={e => (e.currentTarget.style.color = TEXT_LINK)}
                >
                  <span style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: 'rgba(212,168,71,0.4)',
                    display: 'inline-block', flexShrink: 0,
                  }} />
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700,
              color: isDark ? '#D4A847' : '#B8962A',
              marginBottom: 18,
              letterSpacing: '0.06em',
            }}>
              ارتباط با ما
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <a
                href="https://t.me/shagerdebazar"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 13, color: TEXT_LINK,
                  textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'color 0.18s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#2AABEE')}
                onMouseLeave={e => (e.currentTarget.style.color = TEXT_LINK)}
              >
                <span style={{ color: '#2AABEE' }}><TelegramIcon /></span>
                کانال تلگرام
              </a>
              <span style={{
                fontSize: 13, color: TEXT_MUTED,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ color: isDark ? '#4B6278' : '#A09070' }}><GlobeIcon /></span>
                bourssanj.ir
              </span>
            </div>
          </div>

        </div>

        {/* Divider */}
        <div style={{
          height: 1,
          background: isDark
            ? 'linear-gradient(90deg, transparent, rgba(212,168,71,0.1) 50%, transparent)'
            : 'linear-gradient(90deg, transparent, rgba(180,140,40,0.15) 50%, transparent)',
          margin: '32px 0 20px',
        }} />

        {/* Copyright */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 11.5, color: TEXT_MUTED }}>
            © بورسنج ۱۴۰۵ · تمامی حقوق محفوظ است
          </span>
          <span style={{
            fontSize: 11, color: TEXT_MUTED,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#D4A847', display: 'inline-block',
              boxShadow: '0 0 6px rgba(212,168,71,0.6)',
            }} />
            بازار طلا — داده‌های لحظه‌ای
          </span>
        </div>

      </div>
    </footer>
  )
}
