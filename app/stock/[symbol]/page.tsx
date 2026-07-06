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

// نرخ فروش کدال به ریال بر واحد است → میلیون تومان بر واحد
const rateFmt = (v: number | null) =>
  v === null || v === 0 ? '—' : `${(v / 1e7).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} م.ت`

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
          const up = (s.pcp ?? 0) > 0, down = (s.pcp ?? 0) < 0
          const chgC = up ? GREEN : down ? RED : muted
          return (
            <>
              {/* هدر hero */}
              <div style={{
                position: 'relative', overflow: 'hidden',
                marginTop: 14, marginBottom: 16, padding: isMobile ? '18px 18px' : '22px 26px',
                borderRadius: 20, border: `0.5px solid ${line}`,
                background: isDark
                  ? 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.08) 55%, rgba(10,18,30,0.4))'
                  : 'linear-gradient(135deg, rgba(59,130,246,0.09), rgba(139,92,246,0.06) 55%, rgba(255,255,255,0.7))',
                backdropFilter: 'blur(12px)',
              }}>
                <div style={{
                  position: 'absolute', top: -60, left: -40, width: 200, height: 200, borderRadius: '50%',
                  background: `radial-gradient(circle, ${chgC}22, transparent 70%)`, pointerEvents: 'none',
                }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: isMobile ? 24 : 30, fontWeight: 800, letterSpacing: '-0.01em',
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                      }}>{s.l18}</span>
                      <span style={{ fontSize: 12.5, color: muted, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.l30}</span>
                    </div>
                    <Link href={`/stocks/${ind.id}`} style={{
                      display: 'inline-block', marginTop: 10,
                      fontSize: 11, color: isDark ? '#7FB5E8' : '#2563EB', textDecoration: 'none',
                      padding: '4px 11px', borderRadius: 8,
                      background: 'rgba(59,130,246,0.1)', border: '0.5px solid rgba(59,130,246,0.28)',
                    }}>
                      {ind.name}
                    </Link>
                  </div>
                  {/* پیل قیمت پایانی */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 14,
                    background: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.6)',
                    border: `0.5px solid ${chgC}40`,
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9.5, color: muted, marginBottom: 3 }}>قیمت پایانی</div>
                      <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: text }}>
                        {s.pc === null ? '—' : s.pc.toLocaleString('fa-IR')}
                      </div>
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 9,
                      background: `${chgC}18`, color: chgC, fontWeight: 800, fontSize: 13.5,
                    }}>
                      {(up || down) && <ToneIcon tone={up ? 'pos' : 'neg'} size={14} />}
                      {pct(s.pcp)}
                    </div>
                  </div>
                </div>
              </div>

              {/* اطلاعات تابلو */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                gap: 10, marginBottom: 20,
              }}>
                {cards.map(([k, v, c]) => {
                  const accent = c === (GREEN as string) || c === (RED as string)
                  return (
                    <div key={k} style={{
                      position: 'relative', overflow: 'hidden',
                      background: panel, border: `0.5px solid ${accent ? `${c}33` : line}`, borderRadius: 14,
                      padding: '14px 16px', backdropFilter: 'blur(12px)', minWidth: 0,
                    }}>
                      {accent && <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3, background: c }} />}
                      <div style={{ fontSize: 10.5, color: muted, marginBottom: 6 }}>{k}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: c, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
                    </div>
                  )
                })}
              </div>

              <div style={{ fontSize: 10.5, color: muted }}>
                داده تابلو مربوط به آخرین به‌روزرسانی صنایع است
                {data?.updated ? ` — ${new Date(data.updated).toLocaleDateString('fa-IR')}` : ''}
              </div>

              {reports && (reports.months.length > 0 || reports.quarters.length > 0) && (
                <AnalysisSection months={reports.months} quarters={reports.quarters} t={{ panel, text, muted, line, isDark }} isMobile={isMobile} />
              )}
              {reports && reports.months.length > 0 && (
                <MonthlySection months={reports.months} t={{ panel, text, muted, line, isDark }} isMobile={isMobile} />
              )}
              {reports && reports.quarters.length > 0 && (
                <QuarterlyFinSection quarters={reports.quarters} t={{ panel, text, muted, line, isDark }} isMobile={isMobile} />
              )}
              <AiChatSection symbol={symbol} t={{ panel, text, muted, line, isDark }} isMobile={isMobile} />
            </>
          )
        })()}
      </div>
    </main>
  )
}

