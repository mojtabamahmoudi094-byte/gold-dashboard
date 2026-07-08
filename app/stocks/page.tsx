'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useIsMobile } from '../../lib/useIsMobile'

type Sym = {
  l18: string; l30: string
  pl: number | null; plp: number | null
  pc: number | null; pcp: number | null
  tval: number | null; tvol: number | null
  mv: number | null; pe: number | null
}
type Industry = {
  id: number | null; name: string; count: number
  tval: number; mv: number; up: number; down: number
  symbols: Sym[]
}
type Payload = { updated: string; industries: Industry[] }

const PALETTE = [
  'oklch(0.72 0.19 25)',   // قرمز گرم
  'oklch(0.76 0.14 210)',  // آبی فیروزه‌ای
  'oklch(0.78 0.13 300)',  // بنفش
  'oklch(0.78 0.15 85)',   // طلایی
  'oklch(0.74 0.16 150)',  // سبز
  'oklch(0.74 0.15 250)',  // آبی
  'oklch(0.75 0.15 340)',  // صورتی
  'oklch(0.76 0.12 55)',   // نارنجی ملایم
  'oklch(0.75 0.12 180)',  // سبزآبی
]

// همت = هزار میلیارد تومان (۱e13 ریال)
const hemat = (rial: number) =>
  rial >= 1e13
    ? `${(rial / 1e13).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} همت`
    : `${Math.round(rial / 1e10).toLocaleString('fa-IR')} میلیارد ت`

export default function StocksPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    fetch('/api/stocks-industries')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const panel = isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.9)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'

  const industries = useMemo(() => {
    const list = data?.industries ?? []
    const q = query.trim()
    return q ? list.filter(ind => ind.name.includes(q)) : list
  }, [data, query])

  const totalTval = useMemo(
    () => (data?.industries ?? []).reduce((s, x) => s + x.tval, 0),
    [data],
  )

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px' : '40px 24px' }}>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: isMobile ? 19 : 22, fontWeight: 700, color: text, marginBottom: 6 }}>
            سهام به تفکیک صنعت
          </div>
          <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.8 }}>
            همه صنایع بورس و فرابورس بر اساس طبقه‌بندی رسمی سازمان بورس — مرتب بر اساس ارزش معاملات
            {data && totalTval > 0 && (
              <span style={{ marginRight: 8, color: isDark ? '#7FB5E8' : '#2563EB' }}>
                · مجموع ارزش معاملات سهام: {hemat(totalTval)}
              </span>
            )}
          </div>
        </div>

        {/* جستجوی صنعت */}
        {data && (
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="جستجوی صنعت… (مثلاً فلزات، خودرو، دارو)"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '11px 16px', marginBottom: 20,
              borderRadius: 12, border: `1px solid ${line}`,
              background: panel, color: text,
              fontSize: 13, fontFamily: 'inherit', outline: 'none',
            }}
          />
        )}

        {failed && (
          <div style={{
            background: panel, border: `0.5px solid ${line}`, borderRadius: 16,
            padding: '40px 24px', textAlign: 'center', color: muted, fontSize: 13, lineHeight: 2,
          }}>
            داده صنایع هنوز بارگذاری نشده است.
            <br />
            به‌زودی فهرست کامل صنایع بورسی اینجا قرار می‌گیرد.
          </div>
        )}

        {!data && !failed && (
          <div style={{ color: muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
            در حال بارگذاری…
          </div>
        )}

        {data && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 14,
          }}>
            {industries.map((ind, i) => {
              const color = PALETTE[i % PALETTE.length]
              const border = color.replace(')', ' / 0.3)')
              const soft   = color.replace(')', ' / 0.07)')
              const flat = ind.count - ind.up - ind.down
              return (
                <Link
                  key={`${ind.id}-${ind.name}`}
                  href={`/stocks/${ind.id ?? encodeURIComponent(ind.name)}`}
                  style={{
                    textDecoration: 'none', display: 'block',
                    background: panel,
                    border: `0.5px solid ${border}`,
                    borderRadius: 16, padding: '18px 20px',
                    transition: 'background 0.2s, transform 0.15s',
                    cursor: 'pointer', backdropFilter: 'blur(12px)',
                    minWidth: 0,
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = soft
                    ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = panel
                    ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 26, height: 26, borderRadius: 8, padding: '0 4px',
                      fontSize: 11.5, fontWeight: 700,
                      background: soft, border: `0.5px solid ${border}`, color,
                      flexShrink: 0,
                    }}>
                      {(i + 1).toLocaleString('fa-IR')}
                    </span>
                    <span style={{
                      fontSize: 14, fontWeight: 700, color: text, flex: 1, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ind.name}
                    </span>
                    <span style={{ fontSize: 11, color: muted, flexShrink: 0 }}>
                      {ind.count.toLocaleString('fa-IR')} نماد
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: muted }}>ارزش معاملات</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color }}>{hemat(ind.tval)}</span>
                  </div>

                  {/* نوار سبز/خاکستری/قرمز — سهم نمادهای مثبت و منفی */}
                  <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                    {ind.up > 0 && (
                      <div style={{ flex: ind.up, background: 'oklch(0.74 0.16 150 / 0.75)' }} />
                    )}
                    {flat > 0 && (
                      <div style={{ flex: flat, background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,30,46,0.12)' }} />
                    )}
                    {ind.down > 0 && (
                      <div style={{ flex: ind.down, background: 'oklch(0.68 0.19 25 / 0.75)' }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5 }}>
                    <span style={{ color: 'oklch(0.74 0.16 150)' }}>{ind.up.toLocaleString('fa-IR')} مثبت</span>
                    <span style={{ color: 'oklch(0.68 0.19 25)' }}>{ind.down.toLocaleString('fa-IR')} منفی</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {data && industries.length === 0 && (
          <div style={{ color: muted, fontSize: 13, padding: '30px 0', textAlign: 'center' }}>
            صنعتی با این نام پیدا نشد
          </div>
        )}
      </div>
    </main>
  )
}
