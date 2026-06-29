'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const NAV = [
  { label: 'خانه', href: '/' },
  { label: 'صندوق‌ها', href: '/funds' },
  { label: 'تحلیل', href: '/analysis' },
  { label: 'مقایسه', href: '/compare' },
  { label: 'سیگنال‌ها', href: '/signals' },
]

const pn = { style: { pointerEvents: 'none' as const } }

const SunIcon = () => (
  <svg {...pn} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)

const MoonIcon = () => (
  <svg {...pn} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

const MenuIcon = () => (
  <svg {...pn} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
)

const CloseIcon = () => (
  <svg {...pn} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

const LogoMark = () => (
  <svg {...pn} width="26" height="22" viewBox="0 0 26 22" fill="none">
    <polyline
      points="1,19 7,11 13,14 21,4"
      stroke="#00C8FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
    />
    <circle cx="21" cy="4" r="2.5" fill="#00E5A0"/>
    <polyline
      points="1,19 7,11"
      stroke="rgba(0,200,255,0.25)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
)

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [isDark, setIsDark] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)

    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)

    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })

    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      window.removeEventListener('resize', checkMobile)
      window.removeEventListener('scroll', onScroll)
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    window.localStorage.setItem('theme', next ? 'dark' : 'light')
    window.dispatchEvent(new Event('themechange'))
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')

  const navLinkStyle = (active: boolean): React.CSSProperties => ({
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? '#00C8FF' : '#7B93AC',
    padding: '6px 14px',
    borderRadius: 8,
    background: active ? 'rgba(0,200,255,0.07)' : 'transparent',
    fontFamily: 'inherit',
    position: 'relative',
    transition: 'color 0.18s, background 0.18s',
    letterSpacing: '0.01em',
  })

  const headerBg = scrolled
    ? 'rgba(6,11,20,0.92)'
    : 'rgba(6,11,20,0.75)'

  return (
    <header style={{
      background: headerBg,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: scrolled
        ? '1px solid rgba(0,200,255,0.14)'
        : '1px solid rgba(0,200,255,0.08)',
      fontFamily: 'Vazirmatn, Arial, sans-serif',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      transition: 'background 0.25s, border-color 0.25s, box-shadow 0.25s',
      boxShadow: scrolled ? '0 4px 32px rgba(0,0,0,0.4)' : 'none',
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 60,
      }}>

        {/* برند */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ animation: 'pulse-dot 3s ease infinite' }}>
            <LogoMark />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              بورسنج
            </div>
            <div style={{ fontSize: 9, color: '#3A5068', marginTop: -1, letterSpacing: '0.03em' }}>
              bourssanj.ir
            </div>
          </div>
        </Link>

        {/* دسکتاپ */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, direction: 'rtl' }}>
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={navLinkStyle(isActive(item.href))}
                  onMouseEnter={e => {
                    if (!isActive(item.href)) {
                      e.currentTarget.style.color = '#B8D4E8'
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive(item.href)) {
                      e.currentTarget.style.color = '#7B93AC'
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* جداکننده */}
            <div style={{ width: 1, height: 20, background: 'rgba(0,200,255,0.12)', margin: '0 8px' }} />

            {/* تغییر قالب */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'حالت روز' : 'حالت شب'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(0,200,255,0.12)',
                color: '#7B93AC',
                transition: 'all 0.18s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(0,200,255,0.08)'
                e.currentTarget.style.color = '#00C8FF'
                e.currentTarget.style.borderColor = 'rgba(0,200,255,0.3)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.color = '#7B93AC'
                e.currentTarget.style.borderColor = 'rgba(0,200,255,0.12)'
              }}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>

            {/* کاربر */}
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
                <div style={{
                  fontSize: 11, color: '#A0B4C8',
                  background: 'rgba(0,200,255,0.05)',
                  border: '1px solid rgba(0,200,255,0.12)',
                  borderRadius: 8, padding: '5px 12px',
                  maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {user.user_metadata?.first_name
                    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
                    : user.email?.split('@')[0]}
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    fontSize: 11, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                    background: 'rgba(255,77,106,0.06)',
                    border: '1px solid rgba(255,77,106,0.2)',
                    color: '#FF4D6A', fontFamily: 'inherit',
                    transition: 'all 0.18s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,77,106,0.14)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,77,106,0.06)' }}
                >خروج</button>
              </div>
            ) : (
              <Link
                href="/auth"
                style={{
                  fontSize: 12, padding: '6px 16px', borderRadius: 8,
                  background: 'rgba(0,229,160,0.08)',
                  border: '1px solid rgba(0,229,160,0.3)',
                  color: '#00E5A0', textDecoration: 'none', fontWeight: 600,
                  marginRight: 4, transition: 'all 0.18s',
                  letterSpacing: '0.01em',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,229,160,0.15)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,229,160,0.08)' }}
              >
                ورود / ثبت‌نام
              </Link>
            )}
          </div>
        )}

        {/* موبایل */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={toggleTheme}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(0,200,255,0.12)',
                color: '#7B93AC',
              }}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
                background: menuOpen ? 'rgba(0,200,255,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${menuOpen ? 'rgba(0,200,255,0.3)' : 'rgba(0,200,255,0.12)'}`,
                color: menuOpen ? '#00C8FF' : '#7B93AC',
                transition: 'all 0.18s',
              }}
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        )}
      </div>

      {/* منوی موبایل */}
      {isMobile && menuOpen && (
        <div
          className="animate-slide-down"
          style={{
            position: 'absolute', top: 60, left: 0, right: 0,
            background: 'rgba(6,11,20,0.97)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(0,200,255,0.1)',
            padding: '8px 16px 16px',
            direction: 'rtl',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          }}
        >
          {NAV.map((item) => {
            const active = isActive(item.href)
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center',
                textDecoration: 'none', fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? '#00C8FF' : '#A0B4C8',
                padding: '12px 14px', borderRadius: 10,
                background: active ? 'rgba(0,200,255,0.07)' : 'transparent',
                fontFamily: 'inherit', marginBottom: 2,
                borderRight: active ? '2px solid #00C8FF' : '2px solid transparent',
                transition: 'all 0.15s',
              }}>
                {item.label}
              </Link>
            )
          })}

          <div style={{ height: 1, background: 'rgba(0,200,255,0.08)', margin: '8px 0' }} />

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px' }}>
              <span style={{ fontSize: 13, color: '#7B93AC' }}>
                {user.user_metadata?.first_name
                  ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
                  : user.email?.split('@')[0]}
              </span>
              <button onClick={handleLogout} style={{
                fontSize: 12, padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,77,106,0.08)', border: '1px solid rgba(255,77,106,0.25)',
                color: '#FF4D6A', fontFamily: 'inherit',
              }}>خروج</button>
            </div>
          ) : (
            <Link href="/auth" style={{
              display: 'block', fontSize: 14, fontWeight: 600,
              color: '#00E5A0', padding: '12px 14px', borderRadius: 10,
              background: 'rgba(0,229,160,0.07)', textDecoration: 'none',
              textAlign: 'center',
            }}>
              ورود / ثبت‌نام
            </Link>
          )}
        </div>
      )}
    </header>
  )
}
