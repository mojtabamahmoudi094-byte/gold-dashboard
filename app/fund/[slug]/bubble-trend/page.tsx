'use client'

// روند حباب صندوق — آرشیو نامحدود
// دو نمایش: میله‌ای (بالای صفر قرمز=حباب، زیر صفر سبز=تخفیف) و خطی دو رنگ
// + جایگاه حباب واقعی نسبت به عادتِ خودِ صندوق (صدک) + راهنما

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabase'
import { darkTheme, lightTheme, shouldUseDark } from '../../../../lib/theme'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { SubPageHeader, cream } from '../fundShared'

const RED = '#FF4D6A'   // حباب (مثبت)
const GREEN = '#00E5A0' // تخفیف (منفی)

type BubbleRow = {
  trade_date: string
  bubble_asmi: number | null
  bubble_zati: number | null
  bubble_vaqei: number | null
  bubble_vaqei_pctile: number | null
  bubble_vaqei_sample: number | null
}
type Range = 30 | 90 | 365 | 'all'

const valOf = (r: BubbleRow) => r.bubble_vaqei ?? r.bubble_asmi ?? 0

export default function FundBubbleTrendPage() {
  const params = useParams()
  const slug = decodeURIComponent((params?.slug as string) || '')
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [asset, setAsset] = useState<any>(null)
  const [hist, setHist] = useState<BubbleRow[] | null>(null)
  const [range, setRange] = useState<Range>(90)
  const [view, setView] = useState<'bar' | 'line'>('line')

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    if (!slug) return
    supabase.from('assets').select('*').or(`slug.eq."${slug}",name.eq."${slug}"`).limit(1).maybeSingle().then(({ data: a }) => {
      setAsset(a ?? null)
      if (!a) { setHist([]); return }
      supabase.from('fund_bubble_daily')
        .select('trade_date, bubble_asmi, bubble_zati, bubble_vaqei, bubble_vaqei_pctile, bubble_vaqei_sample')
        .eq('fund_name', a.name).order('trade_date', { ascending: true }).limit(3000)
        .then(({ data }) => setHist(data ?? []))
    })
  }, [slug])

  const t: any = isDark ? darkTheme : lightTheme
  const cr = cream(t)

  const slice = hist == null ? [] : (range === 'all' ? hist : hist.slice(-range))

  const panelStyle: React.CSSProperties = {
    background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 14,
    padding: '16px 18px', backdropFilter: 'blur(12px)',
  }

  return (
    <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SubPageHeader t={t} slug={slug} assetName={asset?.name ?? slug} crumb="روند حباب" />

        {/* راهنما */}
        <div style={{ ...panelStyle, padding: '14px 16px', background: `${t.accent}0d`, border: `0.5px solid ${t.accent}30` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright, marginBottom: 8 }}>راهنمای روند حباب</div>
          <div style={{ fontSize: 11.5, color: cr, lineHeight: 2 }}>
            <b style={{ color: RED }}>حباب مثبت (قرمز)</b> یعنی قیمت صندوق بالاتر از ارزش ذاتی دارایی‌هایش است؛ خرید در حباب بالا ریسک دارد.
            <br />
            <b style={{ color: GREEN }}>حباب منفی / تخفیف (سبز)</b> یعنی صندوق ارزان‌تر از دارایی‌های زیرمجموعه‌اش معامله می‌شود.
            <br />
            «حباب واقعی» = حباب اسمی (نسبت به NAV) + حباب ذاتی (نسبت به قیمت روز سکه/شمش در بورس کالا).
            <br />
            نوار «عادتِ خودِ صندوق» جایگاه حباب امروز را در میان کل تاریخچهٔ همین صندوق نشان می‌دهد؛ هر صندوق عادت حبابی متفاوتی دارد.
          </div>
        </div>

        {/* صدک عادتِ خودِ صندوق */}
        {slice.length > 0 && (() => {
          const stat = [...slice].reverse().find(r => r.bubble_vaqei_pctile != null)
          if (!stat || stat.bubble_vaqei_pctile == null) return null
          const p = stat.bubble_vaqei_pctile
          const cheap = p <= 40, rich = p >= 60
          const barColor = cheap ? GREEN : rich ? RED : t.muted
          const verdict = cheap ? 'کم‌تر از معمولِ خودش (تاریخاً ارزان‌تر)' : rich ? 'بیش‌تر از معمولِ خودش (تاریخاً گران‌تر)' : 'نزدیک میانگین عادتِ خودش'
          return (
            <div style={{ ...panelStyle, padding: '12px 14px', background: `${barColor}12`, border: `0.5px solid ${barColor}30` }}>
              <div style={{ fontSize: 12, color: t.textBright, fontWeight: 600, marginBottom: 10 }}>
                حباب واقعی نسبت به عادتِ خودِ صندوق: {verdict}
              </div>
              <div style={{ position: 'relative', height: 8, borderRadius: 999, background: t.border, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', insetInlineStart: `calc(${p}% - 2px)`, top: -2, bottom: -2, width: 4, borderRadius: 2, background: barColor }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: t.muted, marginTop: 6 }}>
                <span>کم‌ترین</span>
                <span>صدک {p.toLocaleString('fa-IR')} از {(stat.bubble_vaqei_sample ?? 0).toLocaleString('fa-IR')} روز</span>
                <span>بیش‌ترین</span>
              </div>
            </div>
          )
        })()}

        {/* کنترل‌ها: نوع نمایش + بازهٔ آرشیو */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['line', 'bar'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                background: view === v ? t.accent : 'transparent', color: view === v ? '#0a0e14' : t.muted,
                border: `0.5px solid ${view === v ? t.accent : t.border}`,
              }}>{v === 'line' ? 'نمودار خطی' : 'نمودار میله‌ای'}</button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: t.muted }}>بازه:</span>
          {([30, 90, 365, 'all'] as Range[]).map(r => (
            <button key={String(r)} onClick={() => setRange(r)} style={{
              fontSize: 11, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              background: range === r ? t.accent : 'transparent', color: range === r ? '#0a0e14' : t.muted,
              border: `0.5px solid ${range === r ? t.accent : t.border}`,
            }}>{r === 'all' ? `همه (${(hist?.length ?? 0).toLocaleString('fa-IR')})` : `${r.toLocaleString('fa-IR')} روزه`}</button>
          ))}
        </div>

        {hist == null && <div style={{ color: t.muted, fontSize: 13, padding: 40, textAlign: 'center' }}>در حال دریافت آرشیو…</div>}
        {hist != null && slice.length < 2 && <div style={{ color: t.muted, fontSize: 13, padding: 40, textAlign: 'center' }}>داده کافی برای نمودار نیست</div>}

        {slice.length >= 2 && (
          <div style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright }}>روند حباب واقعی <span style={{ fontSize: 10, color: cr, fontWeight: 400 }}>درصد</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: t.muted }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: RED }} /> حباب
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: t.muted }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: GREEN }} /> تخفیف
              </div>
            </div>
            {view === 'line'
              ? <BubbleLine t={t} cr={cr} points={slice.map(r => ({ date: r.trade_date, v: Math.round(valOf(r) * 10) / 10 }))} />
              : <BubbleBars t={t} slice={slice} />}
          </div>
        )}

        <div style={{ marginTop: 6 }}>
          <Link href={`/fund/${encodeURIComponent(slug)}`} style={{ color: t.accent, fontSize: 13, textDecoration: 'none' }}>← بازگشت به صفحهٔ صندوق</Link>
        </div>
      </div>
    </main>
  )
}

