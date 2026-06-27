'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'

const NAV = [
  { label: 'خانه', href: '/' },
  { label: 'صندوق‌ها', href: '/funds' },
  { label: 'تاریخچه سیگنال', href: '/signals' },
]

export default function Header() {
  const pathname = usePathname()
  const [isDark, setIsDark] = useState(true)

  // خواندن قالب از حافظه
  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    window.localStorage.setItem('theme', next ? 'dark' : 'light')
    // اطلاع‌رسانی به بقیه‌ی صفحه‌ها
    window.dispatchEvent(new Event('themechange'))
  }

  return (
    <header style={{
      background: '#0A1628',
      borderBottom: '1px solid rgba(0,200,255,0.12)',
      fontFamily: 'Vazirmatn, Arial, sans-serif',
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
      }}>

        {/* برند - سمت چپ */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: '#00C8FF',
            boxShadow: '0 0 10px rgba(0,200,255,0.5)',
          }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.02em' }}>
              بورسنج
            </div>
            <div style={{ fontSize: 9, color: '#5A7088', marginTop: -2 }}>
              bourssanj.ir
            </div>
          </div>
        </Link>

        {/* منو + تغییر قالب - سمت راست */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, direction: 'rtl' }}>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {NAV.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#00C8FF' : '#A0B4C8',
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: isActive ? 'rgba(0,200,255,0.08)' : 'transparent',
                    transition: 'all 0.2s',
                    fontFamily: 'inherit',
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <button
            onClick={toggleTheme}
            title="تغییر قالب"
            style={{
              fontSize: 15, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(0,200,255,0.2)',
              color: '#A0B4C8', fontFamily: 'inherit', marginRight: 8,
            }}
          >
            {isDark ? '☀' : '☾'}
          </button>
        </div>

      </div>
    </header>
  )
}
