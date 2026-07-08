'use client'

/**
 * ماشین‌حساب ارزش‌گذاری سهام — مدل‌های تنزیل سود نقدی (DDM)
 * فرمول‌ها کتابی‌اند (مدیریت مالی راس و مشابه)، بدون کپی‌رایت.
 * تفاوت با ابزارهای مشابه: EPS واقعی از گزارش‌های کدال (public/reports/<symbol>.json)
 * و قیمت لحظه‌ای از /api/stocks-industries پیش‌فرض پر می‌شوند؛ کاربر فقط
 * فرضیات رشد/بازده مورد انتظار را با اسلایدر تنظیم می‌کند.
 *
 * پوشش داده: فقط نمادهایی که در خط گزارش‌های شرکت‌ها EPS سالانه دارند (در حال تکمیل).
 * برای بقیه، کاربر می‌تواند EPS را دستی وارد کند (برچسب «دستی» به‌جای «واقعی کدال»).
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { darkTheme, lightTheme } from '../../lib/theme'
import { useIsMobile } from '../../lib/useIsMobile'
import { Skeleton, SkeletonBlock } from '../components/ui/Skeleton'

type Sym = { l18: string; l30: string; pl: number | null; plp: number | null; pe: number | null }
type Industry = { symbols: Sym[] }
type Payload = { industries: Industry[] }
type RQuarter = { period: string; months: number; audited: boolean; eps: number | null }
type Reports = { symbol: string; quarters: RQuarter[] }

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: 0 })
const rial = (v: number) => `${fa(v)} ریال`
const normQ = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()
const ORANGE = '#f59e0b'
const BLUE = '#3b82f6'

export default function ValuationCalculatorPage() {
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  const t = isDark ? darkTheme : lightTheme
  const cream = isDark ? '#ddd5bd' : '#6B5A3A'

  const [payload, setPayload] = useState<Payload | null>(null)
  const [query, setQuery] = useState('')
  const [sym, setSym] = useState<Sym | null>(null)
  const [reports, setReports] = useState<Reports | null | 'missing'>(null)

  // ورودی‌های قابل‌تنظیم — پیش‌فرض بعد از انتخاب نماد محاسبه می‌شود
  const [eps, setEps] = useState(0)
  const [epsManual, setEpsManual] = useState(false)
  const [payout, setPayout] = useState(50)   // درصد سود تقسیمی از EPS (فرض — داده واقعی تقسیم سود نداریم)
  const [r, setR] = useState(30)             // نرخ بازده مورد انتظار٪
  const [g, setG] = useState(15)             // نرخ رشد بلندمدت٪
  const [gHigh, setGHigh] = useState(22)     // نرخ رشد فوق‌العاده٪ (مدل چندمرحله‌ای)
  const [years, setYears] = useState(5)      // طول دوره رشد فوق‌العاده
  const [gTerm, setGTerm] = useState(12)     // نرخ رشد پایدار بعد از دوره فوق‌العاده٪

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    fetch('/api/stocks-industries').then(r => (r.ok ? r.json() : null)).then(setPayload).catch(() => setPayload(null))
  }, [])

  const allSymbols = useMemo(() => {
    if (!payload) return []
    const out: Sym[] = []
    for (const ind of payload.industries) out.push(...ind.symbols)
    return out
  }, [payload])

  const matches = useMemo(() => {
    if (query.trim().length < 2) return []
    const q = normQ(query)
    return [
      ...allSymbols.filter(s => s.l18.includes(q)),
      ...allSymbols.filter(s => !s.l18.includes(q) && s.l30.includes(q)),
    ].slice(0, 8)
  }, [allSymbols, query])

  // انتخاب نماد → واکشی گزارش‌ها + پرکردن پیش‌فرض‌ها از EPS واقعی
  useEffect(() => {
    if (!sym) return
    setReports(null)
    setEpsManual(false)
    fetch(`/reports/${encodeURIComponent(sym.l18.replace(/\s+/g, '-'))}.json`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((j: Reports) => setReports(j))
      .catch(() => setReports('missing'))
  }, [sym])

  useEffect(() => {
    if (!reports || reports === 'missing') {
      if (reports === 'missing') { setEps(0); setEpsManual(true) }
      return
    }
    const annual = reports.quarters
      .filter(q => q.months === 12 && typeof q.eps === 'number' && q.eps! > 0)
      .sort((a, b) => a.period.localeCompare(b.period))
    if (annual.length === 0) { setEps(0); setEpsManual(true); return }
    const latest = annual[annual.length - 1]
    setEps(Math.round(latest.eps!))
    setEpsManual(false)
    if (annual.length >= 2) {
      const first = annual[0]
      const yrs = annual.length - 1
      const cagr = (Math.pow(latest.eps! / first.eps!, 1 / yrs) - 1) * 100
      if (isFinite(cagr) && cagr > -50 && cagr < 200) setG(Math.round(cagr))
    }
  }, [reports])

  // ── محاسبات ارزش‌گذاری ──
  const calc = useMemo(() => {
    const R = r / 100, G = g / 100, GH = gHigh / 100, GT = gTerm / 100
    const D0 = eps * (payout / 100)
    const D1 = D0 * (1 + G)
    const zeroGrowth = R > 0 ? D0 / R : null
    const gordon = R > G ? D1 / (R - G) : null
    // مدل چندمرحله‌ای: n سال رشد فوق‌العاده + ارزش پایانی با رشد پایدار
    let multiStage: number | null = null
    if (R > GT) {
      let pv = 0
      let d = D0
      for (let y = 1; y <= years; y++) { d = d * (1 + GH); pv += d / Math.pow(1 + R, y) }
      const dTerm = d * (1 + GT)
      const terminal = dTerm / (R - GT)
      pv += terminal / Math.pow(1 + R, years)
      multiStage = pv
    }
    const noGrowthValue = R > 0 ? eps / R : null
    const npvgo = gordon !== null && noGrowthValue !== null ? gordon - noGrowthValue : null
    const peg = sym?.pe && g > 0 ? sym.pe / g : null
    const impliedReturn = sym?.pl && sym.pl > 0 ? (D1 / sym.pl + G) * 100 : null
    return { D0, D1, zeroGrowth, gordon, multiStage, noGrowthValue, npvgo, peg, impliedReturn }
  }, [eps, payout, r, g, gHigh, years, gTerm, sym])

  const verdict = (intrinsic: number | null) => {
    if (intrinsic === null || !sym?.pl) return null
    const ratio = intrinsic / sym.pl
    if (ratio > 1.08) return { label: 'زیر ارزش ذاتی', color: t.green }
    if (ratio < 0.92) return { label: 'بالای ارزش ذاتی', color: t.red }
    return { label: 'نزدیک ارزش منصفانه', color: cream }
  }

  const panelStyle = (accent: string): React.CSSProperties => ({
    background: `linear-gradient(160deg, ${accent}0e, transparent 45%), ${t.panel}`,
    border: `0.5px solid ${t.border}`, borderTop: `2px solid ${accent}66`,
    borderRadius: 14, padding: '18px 20px', backdropFilter: 'blur(12px)', minWidth: 0,
    boxShadow: t.cardShadow,
  })

  const Slider = ({ label, value, onChange, min, max, step = 1, accent, suffix = '٪' }: {
    label: string; value: number; onChange: (v: number) => void
    min: number; max: number; step?: number; accent: string; suffix?: string
  }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 8 }}>
        <span style={{ color: t.muted }}>{label}</span>
        <span style={{ color: accent, fontWeight: 800, fontFamily: 'system-ui, sans-serif' }}>{fa(value, step < 1 ? 1 : 0)}{suffix}</span>
      </div>
      <input
        className="vs-slider" type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ ['--vs-track' as any]: `${t.border}`, ['--vs-thumb' as any]: accent }}
      />
    </div>
  )

  const ResultCard = ({ title, formula, value, accent, big }: {
    title: string; formula: string; value: number | null; accent: string; big?: boolean
  }) => {
    const v = verdict(value)
    return (
      <div style={{ ...panelStyle(accent), padding: big ? '22px 24px' : '16px 18px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: t.textBright, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 10.5, color: cream, fontFamily: 'system-ui, sans-serif', marginBottom: 10, opacity: 0.85 }}>{formula}</div>
        {value === null ? (
          <div style={{ fontSize: 13, color: t.muted }}>در این حالت (r ≤ نرخ رشد) مدل معتبر نیست — بازده مورد انتظار را بالاتر ببرید</div>
        ) : (
          <>
            <div style={{
              fontSize: big ? 26 : 19, fontWeight: 900, color: accent, fontFamily: 'system-ui, sans-serif',
              textShadow: isDark ? `0 0 24px ${accent}44` : 'none', marginBottom: v ? 8 : 0,
            }}>{rial(value)}</div>
            {v && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: v.color, background: `${v.color}16`,
                border: `1px solid ${v.color}44`, borderRadius: 999, padding: '3px 11px',
              }}>{v.label}</span>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '24px 16px 60px' : '32px 24px 64px' }}>

        <Link href="/analysis" style={{ fontSize: 12, color: t.muted, textDecoration: 'none' }}>← بازگشت به تحلیل</Link>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textBright, margin: 0 }}>ماشین‌حساب ارزش‌گذاری سهام</h1>
          <span style={{
            fontSize: 11, color: '#F5B93E', fontWeight: 800, background: '#F5B93E16',
            border: '0.5px solid #F5B93E4d', borderRadius: 999, padding: '3px 11px',
          }}>مدل‌های تنزیل سود نقدی</span>
        </div>
        <div style={{ fontSize: 12.5, color: t.muted, marginBottom: 22 }}>
          ارزش ذاتی سهم را با مدل رشد گوردون، مدل چندمرحله‌ای و NPVGO تخمین بزنید — EPS از گزارش‌های واقعی کدال، فرضیات رشد و بازده با اسلایدر
        </div>

        {/* ── جستجوی نماد ── */}
        <div style={{ ...panelStyle(t.brand2), marginBottom: 20, position: 'relative' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright, marginBottom: 10 }}>نماد مورد نظر را انتخاب کنید</div>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setSym(null) }}
            placeholder="نماد یا نام شرکت… مثلاً: فولاد"
            style={{
              width: '100%', boxSizing: 'border-box', background: t.inputBg,
              border: `1px solid ${t.borderStrong}`, borderRadius: 10,
              padding: '10px 14px', fontSize: 13, color: t.text,
              fontFamily: 'inherit', outline: 'none', direction: 'rtl',
            }}
          />
          {matches.length > 0 && !sym && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {matches.map(s => (
                <button key={s.l18} onClick={() => { setSym(s); setQuery(s.l18) }} style={{
                  all: 'unset', cursor: 'pointer', padding: '8px 10px', borderRadius: 8,
                  fontSize: 12, color: t.text, background: `${t.accent}0a`,
                  display: 'flex', justifyContent: 'space-between', gap: 8,
                }}>
                  <span><b style={{ color: t.text }}>{s.l18}</b><span style={{ color: cream, fontSize: 11, marginRight: 8 }}>{s.l30}</span></span>
                  <span style={{ color: t.muted, fontSize: 11, flexShrink: 0 }}>{s.pl ? rial(s.pl) : '—'}</span>
                </button>
              ))}
            </div>
          )}
          {!payload && <div style={{ marginTop: 10 }}><Skeleton width={200} height={12} /></div>}
        </div>

        {sym && (
          <>
            {/* ── نوار وضعیت نماد ── */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: t.textBright }}>{sym.l18}</div>
              <span style={{ fontSize: 12.5, color: cream }}>{sym.l30}</span>
              <span style={{ fontSize: 12, color: t.muted }}>قیمت فعلی: <b style={{ color: t.text, fontFamily: 'system-ui, sans-serif' }}>{sym.pl ? rial(sym.pl) : '—'}</b></span>
              {sym.pe != null && <span style={{ fontSize: 12, color: t.muted }}>P/E: <b style={{ color: t.text, fontFamily: 'system-ui, sans-serif' }}>{fa(sym.pe, 1)}</b></span>}
              {reports === null ? (
                <Skeleton width={90} height={20} radius={999} />
              ) : (
                <span style={{
                  fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '3px 11px',
                  color: epsManual ? t.muted : t.green,
                  background: epsManual ? `${t.border}` : `${t.green}16`,
                  border: `1px solid ${epsManual ? t.borderStrong : t.green + '44'}`,
                }}>{epsManual ? 'EPS دستی' : 'EPS واقعی کدال'}</span>
              )}
            </div>

            {reports === null ? (
              <SkeletonBlock height={300} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '340px 1fr', gap: 16 }}>

                {/* ── پنل ورودی‌ها ── */}
                <div style={panelStyle(t.accent)}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: t.textBright, marginBottom: 4 }}>سود هر سهم (EPS)</div>
                  <input
                    type="number" value={eps} onChange={e => { setEps(Number(e.target.value)); setEpsManual(true) }}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: t.inputBg, border: `1px solid ${t.borderStrong}`,
                      borderRadius: 9, padding: '9px 12px', fontSize: 14, fontWeight: 800, color: t.accent,
                      fontFamily: 'system-ui, sans-serif', outline: 'none', marginBottom: 4,
                    }}
                  />
                  <div style={{ fontSize: 10.5, color: cream, marginBottom: 16 }}>
                    {epsManual ? 'این نماد هنوز EPS واقعی در پایگاه‌داده ما ندارد — عدد را از آخرین گزارش کدال دستی وارد کنید' : 'آخرین سود سالانه هر سهم از گزارش کدال — قابل ویرایش'} (ریال)
                  </div>

                  <Slider label="درصد تقسیم سود از EPS (فرض)" value={payout} onChange={setPayout} min={0} max={100} accent={ORANGE} />
                  <Slider label="نرخ بازده مورد انتظار (r)" value={r} onChange={setR} min={5} max={60} accent={t.brand2} />
                  <Slider label="نرخ رشد بلندمدت سود (g)" value={g} onChange={setG} min={-20} max={50} accent={t.green} />

                  <div style={{ height: 1, background: t.border, margin: '14px 0' }} />
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: t.textBright, marginBottom: 12 }}>فرضیات مدل چندمرحله‌ای</div>
                  <Slider label="نرخ رشد فوق‌العاده (سال‌های اول)" value={gHigh} onChange={setGHigh} min={0} max={80} accent={t.green} />
                  <Slider label="طول دوره رشد فوق‌العاده" value={years} onChange={setYears} min={1} max={15} accent={cream} suffix=" سال" />
                  <Slider label="نرخ رشد پایدار پس از آن" value={gTerm} onChange={setGTerm} min={0} max={30} accent={BLUE} />

                  <div style={{ fontSize: 10, color: t.muted, marginTop: 4, lineHeight: 1.9 }}>
                    D₀ (سود نقدی فرضی هر سهم) = {rial(Math.round(calc.D0))}
                  </div>
                </div>

                {/* ── پنل نتایج ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <ResultCard title="مدل رشد گوردون (Gordon Growth)" formula="P₀ = D₁ / (r − g)" value={calc.gordon} accent={t.accent} big />

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                    <ResultCard title="مدل چندمرحله‌ای (رشد فوق‌العاده)" formula={`Σ Dₜ/(1+r)ᵗ + ارزش پایانی`} value={calc.multiStage} accent={t.brand2} />
                    <ResultCard title="مدل بدون رشد (سهام ممتاز)" formula="P = D₀ / r" value={calc.zeroGrowth} accent={cream} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
                    <div style={panelStyle(ORANGE)}>
                      <div style={{ fontSize: 11.5, color: t.muted, marginBottom: 6 }}>NPVGO (ارزش فرصت‌های رشد)</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: ORANGE, fontFamily: 'system-ui, sans-serif' }}>
                        {calc.npvgo === null ? '—' : rial(Math.round(calc.npvgo))}
                      </div>
                      <div style={{ fontSize: 10, color: cream, marginTop: 4 }}>ارزش بدون رشد: {calc.noGrowthValue === null ? '—' : rial(Math.round(calc.noGrowthValue))}</div>
                    </div>
                    <div style={panelStyle(t.green)}>
                      <div style={{ fontSize: 11.5, color: t.muted, marginBottom: 6 }}>نسبت PEG</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: t.green, fontFamily: 'system-ui, sans-serif' }}>
                        {calc.peg === null ? '—' : fa(calc.peg, 2)}
                      </div>
                      <div style={{ fontSize: 10, color: cream, marginTop: 4 }}>{calc.peg !== null && calc.peg < 1 ? 'کمتر از ۱ — نسبت به رشد ارزان' : calc.peg !== null ? 'بیشتر از ۱ — نسبت به رشد گران' : 'P/E یا رشد در دسترس نیست'}</div>
                    </div>
                    <div style={panelStyle(t.red)}>
                      <div style={{ fontSize: 11.5, color: t.muted, marginBottom: 6 }}>بازده ضمنی بازار</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: t.red, fontFamily: 'system-ui, sans-serif' }}>
                        {calc.impliedReturn === null ? '—' : `${fa(calc.impliedReturn, 1)}٪`}
                      </div>
                      <div style={{ fontSize: 10, color: cream, marginTop: 4 }}>با فرض قیمت فعلی و رشد g انتخابی</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ fontSize: 10, color: cream, marginTop: 22, textAlign: 'center', opacity: 0.75 }}>
              فرمول‌ها بر پایه مدل‌های استاندارد تنزیل سود نقدی (DDM) — این ابزار تحلیل کمکی است و توصیه سرمایه‌گذاری نیست.
              درصد تقسیم سود، بازده مورد انتظار و نرخ‌های رشد، فرض‌های قابل‌تنظیم شما هستند نه داده رسمی.
            </div>
          </>
        )}
      </div>
    </main>
  )
}
