'use client'

// آرشیو ورود/خروج پول و سرانه خرید/فروش صندوق‌ها — روزهای گذشته
// انتخاب روز → نمودار میله‌ای همان روز + نمودار خطی روند روزانه کل دسته

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { darkTheme, lightTheme, shouldUseDark } from '../../../../lib/theme'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { safe } from '../../../../lib/format'

const CAT_MAP: Record<string, { label: string; category: string }> = {
  gold:    { label: 'طلا',    category: 'طلا' },
  silver:  { label: 'نقره',   category: 'نقره' },
  saffron: { label: 'زعفران', category: 'زعفران' },
  leveraged: { label: 'اهرمی', category: 'اهرمی' },
  sector:    { label: 'بخشی',  category: 'بخشی' },
  equity:    { label: 'سهامی', category: 'سهامی' },
  'fixed-income': { label: 'درآمد ثابت', category: 'درآمد ثابت' },
}

const GREEN = '#00E5A0'
const RED = '#FF4D6A'

type DayFund = {
  symbol: string
  slug: string
  net: number      // میلیارد تومان
  buyAvg: number   // میلیون تومان
  sellAvg: number  // میلیون تومان
}

// ── نمودار میله‌ای مثبت/منفی ورود/خروج یک روز (همان ظاهر صفحه اصلی صندوق‌ها)
function FlowBars({ t, flows }: { t: any; flows: { symbol: string; net: number; slug: string }[] }) {
  if (flows.length === 0) return null
  const maxAbs = Math.max(...flows.map(f => Math.abs(f.net)), 1)
  const barMaxH = 120
  return (
    <div style={{ overflowX: 'auto' }}>
      {/* +75 فضای پایین — لیبل میله منفی بلند روی ردیف نماد نیفتد */}
      <div style={{ display: 'flex', alignItems: 'center', minWidth: flows.length * 30, height: barMaxH * 2 + 75, position: 'relative', paddingTop: 25 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: barMaxH + 35, height: 1, background: `${t.muted}33` }} />
        {flows.map((f, i) => {
          const isPos = f.net >= 0
          const h = Math.max((Math.abs(f.net) / maxAbs) * barMaxH, 3)
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', height: '100%' }}>
              <div style={{
                position: 'absolute',
                top: isPos ? barMaxH + 35 - h - 20 : barMaxH + 35 + h + 4,
                fontSize: 9, fontWeight: 800,
                color: isPos ? GREEN : RED,
                whiteSpace: 'nowrap',
                textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}>
                {isPos ? '+' : ''}{f.net}
              </div>
              <div style={{
                position: 'absolute',
                top: isPos ? barMaxH + 35 - h : barMaxH + 36,
                width: '60%', maxWidth: 22,
                height: h,
                borderRadius: isPos ? '3px 3px 0 0' : '0 0 3px 3px',
                background: isPos
                  ? 'linear-gradient(0deg, rgba(0,229,160,0.4), rgba(0,229,160,0.8))'
                  : 'linear-gradient(180deg, rgba(255,77,106,0.4), rgba(255,77,106,0.8))',
              }}
                title={`${f.symbol}: ${isPos ? '+' : ''}${f.net} میلیارد تومان`}
              />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', minWidth: flows.length * 30, marginTop: 4 }}>
        {flows.map((f, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: t.muted, lineHeight: 1.2 }}>
            {f.symbol}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── نمودار جفتی سرانه خرید/فروش یک روز
function PerCapBars({ t, caps }: { t: any; caps: { symbol: string; buyAvg: number; sellAvg: number }[] }) {
  if (caps.length === 0) return null
  const maxVal = Math.max(...caps.map(f => Math.max(f.buyAvg, f.sellAvg)), 1)
  const barMaxH = 120
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', minWidth: caps.length * 40, height: barMaxH + 50, position: 'relative', alignItems: 'flex-end', paddingBottom: 30 }}>
        {caps.map((f, i) => {
          const buyH = Math.max((f.buyAvg / maxVal) * barMaxH, 2)
          const sellH = Math.max((f.sellAvg / maxVal) * barMaxH, 2)
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: 7, fontWeight: 800, color: GREEN, marginBottom: 2, fontFamily: 'system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                    {f.buyAvg}
                  </div>
                  <div
                    title={`${f.symbol} سرانه خرید: ${f.buyAvg.toLocaleString('fa-IR')} میلیون تومان`}
                    style={{
                      width: 12, height: buyH,
                      borderRadius: '3px 3px 0 0',
                      background: 'linear-gradient(0deg, rgba(0,229,160,0.4), rgba(0,229,160,0.8))',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: 7, fontWeight: 800, color: RED, marginBottom: 2, fontFamily: 'system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                    {f.sellAvg}
                  </div>
                  <div
                    title={`${f.symbol} سرانه فروش: ${f.sellAvg.toLocaleString('fa-IR')} میلیون تومان`}
                    style={{
                      width: 12, height: sellH,
                      borderRadius: '3px 3px 0 0',
                      background: 'linear-gradient(0deg, rgba(255,77,106,0.4), rgba(255,77,106,0.8))',
                    }}
                  />
                </div>
              </div>
              <div style={{ position: 'absolute', bottom: -24, fontSize: 8, color: t.muted, whiteSpace: 'nowrap' }}>
                {f.symbol}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── نمودار خطی روند روزانه (مجموع خالص ورود/خروج کل دسته) — منفی هم دارد
function TrendLine({ t, cream, points, unit }: {
  t: any; cream: string
  points: { date: string; v: number }[]
  unit: string
}) {
  if (points.length < 2) return null
  const vals = points.map(p => p.v)
  const minV = Math.min(...vals, 0)
  const maxV = Math.max(...vals, 0)
  const range = Math.max(maxV - minV, 0.01)

  const W = Math.max(420, points.length * 46), H = 150, PX = 24, PY = 26
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

  return (
    <div style={{ overflowX: 'auto', direction: 'ltr' }}>
      <svg viewBox={`0 0 ${W} ${H + 22}`} style={{ minWidth: W, width: '100%', overflow: 'visible', display: 'block' }} direction="ltr">
        {[0, 0.33, 0.66, 1].map(f => {
          const gy = PY + f * chartH
          return <line key={f} x1={PX} y1={gy} x2={W - PX} y2={gy} stroke={t.border} strokeWidth={0.5} opacity={0.6} />
        })}
        {/* خط صفر */}
        <line x1={PX} y1={zeroY} x2={W - PX} y2={zeroY} stroke={t.muted} strokeWidth={1} strokeDasharray="5 3" opacity={0.6} />
        {/* خط دو رنگ — بالای صفر سبز، زیر صفر قرمز (کلیپ با خط صفر) */}
        <defs>
          <clipPath id="clipAboveZero">
            <rect x={0} y={0} width={W} height={zeroY} />
          </clipPath>
          <clipPath id="clipBelowZero">
            <rect x={0} y={zeroY} width={W} height={H + 22 - zeroY} />
          </clipPath>
        </defs>
        <path d={linePath} fill="none" stroke={GREEN} strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" clipPath="url(#clipAboveZero)" />
        <path d={linePath} fill="none" stroke={RED} strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" clipPath="url(#clipBelowZero)" />
        {pts.map((pt, i) => {
          const col = pt.v >= 0 ? GREEN : RED
          const label = `${pt.v >= 0 ? '+' : ''}${pt.v.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}`
          const lw = label.length * 5.6 + 10
          const lx = Math.min(Math.max(pt.x - lw / 2, PX), W - PX - lw)
          const ly = pt.v >= 0 ? Math.max(pt.y - 20, 2) : Math.min(pt.y + 8, H - 8)
          return (
            <g key={i}>
              <rect x={lx} y={ly} width={lw} height={14} rx={3} fill="rgba(0,0,0,0.84)" />
              <rect x={lx} y={ly} width={lw} height={14} rx={3} fill="none" stroke={col} strokeWidth={0.5} opacity={0.8} />
              <text x={lx + lw / 2} y={ly + 10} textAnchor="middle"
                fontSize={8} fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
                {label}
              </text>
              <circle cx={pt.x} cy={pt.y} r={4} fill={col} />
              <circle cx={pt.x} cy={pt.y} r={7} fill={col} fillOpacity="0.18" />
              <title>{`${pt.date}: ${label} ${unit}`}</title>
            </g>
          )
        })}
        {pts.map((pt, i) => (
          <text key={i} x={pt.x} y={H + 16} textAnchor="middle"
            fontSize={9} fill={cream} fontFamily="Vazirmatn, Arial, sans-serif">
            {pt.date.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  )
}

function ArchiveInner() {
  const params = useParams()
  const slug = (params?.cat as string) || 'gold'
  const catInfo = CAT_MAP[slug] || CAT_MAP.gold
  const sp = useSearchParams()

  const [isDark, setIsDark] = useState(true)
  const [metric, setMetric] = useState<'flow' | 'percap'>(sp.get('m') === 'percap' ? 'percap' : 'flow')
  const [data, setData] = useState<{ assets: any[]; rows: any[]; dates: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selDate, setSelDate] = useState<string>('')
  const isMobile = useIsMobile()
  const t: any = isDark ? darkTheme : lightTheme
  const cream = isDark ? '#ddd5bd' : '#6B5A3A'

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/funds/archive', { cache: 'no-store' })
      if (!res.ok) { setLoading(false); return }
      const json = await res.json()
      setData(json)
      if (json.dates?.length) setSelDate(json.dates[0])
      setLoading(false)
    }
    load()
  }, [])

  // نگاشت asset_id → صندوق‌های این دسته
  const assetById = useMemo(() => {
    const m = new Map<number, any>()
    for (const a of data?.assets || []) {
      if ((a.category || 'طلا') === catInfo.category) m.set(a.id, a)
    }
    return m
  }, [data, catInfo.category])

  // داده هر روز — per (تاریخ) لیست صندوق‌ها با net و سرانه
  const byDate = useMemo(() => {
    const m = new Map<string, DayFund[]>()
    for (const r of data?.rows || []) {
      const asset = assetById.get(r.asset_id)
      if (!asset) continue
      const pc = safe(r.price_close)
      const buyVal = safe(r.buy_i_volume) * pc
      const sellVal = safe(r.sell_i_volume) * pc
      const net = Math.round((buyVal - sellVal) / 1e9 * 10) / 10
      const buyAvg = safe(r.buy_count_i) > 0 ? Math.round(buyVal / safe(r.buy_count_i) / 1e6) : 0
      const sellAvg = safe(r.sell_count_i) > 0 ? Math.round(sellVal / safe(r.sell_count_i) / 1e6) : 0
      if (!m.has(r.trade_date_shamsi)) m.set(r.trade_date_shamsi, [])
      m.get(r.trade_date_shamsi)!.push({ symbol: asset.name, slug: asset.slug, net, buyAvg, sellAvg })
    }
    return m
  }, [data, assetById])

  // فقط تاریخ‌هایی که برای این دسته داده دارند
  const dates = useMemo(
    () => (data?.dates || []).filter(d => (byDate.get(d) || []).length > 0),
    [data, byDate]
  )

  useEffect(() => {
    if (dates.length && !dates.includes(selDate)) setSelDate(dates[0])
  }, [dates, selDate])

  const dayFunds = useMemo(() => {
    const list = [...(byDate.get(selDate) || [])]
    return metric === 'flow'
      ? list.sort((a, b) => b.net - a.net)
      : list.sort((a, b) => (b.buyAvg / Math.max(b.sellAvg, 1)) - (a.buyAvg / Math.max(a.sellAvg, 1)))
  }, [byDate, selDate, metric])

  // روند روزانه — مجموع خالص ورود/خروج کل دسته (قدیم → جدید)
  const trend = useMemo(() =>
    [...dates].sort().map(d => ({
      date: d,
      v: Math.round((byDate.get(d) || []).reduce((s, f) => s + f.net, 0) * 10) / 10,
    })), [dates, byDate])

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px' : '40px 24px' }}>
        <Link href={`/funds/${slug}`} style={{ fontSize: 12, color: t.muted, textDecoration: 'none' }}>
          ← بازگشت به صندوق‌های {catInfo.label}
        </Link>
        <h1 style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: isMobile ? 19 : 24, fontWeight: 800, margin: '16px 0 4px', color: t.text,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: GREEN, flexShrink: 0, boxShadow: `0 0 10px ${GREEN}` }} />
          آرشیو تابلوخوانی صندوق‌های {catInfo.label}
        </h1>
        <div style={{ fontSize: 11.5, color: t.muted, marginBottom: 16, lineHeight: 1.9 }}>
          همه روزهای معاملاتی ثبت‌شده
        </div>

        {/* انتخاب متریک */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {([['flow', 'ورود و خروج پول حقیقی'], ['percap', 'سرانه خرید و فروش حقیقی']] as const).map(([key, label]) => {
            const active = key === metric
            return (
              <button key={key} onClick={() => setMetric(key)} style={{
                fontSize: 11.5, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', minHeight: 40,
                fontFamily: 'inherit', fontWeight: active ? 800 : 500,
                background: active ? `${GREEN}1a` : 'transparent',
                border: `0.5px solid ${active ? `${GREEN}66` : t.border}`,
                color: active ? GREEN : t.muted,
              }}>{label}</button>
            )
          })}
        </div>

        {loading && (
          <div style={{ fontSize: 12.5, color: t.muted, padding: '40px 0', textAlign: 'center' }}>در حال بارگذاری…</div>
        )}
        {!loading && dates.length === 0 && (
          <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: 18, fontSize: 12, color: t.muted, lineHeight: 1.9 }}>
            هنوز داده‌ای برای آرشیو این دسته ثبت نشده است.
          </div>
        )}

        {!loading && dates.length > 0 && (
          <>
            {/* انتخاب روز */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
              {dates.map(d => {
                const active = d === selDate
                return (
                  <button key={d} onClick={() => setSelDate(d)} style={{
                    fontSize: 11, padding: '6px 11px', borderRadius: 8, cursor: 'pointer', minHeight: 36,
                    fontFamily: 'system-ui, sans-serif', fontWeight: active ? 800 : 500,
                    background: active ? `${GREEN}1a` : t.panel,
                    border: `0.5px solid ${active ? `${GREEN}66` : t.border}`,
                    color: active ? GREEN : cream,
                    direction: 'ltr',
                  }}>{d}</button>
                )
              })}
            </div>

            {/* نمودار روز انتخابی */}
            <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em' }}>
                  {metric === 'flow' ? 'ورود و خروج پول حقیقی' : 'سرانه‌ی خرید و فروش حقیقی'}
                  <span style={{ fontSize: 10, color: cream, marginRight: 8 }}>
                    {metric === 'flow' ? 'میلیارد تومان' : 'میلیون تومان'}
                  </span>
                  <span style={{ fontSize: 10, color: cream, marginRight: 8, fontFamily: 'system-ui, sans-serif' }}>{selDate}</span>
                </div>
                {metric === 'percap' && (
                  <div style={{ display: 'flex', gap: 14, fontSize: 10 }}>
                    <span style={{ color: GREEN }}>■ سرانه خریدار</span>
                    <span style={{ color: RED }}>■ سرانه فروشنده</span>
                  </div>
                )}
              </div>
              {metric === 'flow'
                ? <FlowBars t={t} flows={dayFunds} />
                : <PerCapBars t={t} caps={dayFunds} />}
            </div>

            {/* روند روزانه — نمودار خطی */}
            {metric === 'flow' && trend.length >= 2 && (
              <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
                <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em', marginBottom: 12 }}>
                  روند روزانه ورود و خروج پول حقیقی — مجموع کل صندوق‌های {catInfo.label}
                  <span style={{ fontSize: 10, color: cream, marginRight: 8 }}>میلیارد تومان</span>
                </div>
                <TrendLine t={t} cream={cream} points={trend} unit="میلیارد تومان" />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

export default function FundsArchivePage() {
  return (
    <Suspense fallback={null}>
      <ArchiveInner />
    </Suspense>
  )
}
