'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { darkTheme, lightTheme, shouldUseDark } from '../../lib/theme'

const PRODUCT_LINKS = [
  { label: 'صندوق‌های طلا، نقره و زعفران', href: '/funds' },
  { label: 'دیده‌بان',                       href: '/funds' },
  { label: 'تحلیل',                         href: '/analysis/gold' },
  { label: 'نقشه بازار',                    href: '/market-map' },
]

const COMPANY_LINKS = [
  { label: 'درباره ما',   href: '/about' },
  { label: 'تماس با ما', href: '/contact' },
  { label: 'قوانین',      href: '/terms' },
  { label: 'حریم خصوصی', href: '/privacy' },
]

export default function Footer() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  const t = isDark ? darkTheme : lightTheme
  const LINK_C = t.muted
  const ICON_C = t.muted
  const MUTED = t.muted
  const BORDER = t.border
  const ICON_BG = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(184,134,11,0.06)'

  return (
    <footer style={{
      borderTop: `1px solid ${t.border}`,
      background: isDark ? 'rgba(255,255,255,0.015)' : t.bg,
      fontFamily: 'Vazirmatn, Arial, sans-serif',
      direction: 'rtl',
    }}>
      <div className="animate-fade-in" style={{
        maxWidth: 1400, margin: '0 auto',
        padding: '52px 6vw 30px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 40,
      }}>

        {/* Brand */}
        <div className="brand-link" style={{ cursor: 'default' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div className="brand-logo" style={{
              width: 40, height: 40, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
              backgroundImage: 'url(/logo.jpeg)',
              backgroundSize: '148% 148%',
              backgroundPosition: '38% 15%',
              backgroundRepeat: 'no-repeat',
            }} />
            <div className="brand-title" style={{ fontWeight: 800, fontSize: 18, color: t.text }}>بورس سنج</div>
          </div>
          <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.8, maxWidth: 300, margin: 0 }}>
            سامانه هوشمند رصد، تحلیل و پایش بازار سرمایه ایران. سریع، خصوصی و حرفه‌ای.
          </p>
        </div>

        {/* محصول */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: t.text }}>محصول</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
            {PRODUCT_LINKS.map(l => (
              <Link key={l.label} href={l.href} style={{ color: LINK_C, textDecoration: 'none', transition: 'color 0.18s', padding: '6px 0', display: 'inline-block' }}
                onMouseEnter={e => (e.currentTarget.style.color = isDark ? '#fff' : t.textBright)}
                onMouseLeave={e => (e.currentTarget.style.color = LINK_C)}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* شرکت */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: t.text }}>شرکت</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
            {COMPANY_LINKS.map(l => (
              <Link key={l.label} href={l.href} style={{ color: LINK_C, textDecoration: 'none', transition: 'color 0.18s', padding: '6px 0', display: 'inline-block' }}
                onMouseEnter={e => (e.currentTarget.style.color = isDark ? '#fff' : t.textBright)}
                onMouseLeave={e => (e.currentTarget.style.color = LINK_C)}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* ما را دنبال کنید */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: t.text }}>ما را دنبال کنید</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {/* Telegram */}
            <a href="https://t.me/bourssanjj" aria-label="کانال تلگرام بورس سنج" className="social-icon" target="_blank" rel="noopener noreferrer" style={{ width: 40, height: 40, borderRadius: 11, background: ICON_BG, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.18s', flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(42,171,238,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = ICON_BG)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={ICON_C}>
                <path d="M11.944 0A12 12 0 1 0 23.888 12 12 12 0 0 0 11.944 0zm5.992 8.198-1.974 9.3c-.148.658-.537.818-1.087.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.37 14.41l-2.93-.916c-.638-.2-.65-.638.136-.946l11.57-4.461c.53-.193 1.001.13.79.11z"/>
              </svg>
            </a>
          </div>
        </div>

        {/* نماد اعتماد الکترونیکی */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: t.text }}>نماد اعتماد</div>
          <a referrerPolicy="origin" target="_blank" href="https://trustseal.enamad.ir/?id=759107&amp;Code=iADodrOqhpz8onS32a8nRMedm9LAUWay">
            {/* lazy + async: تصویر روی سرور enamad از خارج ایران کند/تایم‌اوت می‌شود؛ نباید رویداد window.load و Core Web Vitals را بلاک کند (فوتر خارج viewport اولیه است) */}
            <img referrerPolicy="origin" loading="lazy" decoding="async" src="https://trustseal.enamad.ir/logo.aspx?id=759107&amp;Code=iADodrOqhpz8onS32a8nRMedm9LAUWay" alt="نماد اعتماد الکترونیکی" style={{ cursor: 'pointer' }} {...{ code: 'iADodrOqhpz8onS32a8nRMedm9LAUWay' }} />
          </a>
        </div>

      </div>

      {/* سلب مسئولیت */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 6vw' }}>
        <p style={{ fontSize: 12, lineHeight: 1.9, color: MUTED, margin: 0, paddingBottom: 20 }}>
          تمامی داده‌ها، سیگنال‌ها و تحلیل‌های ارائه‌شده در بورس سنج صرفاً جنبه اطلاع‌رسانی دارند و توصیه سرمایه‌گذاری یا خرید و فروش محسوب نمی‌شوند. مسئولیت هرگونه تصمیم مالی بر عهده خود کاربر است.
        </p>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: `1px solid ${t.border}`, maxWidth: 1400, margin: '0 auto', padding: '20px 6vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, color: MUTED }}>ساخته‌شده برای فعالان بازار سرمایه ایران</span>
        <span style={{ fontSize: 13, color: MUTED }}>© بورس سنج ۱۴۰۵ — تمامی حقوق محفوظ است</span>
      </div>
    </footer>
  )
}
