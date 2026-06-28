'use client'

import Link from 'next/link'

export default function Footer() {
  return (
    <footer style={{
      background: '#060B14',
      borderTop: '1px solid rgba(0,200,255,0.08)',
      fontFamily: 'Vazirmatn, Arial, sans-serif',
      direction: 'rtl',
      marginTop: 40,
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '32px 24px 20px',
      }}>

        {/* بخش اصلی */}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 32 }}>

          {/* برند */}
          <div style={{ maxWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#00C8FF', boxShadow: '0 0 10px rgba(0,200,255,0.5)' }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF' }}>بورسنج</span>
            </div>
            <p style={{ fontSize: 11, color: '#5A7088', lineHeight: 2, margin: 0 }}>
              پلتفرم تحلیل و رصد هوشمند صندوق‌های کالایی بورس ایران.
              ارزش معاملات، ورود و خروج پول حقیقی، سرانه‌ی خرید و فروش و تحلیل هوشمند بازار.
            </p>
          </div>

          {/* لینک‌ها */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#A0B4C8', marginBottom: 12 }}>دسترسی سریع</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'صفحه‌ی اصلی', href: '/' },
                { label: 'صندوق‌های طلا', href: '/funds' },
                { label: 'تاریخچه سیگنال', href: '/signals' },
              ].map(link => (
                <Link key={link.href} href={link.href} style={{
                  fontSize: 11, color: '#5A7088', textDecoration: 'none',
                  transition: 'color 0.2s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#00C8FF')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#5A7088')}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* ارتباط */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#A0B4C8', marginBottom: 12 }}>ارتباط با ما</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a href="https://t.me/shagerdebazar" target="_blank" rel="noopener noreferrer" style={{
                fontSize: 11, color: '#5A7088', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
                onMouseEnter={e => (e.currentTarget.style.color = '#00C8FF')}
                onMouseLeave={e => (e.currentTarget.style.color = '#5A7088')}
              >
                📱 کانال تلگرام: شاگرد تنبل بازار
              </a>
              <span style={{ fontSize: 11, color: '#5A7088' }}>
                🌐 bourssanj.ir
              </span>
            </div>
          </div>

        </div>

        {/* خط جداکننده */}
        <div style={{ height: 1, background: 'rgba(0,200,255,0.06)', margin: '24px 0 16px' }} />

        {/* کپی‌رایت */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#3A4F63' }}>
            © بورسنج ۱۴۰۵ · تمامی حقوق محفوظ است
          </span>
          <span style={{ fontSize: 9, color: '#3A4F63' }}>
            داده‌ها صرفاً جنبه‌ی اطلاع‌رسانی دارند و توصیه‌ی سرمایه‌گذاری نیستند
          </span>
        </div>

      </div>
    </footer>
  )
}
