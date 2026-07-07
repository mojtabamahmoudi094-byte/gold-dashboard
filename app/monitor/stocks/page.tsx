'use client'

/**
 * رصد لحظه‌ای بازار سهام — ۱۱ نمودار ۵ دقیقه‌ای از سنجه‌های کل بازار
 * داده از /api/market-watch?cat=stocks (جدول market_watch — سرور ایران هر ۵ دقیقه درج می‌کند)
 * همه ارزش‌ها در دیتابیس «ریال»اند؛ اینجا به میلیارد/میلیون تومان تبدیل می‌شوند.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer, LineChart, Line, ComposedChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ReferenceLine,
} from 'recharts'
import { useIsMobile } from '../../../lib/useIsMobile'

type Row = {
  ts: string; t: string; count: number
  mov_pos: number; mov_neg: number; excitement: number
  sym_pos: number; sym_neg: number
  buyq: number; sellq: number
  tval_total: number
  avg_plp: number; avg_pcp: number
  ind_buy_pc: number; ind_sell_pc: number
  leg_buy_pc: number; leg_sell_pc: number
  ord_demand: number; ord_supply: number
  ordx_demand: number; ordx_supply: number
  money_in: number
}

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const COLORS = {
  green: '#22c55e', red: '#ef4444', purple: '#8b5cf6',
  orange: '#f59e0b', blue: '#3b82f6', text: '#a9b0c2', border: 'rgba(255,255,255,0.09)',
}
const FONT = 'Vazirmatn, Arial, sans-serif'

const axisTick = { fontSize: 10, fill: COLORS.text, fontFamily: FONT }
const tooltipStyle = {
  background: '#141927', border: `1px solid ${COLORS.border}`, borderRadius: 10,
  fontFamily: FONT, fontSize: 12, direction: 'rtl' as const,
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'linear-gradient(165deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
      border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: '18px 10px 8px',
      display: 'flex', flexDirection: 'column', minWidth: 0,
    }}>
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: '#eef1f8' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: COLORS.text, marginTop: 5 }}>{subtitle}</div>
      </div>
      <div style={{ width: '100%', height: 240 }}>{children}</div>
    </div>
  )
}

const commonAxes = (yFmt: (v: number) => string) => (
  <>
    <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
    <XAxis dataKey="t" tick={axisTick} tickMargin={8} interval="preserveStartEnd" minTickGap={28} reversed />
    <YAxis tick={axisTick} tickFormatter={yFmt} width={52} orientation="right" />
  </>
)

export default function StocksMonitorPage() {
  const isMobile = useIsMobile()
  const [rows, setRows] = useState<Row[]>([])
  const [date, setDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const res = await fetch('/api/market-watch?cat=stocks', { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json()
        if (!stop) { setRows(j.rows ?? []); setDate(j.date ?? null) }
      } catch {} finally { if (!stop) setLoading(false) }
    }
    load()
    const iv = setInterval(load, 60_000) // دیتای سرور هر ۵ دقیقه عوض می‌شود
    return () => { stop = true; clearInterval(iv) }
  }, [])

  const data = useMemo(() => rows.map((r, i) => ({
    ...r,
    tvalB: r.tval_total / 1e10,                                            // میلیارد تومان
    tval5m: i > 0 ? Math.max(0, (r.tval_total - rows[i - 1].tval_total) / 1e10) : 0,
    indBuyM: r.ind_buy_pc / 1e7, indSellM: r.ind_sell_pc / 1e7,            // میلیون تومان
    legBuyM: r.leg_buy_pc / 1e7, legSellM: r.leg_sell_pc / 1e7,
    ordDB: r.ord_demand / 1e10, ordSB: r.ord_supply / 1e10,
    ordxDB: r.ordx_demand / 1e10, ordxSB: r.ordx_supply / 1e10,
    moneyB: r.money_in / 1e10,
  })), [rows])

  const last = data.length > 0 ? data[data.length - 1] : null

  return (
    <main style={{ minHeight: '100vh', background: '#0a0d14', color: '#eef1f8', fontFamily: FONT, direction: 'rtl', padding: isMobile ? '20px 12px 40px' : '28px 3vw 60px' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, margin: 0 }}>رصد لحظه‌ای بازار سهام</h1>
            <p style={{ color: COLORS.text, fontSize: 13.5, margin: '6px 0 0' }}>
              بروزرسانی هر ۵ دقیقه، شنبه تا چهارشنبه ۹:۰۰ تا ۱۲:۳۵
              {date ? ` — آخرین روز: ${new Date(date).toLocaleDateString('fa-IR')}` : ''}
              {last ? ` — آخرین اسنپ‌شات: ${last.t}` : ''}
            </p>
          </div>
          <Link href="/monitor" style={{ color: COLORS.blue, textDecoration: 'none', fontSize: 14, fontWeight: 700, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '9px 18px', background: 'rgba(255,255,255,0.04)' }}>
            → بازگشت به رصد بازارها
          </Link>
        </div>

        {loading ? (
          <div style={{ color: COLORS.text, textAlign: 'center', padding: 80 }}>در حال بارگذاری…</div>
        ) : data.length === 0 ? (
          <div style={{ color: COLORS.text, textAlign: 'center', padding: 80, lineHeight: 2 }}>
            هنوز داده‌ای ثبت نشده.<br />اولین اسنپ‌شات‌ها فردای روز معاملاتی از ساعت ۹:۰۰ ثبت می‌شوند.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>

            {/* ۱ — هیجان بازار */}
            <ChartCard title="نمودار هیجان بازار" subtitle={`هیجان ${fa(last!.excitement)} واحد`}>
              <ResponsiveContainer>
                <LineChart data={data}>
                  {commonAxes(v => fa(v))}
                  <ReTooltip contentStyle={tooltipStyle} formatter={(v: any) => [fa(Number(v)), 'هیجان']} />
                  <ReferenceLine y={0} stroke={COLORS.text} strokeDasharray="4 4" />
                  <Line dataKey="excitement" name="هیجان" stroke={COLORS.purple} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ۲ — تحرک قیمتی */}
            <ChartCard title="نمودار تحرک قیمتی" subtitle={`مثبت ${fa(last!.mov_pos)} | منفی ${fa(last!.mov_neg)}`}>
              <ResponsiveContainer>
                <LineChart data={data}>
                  {commonAxes(v => fa(v))}
                  <ReTooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [fa(Number(v)), n]} />
                  <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 12 }} />
                  <Line dataKey="mov_pos" name="تحرک مثبت" stroke={COLORS.green} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                  <Line dataKey="mov_neg" name="تحرک منفی" stroke={COLORS.red} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ۳ — ارزش معاملات خرد */}
            <ChartCard title="ارزش معاملات خرد لحظه‌ای" subtitle={`کل ${fa(last!.tvalB)} میلیارد تومان`}>
              <ResponsiveContainer>
                <ComposedChart data={data}>
                  {commonAxes(v => fa(v))}
                  <YAxis yAxisId="bar" hide />
                  <ReTooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [`${fa(Number(v))} میلیارد تومان`, n]} />
                  <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 12 }} />
                  <Bar yAxisId="bar" dataKey="tval5m" name="معاملات ۵ دقیقه" fill={COLORS.orange} opacity={0.85} isAnimationActive={false} />
                  <Line dataKey="tvalB" name="کل معاملات" stroke={COLORS.blue} strokeWidth={2.4} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ۴ — میانگین درصد بازار */}
            <ChartCard title="میانگین درصد قیمت بازار" subtitle={`آخرین ${fa(last!.avg_plp, 2)} | پایانی ${fa(last!.avg_pcp, 2)} درصد`}>
              <ResponsiveContainer>
                <LineChart data={data}>
                  {commonAxes(v => fa(v, 2))}
                  <ReTooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [`${fa(Number(v), 2)}٪`, n]} />
                  <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 12 }} />
                  <ReferenceLine y={0} stroke={COLORS.text} strokeDasharray="4 4" />
                  <Line dataKey="avg_plp" name="میانگین قیمت آخرین" stroke={COLORS.orange} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                  <Line dataKey="avg_pcp" name="میانگین قیمت پایانی" stroke={COLORS.purple} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ۵ — نمادهای مثبت و منفی */}
            <ChartCard title="تعداد نمادهای مثبت و منفی" subtitle={`مثبت ${fa(last!.sym_pos)} | منفی ${fa(last!.sym_neg)}`}>
              <ResponsiveContainer>
                <LineChart data={data}>
                  {commonAxes(v => fa(v))}
                  <ReTooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [fa(Number(v)), n]} />
                  <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 12 }} />
                  <Line dataKey="sym_pos" name="مثبت" stroke={COLORS.green} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                  <Line dataKey="sym_neg" name="منفی" stroke={COLORS.red} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ۶ — صف‌های خرید و فروش */}
            <ChartCard title="تعداد صف‌های خرید و فروش" subtitle={`خرید ${fa(last!.buyq)} | فروش ${fa(last!.sellq)}`}>
              <ResponsiveContainer>
                <LineChart data={data}>
                  {commonAxes(v => fa(v))}
                  <ReTooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [fa(Number(v)), n]} />
                  <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 12 }} />
                  <Line dataKey="buyq" name="صف خرید" stroke={COLORS.green} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                  <Line dataKey="sellq" name="صف فروش" stroke={COLORS.red} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ۷ — سرانه حقیقی */}
            <ChartCard title="سرانه خرید و فروش حقیقی" subtitle={`خرید ${fa(last!.indBuyM)} | فروش ${fa(last!.indSellM)} میلیون تومان${last!.indSellM > 0 ? ` | قدرت ${fa(last!.indBuyM / last!.indSellM, 1)}` : ''}`}>
              <ResponsiveContainer>
                <LineChart data={data}>
                  {commonAxes(v => fa(v))}
                  <ReTooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [`${fa(Number(v), 1)} میلیون تومان`, n]} />
                  <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 12 }} />
                  <Line dataKey="indBuyM" name="سرانه خرید" stroke={COLORS.green} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                  <Line dataKey="indSellM" name="سرانه فروش" stroke={COLORS.red} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ۸ — سرانه حقوقی */}
            <ChartCard title="سرانه خرید و فروش حقوقی" subtitle={`خرید ${fa(last!.legBuyM)} | فروش ${fa(last!.legSellM)} میلیون تومان`}>
              <ResponsiveContainer>
                <LineChart data={data}>
                  {commonAxes(v => fa(v))}
                  <ReTooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [`${fa(Number(v))} میلیون تومان`, n]} />
                  <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 12 }} />
                  <Line dataKey="legBuyM" name="سرانه خرید" stroke={COLORS.green} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                  <Line dataKey="legSellM" name="سرانه فروش" stroke={COLORS.red} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ۹ — ارزش سفارشات بدون صف */}
            <ChartCard title="ارزش سفارشات بدون صف" subtitle={`تقاضا ${fa(last!.ordxDB)} | عرضه ${fa(last!.ordxSB)} میلیارد تومان`}>
              <ResponsiveContainer>
                <LineChart data={data}>
                  {commonAxes(v => fa(v))}
                  <ReTooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [`${fa(Number(v))} میلیارد تومان`, n]} />
                  <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 12 }} />
                  <Line dataKey="ordxDB" name="ارزش تقاضا" stroke={COLORS.green} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                  <Line dataKey="ordxSB" name="ارزش عرضه" stroke={COLORS.red} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ۱۰ — ارزش کل سفارشات */}
            <ChartCard title="ارزش کل سفارشات" subtitle={`تقاضا ${fa(last!.ordDB)} | عرضه ${fa(last!.ordSB)} میلیارد تومان`}>
              <ResponsiveContainer>
                <LineChart data={data}>
                  {commonAxes(v => fa(v))}
                  <ReTooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [`${fa(Number(v))} میلیارد تومان`, n]} />
                  <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 12 }} />
                  <Line dataKey="ordDB" name="ارزش تقاضا" stroke={COLORS.green} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                  <Line dataKey="ordSB" name="ارزش عرضه" stroke={COLORS.red} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ۱۱ — ورود پول حقیقی */}
            <ChartCard title="ورود پول حقیقی به معاملات خرد" subtitle={`آخرین ${fa(last!.moneyB)} میلیارد تومان`}>
              <ResponsiveContainer>
                <AreaChart data={data}>
                  {commonAxes(v => fa(v))}
                  <ReTooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${fa(Number(v))} میلیارد تومان`, 'ورود پول حقیقی']} />
                  <ReferenceLine y={0} stroke={COLORS.text} strokeDasharray="4 4" />
                  <defs>
                    <linearGradient id="moneyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={last!.moneyB >= 0 ? COLORS.green : COLORS.red} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={last!.moneyB >= 0 ? COLORS.green : COLORS.red} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <Area dataKey="moneyB" name="ورود پول حقیقی" stroke={last!.moneyB >= 0 ? COLORS.green : COLORS.red} strokeWidth={2.2} fill="url(#moneyGrad)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

          </div>
        )}
      </div>
    </main>
  )
}
