'use client'

/**
 * رصد لحظه‌ای پورتفو — ۵ نمودار ۵ دقیقه‌ای برای هر نماد داخل پورتفوی کاربر
 * سهام و صندوق‌های بورسی (سهامی/اهرمی/بخشی): ۹:۰۰ تا ۱۲:۳۰
 * صندوق‌های طلا/نقره/زعفران: ۱۲:۰۰ تا ۱۸:۰۰
 * داده از /api/stock-watch?symbols=… (جدول stock_watch_5m — فقط نمادهای پورتفوی کاربران، سرور ایران هر ۵ دقیقه درج می‌کند)
 * الگوی رنگ/چارت از app/monitor/[cat]/page.tsx گرفته شده (بدون تغییر آن فایل)
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip as ReTooltip, Legend, ReferenceLine,
} from 'recharts'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import AuthGate from '../../../components/AuthGate'

type Row = {
  ts: string
  tval: number
  buy_pc_i: number; sell_pc_i: number
  buy_pc_n: number; sell_pc_n: number
  money_in: number
  big_buy: number; big_sell: number
}
type Datum = Row & {
  t: string
  tvalB: number; tval5m: number
  buyPcIM: number; sellPcIM: number
  buyPcNM: number; sellPcNM: number
  moneyB: number
  bigBuyB: number; bigSellB: number; bigNetB: number
}

const CAT_LABELS: Record<string, { title: string; hours: string }> = {
  stocks:         { title: 'سهام',            hours: '۹:۰۰ تا ۱۲:۳۰' },
  'bourse-funds': { title: 'صندوق بورسی',      hours: '۹:۰۰ تا ۱۲:۳۰' },
  gold:           { title: 'صندوق طلا',        hours: '۱۲:۰۰ تا ۱۸:۰۰' },
  silver:         { title: 'صندوق نقره',       hours: '۱۲:۰۰ تا ۱۸:۰۰' },
  saffron:        { title: 'صندوق زعفران',     hours: '۱۲:۰۰ تا ۱۸:۰۰' },
}

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const C = {
  green: '#22c55e', red: '#ef4444', purple: '#f4d795',
  orange: '#f59e0b', blue: '#d9b45b', text: '#a9b0c2', cream: '#ddd5bd',
  border: 'rgba(255,255,255,0.09)', bg: '#0a0d14', panel: '#12161f',
}
const FONT = 'Vazirmatn, Arial, sans-serif'
const axisTick = { fontSize: 10, fill: C.text, fontFamily: FONT }
const tooltipStyle = {
  background: 'rgba(18,22,31,0.96)', border: `1px solid ${C.border}`, borderRadius: 12,
  fontFamily: FONT, fontSize: 12, direction: 'rtl' as const,
  boxShadow: '0 12px 40px rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
  color: C.cream,
}
const tooltipLabelStyle = { color: C.cream, fontFamily: FONT, fontWeight: 700 }
const tooltipItemStyle = { color: C.cream, fontFamily: FONT }

type Series = { key: keyof Datum; name: string; color: string; kind: 'line' | 'area' }
type ChartDef = { id: string; title: string; series: Series[]; unit?: string; dec?: number; refZero?: boolean }

const DEFS: ChartDef[] = [
  {
    id: 'tval', title: 'ارزش معاملات لحظه‌ای', unit: ' میلیارد تومان', dec: 2,
    series: [{ key: 'tval5m', name: 'معاملات ۵ دقیقه', color: C.orange, kind: 'area' }],
  },
  {
    id: 'ind', title: 'سرانه خرید و فروش حقیقی', unit: ' میلیون تومان', dec: 1,
    series: [
      { key: 'buyPcIM', name: 'سرانه خرید', color: C.green, kind: 'line' },
      { key: 'sellPcIM', name: 'سرانه فروش', color: C.red, kind: 'line' },
    ],
  },
  {
    id: 'leg', title: 'سرانه خرید و فروش حقوقی', unit: ' میلیون تومان', dec: 1,
    series: [
      { key: 'buyPcNM', name: 'سرانه خرید', color: C.green, kind: 'line' },
      { key: 'sellPcNM', name: 'سرانه فروش', color: C.red, kind: 'line' },
    ],
  },
  {
    id: 'money', title: 'ورود و خروج پول', unit: ' میلیارد تومان', dec: 2, refZero: true,
    series: [{ key: 'moneyB', name: 'ورود پول حقیقی', color: C.green, kind: 'area' }],
  },
  {
    id: 'bigmoney', title: 'ورود و خروج پول درشت', unit: ' میلیارد تومان', dec: 2, refZero: true,
    series: [{ key: 'bigNetB', name: 'خالص پول درشت (بالای ۲۰۰ میلیون تومان سرانه)', color: C.green, kind: 'area' }],
  },
]

const liveDot = (color: string, lastIndex: number, live: boolean) =>
  function LiveDot(props: any) {
    const { cx, cy, index } = props
    if (index !== lastIndex || cx == null || cy == null) return <g key={`d${index}`} />
    return (
      <g key={`d${index}`}>
        {live && <circle className="live-ping" cx={cx} cy={cy} r={5} fill={color} />}
        <circle cx={cx} cy={cy} r={4} fill={color} stroke={C.bg} strokeWidth={1.5} />
      </g>
    )
  }

export default function PortfolioLiveMonitorPage() {
  const isMobile = useIsMobile()
  const [symbols, setSymbols] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [bySymbol, setBySymbol] = useState<Record<string, { cat: string; rows: Row[] }>>({})
  const [date, setDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [animate, setAnimate] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  // نمادهای پورتفو (سهام/صندوق — نه دارایی فیزیکی که در stock_watch_5m داده‌ای ندارد)
  useEffect(() => {
    let stop = false
    supabase
      .from('portfolio_transactions')
      .select('symbol, asset_type')
      .in('asset_type', ['stock', 'fund'])
      .then(({ data }) => {
        if (stop) return
        const uniq = Array.from(new Set((data ?? []).map((r: any) => r.symbol as string)))
        setSymbols(uniq)
        setSelected(prev => prev ?? uniq[0] ?? null)
      })
    return () => { stop = true }
  }, [])

  useEffect(() => {
    if (symbols.length === 0) { setLoading(false); return }
    let stop = false
    const load = async () => {
      try {
        const res = await fetch(`/api/stock-watch?symbols=${encodeURIComponent(symbols.join(','))}`, { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json()
        if (!stop) { setBySymbol(j.bySymbol ?? {}); setDate(j.date ?? null); setNow(Date.now()) }
      } catch {} finally { if (!stop) setLoading(false) }
    }
    load()
    const iv = setInterval(load, 60_000) // دیتای سرور هر ۵ دقیقه عوض می‌شود
    return () => { stop = true; clearInterval(iv) }
  }, [symbols])

  useEffect(() => {
    if (!loading && Object.keys(bySymbol).length > 0) {
      const to = setTimeout(() => setAnimate(false), 1400)
      return () => clearTimeout(to)
    }
  }, [loading, Object.keys(bySymbol).length]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = selected ? bySymbol[selected] : undefined
  const cfg = current ? (CAT_LABELS[current.cat] ?? { title: current.cat, hours: '' }) : null

  const data: Datum[] = useMemo(() => {
    const rows = current?.rows ?? []
    return rows.map((r, i) => {
      const t = new Date(r.ts).toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' })
      return {
        ...r, t,
        tvalB: r.tval / 1e10,
        tval5m: i > 0 ? Math.max(0, (r.tval - rows[i - 1].tval) / 1e10) : 0,
        buyPcIM: r.buy_pc_i / 1e7, sellPcIM: r.sell_pc_i / 1e7,
        buyPcNM: r.buy_pc_n / 1e7, sellPcNM: r.sell_pc_n / 1e7,
        moneyB: r.money_in / 1e10,
        bigBuyB: r.big_buy / 1e10, bigSellB: r.big_sell / 1e10, bigNetB: (r.big_buy - r.big_sell) / 1e10,
      }
    })
  }, [current])

  const last = data.length > 0 ? data[data.length - 1] : null
  const isLive = !!last && now - new Date(last.ts).getTime() < 12 * 60_000

  const renderChart = useCallback((def: ChartDef) => {
    const dec = def.dec ?? 0
    const lastIndex = data.length - 1
    return (
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 6, left: 4, right: 6, bottom: 0 }}>
          <defs>
            {def.series.map(s => (
              <linearGradient key={`g-${def.id}-${s.key}`} id={`grad-${def.id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.42} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" tick={axisTick} tickMargin={8} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={axisTick} tickFormatter={(v: number) => fa(v, dec)} width={52} orientation="right" />
          {def.refZero && <ReferenceLine y={0} stroke={C.text} strokeDasharray="4 4" />}
          <ReTooltip
            contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle}
            cursor={{ stroke: 'rgba(255,255,255,0.28)', strokeDasharray: '4 4' }}
            formatter={(v: any, n: any) => [`${fa(Number(v), dec)}${def.unit ?? ''}`, n]}
          />
          {def.series.length > 1 && <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 12 }} />}
          {def.series.map(s => {
            if (s.kind === 'area') {
              const col = last && ((def.id === 'money' && last.moneyB < 0) || (def.id === 'bigmoney' && last.bigNetB < 0)) ? C.red : s.color
              return (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.name}
                  stroke={col} strokeWidth={2.6} strokeLinecap="round"
                  fill={`url(#grad-${def.id}-${s.key})`}
                  dot={liveDot(col, lastIndex, isLive)} activeDot={{ r: 5, strokeWidth: 0 }}
                  isAnimationActive={animate} animationDuration={1100}
                  style={{ filter: `drop-shadow(0 0 7px ${col}55)` }} />
              )
            }
            return (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
                stroke={s.color} strokeWidth={2.6} strokeLinecap="round"
                dot={liveDot(s.color, lastIndex, isLive)} activeDot={{ r: 5, strokeWidth: 0 }}
                isAnimationActive={animate} animationDuration={1100}
                style={{ filter: `drop-shadow(0 0 7px ${s.color}55)` }} />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    )
  }, [data, animate, isLive, last])

  return (
    <AuthGate title="رصد لحظه‌ای پورتفو">
      <main style={{ minHeight: '100vh', background: C.bg, color: '#eef1f8', fontFamily: FONT, direction: 'rtl', padding: isMobile ? '20px 12px 40px' : '28px 3vw 60px' }}>
        <div style={{ maxWidth: 1500, margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, margin: 0 }}>رصد لحظه‌ای پورتفو</h1>
                {last && (isLive ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800,
                    color: C.green, background: `${C.green}14`, border: `1px solid ${C.green}44`,
                    borderRadius: 999, padding: '4px 13px',
                  }}>
                    <span className="blink-dot" style={{ width: 8, height: 8, borderRadius: 999, background: C.green, boxShadow: `0 0 9px ${C.green}` }} />
                    زنده
                  </span>
                ) : (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.cream, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 13px' }}>
                    بسته — آخرین اسنپ‌شات {last.t}
                  </span>
                ))}
              </div>
              <p style={{ color: C.text, fontSize: 13.5, margin: '8px 0 0' }}>
                ۵ نمودار هر نماد پورتفو، بروزرسانی هر ۵ دقیقه در ساعت بازار — سهام/صندوق بورسی ۹:۰۰ تا ۱۲:۳۰، صندوق‌های کالایی ۱۲:۰۰ تا ۱۸:۰۰
                {date ? ` — آخرین روز: ${new Date(date).toLocaleDateString('fa-IR')}` : ''}
              </p>
            </div>
            <Link href="/portfolio" style={{ color: C.blue, textDecoration: 'none', fontSize: 14, fontWeight: 700, border: `1px solid ${C.border}`, borderRadius: 12, padding: '9px 18px', background: 'rgba(255,255,255,0.04)' }}>
              → بازگشت به پورتفو
            </Link>
          </div>

          {symbols.length === 0 && !loading ? (
            <div style={{ color: C.text, textAlign: 'center', padding: 80, lineHeight: 2 }}>
              هنوز سهم یا صندوقی در پورتفوی شما ثبت نشده.<br />
              اول از صفحه پورتفو یک تراکنش خرید ثبت کنید.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
                {symbols.map(sym => {
                  const active = sym === selected
                  return (
                    <button key={sym} type="button" onClick={() => setSelected(sym)} style={{
                      padding: '9px 18px', borderRadius: 999, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                      fontFamily: FONT,
                      background: active ? `${C.blue}22` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${active ? `${C.blue}77` : C.border}`,
                      color: active ? C.blue : C.cream,
                    }}>
                      {sym}
                    </button>
                  )
                })}
              </div>

              {loading ? (
                <div style={{ color: C.text, textAlign: 'center', padding: 80 }}>در حال بارگذاری…</div>
              ) : !current || data.length === 0 ? (
                <div style={{ color: C.text, textAlign: 'center', padding: 80, lineHeight: 2 }}>
                  هنوز داده‌ای برای «{selected}» ثبت نشده.<br />
                  اسنپ‌شات‌ها در روز معاملاتی و در ساعت بازار همان نماد ثبت می‌شوند.
                </div>
              ) : (
                <>
                  {cfg && (
                    <div style={{ color: C.text, fontSize: 13, marginBottom: 14 }}>
                      {cfg.title} — ساعت بازار {cfg.hours}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
                    {DEFS.map((def, i) => (
                      <div key={def.id} className="chart-card" style={{
                        boxSizing: 'border-box',
                        background: `linear-gradient(165deg, ${def.series[0].color}0c, rgba(255,255,255,0.02))`,
                        border: `1px solid ${C.border}`, borderTop: `2px solid ${def.series[0].color}55`,
                        borderRadius: 18, padding: '18px 10px 8px',
                        display: 'flex', flexDirection: 'column', minWidth: 0,
                        animationDelay: `${i * 55}ms`,
                      }}>
                        <div style={{ textAlign: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: 15.5, fontWeight: 800, color: '#eef1f8' }}>{def.title}</div>
                        </div>
                        <div style={{ width: '100%', height: 260 }}>{renderChart(def)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </AuthGate>
  )
}
