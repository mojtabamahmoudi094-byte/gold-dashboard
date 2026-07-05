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

// مقادیر گزارش‌های کدال به میلیون ریال هستند
const mrial = (v: number | null) => (v === null ? '—' : hemat(v * 1e6))

const MONTH_NAMES = ['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const monthLabel = (period: string) => {
  const m = period.match(/^(\d{4})\/(\d{2})/)
  return m ? `${MONTH_NAMES[Number(m[2])]} ${Number(m[1]).toLocaleString('fa-IR', { useGrouping: false })}` : period
}

const growth = (cur: number | null, prev: number | null) =>
  cur === null || prev === null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100

const gPct = (v: number | null) =>
  v === null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`

type RProduct = {
  name: string; unit: string | null
  prod_m: number | null; qty_m: number | null; rate_m: number | null
  amount_m: number | null; amount_cum: number | null
}
type RMonth = {
  period: string; publish: string | null
  month: number | null; cum: number | null; lastYearCum: number | null
  products: RProduct[]
}
type RQuarter = {
  period: string; months: number; audited: boolean; consolidated: boolean; publish: string | null
  revenue: number | null; revenue_ly: number | null
  cogs: number | null; gross: number | null; gross_ly: number | null
  sga: number | null; op: number | null; fin_cost: number | null
  net: number | null; net_ly: number | null
  eps: number | null; capital: number | null
}
type Reports = { symbol: string; updated: string; months: RMonth[]; quarters: RQuarter[] }

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

  const [reports, setReports] = useState<Reports | null>(null)
  useEffect(() => {
    if (!symbol) return
    fetch(`/reports/${encodeURIComponent(symbol.replace(/\s+/g, '-'))}.json`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setReports)
      .catch(() => setReports(null))
  }, [symbol])

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

              {reports && reports.months.length > 0 && (
                <MonthlySection months={reports.months} t={{ panel, text, muted, line, isDark }} isMobile={isMobile} />
              )}
              {reports && reports.quarters.length > 0 && (
                <QuarterlyFinSection quarters={reports.quarters} t={{ panel, text, muted, line, isDark }} isMobile={isMobile} />
              )}
            </>
          )
        })()}
      </div>
    </main>
  )
}

type Theme = { panel: string; text: string; muted: string; line: string; isDark: boolean }

const M_ACCENT = '#38BDF8'   // آبی آسمانی — فعالیت ماهانه
const Q_ACCENT = '#F59E0B'   // کهربایی — گزارش فصلی

function SectionCard({ title, badge, accent, t, children }: {
  title: string; badge?: string; accent: string; t: Theme; children: React.ReactNode
}) {
  return (
    <section style={{
      background: t.panel, border: `0.5px solid ${t.line}`, borderRadius: 16,
      padding: '20px 20px 22px', marginTop: 22, backdropFilter: 'blur(12px)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: 3, background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{title}</span>
        {badge && (
          <span style={{
            fontSize: 10, padding: '3px 9px', borderRadius: 7,
            background: `${accent}14`, border: `0.5px solid ${accent}40`, color: accent,
          }}>{badge}</span>
        )}
      </div>
      {children}
    </section>
  )
}

function Chip({ label, value, color, t }: { label: string; value: string; color?: string; t: Theme }) {
  return (
    <div style={{
      flex: '1 1 130px', minWidth: 0, padding: '10px 14px', borderRadius: 12,
      background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,46,0.03)',
      border: `0.5px solid ${t.line}`,
    }}>
      <div style={{ fontSize: 10, color: t.muted, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: color ?? t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}

// ═══ گزارش فعالیت ماهانه ═══
function MonthlySection({ months, t, isMobile }: { months: RMonth[]; t: Theme; isMobile: boolean }) {
  const last = months[months.length - 1]
  const prev = months.length > 1 ? months[months.length - 2] : null
  const mom = growth(last.month, prev?.month ?? null)
  const yoy = growth(last.cum, last.lastYearCum)
  const maxM = Math.max(...months.map(m => m.month ?? 0), 1)

  const topProducts = [...last.products]
    .filter(p => (p.amount_m ?? 0) > 0)
    .sort((a, b) => (b.amount_m ?? 0) - (a.amount_m ?? 0))
    .slice(0, 5)
  const maxP = Math.max(...topProducts.map(p => p.amount_m ?? 0), 1)

  return (
    <SectionCard title="گزارش فعالیت ماهانه" badge={`${months.length.toLocaleString('fa-IR')} ماه`} accent={M_ACCENT} t={t}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <Chip t={t} label={`فروش ${monthLabel(last.period)}`} value={mrial(last.month)} color={M_ACCENT} />
        <Chip t={t} label="نسبت به ماه قبل" value={gPct(mom)} color={mom === null ? undefined : mom >= 0 ? GREEN : RED} />
        <Chip t={t} label="فروش تجمعی سال مالی" value={mrial(last.cum)} />
        <Chip t={t} label="رشد نسبت به دوره مشابه سال قبل" value={gPct(yoy)} color={yoy === null ? undefined : yoy >= 0 ? GREEN : RED} />
      </div>

      {/* روند فروش ماهانه */}
      <div style={{ fontSize: 11, color: t.muted, marginBottom: 10 }}>روند فروش ماهانه (میلیارد تومان)</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: isMobile ? 3 : 6, height: 120, minWidth: 0 }}>
        {months.map((m, i) => {
          const h = Math.max(((m.month ?? 0) / maxM) * 100, 2)
          const isLast = i === months.length - 1
          return (
            <div key={m.period} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              {!isMobile && (
                <div style={{ fontSize: 8.5, color: t.muted, whiteSpace: 'nowrap' }}>
                  {Math.round((m.month ?? 0) / 1e4).toLocaleString('fa-IR')}
                </div>
              )}
              <div title={`${monthLabel(m.period)}: ${mrial(m.month)}`} style={{
                width: '100%', maxWidth: 34, height: `${h}%`, borderRadius: '4px 4px 2px 2px',
                background: isLast ? M_ACCENT : `${M_ACCENT}55`,
              }} />
              <div style={{ fontSize: isMobile ? 7.5 : 9, color: isLast ? t.text : t.muted, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>
                {monthLabel(m.period).split(' ')[0].slice(0, isMobile ? 3 : 8)}
              </div>
            </div>
          )
        })}
      </div>

      {/* محصولات برتر آخرین ماه */}
      {topProducts.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: t.muted, margin: '20px 0 10px' }}>
            محصولات برتر {monthLabel(last.period)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topProducts.map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 11.5, color: t.text, flex: '0 0 auto', width: isMobile ? 120 : 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                <div style={{ flex: 1, height: 7, borderRadius: 4, background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,30,46,0.06)', overflow: 'hidden' }}>
                  <div style={{ width: `${((p.amount_m ?? 0) / maxP) * 100}%`, height: '100%', borderRadius: 4, background: M_ACCENT }} />
                </div>
                <span style={{ fontSize: 10.5, color: t.muted, flexShrink: 0, minWidth: 74, textAlign: 'left' }}>
                  {mrial(p.amount_m)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  )
}

// ═══ گزارش‌های فصلی (صورت سود و زیان دوره‌ای) ═══
function QuarterlyFinSection({ quarters, t, isMobile }: { quarters: RQuarter[]; t: Theme; isMobile: boolean }) {
  const last = quarters[quarters.length - 1]
  const revYoy = growth(last.revenue, last.revenue_ly)
  const netYoy = growth(last.net, last.net_ly)
  const grossMargin = last.revenue ? ((last.gross ?? 0) / last.revenue) * 100 : null
  const netMargin = last.revenue ? ((last.net ?? 0) / last.revenue) * 100 : null

  const maxRev = Math.max(...quarters.map(q => q.revenue ?? 0), 1)

  const durLabel = (q: RQuarter) => `${q.months.toLocaleString('fa-IR')} ماهه منتهی به ${q.period}`

  return (
    <SectionCard title="گزارش‌های فصلی" badge={`${quarters.length.toLocaleString('fa-IR')} دوره`} accent={Q_ACCENT} t={t}>
      <div style={{ fontSize: 11, color: t.muted, marginBottom: 12 }}>
        آخرین گزارش: {durLabel(last)} {last.audited ? '(حسابرسی شده)' : '(حسابرسی نشده)'}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <Chip t={t} label="درآمد عملیاتی دوره" value={mrial(last.revenue)} color={Q_ACCENT} />
        <Chip t={t} label="رشد درآمد نسبت به دوره مشابه" value={gPct(revYoy)} color={revYoy === null ? undefined : revYoy >= 0 ? GREEN : RED} />
        <Chip t={t} label="سود خالص دوره" value={mrial(last.net)} color={(last.net ?? 0) >= 0 ? GREEN : RED} />
        <Chip t={t} label="رشد سود خالص" value={gPct(netYoy)} color={netYoy === null ? undefined : netYoy >= 0 ? GREEN : RED} />
        <Chip t={t} label="حاشیه سود ناخالص" value={grossMargin === null ? '—' : `${grossMargin.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`} />
        <Chip t={t} label="حاشیه سود خالص" value={netMargin === null ? '—' : `${netMargin.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`} />
        <Chip t={t} label="سود هر سهم (EPS)" value={last.eps === null ? '—' : `${last.eps.toLocaleString('fa-IR')} ریال`} />
      </div>

      {/* جدول دوره‌ها */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? 11 : 12, whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ color: t.muted, fontSize: 10 }}>
              {['دوره', 'درآمد', 'رشد درآمد', 'سود ناخالص', 'سود خالص', 'رشد سود', 'حاشیه خالص'].map(h => (
                <th key={h} style={{ textAlign: 'right', padding: '9px 12px', fontWeight: 500, borderBottom: `1px solid ${t.line}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...quarters].reverse().map(q => {
              const rg = growth(q.revenue, q.revenue_ly)
              const ng = growth(q.net, q.net_ly)
              const nm = q.revenue ? ((q.net ?? 0) / q.revenue) * 100 : null
              return (
                <tr key={`${q.period}-${q.months}`}>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: t.text }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 42, height: 5, borderRadius: 3, flexShrink: 0,
                        background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.07)', overflow: 'hidden',
                      }}>
                        <div style={{ width: `${((q.revenue ?? 0) / maxRev) * 100}%`, height: '100%', background: Q_ACCENT, borderRadius: 3 }} />
                      </div>
                      {durLabel(q)}
                    </div>
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: t.text, fontWeight: 600 }}>{mrial(q.revenue)}</td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: rg === null ? t.muted : rg >= 0 ? GREEN : RED }}>{gPct(rg)}</td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: t.text }}>{mrial(q.gross)}</td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: (q.net ?? 0) >= 0 ? GREEN : RED, fontWeight: 600 }}>{mrial(q.net)}</td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: ng === null ? t.muted : ng >= 0 ? GREEN : RED }}>{gPct(ng)}</td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: t.muted }}>
                    {nm === null ? '—' : `${nm.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
