'use client'

/**
 * رصد لحظه‌ای بازار — ۱۲ نمودار ۵ دقیقه‌ای برای هر دسته (config-محور)
 * دسته‌ها: سهام و صندوق‌های بورسی (۹:۰۰–۱۲:۳۰)، صندوق‌های طلا/نقره/زعفران (۱۲:۰۰–۱۷:۳۰)
 * داده از /api/market-watch?cat=… (جدول market_watch — سرور ایران هر ۵ دقیقه درج می‌کند)
 * همه ارزش‌ها در دیتابیس «ریال»اند؛ اینجا به میلیارد/میلیون تومان تبدیل می‌شوند.
 *
 * محور زمان: شروع بازار چپ، داده جدید به راست اضافه می‌شود (خواسته کاربر).
 * حالت زنده: نقطه تپنده روی آخرین داده + نشان «زنده» وقتی اسنپ‌شات < ۱۲ دقیقه.
 * کلیک روی هر کارت → مودال تمام‌صفحه همان نمودار.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ResponsiveContainer, ComposedChart, BarChart, PieChart, Pie, Line, Bar, Area, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ReferenceLine,
} from 'recharts'
import { useIsMobile } from '../../../lib/useIsMobile'
import AuthGate from '../../../components/AuthGate'

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
  big_buy: number; big_sell: number
  plp_dist: number[]
  // فقط برای cat=stocks — تفکیک ارزش معاملات بورس/فرابورس/آپشن/صندوق‌ها (ریال)
  tval_by_segment?: {
    bourse: number; fara_bourse: number; option: number
    fund_equity: number; fund_fixed_income: number; fund_commodity: number
  }
}
type Datum = Row & {
  tvalB: number; tval5m: number
  indBuyM: number; indSellM: number; legBuyM: number; legSellM: number
  ordDB: number; ordSB: number; ordxDB: number; ordxSB: number; moneyB: number
  bigBuyB: number; bigSellB: number; bigNetB: number
}

const CATS: Record<string, { title: string; hours: string }> = {
  stocks:         { title: 'بازار سهام',       hours: '۹:۰۰ تا ۱۲:۳۰' },
  'bourse-funds': { title: 'صندوق‌های بورسی',  hours: '۹:۰۰ تا ۱۲:۳۰' },
  gold:           { title: 'صندوق‌های طلا',    hours: '۱۲:۰۰ تا ۱۸:۰۰' },
  silver:         { title: 'صندوق‌های نقره',   hours: '۱۲:۰۰ تا ۱۸:۰۰' },
  saffron:        { title: 'صندوق‌های زعفران', hours: '۱۲:۰۰ تا ۱۸:۰۰' },
}

// عنوان کارت «محدوده قیمتی آخرین معاملات» — برای سهام شامل حق تقدم و ص.سهامی هم می‌شود
const DIST_TITLES: Record<string, string> = {
  stocks: 'محدوده قیمتی آخرین معاملات سهام، حق تقدم و ص.سهامی',
  'bourse-funds': 'محدوده قیمتی آخرین معاملات صندوق‌های بورسی',
  gold: 'محدوده قیمتی آخرین معاملات صندوق‌های طلا',
  silver: 'محدوده قیمتی آخرین معاملات صندوق‌های نقره',
  saffron: 'محدوده قیمتی آخرین معاملات صندوق‌های زعفران',
}
// برچسب ۱۲ باکت — باید با PLP_BUCKETS در scripts/stocks-industries.js هم‌ترازی داشته باشد
const PLP_BUCKET_LABELS = [
  'پایین‌تر از منفی ۵', 'منفی ۴ تا ۵', 'منفی ۳ تا ۴', 'منفی ۲ تا ۳', 'منفی ۱ تا ۲', 'صفر تا منفی ۱',
  'صفر تا مثبت ۱', 'مثبت ۱ تا ۲', 'مثبت ۲ تا ۳', 'مثبت ۳ تا ۴', 'مثبت ۴ تا ۵', 'بالاتر از مثبت ۵',
]
// همان برچسب‌ها دو‌خطی — چرخش (angle) روی صفحهٔ RTL جهت‌اش برعکس می‌شود و متن روی چارت می‌افتد
const PLP_TICK_LINES: [string, string][] = [
  ['پایین‌تر از', 'منفی ۵'], ['منفی ۴', 'تا ۵'], ['منفی ۳', 'تا ۴'], ['منفی ۲', 'تا ۳'],
  ['منفی ۱', 'تا ۲'], ['صفر تا', 'منفی ۱'], ['صفر تا', 'مثبت ۱'], ['مثبت ۱', 'تا ۲'],
  ['مثبت ۲', 'تا ۳'], ['مثبت ۳', 'تا ۴'], ['مثبت ۴', 'تا ۵'], ['بالاتر از', 'مثبت ۵'],
]
// tick سفارشی افقیِ دو‌خطی به‌جای چرخش متن
const distTick = (big: boolean) =>
  function DistTick(props: any) {
    const { x, y, payload } = props
    const [l1, l2] = PLP_TICK_LINES[payload.index] ?? ['', '']
    const fs = big ? 11 : 9
    return (
      <g transform={`translate(${x},${y})`}>
        <text textAnchor="middle" fontFamily={FONT} fontSize={fs} fill={C.text}>
          <tspan x={0} dy={fs + 4}>{l1}</tspan>
          <tspan x={0} dy={fs + 2}>{l2}</tspan>
        </text>
      </g>
    )
  }

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const C = {
  green: '#22c55e', red: '#ef4444', purple: '#f4d795',
  orange: '#f59e0b', blue: '#d9b45b', text: '#a9b0c2', cream: '#ddd5bd',
  border: 'rgba(255,255,255,0.09)', bg: '#0a0d14', panel: '#12161f',
}
const FONT = 'Vazirmatn, Arial, sans-serif'

// تفکیک ارزش معاملات (کارت دوم دایره‌ای) — ترتیب و رنگ هر بخش
const SEGMENT_ORDER: (keyof NonNullable<Row['tval_by_segment']>)[] =
  ['bourse', 'fara_bourse', 'option', 'fund_equity', 'fund_fixed_income', 'fund_commodity']
const SEGMENT_LABELS: Record<string, string> = {
  bourse: 'بورس', fara_bourse: 'فرابورس', option: 'آپشن',
  fund_equity: 'صندوق سهامی', fund_fixed_income: 'صندوق درآمدثابت', fund_commodity: 'صندوق کالایی',
}
const SEGMENT_COLORS: Record<string, string> = {
  bourse: '#d9b45b', fara_bourse: '#22c55e', option: '#ef4444',
  fund_equity: '#f59e0b', fund_fixed_income: '#f4d795', fund_commodity: '#eab308',
}

const axisTick = { fontSize: 10, fill: C.text, fontFamily: FONT }
const tooltipStyle = {
  background: 'rgba(18,22,31,0.96)', border: `1px solid ${C.border}`, borderRadius: 12,
  fontFamily: FONT, fontSize: 12, direction: 'rtl' as const,
  boxShadow: '0 12px 40px rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
  color: C.cream,
}
const tooltipLabelStyle = { color: C.cream, fontFamily: FONT, fontWeight: 700 }
const tooltipItemStyle = { color: C.cream, fontFamily: FONT }

// ── تعریف نمودارها ────────────────────────────────────────────────
type Series = { key: keyof Datum; name: string; color: string; kind: 'line' | 'bar' | 'area' }
type ChartDef = {
  id: string; title: string
  series: Series[]
  unit?: string             // پسوند tooltip و زیرنویس
  dec?: number              // رقم اعشار
  refZero?: boolean
  sub: (l: Datum) => { txt: string; color?: string }[]
}

const DEFS: ChartDef[] = [
  {
    id: 'tval', title: 'ارزش معاملات خرد لحظه‌ای', unit: ' میلیارد تومان',
    series: [
      { key: 'tval5m', name: 'معاملات ۵ دقیقه', color: C.orange, kind: 'bar' },
      { key: 'tvalB', name: 'کل معاملات', color: C.blue, kind: 'line' },
    ],
    sub: l => [{ txt: `کل ${fa(l.tvalB)} میلیارد تومان`, color: C.blue }],
  },
  {
    id: 'avgpct', title: 'میانگین درصد قیمت بازار', unit: '٪', dec: 2, refZero: true,
    series: [
      { key: 'avg_plp', name: 'میانگین قیمت آخرین', color: C.orange, kind: 'line' },
      { key: 'avg_pcp', name: 'میانگین قیمت پایانی', color: C.purple, kind: 'line' },
    ],
    sub: l => [{ txt: `آخرین ${fa(l.avg_plp, 2)}٪`, color: C.orange }, { txt: ' | ' }, { txt: `پایانی ${fa(l.avg_pcp, 2)}٪`, color: C.purple }],
  },
  {
    id: 'symbols', title: 'تعداد نمادهای مثبت و منفی',
    series: [
      { key: 'sym_pos', name: 'مثبت', color: C.green, kind: 'line' },
      { key: 'sym_neg', name: 'منفی', color: C.red, kind: 'line' },
    ],
    sub: l => [{ txt: `مثبت ${fa(l.sym_pos)}`, color: C.green }, { txt: ' | ' }, { txt: `منفی ${fa(l.sym_neg)}`, color: C.red }],
  },
  {
    id: 'ind', title: 'سرانه خرید و فروش حقیقی', unit: ' میلیون تومان', dec: 1,
    series: [
      { key: 'indBuyM', name: 'سرانه خرید', color: C.green, kind: 'line' },
      { key: 'indSellM', name: 'سرانه فروش', color: C.red, kind: 'line' },
    ],
    sub: l => [
      { txt: `خرید ${fa(l.indBuyM)}`, color: C.green }, { txt: ' | ' },
      { txt: `فروش ${fa(l.indSellM)} میلیون تومان`, color: C.red },
      ...(l.indSellM > 0 ? [{ txt: ` | قدرت ${fa(l.indBuyM / l.indSellM, 1)}`, color: C.orange }] : []),
    ],
  },
  {
    id: 'leg', title: 'سرانه خرید و فروش حقوقی', unit: ' میلیون تومان',
    series: [
      { key: 'legBuyM', name: 'سرانه خرید', color: C.green, kind: 'line' },
      { key: 'legSellM', name: 'سرانه فروش', color: C.red, kind: 'line' },
    ],
    sub: l => [{ txt: `خرید ${fa(l.legBuyM)}`, color: C.green }, { txt: ' | ' }, { txt: `فروش ${fa(l.legSellM)} میلیون تومان`, color: C.red }],
  },
  {
    id: 'ordx', title: 'ارزش سفارشات بدون صف', unit: ' میلیارد تومان',
    series: [
      { key: 'ordxDB', name: 'ارزش تقاضا', color: C.green, kind: 'line' },
      { key: 'ordxSB', name: 'ارزش عرضه', color: C.red, kind: 'line' },
    ],
    sub: l => [{ txt: `تقاضا ${fa(l.ordxDB)}`, color: C.green }, { txt: ' | ' }, { txt: `عرضه ${fa(l.ordxSB)} میلیارد تومان`, color: C.red }],
  },
  {
    id: 'ord', title: 'ارزش کل سفارشات', unit: ' میلیارد تومان',
    series: [
      { key: 'ordDB', name: 'ارزش تقاضا', color: C.green, kind: 'line' },
      { key: 'ordSB', name: 'ارزش عرضه', color: C.red, kind: 'line' },
    ],
    sub: l => [{ txt: `تقاضا ${fa(l.ordDB)}`, color: C.green }, { txt: ' | ' }, { txt: `عرضه ${fa(l.ordSB)} میلیارد تومان`, color: C.red }],
  },
  {
    id: 'money', title: 'ورود پول حقیقی به معاملات خرد', unit: ' میلیارد تومان', refZero: true,
    series: [{ key: 'moneyB', name: 'ورود پول حقیقی', color: C.green, kind: 'area' }],
    sub: l => [{ txt: `آخرین ${fa(l.moneyB)} میلیارد تومان`, color: l.moneyB >= 0 ? C.green : C.red }],
  },
  {
    // کدهای حقیقی با سرانه خرید/فروش بالای ۵۰ میلیون تومان — نشانه ورود سرمایه‌گذار درشت/آگاه
    id: 'bigmoney', title: 'ورود و خروج پول درشت', unit: ' میلیارد تومان', refZero: true,
    series: [{ key: 'bigNetB', name: 'خالص پول درشت', color: C.green, kind: 'area' }],
    sub: l => [
      { txt: `خالص ${fa(l.bigNetB)} میلیارد تومان`, color: l.bigNetB >= 0 ? C.green : C.red }, { txt: ' | ' },
      { txt: `ورود ${fa(l.bigBuyB)}`, color: C.green }, { txt: ' | ' },
      { txt: `خروج ${fa(l.bigSellB)}`, color: C.red },
    ],
  },
]

// نقطه تپنده روی آخرین داده — حس «زنده بودن» نمودار
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

export default function MarketMonitorPage() {
  const isMobile = useIsMobile()
  const params = useParams<{ cat: string }>()
  const cat = String(params?.cat ?? 'stocks')
  const cfg = CATS[cat]
  const [rows, setRows] = useState<Row[]>([])
  const [date, setDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [animate, setAnimate] = useState(true)          // فقط بار اول خط‌ها ترسیم‌شونده
  const [expanded, setExpanded] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!cfg) return
    let stop = false
    const load = async () => {
      try {
        const res = await fetch(`/api/market-watch?cat=${encodeURIComponent(cat)}`, { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json()
        if (!stop) { setRows(j.rows ?? []); setDate(j.date ?? null); setNow(Date.now()) }
      } catch {} finally { if (!stop) setLoading(false) }
    }
    load()
    const iv = setInterval(load, 60_000) // دیتای سرور هر ۵ دقیقه عوض می‌شود
    return () => { stop = true; clearInterval(iv) }
  }, [cat, cfg])

  // انیمیشن ترسیم فقط روی اولین رندر — نه هر poll
  useEffect(() => {
    if (!loading && rows.length > 0) {
      const to = setTimeout(() => setAnimate(false), 1400)
      return () => clearTimeout(to)
    }
  }, [loading, rows.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => setExpanded(null), [])
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [expanded, close])

  const data: Datum[] = useMemo(() => rows.map((r, i) => ({
    ...r,
    tvalB: r.tval_total / 1e10,                                            // میلیارد تومان
    tval5m: i > 0 ? Math.max(0, (r.tval_total - rows[i - 1].tval_total) / 1e10) : 0,
    indBuyM: r.ind_buy_pc / 1e7, indSellM: r.ind_sell_pc / 1e7,            // میلیون تومان
    legBuyM: r.leg_buy_pc / 1e7, legSellM: r.leg_sell_pc / 1e7,
    ordDB: r.ord_demand / 1e10, ordSB: r.ord_supply / 1e10,
    ordxDB: r.ordx_demand / 1e10, ordxSB: r.ordx_supply / 1e10,
    moneyB: r.money_in / 1e10,
    bigBuyB: r.big_buy / 1e10, bigSellB: r.big_sell / 1e10, bigNetB: (r.big_buy - r.big_sell) / 1e10,
  })), [rows])

  const last = data.length > 0 ? data[data.length - 1] : null
  // زنده = آخرین اسنپ‌شات کمتر از ۱۲ دقیقه پیش (چرخه درج ۵ دقیقه است)
  const isLive = !!last && now - new Date(last.ts).getTime() < 12 * 60_000

  const renderChart = (def: ChartDef, big: boolean) => {
    const dec = def.dec ?? 0
    const lastIndex = data.length - 1
    const tickBig = big ? { ...axisTick, fontSize: 12 } : axisTick
    return (
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 6, left: 4, right: 6, bottom: 0 }}>
          <defs>
            {def.series.map(s => (
              <linearGradient key={`g-${def.id}-${s.key}`} id={`grad-${def.id}-${s.key}${big ? '-big' : ''}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.42} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
          {/* شروع بازار چپ، داده جدید سمت راست */}
          <XAxis dataKey="t" tick={tickBig} tickMargin={8} interval="preserveStartEnd" minTickGap={big ? 40 : 28} />
          <YAxis tick={tickBig} tickFormatter={(v: number) => fa(v, dec)} width={big ? 62 : 52} orientation="right" />
          {def.series.some(s => s.kind === 'bar') && <YAxis yAxisId="bars" hide />}
          {def.refZero && <ReferenceLine y={0} stroke={C.text} strokeDasharray="4 4" />}
          <ReTooltip
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
            cursor={{ stroke: 'rgba(255,255,255,0.28)', strokeDasharray: '4 4' }}
            formatter={(v: any, n: any) => [`${fa(Number(v), dec)}${def.unit ?? ''}`, n]}
          />
          {def.series.length > 1 && <Legend wrapperStyle={{ fontFamily: FONT, fontSize: big ? 13 : 12 }} />}
          {def.series.map(s => {
            if (s.kind === 'bar') return (
              <Bar key={s.key} yAxisId="bars" dataKey={s.key} name={s.name} fill={s.color}
                opacity={0.8} radius={[3, 3, 0, 0]} isAnimationActive={animate} animationDuration={900} />
            )
            if (s.kind === 'area') {
              // ورود پول: رنگ خط بر اساس آخرین مقدار (سبز/قرمز)
              const col = last && ((def.id === 'money' && last.moneyB < 0) || (def.id === 'bigmoney' && last.bigNetB < 0)) ? C.red : s.color
              return (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.name}
                  stroke={col} strokeWidth={2.6} strokeLinecap="round"
                  fill={`url(#grad-${def.id}-${s.key}${big ? '-big' : ''})`}
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
  }

  const distTitle = DIST_TITLES[cat] ?? `محدوده قیمتی آخرین معاملات ${cfg?.title ?? ''}`

  const renderDistChart = (big: boolean) => {
    if (!last) return null
    const dist = last.plp_dist ?? []
    const rows = PLP_BUCKET_LABELS.map((name, i) => ({ name, value: dist[i] ?? 0, neg: i < 6 }))
    const tickBig = big ? { ...axisTick, fontSize: 11 } : { ...axisTick, fontSize: 9 }
    return (
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 6, left: 4, right: 6, bottom: 0 }}>
          <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={distTick(big) as any} interval={0} tickLine={false} height={big ? 46 : 36} />
          <YAxis tick={tickBig} tickFormatter={(v: number) => fa(v)} width={big ? 50 : 40} orientation="right" allowDecimals={false} />
          <ReTooltip
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
            cursor={{ fill: 'rgba(255,255,255,0.06)' }}
            formatter={(v: any) => [fa(Number(v)), 'تعداد نماد']}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={animate} animationDuration={900}>
            {rows.map((r, i) => <Cell key={i} fill={r.neg ? C.red : C.green} />)}
            {big && (
              <LabelList dataKey="value" position="top" formatter={(v: any) => fa(Number(v))}
                style={{ fontFamily: FONT, fontSize: 12, fontWeight: 800, fill: '#eef1f8' }} />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  // برچسب داخل هر برش دایره‌ای: مقدار + درصد — هم‌راستا با کارت‌های دیگر (فونت وزیرمتن، رنگ کرم)
  const pieSliceLabel = (big: boolean) =>
    function PieSliceLabel(props: any) {
    const { cx, cy, midAngle, innerRadius, outerRadius, value, percent } = props
    if (!value) return null
    const RAD = Math.PI / 180
    const r = innerRadius + (outerRadius - innerRadius) * 0.62
    const x = cx + r * Math.cos(-midAngle * RAD)
    const y = cy + r * Math.sin(-midAngle * RAD)
    return (
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
        fontFamily={FONT} fontSize={big ? 14 : 11.5} fontWeight={800} fill="#fff"
        style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.65))' }}>
        {fa(value)} ({fa(Math.round(percent * 100))}٪)
      </text>
    )
  }

  // لجند سفارشی زیر نمودار دایره‌ای — نقطه رنگی + عنوان، به‌جای Legend پیش‌فرض recharts
  const pieLegend = (entries: { name: string; value: number; color: string }[], big: boolean) => (
    <div style={{
      display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: big ? '8px 18px' : '5px 12px',
      marginTop: big ? 14 : 8, padding: '0 6px',
    }}>
      {entries.map(e => (
        <span key={e.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: big ? 13 : 11.5, color: C.cream, fontWeight: 600 }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: e.color, flex: 'none' }} />
          {e.name}
        </span>
      ))}
    </div>
  )

  // نمودار دایره‌ای «تعداد نماد مثبت و منفی» — از last.sym_pos/sym_neg (همه دسته‌ها)
  const renderSymPie = (big: boolean) => {
    if (!last) return null
    const entries = [
      { name: 'نمادهای مثبت', value: last.sym_pos, color: C.green },
      { name: 'نمادهای منفی', value: last.sym_neg, color: C.red },
    ].filter(e => e.value > 0)
    if (entries.length === 0) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={entries} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="85%"
                paddingAngle={3} stroke="none" isAnimationActive={animate} animationDuration={900}
                label={pieSliceLabel(big)} labelLine={false}>
                {entries.map(e => <Cell key={e.name} fill={e.color} />)}
              </Pie>
              <ReTooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle}
                formatter={(v: any, n: any) => [`${fa(Number(v))} نماد`, n]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {pieLegend(entries, big)}
      </div>
    )
  }

  // نمودار دایره‌ای «تفکیک ارزش معاملات» — بورس/فرابورس/آپشن/صندوق‌ها — فقط cat=stocks
  const renderSegPie = (big: boolean) => {
    const seg = last?.tval_by_segment
    if (!seg) return null
    const entries = SEGMENT_ORDER
      .map(k => ({ name: SEGMENT_LABELS[k], value: (seg[k] ?? 0) / 1e13, color: SEGMENT_COLORS[k] })) // ریال → همت
      .filter(e => e.value > 0)
    if (entries.length === 0) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={entries} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="85%"
                paddingAngle={3} stroke="none" isAnimationActive={animate} animationDuration={900}
                label={pieSliceLabel(big)} labelLine={false}>
                {entries.map(e => <Cell key={e.name} fill={e.color} />)}
              </Pie>
              <ReTooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle}
                formatter={(v: any, n: any) => [`${fa(Number(v), 1)} همت`, n]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {pieLegend(entries, big)}
      </div>
    )
  }

  const symPieTitle = 'تعداد نماد مثبت و منفی'
  const segPieTitle = 'تفکیک ارزش معاملات بازار'

  if (!cfg) {
    return (
      <main style={{ minHeight: '100vh', background: C.bg, color: '#eef1f8', fontFamily: FONT, direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 18 }}>
        <div style={{ color: C.text }}>دسته‌ای با این نام وجود ندارد.</div>
        <Link href="/monitor" style={{ color: C.blue, textDecoration: 'none', fontWeight: 700 }}>→ بازگشت به رصد بازارها</Link>
      </main>
    )
  }

  const expandedDef = expanded ? DEFS.find(d => d.id === expanded) : null

  return (
    <AuthGate title="نمودار لحظه‌ای رصد بازارها">
      <main style={{ minHeight: '100vh', background: C.bg, color: '#eef1f8', fontFamily: FONT, direction: 'rtl', padding: isMobile ? '20px 12px 40px' : '28px 3vw 60px' }}>
        <div style={{ maxWidth: 1500, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, margin: 0 }}>رصد لحظه‌ای {cfg.title}</h1>
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
                <span style={{
                  fontSize: 11.5, fontWeight: 700, color: C.cream,
                  border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 13px',
                }}>
                  بسته — آخرین اسنپ‌شات {last.t}
                </span>
              ))}
            </div>
            <p style={{ color: C.text, fontSize: 13.5, margin: '8px 0 0' }}>
              بروزرسانی هر ۵ دقیقه، شنبه تا چهارشنبه {cfg.hours}
              {date ? ` — آخرین روز: ${new Date(date).toLocaleDateString('fa-IR')}` : ''}
            </p>
          </div>
          <Link href="/monitor" style={{ color: C.blue, textDecoration: 'none', fontSize: 14, fontWeight: 700, border: `1px solid ${C.border}`, borderRadius: 12, padding: '9px 18px', background: 'rgba(255,255,255,0.04)' }}>
            → بازگشت به رصد بازارها
          </Link>
        </div>

        {loading ? (
          <div style={{ color: C.text, textAlign: 'center', padding: 80 }}>در حال بارگذاری…</div>
        ) : data.length === 0 ? (
          <div style={{ color: C.text, textAlign: 'center', padding: 80, lineHeight: 2 }}>
            هنوز داده‌ای ثبت نشده.<br />اسنپ‌شات‌ها در روز معاملاتی از ساعت {cfg.hours.split(' ')[0]} ثبت می‌شوند.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
            {last?.plp_dist && (
              <button className="chart-card" onClick={() => setExpanded('plp_dist')}
                aria-label={`بزرگ‌نمایی ${distTitle}`}
                style={{
                  all: 'unset', boxSizing: 'border-box', cursor: 'zoom-in',
                  background: `linear-gradient(165deg, ${C.blue}0c, rgba(255,255,255,0.02))`,
                  border: `1px solid ${C.border}`, borderTop: `2px solid ${C.blue}55`,
                  borderRadius: 18, padding: '18px 10px 8px',
                  display: 'flex', flexDirection: 'column', minWidth: 0,
                  transition: 'border-color 0.2s, transform 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.blue}66` }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border }}>
                <div style={{ textAlign: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: '#eef1f8' }}>{distTitle}</div>
                </div>
                <div style={{ width: '100%', height: 240 }}>{renderDistChart(false)}</div>
              </button>
            )}
            {last && last.sym_pos + last.sym_neg > 0 && (
              <button className="chart-card" onClick={() => setExpanded('sym_pie')}
                aria-label={`بزرگ‌نمایی ${symPieTitle}`}
                style={{
                  all: 'unset', boxSizing: 'border-box', cursor: 'zoom-in',
                  background: `linear-gradient(165deg, ${C.green}0c, rgba(255,255,255,0.02))`,
                  border: `1px solid ${C.border}`, borderTop: `2px solid ${C.green}55`,
                  borderRadius: 18, padding: '18px 10px 8px',
                  display: 'flex', flexDirection: 'column', minWidth: 0,
                  transition: 'border-color 0.2s, transform 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.green}66` }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border }}>
                <div style={{ textAlign: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: '#eef1f8' }}>{symPieTitle}</div>
                </div>
                <div style={{ width: '100%', height: 240 }}>{renderSymPie(false)}</div>
              </button>
            )}
            {last?.tval_by_segment && (
              <button className="chart-card" onClick={() => setExpanded('seg_pie')}
                aria-label={`بزرگ‌نمایی ${segPieTitle}`}
                style={{
                  all: 'unset', boxSizing: 'border-box', cursor: 'zoom-in',
                  background: `linear-gradient(165deg, ${C.purple}0c, rgba(255,255,255,0.02))`,
                  border: `1px solid ${C.border}`, borderTop: `2px solid ${C.purple}55`,
                  borderRadius: 18, padding: '18px 10px 8px',
                  display: 'flex', flexDirection: 'column', minWidth: 0,
                  transition: 'border-color 0.2s, transform 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.purple}66` }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border }}>
                <div style={{ textAlign: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: '#eef1f8' }}>{segPieTitle}</div>
                </div>
                <div style={{ width: '100%', height: 240 }}>{renderSegPie(false)}</div>
              </button>
            )}
            {DEFS.map((def, i) => (
              <button key={def.id} className="chart-card" onClick={() => setExpanded(def.id)}
                aria-label={`بزرگ‌نمایی ${def.title}`}
                style={{
                  all: 'unset', boxSizing: 'border-box', cursor: 'zoom-in',
                  background: `linear-gradient(165deg, ${def.series[0].color}0c, rgba(255,255,255,0.02))`,
                  border: `1px solid ${C.border}`, borderTop: `2px solid ${def.series[0].color}55`,
                  borderRadius: 18, padding: '18px 10px 8px',
                  display: 'flex', flexDirection: 'column', minWidth: 0,
                  animationDelay: `${i * 55}ms`,
                  transition: 'border-color 0.2s, transform 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${def.series[0].color}66` }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border }}>
                <div style={{ textAlign: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: '#eef1f8' }}>{def.title}</div>
                  <div style={{ fontSize: 12.5, color: C.cream, marginTop: 5 }}>
                    {def.sub(last!).map((p, j) => <span key={j} style={p.color ? { color: p.color, fontWeight: 700 } : undefined}>{p.txt}</span>)}
                  </div>
                </div>
                <div style={{ width: '100%', height: 240 }}>{renderChart(def, false)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── مودال بزرگ‌نمایی ── */}
      {expanded === 'plp_dist' && last?.plp_dist && (
        <div onClick={close} role="dialog" aria-modal="true" style={{
          position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(4,6,10,0.78)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          padding: isMobile ? 10 : 32,
        }}>
          <div className="chart-modal" onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 1200, height: isMobile ? '82vh' : '78vh',
            background: `linear-gradient(165deg, ${C.blue}0e, ${C.panel})`,
            border: `1px solid ${C.border}`, borderTop: `2px solid ${C.blue}77`,
            borderRadius: 20, padding: isMobile ? '14px 8px 10px' : '20px 16px 14px',
            display: 'flex', flexDirection: 'column', boxShadow: '0 30px 90px rgba(0,0,0,0.7)',
            fontFamily: FONT, direction: 'rtl',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, padding: '0 8px' }}>
              <span style={{ fontSize: isMobile ? 15 : 18, fontWeight: 800, color: '#eef1f8' }}>{distTitle}</span>
              <button onClick={close} aria-label="بستن" style={{
                all: 'unset', cursor: 'pointer', width: 34, height: 34, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.text, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)',
                fontSize: 16, fontWeight: 700,
              }}>✕</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>{renderDistChart(true)}</div>
          </div>
        </div>
      )}
      {expanded === 'sym_pie' && last && (
        <div onClick={close} role="dialog" aria-modal="true" style={{
          position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(4,6,10,0.78)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          padding: isMobile ? 10 : 32,
        }}>
          <div className="chart-modal" onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 1200, height: isMobile ? '82vh' : '78vh',
            background: `linear-gradient(165deg, ${C.green}0e, ${C.panel})`,
            border: `1px solid ${C.border}`, borderTop: `2px solid ${C.green}77`,
            borderRadius: 20, padding: isMobile ? '14px 8px 10px' : '20px 16px 14px',
            display: 'flex', flexDirection: 'column', boxShadow: '0 30px 90px rgba(0,0,0,0.7)',
            fontFamily: FONT, direction: 'rtl',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, padding: '0 8px' }}>
              <span style={{ fontSize: isMobile ? 15 : 18, fontWeight: 800, color: '#eef1f8' }}>{symPieTitle}</span>
              <button onClick={close} aria-label="بستن" style={{
                all: 'unset', cursor: 'pointer', width: 34, height: 34, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.text, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)',
                fontSize: 16, fontWeight: 700,
              }}>✕</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>{renderSymPie(true)}</div>
          </div>
        </div>
      )}
      {expanded === 'seg_pie' && last?.tval_by_segment && (
        <div onClick={close} role="dialog" aria-modal="true" style={{
          position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(4,6,10,0.78)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          padding: isMobile ? 10 : 32,
        }}>
          <div className="chart-modal" onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 1200, height: isMobile ? '82vh' : '78vh',
            background: `linear-gradient(165deg, ${C.purple}0e, ${C.panel})`,
            border: `1px solid ${C.border}`, borderTop: `2px solid ${C.purple}77`,
            borderRadius: 20, padding: isMobile ? '14px 8px 10px' : '20px 16px 14px',
            display: 'flex', flexDirection: 'column', boxShadow: '0 30px 90px rgba(0,0,0,0.7)',
            fontFamily: FONT, direction: 'rtl',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, padding: '0 8px' }}>
              <span style={{ fontSize: isMobile ? 15 : 18, fontWeight: 800, color: '#eef1f8' }}>{segPieTitle}</span>
              <button onClick={close} aria-label="بستن" style={{
                all: 'unset', cursor: 'pointer', width: 34, height: 34, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.text, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)',
                fontSize: 16, fontWeight: 700,
              }}>✕</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>{renderSegPie(true)}</div>
          </div>
        </div>
      )}
      {expandedDef && last && (
        <div onClick={close} role="dialog" aria-modal="true" style={{
          position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(4,6,10,0.78)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          padding: isMobile ? 10 : 32,
        }}>
          <div className="chart-modal" onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 1200, height: isMobile ? '82vh' : '78vh',
            background: `linear-gradient(165deg, ${expandedDef.series[0].color}0e, ${C.panel})`,
            border: `1px solid ${C.border}`, borderTop: `2px solid ${expandedDef.series[0].color}77`,
            borderRadius: 20, padding: isMobile ? '14px 8px 10px' : '20px 16px 14px',
            display: 'flex', flexDirection: 'column', boxShadow: '0 30px 90px rgba(0,0,0,0.7)',
            fontFamily: FONT, direction: 'rtl',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, padding: '0 8px' }}>
              <div>
                <span style={{ fontSize: isMobile ? 15 : 18, fontWeight: 800, color: '#eef1f8' }}>{expandedDef.title}</span>
                <span style={{ fontSize: isMobile ? 11.5 : 13, color: C.cream, marginRight: 12 }}>
                  {expandedDef.sub(last).map((p, j) => <span key={j} style={p.color ? { color: p.color, fontWeight: 700 } : undefined}>{p.txt}</span>)}
                </span>
              </div>
              <button onClick={close} aria-label="بستن" style={{
                all: 'unset', cursor: 'pointer', width: 34, height: 34, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.text, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)',
                fontSize: 16, fontWeight: 700,
              }}>✕</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>{renderChart(expandedDef, true)}</div>
          </div>
        </div>
      )}
    </main>
    </AuthGate>
  )
}
