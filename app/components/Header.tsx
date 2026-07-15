'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

type NavItem = { label: string; href: string; menu?: { label: string; href: string }[] }

type IdxItem = { name: string; value: number; change: number | null; pct: number | null }

const BRSAPI_KEY = process.env.NEXT_PUBLIC_BRSAPI_KEY ?? 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'

const idxNum = (v: unknown): number | null => {
  const x = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(x) ? x : null
}

const faInt = (v: number) => Math.round(v).toLocaleString('fa-IR')
const faPct = (v: number) => Math.abs(v).toLocaleString('fa-IR', { maximumFractionDigits: 2 })

const NAV: NavItem[] = [
  { label: 'خانه',          href: '/' },
  { label: 'سهام',          href: '/stocks' },
  { label: 'صندوق‌ها',      href: '/funds', menu: [
    { label: 'دیدبان صندوق‌ها', href: '/funds' },
  ] },
  { label: 'نمودار',        href: '/monitor', menu: [
    { label: 'نمودار لحظه‌ای رصد بازارها', href: '/monitor' },
  ] },
  { label: 'تحلیل',         href: '/analysis', menu: [
    { label: 'تحلیل بازارها', href: '/analysis' },
    { label: 'تحلیل تکنیکال', href: '/technical' },
    { label: 'دیده‌بان تکنیکال', href: '/technical/screener' },
    { label: 'رادار پول هوشمند', href: '/funds/radar' },
    { label: 'ماشین‌حساب ارزش‌گذاری', href: '/valuation' },
  ] },
  { label: 'ارزش معاملات',  href: '/trade-value' },
  { label: 'مقایسه',        href: '/compare' },
  { label: 'سیگنال‌ها',     href: '/signals' },
  { label: 'فیلترها',       href: '/vip/filters', menu: [
    { label: 'فیلترهای VIP', href: '/vip/filters' },
    { label: 'فیلترهای کاربردی', href: '/vip/useful-filters' },
  ] },
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
  <div style={{
    width: 40, height: 40, borderRadius: 11, overflow: 'hidden', flexShrink: 0,
    backgroundImage: 'url(/logo.jpeg)',
    backgroundSize: '148% 148%',
    backgroundPosition: '38% 15%',
    backgroundRepeat: 'no-repeat',
  }} />
)

