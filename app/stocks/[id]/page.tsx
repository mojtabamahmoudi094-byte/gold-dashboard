'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useIsMobile } from '../../../lib/useIsMobile'
import { Skeleton, SkeletonRows } from '../../components/ui/Skeleton'

type Sym = {
  l18: string; l30: string
  pl: number | null; plp: number | null
  pc: number | null; pcp: number | null
  tval: number | null; tvol: number | null
  mv: number | null; mv_usd?: number | null; pe: number | null
}
type Industry = {
  id: number | null; name: string; count: number
  tval: number; mv: number; mv_usd?: number; up: number; down: number
  symbols: Sym[]
}
type Payload = { updated: string; industries: Industry[] }

const hemat = (rial: number) =>
  rial >= 1e13
    ? `${(rial / 1e13).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} همت`
    : `${Math.round(rial / 1e10).toLocaleString('fa-IR')} میلیارد ت`

// ارزش بازار دلاری — روزی یک‌بار ساعت ۱۳ تهران توسط sync-usd-market-value.js محاسبه می‌شود
const husd = (v: number | null | undefined) =>
  v == null ? null : v >= 1e9
    ? `$${(v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })}B`
    : `$${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`

const pct = (v: number | null) =>
  v === null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`

const pctColor = (v: number | null, muted: string) =>
  v === null || v === 0 ? muted : v > 0 ? 'oklch(0.74 0.16 150)' : 'oklch(0.68 0.19 25)'

export default function IndustryPage() {
  const params = useParams()
  const rawId = decodeURIComponent((params?.id as string) || '')
  const router = useRouter()
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
    fetch('/api/stocks-industries')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  const ind = useMemo(() => {
    if (!data) return null
    return data.industries.find(x => String(x.id) === rawId || x.name === rawId) ?? null
  }, [data, rawId])

  // میانگین و رتبه P/E صنعت — فقط از نمادهایی که P/E مثبت دارند (زیان‌ده‌ها منحرف‌کننده میانگین‌اند)
  const peStats = useMemo(() => {
    if (!ind) return { avg: null as number | null, ranks: new Map<string, number>(), count: 0 }
    const withPe = ind.symbols.filter(s => s.pe !== null && s.pe > 0)
    const avg = withPe.length ? withPe.reduce((s, x) => s + (x.pe as number), 0) / withPe.length : null
    const ranked = [...withPe].sort((a, b) => (a.pe as number) - (b.pe as number))
    const ranks = new Map<string, number>()
    ranked.forEach((s, i) => ranks.set(s.l18, i + 1))
    return { avg, ranks, count: withPe.length }
  }, [ind])

  type SortKey = 'l18' | 'pc' | 'pcp' | 'pl' | 'plp' | 'tval' | 'mv' | 'pe'
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const sortedSymbols = useMemo(() => {
    if (!ind) return []
    if (!sortKey) return ind.symbols
    const dir = sortDir === 'desc' ? -1 : 1
    return [...ind.symbols].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      if (typeof av === 'string' || typeof bv === 'string') {
        return dir * String(av).localeCompare(String(bv), 'fa')
      }
      return dir * ((av as number) - (bv as number))
    })
  }, [ind, sortKey, sortDir])

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const panel = isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.9)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px' : '40px 24px' }}>

        <Link href="/stocks" style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>
          ← بازگشت به صنایع
        </Link>

        {(failed || (data && !ind)) && (
          <div style={{ color: muted, fontSize: 13, padding: '50px 0', textAlign: 'center' }}>
            داده این صنعت در دسترس نیست
          </div>
        )}

        {!data && !failed && (
          <div style={{ margin: '12px 0 20px' }}>
            <Skeleton width={180} height={22} style={{ marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} width={100} height={26} radius={9} />)}
            </div>
            <SkeletonRows rows={8} height={44} />
          </div>
        )}

        {ind && (
          <>
            <div style={{ margin: '12px 0 20px' }}>
              <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: text, marginBottom: 8 }}>
                {ind.name}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11.5 }}>
                {[
                  ['نماد', ind.count.toLocaleString('fa-IR')],
                  ['ارزش معاملات', hemat(ind.tval)],
                  ['ارزش بازار', husd(ind.mv_usd) ? `${hemat(ind.mv)} (${husd(ind.mv_usd)})` : hemat(ind.mv)],
                  ['مثبت', ind.up.toLocaleString('fa-IR')],
                  ['منفی', ind.down.toLocaleString('fa-IR')],
                  ...(peStats.avg !== null ? [['میانگین P/E صنعت', peStats.avg.toLocaleString('fa-IR', { maximumFractionDigits: 1 })]] : []),
                ].map(([k, v]) => (
                  <span key={k} style={{
                    padding: '5px 12px', borderRadius: 9,
                    background: panel, border: `0.5px solid ${line}`,
                    color: muted,
                  }}>
                    {k}: <b style={{ color: text }}>{v}</b>
                  </span>
                ))}
              </div>
            </div>

            <div style={{
              background: panel, border: `0.5px solid ${line}`, borderRadius: 16,
              overflow: 'hidden', backdropFilter: 'blur(12px)',
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? 11.5 : 12.5, whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ color: muted, fontSize: 10.5 }}>
                      {([
                        ['نماد', 'l18'], ['قیمت پایانی', 'pc'], ['٪ پایانی', 'pcp'],
                        ['آخرین', 'pl'], ['٪ آخرین', 'plp'], ['ارزش معاملات', 'tval'],
                        ...(isMobile ? [] : [['ارزش بازار', 'mv'], ['P/E', 'pe']]),
                      ] as [string, SortKey][]).map(([h, key]) => (
                        <th
                          key={h}
                          onClick={() => toggleSort(key)}
                          style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 500, borderBottom: `1px solid ${line}`, cursor: 'pointer', userSelect: 'none' }}
                        >
                          {h}{sortKey === key ? (sortDir === 'desc' ? ' ▾' : ' ▴') : ''}
                        </th>
                      ))}
                      {!isMobile && (
                        <th style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 500, borderBottom: `1px solid ${line}` }}>
                          رتبه P/E صنعت
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSymbols.map((s, i) => (
                      <tr
                        key={s.l18}
                        onClick={() => router.push(`/stock/${encodeURIComponent(s.l18)}`)}
                        style={{
                          background: i % 2 ? (isDark ? 'rgba(255,255,255,0.015)' : 'rgba(15,30,46,0.02)') : 'transparent',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(59,130,246,0.07)' : 'rgba(59,130,246,0.06)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = i % 2 ? (isDark ? 'rgba(255,255,255,0.015)' : 'rgba(15,30,46,0.02)') : 'transparent' }}
                      >
                        <td style={{ padding: '10px 14px', borderBottom: `1px solid ${line}` }}>
                          <div style={{ fontWeight: 700, color: text }}>{s.l18}</div>
                          {!isMobile && <div style={{ fontSize: 10, color: muted, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.l30}</div>}
                        </td>
                        <td style={{ padding: '10px 14px', borderBottom: `1px solid ${line}` }}>
                          {s.pc === null ? '—' : s.pc.toLocaleString('fa-IR')}
                        </td>
                        <td style={{ padding: '10px 14px', borderBottom: `1px solid ${line}`, color: pctColor(s.pcp, muted), fontWeight: 600 }}>
                          {pct(s.pcp)}
                        </td>
                        <td style={{ padding: '10px 14px', borderBottom: `1px solid ${line}` }}>
                          {s.pl === null ? '—' : s.pl.toLocaleString('fa-IR')}
                        </td>
                        <td style={{ padding: '10px 14px', borderBottom: `1px solid ${line}`, color: pctColor(s.plp, muted), fontWeight: 600 }}>
                          {pct(s.plp)}
                        </td>
                        <td style={{ padding: '10px 14px', borderBottom: `1px solid ${line}` }}>
                          {s.tval === null ? '—' : hemat(s.tval)}
                        </td>
                        {!isMobile && (
                          <>
                            <td style={{ padding: '10px 14px', borderBottom: `1px solid ${line}` }}>
                              {s.mv === null ? '—' : hemat(s.mv)}
                              {husd(s.mv_usd) && (
                                <div style={{ fontSize: 10, color: muted }}>{husd(s.mv_usd)}</div>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', borderBottom: `1px solid ${line}`, color: muted }}>
                              {s.pe === null ? '—' : s.pe.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}
                            </td>
                            <td style={{ padding: '10px 14px', borderBottom: `1px solid ${line}`, color: muted }}>
                              {peStats.ranks.has(s.l18)
                                ? `${(peStats.ranks.get(s.l18) as number).toLocaleString('fa-IR')} از ${peStats.count.toLocaleString('fa-IR')}`
                                : '—'}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
