'use client'

import Link from 'next/link'

const LINK_C = '#a9b0c2'
const ICON_C = '#c7cddb'
const MUTED  = '#8b93a7'
const BORDER = 'rgba(255,255,255,0.09)'
const ICON_BG = 'rgba(255,255,255,0.05)'

const PRODUCT_LINKS = [
  { label: 'صندوق‌های طلا، نقره و زعفران', href: '/funds' },
  { label: 'دیدبان',                        href: '/funds' },
  { label: 'تحلیل',                         href: '/analysis/gold' },
  { label: 'نقشه بازار',                    href: '/funds' },
]

const COMPANY_LINKS = [
  { label: 'قوانین',      href: '#' },
  { label: 'حریم خصوصی', href: '#' },
]

export default function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid rgba(255,255,255,0.07)',
      background: 'rgba(255,255,255,0.015)',
      fontFamily: 'Vazirmatn, Arial, sans-serif',
      direction: 'rtl',
    }}>
      <div style={{
        maxWidth: 1400, margin: '0 auto',
        padding: '52px 6vw 30px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 40,
      }}>

        {/* Brand */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
              backgroundImage: 'url(/logo.jpeg)',
              backgroundSize: '148% 148%',
              backgroundPosition: '38% 15%',
              backgroundRepeat: 'no-repeat',
            }} />
            <div style={{ fontWeight: 800, fontSize: 18, color: '#eef1f8' }}>بورس سنج</div>
          </div>
          <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.8, maxWidth: 300, margin: 0 }}>
            سامانه هوشمند رصد، تحلیل و پایش بازار سرمایه ایران. سریع، خصوصی و حرفه‌ای.
          </p>
        </div>

        {/* محصول */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#eef1f8' }}>محصول</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 14 }}>
            {PRODUCT_LINKS.map(l => (
              <Link key={l.label} href={l.href} style={{ color: LINK_C, textDecoration: 'none', transition: 'color 0.18s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = LINK_C)}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* شرکت */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#eef1f8' }}>شرکت</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 14 }}>
            {COMPANY_LINKS.map(l => (
              <Link key={l.label} href={l.href} style={{ color: LINK_C, textDecoration: 'none', transition: 'color 0.18s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = LINK_C)}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* ما را دنبال کنید */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#eef1f8' }}>ما را دنبال کنید</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {/* X / Twitter */}
            <a href="#" aria-label="بورس سنج در توییتر" style={{ width: 40, height: 40, borderRadius: 11, background: ICON_BG, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.18s', flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = ICON_BG)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ICON_C} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 4 L3 11 L10 13 L12 20 Z"/>
              </svg>
            </a>
            {/* Instagram */}
            <a href="#" aria-label="بورس سنج در اینستاگرام" style={{ width: 40, height: 40, borderRadius: 11, background: ICON_BG, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.18s', flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = ICON_BG)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ICON_C} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="5"/>
                <circle cx="12" cy="12" r="4"/>
                <circle cx="17.5" cy="6.5" r="1" fill={ICON_C} stroke="none"/>
              </svg>
            </a>
            {/* Telegram */}
            <a href="https://t.me/bourssanjj" aria-label="کانال تلگرام بورس سنج" target="_blank" rel="noopener noreferrer" style={{ width: 40, height: 40, borderRadius: 11, background: ICON_BG, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.18s', flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(42,171,238,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = ICON_BG)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={ICON_C}>
                <path d="M11.944 0A12 12 0 1 0 23.888 12 12 12 0 0 0 11.944 0zm5.992 8.198-1.974 9.3c-.148.658-.537.818-1.087.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.37 14.41l-2.93-.916c-.638-.2-.65-.638.136-.946l11.57-4.461c.53-.193 1.001.13.79.11z"/>
              </svg>
            </a>
          </div>
        </div>

      </div>

      {/* سلب مسئولیت */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 6vw' }}>
        <p style={{ fontSize: 12, lineHeight: 1.9, color: MUTED, margin: 0, paddingBottom: 20 }}>
          تمامی داده‌ها، سیگنال‌ها و تحلیل‌های ارائه‌شده در بورس سنج صرفاً جنبه اطلاع‌رسانی دارند و توصیه سرمایه‌گذاری یا خرید و فروش محسوب نمی‌شوند. مسئولیت هرگونه تصمیم مالی بر عهده خود کاربر است.
        </p>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', maxWidth: 1400, margin: '0 auto', padding: '20px 6vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, color: MUTED }}>ساخته‌شده برای فعالان بازار سرمایه ایران</span>
        <span style={{ fontSize: 13, color: MUTED }}>© بورس سنج ۱۴۰۵ — تمامی حقوق محفوظ است</span>
      </div>
    </footer>
  )
}