type Theme = { panel: string; text: string; muted: string; line: string; isDark: boolean }

const M_ACCENT = '#FACC15'   // زرد طلایی — فعالیت ماهانه
const Q_ACCENT = '#F59E0B'   // کهربایی — گزارش فصلی
const A_ACCENT = '#A78BFA'   // بنفش — تحلیل هوشمند
const AI_ACCENT = '#2DD4BF'  // فیروزه‌ای — دستیار تحلیلگر
const AI_API = 'https://newbot.dadashchekhabare.qzz.io/ai/ask'

type Tone = 'pos' | 'neg' | 'neutral'
type Insight = { tone: Tone; text: string }

// تحلیل قاعده‌محور از گزارش‌های هر سهم
function buildInsights(months: RMonth[], quarters: RQuarter[]): { verdict: Insight; items: Insight[] } {
  const items: Insight[] = []
  const fa0 = (v: number) => Math.abs(v).toLocaleString('fa-IR', { maximumFractionDigits: 0 })
  let score = 0

  if (months.length >= 2) {
    const last = months[months.length - 1], prev = months[months.length - 2]
    const mom = growth(last.month, prev.month)
    const yoy = growth(last.cum, last.lastYearCum)
    if (mom !== null) {
      items.push({ tone: mom >= 0 ? 'pos' : 'neg', text: `فروش ${monthLabel(last.period)} نسبت به ماه قبل ${mom >= 0 ? 'رشد' : 'افت'} ${fa0(mom)}٪ داشته است.` })
      score += mom >= 0 ? 1 : -1
    }
    if (yoy !== null) {
      items.push({ tone: yoy >= 0 ? 'pos' : 'neg', text: `فروش تجمعی سال مالی نسبت به دوره مشابه سال قبل ${yoy >= 0 ? '+' : '−'}${fa0(yoy)}٪ تغییر کرده است.` })
      score += yoy >= 0 ? 1 : -1
    }
    // روند نرخ فروش محصول اصلی
    const mainP = [...last.products].filter(p => (p.amount_m ?? 0) > 0 && (p.rate_m ?? 0) > 0).sort((a, b) => (b.amount_m ?? 0) - (a.amount_m ?? 0))[0]
    if (mainP) {
      const ser = months.map(m => m.products.find(x => x.name === mainP.name)?.rate_m ?? null).filter((v): v is number => v !== null && v > 0)
      if (ser.length >= 2) {
        const g = growth(ser[ser.length - 1], ser[0])
        if (g !== null && Math.abs(g) >= 1) {
          items.push({ tone: g >= 0 ? 'pos' : 'neg', text: `نرخ فروش «${mainP.name}» طی دوره ${g >= 0 ? 'صعودی' : 'نزولی'} بوده و ${g >= 0 ? '+' : '−'}${fa0(g)}٪ تغییر کرده است.` })
          score += g >= 0 ? 1 : -1
        }
      }
    }
  }

  if (quarters.length >= 1) {
    const q = quarters[quarters.length - 1]
    const nm = q.revenue ? ((q.net ?? 0) / q.revenue) * 100 : null
    const netYoy = growth(q.net, q.net_ly)
    if (netYoy !== null) {
      items.push({ tone: netYoy >= 0 ? 'pos' : 'neg', text: `سود خالص آخرین دوره نسبت به دوره مشابه سال قبل ${netYoy >= 0 ? 'رشد' : 'افت'} ${fa0(netYoy)}٪ داشته است.` })
      score += netYoy >= 0 ? 1 : -1
    }
    if (nm !== null) {
      items.push({ tone: nm >= 25 ? 'pos' : nm >= 0 ? 'neutral' : 'neg', text: `حاشیه سود خالص آخرین دوره ${fa0(nm)}٪ بوده است${nm >= 30 ? ' که سطح بالایی است' : nm < 10 ? ' که پایین است' : ''}.` })
    }
    // روند حاشیه نسبت به دوره هم‌طول قبلی
    const prevSame = [...quarters].reverse().find(x => x.months === q.months && x.period < q.period)
    if (prevSame && prevSame.revenue && q.revenue && nm !== null) {
      const pnm = ((prevSame.net ?? 0) / prevSame.revenue) * 100
      const d = nm - pnm
      if (Math.abs(d) >= 1) {
        items.push({ tone: d >= 0 ? 'pos' : 'neg', text: `حاشیه سود خالص نسبت به دوره ${q.months.toLocaleString('fa-IR')} ماهه قبلی ${d >= 0 ? 'بهبود' : 'کاهش'} ${fa0(d)} واحد درصدی داشته است.` })
        score += d >= 0 ? 1 : -1
      }
    }
  }

  const verdict: Insight =
    score >= 2 ? { tone: 'pos', text: 'مجموع سیگنال‌های گزارش‌های اخیر مثبت است؛ روند فروش و سودآوری رو به بهبود بوده.' }
    : score <= -2 ? { tone: 'neg', text: 'مجموع سیگنال‌های گزارش‌های اخیر منفی است؛ فشار بر فروش یا سودآوری دیده می‌شود.' }
    : { tone: 'neutral', text: 'سیگنال‌های گزارش‌های اخیر متعادل است؛ روند مشخصی غالب نیست.' }

  return { verdict, items }
}

