'use client'

// آرشیو تابلوخوانی — یک نمودار انتخابی با تاریخچه بلند (تا ۹۰ روز) + چیپ انتخاب متریک

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useIsMobile } from '../../../../../lib/useIsMobile'
import { safe } from '../../../../../lib/format'
import { TapeChartStyles, FlowBarsPanel, LineChartPanel, BarChartPanel } from '../../../../components/TapeChartPanels'
import { useTapeTheme, useTapeRows, type TapeRow } from '../TapePageClient'

const METRICS: { key: string; label: string }[] = [
  { key: 'flow',   label: 'ورود و خروج پول حقیقی' },
  { key: 'percap', label: 'سرانه خرید و فروش' },
  { key: 'tval',   label: 'ارزش معاملات' },
  { key: 'tvol',   label: 'حجم معاملات' },
  { key: 'power',  label: 'قدرت خریدار' },
  { key: 'codes',  label: 'تعداد کدهای حقیقی' },
  { key: 'ival',   label: 'ارزش خرید/فروش حقیقی' },
  { key: 'nval',   label: 'ارزش خرید/فروش حقوقی' },
  { key: 'ivol',   label: 'حجم خرید/فروش حقیقی' },
  { key: 'nvol',   label: 'حجم خرید/فروش حقوقی' },
]