export default function Header() {
  const pathname = usePathname()
  const router   = useRouter()
  const [isDark, setIsDark]     = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [user, setUser]         = useState<any>(null)
  const [scrolled, setScrolled] = useState(false)
  const [openDrop, setOpenDrop] = useState<string | null>(null) // href آیتم بازشوی فعال

  // شاخص‌های بازار — BrsApi فقط از IP ایران جواب می‌دهد، پس فچ سمت کلاینت انجام می‌شود (همان الگوی صفحه ادمین)
  const [idxItems, setIdxItems]     = useState<IdxItem[] | null>(null)
  const [idxLoading, setIdxLoading] = useState(false)
  const [idxError, setIdxError]     = useState(false)
  const idxFetchedAt = useRef(0)

  const fetchIndices = async () => {
    if (idxLoading) return
    if (idxItems && Date.now() - idxFetchedAt.current < 60_000) return
    setIdxLoading(true)
    try {
      const [selRes, faraRes] = await Promise.allSettled([
        fetch(`https://Api.BrsApi.ir/Tsetmc/Index.php?key=${BRSAPI_KEY}&type=3`, { cache: 'no-store', signal: AbortSignal.timeout(8_000) }),
        fetch(`https://Api.BrsApi.ir/Tsetmc/Index.php?key=${BRSAPI_KEY}&type=2`, { cache: 'no-store', signal: AbortSignal.timeout(8_000) }),
      ])
      const items: IdxItem[] = []

      // type=3 — شاخص‌های منتخب: کل، هم‌وزن، قیمت (وزنی-ارزشی)، قیمت (هم‌وزن)، آزاد شناور، بازار اول و دوم
      if (selRes.status === 'fulfilled' && selRes.value.ok) {
        const d = await selRes.value.json()
        const arr = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [d]
        for (const it of arr) {
          const value = idxNum(it?.index)
          if (value === null) continue
          items.push({
            name: String(it?.name ?? '').trim() || 'شاخص',
            value,
            change: idxNum(it?.index_change),
            pct: idxNum(it?.index_change_percent),
          })
        }
      }

      // type=2 — شاخص کل فرابورس
      if (faraRes.status === 'fulfilled' && faraRes.value.ok) {
        const d = await faraRes.value.json()
        const o = Array.isArray(d) ? d[0] : d
        const v = idxNum(o?.index)
        if (v !== null) {
          items.push({ name: 'شاخص کل فرابورس', value: v, change: idxNum(o?.index_change), pct: idxNum(o?.index_change_percent) })
          const ew = idxNum(o?.index_equalWeight)
          if (ew !== null) items.push({ name: 'فرابورس هم‌وزن', value: ew, change: idxNum(o?.index_equalWeight_change), pct: null })
        }
      }

      if (items.length) {
        setIdxItems(items)
        idxFetchedAt.current = Date.now()
        setIdxError(false)
      } else {
        setIdxError(true)
      }
    } catch {
      setIdxError(true)
    } finally {
      setIdxLoading(false)
    }
  }

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

  useEffect(() => { if (menuOpen) fetchIndices() }, [menuOpen]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const renderIdxRows = (compact = false) => {
    if (idxLoading && !idxItems) {
      return <div style={{ padding: '14px 16px', fontSize: 12.5, color: isDark ? '#ddd5bd' : '#7A6A50' }}>در حال دریافت…</div>
    }
    if (idxError && !idxItems) {
      return <div style={{ padding: '14px 16px', fontSize: 12.5, color: '#EF4444' }}>دریافت شاخص‌ها ناموفق بود</div>
    }
    if (!idxItems) return null
    return idxItems.map((it, i) => {
      const up = (it.pct ?? it.change ?? 0) >= 0
      const clr = up ? 'oklch(0.74 0.17 155)' : '#EF4444'
      return (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: compact ? '9px 16px' : '10px 14px',
          borderRadius: 9,
          borderBottom: i < idxItems.length - 1 ? `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(59,130,246,0.08)'}` : 'none',
        }}>
          <span style={{
            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: 12.5, fontWeight: 500,
            color: isDark ? '#ddd5bd' : '#5A4A30',
          }}>
            {it.name}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#eef1f8' : '#2A2A2A', direction: 'ltr' }}>
            {faInt(it.value)}
          </span>
          {it.pct !== null ? (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: clr, minWidth: 52, textAlign: 'left' }}>
              {up ? '▲' : '▼'} {faPct(it.pct)}٪
            </span>
          ) : it.change !== null ? (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: clr, minWidth: 52, textAlign: 'left' }}>
              {up ? '▲' : '▼'} {faInt(Math.abs(it.change))}
            </span>
          ) : (
            <span style={{ minWidth: 52 }} />
          )}
        </div>
      )
    })
  }

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

        {/* Desktop nav — نمایش/عدم نمایش با CSS تا HTML سرور هم روی موبایل درست باشد */}
        {(
          <div className="nav-desktop" style={{ alignItems: 'center', gap: 6, direction: 'rtl' }}>
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

            {/* کارت شاخص — با هاور باز می‌شود، دیتا مستقیم از BrsApi سمت کلاینت */}
            <div style={{ position: 'relative' }}
              onMouseEnter={() => { setOpenDrop('__idx__'); fetchIndices() }}
              onMouseLeave={() => setOpenDrop(null)}>
              <button
                aria-expanded={openDrop === '__idx__'}
                onClick={() => { setOpenDrop(openDrop === '__idx__' ? null : '__idx__'); fetchIndices() }}
                style={{
                  ...navLink(false),
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  border: 'none', borderBottom: '1.5px solid transparent',
                  background: openDrop === '__idx__' ? 'rgba(59,130,246,0.08)' : 'transparent',
                  color: openDrop === '__idx__' ? '#3b82f6' : TEXT_NAV,
                  cursor: 'pointer',
                }}
              >
                شاخص
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: openDrop === '__idx__' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', pointerEvents: 'none' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {openDrop === '__idx__' && (
                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, paddingTop: 10 }}>
                  <div style={{
                    minWidth: 300,
                    background: isDark ? '#12161f' : '#fffdf8',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(59,130,246,0.15)'}`,
                    borderRadius: 14, padding: 6,
                    boxShadow: isDark ? '0 18px 50px rgba(0,0,0,0.6)' : '0 14px 40px rgba(0,0,0,0.14)',
                    direction: 'rtl',
                  }}>
                    {renderIdxRows()}
                  </div>
                </div>
              )}
            </div>

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
        {(
          <div className="nav-mobile" style={{ alignItems: 'center', gap: 8 }}>
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

      {/* Mobile menu — دکمه بازکننده فقط در .nav-mobile دیده می‌شود */}
      {menuOpen && (
        <div
          className="animate-slide-down nav-mobile-menu"
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
              <div key={item.href}>
                <Link href={item.href} aria-current={active ? 'page' : undefined} style={{
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
                {/* زیرمنو — دسکتاپ با هاور باز می‌شود؛ موبایل باید همیشه دیده شود وگرنه مسیرهایی مثل ارزش‌گذاری/رادار غیرقابل‌دسترس می‌مانند */}
                {item.menu && (
                  <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 4 }}>
                    {item.menu.map(m => {
                      const mActive = pathname === m.href
                      return (
                        <Link key={m.href} href={m.href} aria-current={mActive ? 'page' : undefined} style={{
                          display: 'block', textDecoration: 'none', fontSize: 12.5,
                          fontWeight: mActive ? 600 : 400,
                          color: mActive ? '#3b82f6' : isDark ? '#6b7a8c' : '#8a7a5a',
                          padding: '9px 16px 9px 16px', margin: '0 16px 0 0', borderRadius: 8,
                          background: mActive ? 'rgba(59,130,246,0.07)' : 'transparent',
                          fontFamily: 'inherit',
                        }}>
                          · {m.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          </nav>

          <div style={{ height: 1, background: BORDER, margin: '10px 0' }} />

          {/* شاخص‌های بازار در منوی موبایل — هاور وجود ندارد، همیشه نمایش داده می‌شود */}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', padding: '4px 16px 6px' }}>شاخص‌های بازار</div>
          <div>{renderIdxRows(true)}</div>

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