const toneColor = (tone: Tone) => tone === 'pos' ? GREEN : tone === 'neg' ? RED : '#94A3B8'

const ToneIcon = ({ tone, size = 18 }: { tone: Tone; size?: number }) => {
  const c = toneColor(tone)
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, style: { pointerEvents: 'none' as const } }
  if (tone === 'pos') return (<svg {...common}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>)
  if (tone === 'neg') return (<svg {...common}><polyline points="3 7 9 13 13 9 21 17" /><polyline points="15 17 21 17 21 11" /></svg>)
  return (<svg {...common}><line x1="5" y1="12" x2="19" y2="12" /></svg>)
}

// ═══ تحلیل هوشمند ═══
function AnalysisSection({ months, quarters, t, isMobile }: { months: RMonth[]; quarters: RQuarter[]; t: Theme; isMobile: boolean }) {
  const { verdict, items } = buildInsights(months, quarters)
  if (items.length === 0) return null
  return (
    <SectionCard title="تحلیل هوشمند" badge="خودکار" accent={A_ACCENT} t={t}>
      {/* حکم کلی */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, marginBottom: 14,
        background: `${toneColor(verdict.tone)}12`, border: `0.5px solid ${toneColor(verdict.tone)}40`,
      }}>
        <span style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${toneColor(verdict.tone)}18`, border: `0.5px solid ${toneColor(verdict.tone)}45`,
        }}>
          <ToneIcon tone={verdict.tone} size={18} />
        </span>
        <span style={{ fontSize: isMobile ? 12.5 : 13.5, fontWeight: 700, color: toneColor(verdict.tone), lineHeight: 1.7 }}>
          {verdict.text}
        </span>
      </div>
      {/* بندها */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: toneColor(it.tone), marginTop: 6, flexShrink: 0 }} />
            <span style={{ fontSize: isMobile ? 12 : 12.5, color: t.text, lineHeight: 1.9 }}>{it.text}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9.5, color: t.muted, marginTop: 14, lineHeight: 1.7 }}>
        این تحلیل خودکار و صرفاً بر پایه گزارش‌های کدال محاسبه شده است و توصیه خرید یا فروش نیست.
      </div>
    </SectionCard>
  )
}

function SectionCard({ title, badge, accent, t, children }: {
  title: string; badge?: string; accent: string; t: Theme; children: React.ReactNode
}) {
  return (
    <section style={{
      background: t.panel, border: `0.5px solid ${t.line}`, borderRadius: 16,
      padding: '20px 20px 22px', marginTop: 22, backdropFilter: 'blur(12px)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: accent, flexShrink: 0, boxShadow: `0 0 10px ${accent}` }} />
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

// اسپارک‌لاین نرخ فروش — جدیدترین سمت چپ (هماهنگ با RTL)، با tooltip تاریخ+نرخ روی hover
function Sparkline({ values, periods, color, w, h, t }: {
  values: (number | null)[]; periods: string[]; color: string; w: number; h: number; t: Theme
}) {
  const [hover, setHover] = useState<number | null>(null)
  const nums = values.filter((v): v is number => v !== null && v > 0)
  if (nums.length < 2) return null
  const min = Math.min(...nums), max = Math.max(...nums)
  const range = max - min || 1
  const n = values.length
  const x = (i: number) => (i / (n - 1)) * w   // قدیمی چپ، جدید راست
  const y = (v: number) => h - ((v - min) / range) * (h - 5) - 2.5
  // یک خط پیوسته از همه نقاط موجود — از روی ماه‌های خالی پل می‌زند (قطع نمی‌شود)
  const pres = values.map((v, i) => ({ v, i })).filter(p => p.v !== null && p.v > 0) as { v: number; i: number }[]
  const line = pres.map(p => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const fillPts = `${x(pres[0].i).toFixed(1)},${h} ${line} ${x(pres[pres.length - 1].i).toFixed(1)},${h}`
  const newest = pres[pres.length - 1]   // جدیدترین = بزرگ‌ترین اندیس در سمت راست
  const gid = `spk-${Math.random().toString(36).slice(2, 8)}`
  const hv = hover !== null ? values[hover] : null
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fillPts} fill={`url(#${gid})`} stroke="none" />
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        {hover !== null && hv !== null && (
          <line x1={x(hover)} y1={0} x2={x(hover)} y2={h} stroke={color} strokeWidth={0.8} strokeOpacity={0.4} strokeDasharray="2 2" />
        )}
        <circle cx={x(newest.i)} cy={y(newest.v)} r={2.8} fill={color} stroke={color} strokeWidth={3} strokeOpacity={0.25} />
        {hover !== null && hv !== null && <circle cx={x(hover)} cy={y(hv)} r={3.4} fill={color} stroke={t.panel} strokeWidth={1.5} />}
        {/* نواحی hover — کل ارتفاع هر ماه */}
        {pres.map(p => (
          <rect key={p.i} x={x(p.i) - w / (2 * (n - 1))} y={0} width={w / (n - 1)} height={h}
            fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHover(p.i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && hv !== null && (
        <div style={{
          position: 'absolute', left: x(hover), top: -6, transform: 'translate(-50%, -100%)',
          background: t.isDark ? 'rgba(2,6,14,0.96)' : 'rgba(255,255,255,0.98)',
          border: `0.5px solid ${color}66`, borderRadius: 8, padding: '5px 9px', whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 5, boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        }}>
          <div style={{ fontSize: 9.5, color: t.muted, marginBottom: 2 }}>{monthLabel(periods[hover])}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color }}>{rateFmt(hv)}</div>
        </div>
      )}
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

  // روند نرخ فروش ۳ محصول اصلی در طول ماه‌ها
  const rateNames = [...last.products]
    .filter(p => (p.amount_m ?? 0) > 0 && (p.rate_m ?? 0) > 0)
    .sort((a, b) => (b.amount_m ?? 0) - (a.amount_m ?? 0))
    .slice(0, 3)
    .map(p => p.name)
  const rateSeries = rateNames.map(name => {
    const vals = months.map(m => {
      const pr = m.products.find(x => x.name === name)
      return pr && pr.rate_m ? pr.rate_m : null
    })
    const nums = vals.filter((v): v is number => v !== null && v > 0)
    const first = nums[0] ?? null
    const lastV = nums[nums.length - 1] ?? null
    return { name, vals, periods: months.map(m => m.period), latest: lastV, chg: growth(lastV, first) }
  }).filter(s => s.vals.filter(v => v).length >= 2)

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
      <div style={{ display: 'flex', direction: 'ltr', alignItems: 'flex-end', gap: isMobile ? 3 : 6, height: 120, minWidth: 0 }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25 }}>
                <div style={{ fontSize: isMobile ? 7.5 : 9, color: isLast ? t.text : t.muted, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>
                  {monthLabel(m.period).split(' ')[0].slice(0, isMobile ? 3 : 8)}
                </div>
                <div style={{ fontSize: isMobile ? 6.5 : 8, color: isLast ? M_ACCENT : t.muted, opacity: isLast ? 1 : 0.65, whiteSpace: 'nowrap' }}>
                  {(monthLabel(m.period).split(' ')[1] || '').slice(-2)}
                </div>
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

      {/* روند نرخ فروش محصولات اصلی */}
      {rateSeries.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: t.muted, margin: '22px 0 12px' }}>
            روند نرخ فروش محصولات اصلی (میلیون تومان بر واحد)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {rateSeries.map(s => {
              const trend = s.chg === null ? t.muted : s.chg >= 0 ? GREEN : RED
              return (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, minWidth: 0 }}>
                  <div style={{ flex: '0 0 auto', width: isMobile ? 96 : 150, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ fontSize: 9.5, color: t.muted }}>نرخ فعلی: {rateFmt(s.latest)}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                    <Sparkline values={s.vals} periods={s.periods} color={trend} w={isMobile ? 130 : 320} h={34} t={t} />
                  </div>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    fontSize: 10.5, fontWeight: 700, flexShrink: 0, minWidth: 56, justifyContent: 'flex-start',
                    color: trend,
                  }}>
                    {s.chg !== null && <ToneIcon tone={s.chg >= 0 ? 'pos' : 'neg'} size={12} />}
                    {gPct(s.chg)}
                  </span>
                </div>
              )
            })}
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

