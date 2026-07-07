'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../lib/useIsMobile'

type NavItem = { label: string; href: string; menu?: { label: string; href: string }[] }

const NAV: NavItem[] = [
  { label: 'خانه',          href: '/' },
  { label: 'سهام',          href: '/stocks' },
  { label: 'صندوق‌ها',      href: '/funds' },
  { label: 'نمودار',        href: '/monitor', menu: [
    { label: 'نمودار لحظه‌ای رصد بازارها', href: '/monitor' },
  ] },
  { label: 'تحلیل',         href: '/analysis' },
  { label: 'ارزش معاملات',  href: '/trade-value' },
  { label: 'مقایسه',        href: '/compare' },
  { label: 'سیگنال‌ها',     href: '/signals' },
  { label: 'پورتفوی من',    href: '/portfolio' },
]

const pn = { style: { pointerEvents: 'none' as const } }

const SunIcon = () => (
  <svg {...pn} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  <svg {...pn} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

const MenuIcon = () => (
  <svg {...pn} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="3" y1="7" x2="21" y2="7"/>
    <line x1="3" y1="13" x2="16" y2="13"/>
    <line x1="3" y1="19" x2="12" y2="19"/>
  </svg>
)

const CloseIcon = () => (
  <svg {...pn} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

const UserIcon = () => (
  <svg {...pn} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)

const LogoMark = () => (
  <svg {...pn} width="30" height="24" viewBox="0 0 30 24" fill="none">
    <defs>
      <linearGradient id="lgLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#3b82f6"/>
        <stop offset="100%" stopColor="#8b5cf6"/>
      </linearGradient>
      <linearGradient id="lgFill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15"/>
        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02"/>
      </linearGradient>
    </defs>
    <path d="M2,22 L8,13 L14,16 L25,4 L25,22 Z" fill="url(#lgFill)"/>
    <polyline
      points="2,22 8,13 14,16 25,4"
      stroke="url(#lgLine)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      fill="none"
    />
    <circle cx="25" cy="4" r="3" fill="rgba(59,130,246,0.2)"/>
    <circle cx="25" cy="4" r="1.8" fill="#3b82f6"/>
  </svg>
)

export default function Header() {
  const pathname = usePathname()
  const router   = useRouter()
  const [isDark, setIsDark]     = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const isMobile = useIsMobile()
  const [user, setUser]         = useState<any>(null)
  const [scrolled, setScrolled] = useState(false)
  const [openDrop, setOpenDrop] = useState<string | null>(null) // href آیتم بازشوی فعال

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)

    const onScroll = () => setScrolled(window.scrollY > 6)
    window.addEventListener('scroll', onScroll, { passive: true })

    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setUser(s?.user ?? null)
    })

    return () => {
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

  const BG      = isDark ? 'rgba(8,10,16,0.95)' : 'rgba(252,249,242,0.97)'
  const BORDER  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(59,130,246,0.12)'
  const SHADOW  = scrolled
    ? isDark ? '0 4px 40px rgba(0,0,0,0.7)' : '0 4px 20px rgba(0,0,0,0.1)'
    : 'none'
  const TEXT_NAV   = isDark ? '#6b7280' : '#7A6A50'
  const MOBILE_BG  = isDark ? 'rgba(8,10,16,0.99)' : 'rgba(252,249,242,0.99)'

  const navLink = (active: boolean): React.CSSProperties => ({
    textDecoration: 'none',
    fontSize: 13.5,
    fontWeight: active ? 600 : 400,
    color: active ? '#3b82f6' : TEXT_NAV,
    padding: '7px 14px',
    borderRadius: 8,
    background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
    fontFamily: 'inherit',
    transition: 'color 0.18s, background 0.18s',
    letterSpacing: '0.01em',
    borderBottom: active ? '1.5px solid rgba(59,130,246,0.5)' : '1.5px solid transparent',
  })

  return (
    <header style={{
      background: BG,
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      fontFamily: 'Vazirmatn, Arial, sans-serif',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      transition: 'background 0.3s, box-shadow 0.3s',
      boxShadow: SHADOW,
    }}>

      {/* Top accent stripe — blue→purple gradient */}
      <div style={{
        height: 2,
        background: 'linear-gradient(90deg, #3b82f6 0%, #6366f1 40%, #8b5cf6 70%, #a78bfa 100%)',
      }} />

      <div style={{ height: 1, background: BORDER }} />

      {/* Main nav row */}
      <div style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 58,
      }}>

        {/* Brand */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark />
          <div>
            <div style={{
              fontSize: 17,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
            }}>
              بورس سنج
            </div>
            <div style={{
              fontSize: 9,
              color: isDark ? 'rgba(59,130,246,0.5)' : 'rgba(37,99,235,0.6)',
              marginTop: 1,
              letterSpacing: '0.06em',
              fontWeight: 500,
            }}>
              bourssanj.ir
            </div>
          </div>
        </Link>

        {/* Desktop nav */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, direction: 'rtl' }}>
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {NAV.map((item) => {
                const link = (
                  <Link
                    key={item.menu ? undefined : item.href}
                    href={item.href}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    aria-expanded={item.menu ? openDrop === item.href : undefined}
                    style={{ ...navLink(isActive(item.href)), display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    onMouseEnter={e => {
                      if (!isActive(item.href)) {
                        e.currentTarget.style.color = '#3b82f6'
                        e.currentTarget.style.background = 'rgba(59,130,246,0.08)'
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive(item.href)) {
                        e.currentTarget.style.color = TEXT_NAV
                        e.currentTarget.style.background = 'transparent'
                      }
                    }}
                  >
                    {item.label}
                    {item.menu && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: openDrop === item.href ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', pointerEvents: 'none' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    )}
                  </Link>
                )
                if (!item.menu) return link
                return (
                  <div key={item.href} style={{ position: 'relative' }}
                    onMouseEnter={() => setOpenDrop(item.href)}
                    onMouseLeave={() => setOpenDrop(null)}>
                    {link}
                    {openDrop === item.href && (
                      <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, paddingTop: 10 }}>
                        <div style={{
                          minWidth: 250,
                          background: isDark ? '#12161f' : '#fffdf8',
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(59,130,246,0.15)'}`,
                          borderRadius: 14, padding: 6,
                          boxShadow: isDark ? '0 18px 50px rgba(0,0,0,0.6)' : '0 14px 40px rgba(0,0,0,0.14)',
                        }}>
                          {item.menu.map((m) => (
                            <Link key={m.href} href={m.href} style={{
                              display: 'block', textDecoration: 'none',
                              fontSize: 13, fontWeight: 500,
                              color: isDark ? '#c7cddc' : '#5A4A30',
                              padding: '11px 14px', borderRadius: 9,
                              whiteSpace: 'nowrap', fontFamily: 'inherit',
                              transition: 'background 0.15s, color 0.15s',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'rgba(59,130,246,0.1)'
                              e.currentTarget.style.color = '#3b82f6'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = isDark ? '#c7cddc' : '#5A4A30'
                            }}>
                              {m.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>

            <div style={{
              width: 1, height: 22,
              background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(59,130,246,0.15)',
              margin: '0 8px',
            }} />

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'حالت روز' : 'حالت شب'}
              aria-label={isDark ? 'تغییر به حالت روز' : 'تغییر به حالت شب'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
                background: 'transparent',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
                color: isDark ? '#6b7280' : '#7A6A50',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(59,130,246,0.1)'
                e.currentTarget.style.color = '#3b82f6'
                e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = isDark ? '#6b7280' : '#7A6A50'
                e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
              }}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>

            {/* Auth */}
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 11.5,
                  color: isDark ? '#a9b0c2' : '#6B5A3A',
                  background: isDark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.08)',
                  border: `1px solid ${isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.2)'}`,
                  borderRadius: 8, padding: '5px 12px',
                  maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  <UserIcon />
                  {user.user_metadata?.first_name
                    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
                    : user.email?.split('@')[0]}
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    fontSize: 11.5, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    color: '#EF4444', fontFamily: 'inherit',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.14)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)' }}
                >خروج</button>
              </div>
            ) : (
              <Link
                href="/auth"
                style={{
                  fontSize: 12.5, padding: '7px 18px', borderRadius: 8,
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  border: 'none',
                  color: '#fff', textDecoration: 'none', fontWeight: 600,
                  marginRight: 4, transition: 'all 0.2s',
                  letterSpacing: '0.01em',
                  boxShadow: '0 2px 16px rgba(59,130,246,0.3)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 4px 24px rgba(59,130,246,0.5)'
                  e.currentTarget.style.opacity = '0.92'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = '0 2px 16px rgba(59,130,246,0.3)'
                  e.currentTarget.style.opacity = '1'
                }}
              >
                ورود / ثبت‌نام
              </Link>
            )}
          </div>
        )}

        {/* Mobile controls */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={toggleTheme}
              aria-label={isDark ? 'تغییر به حالت روز' : 'تغییر به حالت شب'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
                background: 'transparent',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
                color: isDark ? '#6b7280' : '#7A6A50',
              }}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? 'بستن منو' : 'باز کردن منو'}
              aria-expanded={menuOpen}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
                background: menuOpen ? 'rgba(59,130,246,0.1)' : 'transparent',
                border: `1px solid ${menuOpen ? 'rgba(59,130,246,0.35)' : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
                color: menuOpen ? '#3b82f6' : isDark ? '#6b7280' : '#7A6A50',
                transition: 'all 0.2s',
              }}
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        )}
      </div>

      {/* Mobile menu */}
      {isMobile && menuOpen && (
        <div
          className="animate-slide-down"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: MOBILE_BG,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderBottom: `1px solid ${BORDER}`,
            padding: '8px 16px 20px',
            direction: 'rtl',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          <nav aria-label="منوی اصلی موبایل">
          {NAV.map((item) => {
            const active = isActive(item.href)
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} style={{
                display: 'flex', alignItems: 'center',
                textDecoration: 'none', fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? '#3b82f6' : isDark ? '#8A9BAE' : '#7A6A50',
                padding: '13px 16px', borderRadius: 10,
                background: active ? 'rgba(59,130,246,0.08)' : 'transparent',
                fontFamily: 'inherit', marginBottom: 2,
                borderRight: active ? '2.5px solid rgba(59,130,246,0.6)' : '2.5px solid transparent',
                transition: 'all 0.15s',
              }}>
                {item.label}
              </Link>
            )
          })}
          </nav>

          <div style={{ height: 1, background: BORDER, margin: '10px 0' }} />

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
              <span style={{ fontSize: 13, color: isDark ? '#a9b0c2' : '#7A6A50' }}>
                {user.user_metadata?.first_name
                  ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
                  : user.email?.split('@')[0]}
              </span>
              <button onClick={handleLogout} style={{
                fontSize: 12, padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
                color: '#EF4444', fontFamily: 'inherit',
              }}>خروج</button>
            </div>
          ) : (
            <Link href="/auth" style={{
              display: 'block', fontSize: 14, fontWeight: 600,
              color: '#fff', padding: '13px 16px', borderRadius: 10,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              border: 'none',
              textDecoration: 'none', textAlign: 'center',
              marginTop: 2,
            }}>
              ورود / ثبت‌نام
            </Link>
          )}
        </div>
      )}
    </header>
  )
}
