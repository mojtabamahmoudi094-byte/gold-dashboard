'use client'

/**
 * رصد لحظه‌ای بازارها — دسته‌بندی‌ها
 * فعلاً «سهام» فعال است؛ بقیه دسته‌ها به‌مرور اضافه می‌شوند (جدول market_watch با cat جدا)
 */

import Link from 'next/link'
import { useIsMobile } from '../../lib/useIsMobile'

const CATS = [
  {
    href: '/monitor/stocks', ready: true,
    title: 'سهام', desc: 'هیجان، تحرک قیمتی، ارزش معاملات خرد، صف‌ها، سرانه‌ها و ورود پول حقیقی',
    color: '#3b82f6',
  },
  {
    href: '#', ready: false,
    title: 'صندوق‌های بورسی', desc: 'رصد لحظه‌ای صندوق‌های اهرمی، بخشی و سهامی',
    color: '#8b5cf6',
  },
  {
    href: '#', ready: false,
    title: 'صندوق‌های طلا', desc: 'رصد لحظه‌ای صندوق‌های مبتنی بر طلا',
    color: 'oklch(0.82 0.15 70)',
  },
  {
    href: '#', ready: false,
    title: 'صندوق‌های نقره', desc: 'رصد لحظه‌ای صندوق‌های مبتنی بر نقره',
    color: 'oklch(0.84 0.03 240)',
  },
  {
    href: '#', ready: false,
    title: 'صندوق‌های زعفران', desc: 'رصد لحظه‌ای صندوق‌های کالایی زعفران',
    color: 'oklch(0.70 0.19 40)',
  },
]

export default function MonitorPage() {
  const isMobile = useIsMobile()
  return (
    <main style={{ minHeight: '100vh', background: '#0a0d14', color: '#eef1f8', fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl', padding: isMobile ? '32px 16px' : '60px 6vw' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', marginBottom: 12 }}>نمودار</div>
          <h1 style={{ fontSize: isMobile ? 26 : 'clamp(30px,4vw,44px)', fontWeight: 900, margin: '0 0 14px' }}>رصد لحظه‌ای بازارها</h1>
          <p style={{ color: '#a9b0c2', fontSize: 17 }}>سنجه‌های کل بازار، هر ۵ دقیقه در ساعت معاملات</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {CATS.map((c, i) => (
            <Link key={i} href={c.href} aria-disabled={!c.ready} style={{
              textDecoration: 'none', display: 'flex', flexDirection: 'column',
              background: 'linear-gradient(165deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
              padding: '26px 24px', transition: 'transform 0.25s, border-color 0.25s',
              cursor: c.ready ? 'pointer' : 'default',
              opacity: c.ready ? 1 : 0.55, pointerEvents: c.ready ? 'auto' : 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.borderColor = `${c.color}66` }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: c.color, flexShrink: 0 }} />
                <h3 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: '#eef1f8' }}>{c.title}</h3>
                {!c.ready && <span style={{ fontSize: 11, fontWeight: 700, color: '#a9b0c2', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '3px 9px', marginRight: 'auto' }}>به‌زودی</span>}
              </div>
              <p style={{ color: '#a9b0c2', fontSize: 14, lineHeight: 1.8, margin: 0 }}>{c.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
