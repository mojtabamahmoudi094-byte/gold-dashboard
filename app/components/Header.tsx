'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const NAV = [
  { label: 'خانه', href: '/' },
  { label: 'صندوق‌ها', href: '/funds' },
  { label: 'مقایسه', href: '/compare' },
  { label: 'تاریخچه سیگنال', href: '/signals' },
]

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [isDark, setIsDark] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)

    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)

    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      window.removeEventListener('resize', checkMobile)
      subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  // بستن منو وقتی صفحه عوض شد
  useEffect(() => { setMenuOpen(false) }, [pathname])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    window.localStorage.setItem('theme', next ? 'dark' : 'light')
    window.dispatchEvent(new Event('themechange'))
  }

  return (
    <header style={{
      background: '#0A1628',
      borderBottom: '1px solid rgba(0,200,255,0.12)',
      fontFamily: 'Vazirmatn, Arial, sans-serif',
      position: 'relative', zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
      }}>

        {/* برند */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: '#00C8FF',
            boxShadow: '0 0 10px rgba(0,200,255,0.5)',
          }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF' }}>بورسنج</div>
            <div style={{ fontSize: 9, color: '#5A7088', marginTop: -2 }}>bourssanj.ir</div>
          </div>
        </Link>

        {/* دسکتاپ: منو + تغییر قالب */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, direction: 'rtl' }}>
            <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {NAV.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                return (
                  <Link key={item.href} href={item.href} style={{
                    textDecoration: 'none', fontSize: 13, fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#00C8FF' : '#A0B4C8', padding: '8px 16px', borderRadius: 8,
                    background: isActive ? 'rgba(0,200,255,0.08)' : 'transparent',
                    fontFamily: 'inherit',
                  }}>
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            <button onClick={toggleTheme} style={{
              fontSize: 15, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(0,200,255,0.2)',
              color: '#A0B4C8', fontFamily: 'inherit', marginRight: 8,
            }}>
              {isDark ? '☀' : '☾'}
            </button>

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 4 }}>
                <div style={{
                  fontSize: 11, color: '#A0B4C8',
                  background: 'rgba(0,200,255,0.06)',
                  border: '0.5px solid rgba(0,200,255,0.2)',
                  borderRadius: 8, padding: '5px 12px',
                  maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {user.user_metadata?.first_name
                    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
                    : user.email?.split('@')[0]}
                </div>
                <button onClick={handleLogout} style={{
                  fontSize: 11, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                  background: 'rgba(255,77,106,0.08)', border: '0.5px solid rgba(255,77,106,0.3)',
                  color: '#FF4D6A', fontFamily: 'inherit',
                }}>خروج</button>
              </div>
            ) : (
              <Link href="/auth" style={{
                fontSize: 12, padding: '6px 16px', borderRadius: 8,
                background: 'rgba(0,229,160,0.1)', border: '0.5px solid rgba(0,229,160,0.4)',
                color: '#00E5A0', textDecoration: 'none', fontWeight: 700, marginRight: 4,
              }}>
                ورود / ثبت‌نام
              </Link>
            )}
          </div>
        )}

        {/* موبایل: دکمه همبرگر + تغییر قالب */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={toggleTheme} style={{
              fontSize: 15, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(0,200,255,0.2)',
              color: '#A0B4C8', fontFamily: 'inherit',
            }}>
              {isDark ? '☀' : '☾'}
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} style={{
              fontSize: 22, padding: '4px 8px', borderRadius: 8, cursor: 'pointer',
              background: menuOpen ? 'rgba(0,200,255,0.1)' : 'transparent',
              border: '0.5px solid rgba(0,200,255,0.2)',
              color: '#A0B4C8', fontFamily: 'inherit', lineHeight: 1,
            }}>
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        )}
      </div>

      {/* منوی موبایل */}
      {isMobile && menuOpen && (
        <div style={{
          position: 'absolute', top: 56, left: 0, right: 0,
          background: '#0A1628', borderBottom: '1px solid rgba(0,200,255,0.12)',
          padding: '8px 20px 16px', direction: 'rtl',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          {NAV.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'block', textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 700 : 500,
                color: isActive ? '#00C8FF' : '#A0B4C8', padding: '12px 16px', borderRadius: 8,
                background: isActive ? 'rgba(0,200,255,0.08)' : 'transparent',
                fontFamily: 'inherit', marginBottom: 2,
              }}>
                {item.label}
              </Link>
            )
          })}
          <div style={{ borderTop: '0.5px solid rgba(0,200,255,0.1)', marginTop: 8, paddingTop: 8 }}>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
                <span style={{ fontSize: 13, color: '#A0B4C8' }}>
                  {user.user_metadata?.first_name
                    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
                    : user.email?.split('@')[0]}
                </span>
                <button onClick={handleLogout} style={{
                  fontSize: 12, padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
                  background: 'rgba(255,77,106,0.08)', border: '0.5px solid rgba(255,77,106,0.3)',
                  color: '#FF4D6A', fontFamily: 'inherit',
                }}>خروج</button>
              </div>
            ) : (
              <Link href="/auth" style={{
                display: 'block', fontSize: 14, fontWeight: 700,
                color: '#00E5A0', padding: '12px 16px', borderRadius: 8,
                background: 'rgba(0,229,160,0.08)', textDecoration: 'none',
              }}>
                ورود / ثبت‌نام
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
