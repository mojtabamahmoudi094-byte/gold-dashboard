'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { NAV } from './Header'
import { shouldUseDark } from '../../lib/theme'

const LABELS: Record<string, string> = {}
for (const item of NAV) {
  LABELS[item.href] = item.label
  for (const sub of item.menu ?? []) LABELS[sub.href] = sub.label
}

function labelFor(path: string, segment: string) {
  return LABELS[path] || decodeURIComponent(segment)
}

export default function Breadcrumb() {
  const pathname = usePathname()
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  if (!pathname || pathname === '/') return null

  const segments = pathname.split('/').filter(Boolean)
  const crumbs = segments.map((seg, i) => {
    const path = '/' + segments.slice(0, i + 1).join('/')
    return { path, label: labelFor(path, seg) }
  })

  const muted = isDark ? '#6b7280' : '#7A6A50'
  const text = isDark ? '#eef1f8' : '#1A1205'
  const border = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'

  return (
    <nav
      aria-label="مسیر صفحه"
      style={{
        maxWidth: 1100, margin: '0 auto', padding: '10px 24px',
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        fontSize: 12, direction: 'rtl', borderBottom: `0.5px solid ${border}`,
      }}
    >
      <Link href="/" style={{ color: muted, textDecoration: 'none' }}>خانه</Link>
      {crumbs.map((c, i) => (
        <span key={c.path} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: muted }}>‹</span>
          {i === crumbs.length - 1 ? (
            <span style={{ color: text, fontWeight: 600 }}>{c.label}</span>
          ) : (
            <Link href={c.path} style={{ color: muted, textDecoration: 'none' }}>{c.label}</Link>
          )}
        </span>
      ))}
    </nav>
  )
}
