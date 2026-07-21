'use client'

// رادار پول هوشمند — تجمیع پرتفوی ماهانه ۱۰۰+ صندوق سهامی/اهرمی/بخشی از کدال
// داده از public/portfolio/_radar.json (خروجی scripts/build-portfolio-radar.js)

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AuthGate from '../../../components/AuthGate'
import { darkTheme, lightTheme, shouldUseDark } from '../../../lib/theme'
import { Skeleton, SkeletonBlock } from '../../components/ui/Skeleton'
import { TutorialPanel } from '../../components/ui/TutorialPanel'
import { useIsMobile } from '../../../lib/useIsMobile'

type Holder = [number, number, number]   // [ایندکس صندوق، ارزش م.ت، درصد از NAV]
type RadarStock = {
  n: string; sym?: string; v: number; c: number; b: number; s: number
  e: number[]; x: number[]; h: Holder[]
}
type RadarFund = { s: string; g: string; nav: number; date: string }
type Radar = {
  updated: string; month: string; fundsTotal: number; stale: number
  funds: RadarFund[]; stocks: RadarStock[]
}

const MONTH_NAMES = ['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
// م.ت → نمایش خوانا (از ۱۰۰۰ به بعد: همت)
const fmtBt = (v: number) => (v >= 1000 ? `${fa(v / 1000, 1)} همت` : `${fa(v)} م.ت`)
const normQ = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()

export default function SmartMoneyRadarPage() {
  const [isDark, setIsDark] = useState(true)
  const [data, setData] = useState<Radar | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<RadarStock | null>(null)
  const isMobile = useIsMobile()
  const t = isDark ? darkTheme : lightTheme

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    fetch('/portfolio/_radar.json', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { setData(j); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const views = useMemo(() => {
    if (!data) return null
    const withFlow = data.stocks.map(st => ({ ...st, net: st.b - st.s }))
    const netBuy = [...withFlow].filter(s => s.net > 1).sort((a, b) => b.net - a.net).slice(0, 10)
    const netSell = [...withFlow].filter(s => s.net < -1).sort((a, b) => a.net - b.net).slice(0, 10)
    const popular = [...data.stocks].sort((a, b) => b.c - a.c || b.v - a.v).slice(0, 10)
    const fresh = [...data.stocks].filter(s => s.e.length >= 2)
      .sort((a, b) => b.e.length - a.e.length || b.v - a.v).slice(0, 8)
    const exits = [...data.stocks].filter(s => s.x.length >= 2)
      .sort((a, b) => b.x.length - a.x.length || b.s - a.s).slice(0, 8)
    const totBuy = data.stocks.reduce((s, x) => s + x.b, 0)
    const totSell = data.stocks.reduce((s, x) => s + x.s, 0)
    const totNav = data.funds.reduce((s, f) => s + f.nav, 0)
    return { netBuy, netSell, popular, fresh, exits, totBuy, totSell, totNav }
  }, [data])

  const matches = useMemo(() => {
    if (!data || query.trim().length < 2) return []
    const q = normQ(query)
    // نماد جلوتر از نام — جستجوی «فملی» باید قبل از نام‌های حاوی عبارت بیاید
    return [
      ...data.stocks.filter(s => s.sym && s.sym.includes(q)),
      ...data.stocks.filter(s => !(s.sym && s.sym.includes(q)) && s.n.includes(q)),
    ].slice(0, 8)
  }, [data, query])

  const monthLabel = data ? `${MONTH_NAMES[Number(data.month.split('/')[1])]} ${data.month.split('/')[0]}` : ''

  if (loading) {
    return (
      <AuthGate title="رادار پول هوشمند">
        <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton width={180} height={12} />
          <Skeleton width={280} height={30} radius={10} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} height={80} />)}
          </div>
          <SkeletonBlock height={320} />
        </div>
      </main>
      </AuthGate>
    )
  }

  if (!data || !views) {
    return (
      <AuthGate title="رادار پول هوشمند">
        <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: t.muted, fontSize: 13 }}>داده رادار در دسترس نیست.</div>
        </main>
      </AuthGate>
    )
  }

  const panelStyle = (accent: string): React.CSSProperties => ({
    background: `linear-gradient(160deg, ${accent}0e, transparent 45%), ${t.panel}`,
    border: `0.5px solid ${t.border}`,
    borderTop: `2px solid ${accent}66`, borderRadius: 14,
    padding: '16px 18px', backdropFilter: 'blur(12px)', minWidth: 0,
    boxShadow: t.cardShadow,
  })

  // متن ثانویه (نام کامل شرکت، زیرنویس‌ها) — کرم روشن، خوانا روی قاب تیره
  const cream = isDark ? '#ddd5bd' : '#6B5A3A'

  // نماد پررنگ (هیچ‌وقت بریده نمی‌شود) + نام کامل کرم با ellipsis
  // نکته: overflow:hidden روی span درون‌خطی گلیف آخر فارسی را می‌بُرید — flex شد
  const StockName = ({ st, size = 11.5 }: { st: RadarStock, size?: number }) => (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0, overflow: 'hidden' }}>
      <span style={st.sym
        ? { fontWeight: 800, color: t.text, fontSize: size, flexShrink: 0, whiteSpace: 'nowrap' }
        : { fontWeight: 800, color: t.text, fontSize: size, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }
      }>{st.sym || st.n}</span>
      {st.sym && !isMobile && (
        <span style={{ flex: 1, fontSize: size - 2, color: cream, opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{st.n}</span>
      )}
    </span>
  )

  const fundChip = (fi: number, extra?: string) => {
    const f = data.funds[fi]
    if (!f) return null
    return (
      <Link key={f.g} href={`/fund/${encodeURIComponent(f.g)}`} style={{
        fontSize: 10.5, color: t.accent, textDecoration: 'none',
        background: `${t.accent}12`, border: `0.5px solid ${t.accent}33`,
        borderRadius: 7, padding: '3px 8px', whiteSpace: 'nowrap',
      }}>
        {f.s}{extra ? ` · ${extra}` : ''}
      </Link>
    )
  }

  // ── لیست میله‌ای خرید/فروش خالص ──
  const FlowList = ({ items, color, sign }: { items: (RadarStock & { net: number })[], color: string, sign: 1 | -1 }) => {
    const max = Math.max(...items.map(s => Math.abs(s.net)), 1)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {items.map((st, i) => (
          <button key={st.n} onClick={() => { setSelected(st); setQuery('') }} style={{
            all: 'unset', cursor: 'pointer', display: 'block',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11.5, marginBottom: 4 }}>
              <span style={{
                flexShrink: 0, width: 17, height: 17, borderRadius: 6, fontSize: 9.5, fontWeight: 800,
                color: i < 3 ? color : t.muted, background: i < 3 ? `${color}1c` : `${t.border}88`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
              }}>{fa(i + 1)}</span>
              <StockName st={st} />
              <span style={{ color, fontWeight: 700, flexShrink: 0, fontFamily: 'system-ui, sans-serif', marginRight: 'auto' }}>
                {sign > 0 ? '+' : '−'}{fmtBt(Math.abs(st.net))}
              </span>
            </div>
            <div style={{ height: 5, background: t.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${(Math.abs(st.net) / max) * 100}%`, borderRadius: 3,
                background: `linear-gradient(to left, ${color}, ${color}77)`,
                boxShadow: `0 0 8px ${color}55`,
              }} />
            </div>
          </button>
        ))}
        {items.length === 0 && <div style={{ fontSize: 11, color: cream }}>موردی یافت نشد</div>}
      </div>
    )
  }

  const stat = (label: string, value: string, color?: string) => {
    const c = color || t.accent
    return (
      <div style={{ ...panelStyle(c), padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: t.muted, marginBottom: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: c, boxShadow: `0 0 7px ${c}` }} />
          {label}
        </div>
        <div style={{
          fontSize: 18, fontWeight: 800, color: color || t.textBright,
          fontFamily: 'system-ui, sans-serif', textShadow: isDark ? `0 0 22px ${c}44` : 'none',
        }}>{value}</div>
      </div>
    )
  }

  return (
    <AuthGate title="رادار پول هوشمند">
      <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 64px' }}>

        {/* ── سربرگ ── */}
        <Link href="/funds" style={{ fontSize: 12, color: t.muted, textDecoration: 'none' }}>← بازگشت به دیدبان صندوق‌ها</Link>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textBright, margin: 0 }}>رادار پول هوشمند</h1>
          <span style={{
            fontSize: 11, color: '#F5B93E', fontWeight: 800, background: '#F5B93E16',
            border: '0.5px solid #F5B93E4d', borderRadius: 999, padding: '3px 11px',
          }}>گزارش {monthLabel}</span>
        </div>
        <div style={{ fontSize: 12.5, color: t.muted, marginBottom: 22 }}>
          صندوق‌های سهامی، اهرمی و بخشی این ماه چه خریدند و چه فروختند؟ — تجمیع پرتفوی ماهانه {fa(data.funds.length)} صندوق از گزارش‌های رسمی کدال
        </div>

        <TutorialPanel t={t} isDark={isDark} storageKey="radar_tutorial_open" title="چطور از رادار پول هوشمند استفاده کنم؟">
          هر ماه، صندوق‌های سهامی/اهرمی/بخشی صورت‌وضعیت پرتفوی‌شان را در کدال منتشر می‌کنند — این صفحه آن گزارش‌ها را
          کنار هم می‌گذارد تا ببینید «پول هوشمند» (صندوق‌های حرفه‌ای) این ماه کدام سهم‌ها را خریده یا فروخته‌اند.
          نام یا نماد سهم را در کادر جستجو بزنید تا ببینید کدام صندوق‌ها آن را دارند و چند درصد پرتفویشان است؛
          یا از جدول‌های «بیشترین خرید/فروش خالص» و «محبوب‌ترین سهم‌ها» برای کشف روند کلی بازار استفاده کنید.
        </TutorialPanel>

        {/* ── آمار کلی ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {stat('ارزش سهام نزد صندوق‌ها', fmtBt(views.totNav))}
          {stat('خرید ماه صندوق‌ها', fmtBt(views.totBuy), t.green)}
          {stat('فروش ماه صندوق‌ها', fmtBt(views.totSell), t.red)}
          {stat('سهم‌های ردیابی‌شده', fa(data.stocks.length))}
        </div>

        {/* ── جستجوی سهم ── */}
        <div style={{ ...panelStyle(t.brand2), marginBottom: 20, position: 'relative' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright, marginBottom: 10 }}>
            کدام صندوق‌ها این سهم را دارند؟
          </div>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null) }}
            placeholder="نماد یا نام شرکت… مثلاً: فملی"
            style={{
              width: '100%', boxSizing: 'border-box', background: t.inputBg,
              border: `1px solid ${t.borderStrong}`, borderRadius: 10,
              padding: '10px 14px', fontSize: 13, color: t.text,
              fontFamily: 'inherit', outline: 'none', direction: 'rtl',
            }}
          />
          {matches.length > 0 && !selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {matches.map(st => (
                <button key={st.n} onClick={() => { setSelected(st); setQuery(st.sym || st.n) }} style={{
                  all: 'unset', cursor: 'pointer', padding: '8px 10px', borderRadius: 8,
                  fontSize: 12, color: t.text, background: `${t.accent}0a`,
                  display: 'flex', justifyContent: 'space-between', gap: 8,
                }}>
                  <StockName st={st} size={12} />
                  <span style={{ color: t.muted, fontSize: 11, flexShrink: 0 }}>{fa(st.c)} صندوق · {fmtBt(st.v)}</span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: t.textBright }}>
                  {selected.sym || selected.n}
                  {selected.sym && <span style={{ fontSize: 11, fontWeight: 400, color: t.muted, marginRight: 8 }}>{selected.n}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                  <span style={{ color: t.muted }}>{fa(selected.c)} صندوق دارنده</span>
                  <span style={{ color: t.accent, fontWeight: 700 }}>{fmtBt(selected.v)}</span>
                  {selected.b - selected.s > 1 && <span style={{ color: t.green, fontWeight: 700 }}>خرید خالص ماه: {fmtBt(selected.b - selected.s)}</span>}
                  {selected.s - selected.b > 1 && <span style={{ color: t.red, fontWeight: 700 }}>فروش خالص ماه: {fmtBt(selected.s - selected.b)}</span>}
                </div>
              </div>
              {selected.h.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <thead>
                      <tr style={{ color: t.muted, textAlign: 'right' }}>
                        <th style={{ padding: '6px 8px', fontWeight: 600 }}>صندوق</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600 }}>ارزش نزد صندوق</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600 }}>سهم از پرتفوی صندوق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.h.slice(0, 15).map(([fi, val, pct]) => {
                        const f = data.funds[fi]
                        if (!f) return null
                        return (
                          <tr key={f.g} style={{ borderTop: `0.5px solid ${t.border}` }}>
                            <td style={{ padding: '7px 8px' }}>
                              <Link href={`/fund/${encodeURIComponent(f.g)}`} style={{ color: t.accent, textDecoration: 'none', fontWeight: 700 }}>{f.s}</Link>
                            </td>
                            <td style={{ padding: '7px 8px', fontFamily: 'system-ui, sans-serif' }}>{fmtBt(val)}</td>
                            <td style={{ padding: '7px 8px', fontFamily: 'system-ui, sans-serif' }}>
                              {fa(pct, 2)}٪
                              <span style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8, width: 60, height: 4, background: t.border, borderRadius: 2, overflow: 'hidden' }}>
                                <span style={{ display: 'block', height: '100%', width: `${Math.min(pct * 8, 100)}%`, background: t.brand2, borderRadius: 2 }} />
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {selected.h.length > 15 && (
                    <div style={{ fontSize: 10.5, color: cream, marginTop: 6 }}>و {fa(selected.h.length - 15)} صندوق دیگر…</div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: t.muted }}>
                  در پایان {monthLabel} هیچ صندوقی این سهم را در پرتفوی نداشت{selected.s > 0 ? ` — طی ماه ${fmtBt(selected.s)} فروخته و خارج شده‌اند` : ''}.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── خرید و فروش خالص ماه ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={panelStyle(t.green)}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright, marginBottom: 4 }}>بیشترین خرید خالص ماه</div>
            <div style={{ fontSize: 10.5, color: cream, marginBottom: 12 }}>سهم‌هایی که صندوق‌ها در {monthLabel} بیشترین پول را واردشان کردند</div>
            <FlowList items={views.netBuy} color={t.green} sign={1} />
          </div>
          <div style={panelStyle(t.red)}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright, marginBottom: 4 }}>بیشترین فروش خالص ماه</div>
            <div style={{ fontSize: 10.5, color: cream, marginBottom: 12 }}>سهم‌هایی که صندوق‌ها در {monthLabel} بیشترین خروج پول را داشتند</div>
            <FlowList items={views.netSell} color={t.red} sign={-1} />
          </div>
        </div>

        {/* ── محبوب‌ترین سهم‌ها ── */}
        <div style={{ ...panelStyle(t.accent), marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright, marginBottom: 4 }}>محبوب‌ترین سهم‌ها نزد صندوق‌ها</div>
          <div style={{ fontSize: 10.5, color: cream, marginBottom: 12 }}>بر اساس تعداد صندوق‌هایی که سهم را در پرتفوی دارند</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead>
                <tr style={{ color: t.muted, textAlign: 'right' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>شرکت</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>تعداد صندوق</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>ارزش کل</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>بزرگ‌ترین دارنده</th>
                </tr>
              </thead>
              <tbody>
                {views.popular.map(st => (
                  <tr key={st.n} style={{ borderTop: `0.5px solid ${t.border}`, cursor: 'pointer' }}
                    onClick={() => { setSelected(st); setQuery(st.sym || st.n); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                    <td style={{ padding: '8px' }}><StockName st={st} size={12} /></td>
                    <td style={{ padding: '8px', fontFamily: 'system-ui, sans-serif' }}>{fa(st.c)}</td>
                    <td style={{ padding: '8px', fontFamily: 'system-ui, sans-serif' }}>{fmtBt(st.v)}</td>
                    <td style={{ padding: '8px' }}>{st.h[0] ? fundChip(st.h[0][0], `${fa(st.h[0][2], 1)}٪`) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── ورود تازه و خروج کامل ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
          <div style={panelStyle(t.green)}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright, marginBottom: 4 }}>ورودهای تازه</div>
            <div style={{ fontSize: 10.5, color: cream, marginBottom: 12 }}>سهم‌هایی که برای اولین بار به پرتفوی چند صندوق آمدند (عرضه‌های اولیه اینجا دیده می‌شوند)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {views.fresh.map(st => (
                <div key={st.n}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, marginBottom: 5 }}>
                    <StockName st={st} />
                    <span style={{ color: t.green, flexShrink: 0 }}>{fa(st.e.length)} صندوق</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {st.e.slice(0, 6).map(fi => fundChip(fi))}
                    {st.e.length > 6 && <span style={{ fontSize: 10, color: cream, alignSelf: 'center' }}>+{fa(st.e.length - 6)}</span>}
                  </div>
                </div>
              ))}
              {views.fresh.length === 0 && <div style={{ fontSize: 11, color: cream }}>این ماه ورود تازه‌ی گروهی ثبت نشد</div>}
            </div>
          </div>
          <div style={panelStyle(t.red)}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright, marginBottom: 4 }}>خروج‌های کامل</div>
            <div style={{ fontSize: 10.5, color: cream, marginBottom: 12 }}>سهم‌هایی که چند صندوق به‌طور کامل از آن‌ها خارج شدند</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {views.exits.map(st => (
                <div key={st.n}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, marginBottom: 5 }}>
                    <StockName st={st} />
                    <span style={{ color: t.red, flexShrink: 0 }}>{fa(st.x.length)} صندوق</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {st.x.slice(0, 6).map(fi => fundChip(fi))}
                    {st.x.length > 6 && <span style={{ fontSize: 10, color: cream, alignSelf: 'center' }}>+{fa(st.x.length - 6)}</span>}
                  </div>
                </div>
              ))}
              {views.exits.length === 0 && <div style={{ fontSize: 11, color: cream }}>این ماه خروج کامل گروهی ثبت نشد</div>}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 10, color: cream, marginTop: 18, textAlign: 'center' }}>
          منبع: صورت وضعیت پرتفوی ماهانه صندوق‌ها در کدال · واحدها: میلیارد تومان (م.ت) و هزار میلیارد تومان (همت)
        </div>
      </div>
    </main>
    </AuthGate>
  )
}
