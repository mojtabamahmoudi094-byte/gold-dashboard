'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useIsMobile } from '../../../lib/useIsMobile'

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

const hemat = (rial: number) =>
  rial >= 1e13
    ? `${(rial / 1e13).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} همت`
    : `${Math.round(rial / 1e10).toLocaleString('fa-IR')} میلیارد ت`

const pct = (v: number | null) =>
  v === null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`

const GREEN = 'oklch(0.74 0.16 150)'
const RED   = 'oklch(0.68 0.19 25)'

export default function StockPage() {
  const params = useParams()
  const symbol = decodeURIComponent((params?.symbol as string) || '')
  const [data, setData] = useState<Payload | null>(null)
  const [failed, setFailed] = useState(false)
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
    fetch('/stocks/industries.json')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  const found = useMemo(() => {
    if (!data) return null
    for (const ind of data.industries) {
      const s = ind.symbols.find(x => x.l18 === symbol)
      if (s) return { s, ind }
    }
    return null
  }, [data, symbol])

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const panel = isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.9)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#5A7088' : '#6B7F90'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'

  const pcColor = (v: number | null) => (v === null || v === 0 ? text : v > 0 ? GREEN : RED)

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px' : '40px 24px' }}>

        {found && (
          <Link href={`/stocks/${found.ind.id}`} style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>
            ← بازگشت به {found.ind.name}
          </Link>
        )}
        {!found && (
          <Link href="/stocks" style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>
            ← بازگشت به صنایع
          </Link>
        )}

        {(failed || (data && !found)) && (
          <div style={{ color: muted, fontSize: 13, padding: '50px 0', textAlign: 'center' }}>
            نماد «{symbol}» پیدا نشد
          </div>
        )}

        {!data && !failed && (
          <div style={{ color: muted, fontSize: 13, padding: '50px 0', textAlign: 'center' }}>
            در حال بارگذاری…
          </div>
        )}

        {found && (() => {
          const { s, ind } = found
          const cards: [string, string, string][] = [
            ['قیمت پایانی', s.pc === null ? '—' : s.pc.toLocaleString('fa-IR'), pcColor(s.pcp) as string],
            ['٪ پایانی', pct(s.pcp), pcColor(s.pcp) as string],
            ['آخرین معامله', s.pl === null ? '—' : s.pl.toLocaleString('fa-IR'), pcColor(s.plp) as string],
            ['٪ آخرین', pct(s.plp), pcColor(s.plp) as string],
            ['ارزش معاملات', s.tval === null ? '—' : hemat(s.tval), text],
            ['حجم معاملات', s.tvol === null ? '—' : s.tvol >= 1e6
              ? `${(s.tvol / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} م`
              : s.tvol.toLocaleString('fa-IR'), text],
            ['ارزش بازار', s.mv === null ? '—' : hemat(s.mv), text],
            ['P/E', s.pe === null ? '—' : s.pe.toLocaleString('fa-IR', { maximumFractionDigits: 1 }), text],
          ]
          return (
            <>
              <div style={{ margin: '14px 0 6px', display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: text }}>{s.l18}</span>
                <span style={{ fontSize: 12.5, color: muted }}>{s.l30}</span>
              </div>
              <div style={{ marginBottom: 20 }}>
                <Link href={`/stocks/${ind.id}`} style={{
                  fontSize: 11, color: isDark ? '#7FB5E8' : '#2563EB', textDecoration: 'none',
                  padding: '4px 10px', borderRadius: 8,
                  background: 'rgba(59,130,246,0.08)', border: '0.5px solid rgba(59,130,246,0.25)',
                }}>
                  صنعت: {ind.name}
                </Link>
              </div>

              {/* اطلاعات تابلو */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                gap: 10, marginBottom: 24,
              }}>
                {cards.map(([k, v, c]) => (
                  <div key={k} style={{
                    background: panel, border: `0.5px solid ${line}`, borderRadius: 14,
                    padding: '14px 16px', backdropFilter: 'blur(12px)', minWidth: 0,
                  }}>
                    <div style={{ fontSize: 10.5, color: muted, marginBottom: 6 }}>{k}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: c, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 10.5, color: muted }}>
                داده تابلو مربوط به آخرین به‌روزرسانی صنایع است
                {data?.updated ? ` — ${new Date(data.updated).toLocaleDateString('fa-IR')}` : ''}
              </div>
            </>
          )
        })()}
      </div>
    </main>
  )
}
