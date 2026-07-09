import Link from 'next/link'
import { darkTheme as t } from '../lib/theme'

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        textAlign: 'center',
        padding: '40px 20px',
        fontFamily: 'Vazirmatn, Arial, sans-serif',
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 900, color: t.brand, letterSpacing: '-1px' }}>۴۰۴</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: t.text, margin: 0 }}>
        صفحه مورد نظر پیدا نشد
      </h1>
      <p style={{ fontSize: 14, color: t.muted, margin: 0, maxWidth: 380 }}>
        این آدرس در بورس سنج وجود ندارد یا جابه‌جا شده است.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 10,
          fontSize: 13.5,
          fontWeight: 600,
          color: '#fff',
          textDecoration: 'none',
          padding: '9px 22px',
          borderRadius: 8,
          background: `linear-gradient(135deg, ${t.brand}, ${t.brand2})`,
        }}
      >
        بازگشت به خانه
      </Link>
    </div>
  )
}