function MetricChart({ metric, rows, t }: { metric: string; rows: TapeRow[]; t: any }) {
  const hasTape = (r: TapeRow) => r.buy_i_volume != null && r.pc != null
  const flowRows = rows.filter(r => r.money_in != null)
  const capRows = rows.filter(r => r.per_capita_buy != null || r.per_capita_sell != null)
  const snapRows = rows.filter(r => r.tval != null)
  const tapeRows = rows.filter(hasTape)

  const empty = (
    <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: 18, fontSize: 12, color: t.muted, lineHeight: 1.9 }}>
      برای این نمودار هنوز داده‌ای ثبت نشده است — داده خام حقیقی/حقوقی از تاریخ راه‌اندازی به بعد در پایان هر روز معاملاتی جمع می‌شود.
    </div>
  )

  switch (metric) {
    case 'flow':
      return flowRows.length ? (
        <FlowBarsPanel t={t} title="ورود و خروج پول حقیقی روزانه" unit="میلیارد تومان"
          flows={flowRows.map(r => ({ date: r.trade_date_shamsi || r.trade_date, net: Math.round(safe(r.money_in) / 1e9 * 10) / 10 }))} />
      ) : empty
    case 'percap':
      return capRows.length ? (
        <BarChartPanel t={t} title="سرانه خرید و فروش حقیقی روزانه" subtitle="میلیون تومان"
          rows={capRows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
          getA={r => Math.round(safe(r.per_capita_buy) / 1e6 * 10) / 10}
          getB={r => Math.round(safe(r.per_capita_sell) / 1e6 * 10) / 10} />
      ) : empty
    case 'tval':
      return snapRows.length ? (
        <BarChartPanel t={t} title="ارزش معاملات" subtitle="میلیارد تومان"
          rows={snapRows} colorA={t.accent} labelA="ارزش"
          getA={r => Math.round(safe(r.tval) / 1e10)} />
      ) : empty
    case 'tvol':
      return snapRows.length ? (
        <BarChartPanel t={t} title="حجم معاملات" subtitle="میلیون سهم"
          rows={snapRows} colorA="#A78BFA" labelA="حجم"
          getA={r => Math.round(safe(r.tvol) / 1e6 * 10) / 10} />
      ) : empty
    case 'power':
      return capRows.length >= 2 ? (
        <LineChartPanel t={t} title="قدرت خریدار حقیقی" subtitle="برابر · بالای ۱ = خریدار قوی‌تر"
          rows={capRows}
          getValue={r => { const s = safe(r.per_capita_sell); return s > 0 ? Math.round(safe(r.per_capita_buy) / s * 100) / 100 : 0 }}
          colorAbove="#00E5A0" colorBelow="#FF4D6A" threshold={1} />
      ) : empty
    case 'codes':
      return tapeRows.length ? (
        <BarChartPanel t={t} title="تعداد کدهای معاملاتی حقیقی" subtitle="نفر"
          rows={tapeRows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خریدار" labelB="فروشنده"
          getA={r => safe(r.buy_count_i)} getB={r => safe(r.sell_count_i)} />
      ) : empty
    case 'ival':
      return tapeRows.length ? (
        <BarChartPanel t={t} title="ارزش خرید و فروش حقیقی" subtitle="میلیارد تومان"
          rows={tapeRows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
          getA={r => Math.round(safe(r.buy_i_volume) * safe(r.pc) / 1e10 * 10) / 10}
          getB={r => Math.round(safe(r.sell_i_volume) * safe(r.pc) / 1e10 * 10) / 10} />
      ) : empty
    case 'nval':
      return tapeRows.length ? (
        <BarChartPanel t={t} title="ارزش خرید و فروش حقوقی" subtitle="میلیارد تومان"
          rows={tapeRows} colorA="#60A5FA" colorB="#F59E0B" labelA="خرید" labelB="فروش"
          getA={r => Math.round(safe(r.buy_n_volume) * safe(r.pc) / 1e10 * 10) / 10}
          getB={r => Math.round(safe(r.sell_n_volume) * safe(r.pc) / 1e10 * 10) / 10} />
      ) : empty
    case 'ivol':
      return tapeRows.length ? (
        <BarChartPanel t={t} title="حجم خرید و فروش حقیقی" subtitle="میلیون سهم"
          rows={tapeRows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
          getA={r => Math.round(safe(r.buy_i_volume) / 1e6 * 10) / 10}
          getB={r => Math.round(safe(r.sell_i_volume) / 1e6 * 10) / 10} />
      ) : empty
    case 'nvol':
      return tapeRows.length ? (
        <BarChartPanel t={t} title="حجم خرید و فروش حقوقی" subtitle="میلیون سهم"
          rows={tapeRows} colorA="#60A5FA" colorB="#F59E0B" labelA="خرید" labelB="فروش"
          getA={r => Math.round(safe(r.buy_n_volume) / 1e6 * 10) / 10}
          getB={r => Math.round(safe(r.sell_n_volume) / 1e6 * 10) / 10} />
      ) : empty
    default:
      return empty
  }
}

function ArchiveInner({ symbol }: { symbol: string }) {
  const t = useTapeTheme()
  const isMobile = useIsMobile()
  const sp = useSearchParams()
  const initial = METRICS.some(m => m.key === sp.get('m')) ? sp.get('m')! : 'flow'
  const [metric, setMetric] = useState(initial)
  const rows = useTapeRows(symbol, 90)

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px' : '40px 24px' }}>
        <TapeChartStyles />
        <Link href={`/stock/${encodeURIComponent(symbol)}/tape`} style={{ fontSize: 12, color: t.muted, textDecoration: 'none' }}>
          ← بازگشت به نمودار تابلوخوانی {symbol}
        </Link>
        <h1 style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: isMobile ? 19 : 24, fontWeight: 800, margin: '16px 0 4px', color: t.text,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#00E5A0', flexShrink: 0, boxShadow: '0 0 10px #00E5A0' }} />
          آرشیو تابلوخوانی {symbol}
        </h1>
        <div style={{ fontSize: 11.5, color: t.muted, marginBottom: 16, lineHeight: 1.9 }}>
          تا ۹۰ روز معاملاتی اخیر
        </div>

        {/* انتخاب متریک */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {METRICS.map(m => {
            const active = m.key === metric
            return (
              <button key={m.key} onClick={() => setMetric(m.key)} style={{
                fontSize: 11.5, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', minHeight: 40,
                fontFamily: 'inherit', fontWeight: active ? 800 : 500,
                background: active ? '#00E5A01a' : 'transparent',
                border: `0.5px solid ${active ? '#00E5A066' : t.border}`,
                color: active ? '#00E5A0' : t.muted,
              }}>{m.label}</button>
            )
          })}
        </div>

        {rows === null && (
          <div style={{ fontSize: 12.5, color: t.muted, padding: '40px 0', textAlign: 'center' }}>در حال بارگذاری…</div>
        )}
        {rows !== null && <MetricChart metric={metric} rows={rows} t={t} />}
      </div>
    </main>
  )
}

export default function ArchiveClient({ symbol }: { symbol: string }) {
  return (
    <Suspense fallback={null}>
      <ArchiveInner symbol={symbol} />
    </Suspense>
  )
}