// ── نمودار خطی دو رنگ — بالای صفر قرمز (حباب)، زیر صفر سبز (تخفیف) ──
function BubbleLine({ t, cr, points }: { t: any; cr: string; points: { date: string; v: number }[] }) {
  if (points.length < 2) return null
  const vals = points.map(p => p.v)
  const minV = Math.min(...vals, 0)
  const maxV = Math.max(...vals, 0)
  const range = Math.max(maxV - minV, 0.01)

  const W = Math.max(420, points.length * 30), H = 170, PX = 24, PY = 26
  const chartH = H - PY - 8
  const xOf = (i: number) => PX + (i / (points.length - 1)) * (W - 2 * PX)
  const yOf = (v: number) => PY + (1 - (v - minV) / range) * chartH
  const pts = points.map((p, i) => ({ x: xOf(i), y: yOf(p.v), v: p.v, date: p.date }))

  const linePath = pts.reduce((acc, pt, i) => {
    if (i === 0) return `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
    const prev = pts[i - 1]
    const mx = ((pt.x + prev.x) / 2).toFixed(1)
    return `${acc} C${mx},${prev.y.toFixed(1)} ${mx},${pt.y.toFixed(1)} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
  }, '')
  const zeroY = yOf(0)
  const showLabel = points.length <= 40
  const step = Math.max(1, Math.round(points.length / 8))

  return (
    <div style={{ overflowX: 'auto', direction: 'ltr' }}>
      <svg viewBox={`0 0 ${W} ${H + 22}`} style={{ minWidth: W, width: '100%', overflow: 'visible', display: 'block' }} direction="ltr">
        {[0, 0.33, 0.66, 1].map(f => {
          const gy = PY + f * chartH
          return <line key={f} x1={PX} y1={gy} x2={W - PX} y2={gy} stroke={t.border} strokeWidth={0.5} opacity={0.6} />
        })}
        <line x1={PX} y1={zeroY} x2={W - PX} y2={zeroY} stroke={t.muted} strokeWidth={1} strokeDasharray="5 3" opacity={0.6} />
        <defs>
          <clipPath id="bubAbove"><rect x={0} y={0} width={W} height={zeroY} /></clipPath>
          <clipPath id="bubBelow"><rect x={0} y={zeroY} width={W} height={H + 22 - zeroY} /></clipPath>
        </defs>
        {/* بالای صفر = حباب = قرمز */}
        <path d={linePath} fill="none" stroke={RED} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" clipPath="url(#bubAbove)" />
        {/* زیر صفر = تخفیف = سبز */}
        <path d={linePath} fill="none" stroke={GREEN} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" clipPath="url(#bubBelow)" />
        {pts.map((pt, i) => {
          const col = pt.v >= 0 ? RED : GREEN
          const label = `${pt.v >= 0 ? '+' : ''}${pt.v.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}`
          const lw = label.length * 5.6 + 10
          const lx = Math.min(Math.max(pt.x - lw / 2, PX), W - PX - lw)
          const ly = pt.v >= 0 ? Math.max(pt.y - 20, 2) : Math.min(pt.y + 8, H - 8)
          return (
            <g key={i}>
              {showLabel && (
                <>
                  <rect x={lx} y={ly} width={lw} height={14} rx={3} fill="rgba(0,0,0,0.84)" />
                  <rect x={lx} y={ly} width={lw} height={14} rx={3} fill="none" stroke={col} strokeWidth={0.5} opacity={0.8} />
                  <text x={lx + lw / 2} y={ly + 10} textAnchor="middle" fontSize={8} fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">{label}</text>
                </>
              )}
              <circle cx={pt.x} cy={pt.y} r={showLabel ? 4 : 2.4} fill={col} />
              <title>{`${pt.date}: ${label}٪`}</title>
            </g>
          )
        })}
        {pts.map((pt, i) => (i === 0 || i === pts.length - 1 || i % step === 0) ? (
          <text key={i} x={pt.x} y={H + 16} textAnchor="middle" fontSize={9} fill={cr} fontFamily="Vazirmatn, Arial, sans-serif">
            {pt.date.slice(5)}
          </text>
        ) : null)}
      </svg>
    </div>
  )
}

// ── نمودار میله‌ای بالا/پایین صفر (شکل قبلی) ──
function BubbleBars({ t, slice }: { t: any; slice: BubbleRow[] }) {
  const vals = slice.map(valOf)
  const maxAbs = Math.max(...vals.map(v => Math.abs(v)), 1)
  const barsH = 140
  const half = barsH / 2
  return (
    <div style={{ overflowX: 'auto', direction: 'ltr' }}>
      <div style={{ minWidth: Math.max(320, slice.length * 12) }}>
        <div style={{ position: 'relative', height: barsH }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: half, height: 1, background: t.border }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', direction: 'ltr', gap: slice.length > 60 ? 1 : 2 }}>
            {slice.map((r, i) => {
              const v = valOf(r)
              const barPx = Math.max((Math.abs(v) / maxAbs) * half, 2)
              const up = v >= 0
              return (
                <div key={r.trade_date + i} title={`${r.trade_date}: ${up ? '+' : ''}${v.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`}
                  style={{ flex: 1, minWidth: 0, maxWidth: 14, height: barsH, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: half, display: 'flex', alignItems: 'flex-end' }}>
                    {up && <div style={{ height: barPx, width: '100%', borderRadius: '2px 2px 0 0', background: RED }} />}
                  </div>
                  <div style={{ height: half, display: 'flex', alignItems: 'flex-start' }}>
                    {!up && <div style={{ height: barPx, width: '100%', borderRadius: '0 0 2px 2px', background: GREEN }} />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: t.muted, marginTop: 6 }}>
          <span>{slice[0]?.trade_date}</span>
          <span>{slice[slice.length - 1]?.trade_date}</span>
        </div>
      </div>
    </div>
  )
}