// ————— دستیار تحلیلگر هوشمند (RAG کتاب‌های بنیادی + داده کدال + Gemini) —————
type ChatMsg = { role: 'user' | 'ai'; text: string }

const SUGGESTED_QS = [
  'وضعیت بنیادی این سهم چطوره؟',
  'روند فروش و سودآوری رو تحلیل کن',
  'EPS و رشدش نسبت به سال قبل چطوره؟',
]

// حذف نشانه‌گذاری markdown از جواب (bold/heading) برای نمایش تمیز
const stripMd = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,4}\s*/gm, '').replace(/^\s*[*-]\s+/gm, '• ')

function AiChatSection({ symbol, t, isMobile }: { symbol: string; t: Theme; isMobile: boolean }) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const send = async (raw?: string) => {
    const q = (raw ?? input).trim()
    if (!q || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: q }])
    setLoading(true)
    try {
      // اگر کاربر نماد را نگفته، به سوال اضافه کن تا داده کدال درست وصل شود
      const full = q.includes(symbol) ? q : `درباره نماد ${symbol}: ${q}`
      const res = await fetch(AI_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: full }),
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'ai', text: stripMd(data.answer || data.error || 'خطایی رخ داد.') }])
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'ارتباط با دستیار برقرار نشد. کمی بعد دوباره امتحان کنید.' }])
    }
    setLoading(false)
  }

  return (
    <SectionCard title="دستیار تحلیلگر" badge="هوش مصنوعی" accent={AI_ACCENT} t={t}>
      {messages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, maxHeight: 420, overflowY: 'auto' }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-start' : 'stretch',
              maxWidth: m.role === 'user' ? '85%' : '100%',
              padding: '10px 14px', borderRadius: 12, lineHeight: 2,
              fontSize: isMobile ? 12 : 12.5,
              whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? `${AI_ACCENT}14` : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,46,0.03)'),
              border: `0.5px solid ${m.role === 'user' ? `${AI_ACCENT}40` : t.line}`,
              color: t.text,
            }}>
              {m.text}
            </div>
          ))}
          {loading && (
            <div style={{ fontSize: 12, color: t.muted, padding: '6px 4px' }}>
              در حال تحلیل… (ممکن است تا ۳۰ ثانیه طول بکشد)
            </div>
          )}
        </div>
      )}

      {messages.length === 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {SUGGESTED_QS.map(q => (
            <button key={q} onClick={() => send(q)} disabled={loading} style={{
              fontSize: 11.5, padding: '7px 12px', borderRadius: 9, cursor: 'pointer',
              background: `${AI_ACCENT}10`, border: `0.5px solid ${AI_ACCENT}35`, color: t.text,
              fontFamily: 'inherit',
            }}>{q}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder={`سوالت درباره ${symbol} رو بپرس…`}
          disabled={loading}
          style={{
            flex: 1, minWidth: 0, padding: '11px 14px', borderRadius: 11, fontSize: 12.5,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,30,46,0.04)',
            border: `0.5px solid ${t.line}`, color: t.text, outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{
          padding: '11px 18px', borderRadius: 11, fontSize: 12.5, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
          background: `${AI_ACCENT}18`, border: `0.5px solid ${AI_ACCENT}50`, color: AI_ACCENT,
          opacity: loading || !input.trim() ? 0.5 : 1, flexShrink: 0,
          fontFamily: 'inherit',
        }}>
          {loading ? '…' : 'بپرس'}
        </button>
      </div>

      <div style={{ fontSize: 9.5, color: t.muted, marginTop: 12, lineHeight: 1.7 }}>
        پاسخ‌ها با هوش مصنوعی بر پایه کتاب‌های تحلیل بنیادی و گزارش‌های کدال تولید می‌شوند و توصیه خرید یا فروش نیستند.
      </div>
    </SectionCard>
  )
}
