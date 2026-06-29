'use client'

import Link from 'next/link'

const TelegramIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.944 0A12 12 0 1 0 23.888 12 12 12 0 0 0 11.944 0zm5.992 8.198-1.974 9.3c-.148.658-.537.818-1.087.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.37 14.41l-2.93-.916c-.638-.2-.65-.638.136-.946l11.57-4.461c.53-.193 1.001.13.79.11z"/>
  </svg>
)

const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
)

const LogoMark = () => (
  <svg width="22" height="18" viewBox="0 0 26 22" fill="none">
    <polyline
      points="1,19 7,11 13,14 21,4"
      stroke="#00C8FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
    />
    <circle cx="21" cy="4" r="2.5" fill="#00E5A0"/>
  </svg>
)

const LINKS = [
  { label: 'صفحه‌ی اصلی', href: '/' },
  { label: 'صندوق‌های کالایی', href: '/funds' },
  { label: 'تحلیل طلا', href: '/analysis/gold' },
  { label: 'تاریخچه سیگنال', href: '/signals' },
]

export default function Footer() {
  return (
    <footer style={{
      background: '#030709',
      borderTop: '1px solid rgba(0,200,255,0.07)',
      fontFamily: 'Vazirmatn, Arial, sans-serif',
      direction: 'rtl',
      marginTop: 48,
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '36px 24px 22px',
      }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 36 }}>

          {/* برند */}
          <div style={{ maxWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <LogoMark />
              <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                بورسنج
              </span>
            </div>
            <p style={{
              fontSize: 11.5, color: '#3A5068', lineHeight: 2, margin: 0,
            }}>
              پلتفرم تحلیل و رصد هوشمند صندوق‌های کالایی بورس ایران.
              ارزش معاملات، ورود پول حقیقی، سرانه خرید/فروش و تحلیل بازار طلا.
            </p>
          </div>

          {/* دسترسی سریع */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5A7088', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              دسترسی سریع
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {LINKS.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{ fontSize: 12, color: '#3A5068', textDecoration: 'none', transition: 'color 0.18s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#00C8FF')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#3A5068')}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* ارتباط */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5A7088', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              ارتباط
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <a
                href="https://t.me/shagerdebazar"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 12, color: '#3A5068', textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'color 0.18s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#2AABEE')}
                onMouseLeave={e => (e.currentTarget.style.color = '#3A5068')}
              >
                <TelegramIcon />
                شاگرد تنبل بازار
              </a>
              <span style={{
                fontSize: 12, color: '#3A5068',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <GlobeIcon />
                bourssanj.ir
              </span>
            </div>
          </div>

        </div>

        {/* جداکننده */}
        <div style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.07) 50%, transparent)',
          margin: '28px 0 18px',
        }} />

        {/* کپی‌رایت */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 10.5, color: '#263545' }}>
            © بورسنج ۱۴۰۵ · تمامی حقوق محفوظ است
          </span>
          <span style={{ fontSize: 10, color: '#1E2E3D' }}>
            داده‌ها صرفاً جنبه اطلاع‌رسانی دارند و توصیه سرمایه‌گذاری نیستند
          </span>
        </div>

      </div>
    </footer>
  )
}
