'use client'

// نمودار تابلوخوانی یک نماد — /stock/[symbol]/tape
// ظاهر دقیقاً مثل نمودارهای صفحه صندوق طلا؛ ۱۰ روز آخر، آرشیو در گوشه هر نمودار

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { darkTheme, lightTheme, shouldUseDark } from '../../../../lib/theme'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { safe } from '../../../../lib/format'
import { TapeChartStyles, FlowBarsPanel, LineChartPanel, BarChartPanel } from '../../../components/TapeChartPanels'

export type TapeRow = {
  trade_date: string; trade_date_shamsi?: string
  pc?: number; tval?: number; tvol?: number
  buy_i_volume?: number; sell_i_volume?: number
  buy_n_volume?: number; sell_n_volume?: number
  buy_count_i?: number; sell_count_i?: number
  buy_count_n?: number; sell_count_n?: number
  money_in?: number; per_capita_buy?: number; per_capita_sell?: number
}

// نمودارهایی که به داده خام tape نیاز دارند (از روز راه‌اندازی جدول به بعد پر می‌شود)
const hasTape = (r: TapeRow) => r.buy_i_volume != null && r.pc != null

export function useTapeTheme() {
  const [isDark, setIsDark] = useState(true)
  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])
  return isDark ? darkTheme : lightTheme
}

export function useTapeRows(symbol: string, days: number) {
  const [rows, setRows] = useState<TapeRow[] | null>(null)
  useEffect(() => {
    setRows(null)
    fetch(`/api/stock-tape/${encodeURIComponent(symbol)}?days=${days}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(j => setRows(j.rows ?? []))
      .catch(() => setRows([]))
  }, [symbol, days])
  return rows
}

// تعریف مشترک ۱۰ نمودار — در صفحه اصلی و آرشیو استفاده می‌شود
export function TapeCharts({ symbol, rows, t, isMobile, withArchiveLinks }: {
  symbol: string; rows: TapeRow[]; t: any; isMobile: boolean; withArchiveLinks: boolean
}) {
  const enc = encodeURIComponent(symbol)
  const ah = (m: string) => withArchiveLinks ? `/stock/${enc}/tape/archive?m=${m}` : undefined

  const flowRows = rows.filter(r => r.money_in != null)
  const capRows = rows.filter(r => r.per_capita_buy != null || r.per_capita_sell != null)
  const snapRows = rows.filter(r => r.tval != null)
  const tapeRows = rows.filter(hasTape)

  // واحدها: money_in تومان → میلیارد؛ سرانه تومان → میلیون؛ tval ریال → میلیارد تومان (÷1e10)؛
  // ارزش حقیقی/حقوقی = حجم×قیمت پایانی (ریال) ÷1e10 = میلیارد تومان
  const flows = flowRows.map(r => ({
    date: r.trade_date_shamsi || r.trade_date, net: Math.round((safe(r.money_in) / 1e9) * 10) / 10,
  }))

  const noTapeYet = tapeRows.length === 0 && (
    <div style={{
      background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12,
      padding: '18px', fontSize: 12, color: t.muted, lineHeight: 1.9, gridColumn: '1 / -1',
    }}>
      داده خام حقیقی/حقوقی (تعداد کدها و تفکیک خرید/فروش) از امروز به بعد در پایان هر روز معاملاتی جمع‌آوری می‌شود و نمودارهای تکمیلی به‌مرور پر می‌شوند.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TapeChartStyles />

      {/* ورود و خروج پول حقیقی */}
      {flows.length > 0 && (
        <FlowBarsPanel t={t} title="ورود و خروج پول حقیقی روزانه" unit="میلیارد تومان"
          flows={flows} archiveHref={ah('flow')} />
      )}

      {/* سرانه خرید و فروش حقیقی */}
      {capRows.length > 0 && (
        <BarChartPanel t={t} title="سرانه خرید و فروش حقیقی روزانه" subtitle="میلیون تومان"
          rows={capRows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
          getA={r => Math.round(safe(r.per_capita_buy) / 1e6 * 10) / 10}
          getB={r => Math.round(safe(r.per_capita_sell) / 1e6 * 10) / 10}
          archiveHref={ah('percap')} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        {snapRows.length > 0 && (
          <BarChartPanel t={t} title="ارزش معاملات" subtitle="میلیارد تومان"
            rows={snapRows} colorA={t.accent} labelA="ارزش"
            getA={r => Math.round(safe(r.tval) / 1e10)}
            archiveHref={ah('tval')} />
        )}

        {snapRows.length > 0 && (
          <BarChartPanel t={t} title="حجم معاملات" subtitle="میلیون سهم"
            rows={snapRows} colorA="#A78BFA" labelA="حجم"
            getA={r => Math.round(safe(r.tvol) / 1e6 * 10) / 10}
            archiveHref={ah('tvol')} />
        )}

        {capRows.length >= 2 && (
          <LineChartPanel t={t} title="قدرت خریدار حقیقی" subtitle="برابر · بالای ۱ = خریدار قوی‌تر"
            rows={capRows}
            getValue={r => {
              const s = safe(r.per_capita_sell)
              return s > 0 ? Math.round(safe(r.per_capita_buy) / s * 100) / 100 : 0
            }}
            colorAbove="#00E5A0" colorBelow="#FF4D6A" threshold={1}
            archiveHref={ah('power')} />
        )}

        {tapeRows.length > 0 && (
          <BarChartPanel t={t} title="تعداد کدهای معاملاتی حقیقی" subtitle="نفر"
            rows={tapeRows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خریدار" labelB="فروشنده"
            getA={r => safe(r.buy_count_i)}
            getB={r => safe(r.sell_count_i)}
            archiveHref={ah('codes')} />
        )}

        {tapeRows.length > 0 && (
          <BarChartPanel t={t} title="ارزش خرید و فروش حقیقی" subtitle="میلیارد تومان"
            rows={tapeRows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
            getA={r => Math.round(safe(r.buy_i_volume) * safe(r.pc) / 1e10 * 10) / 10}
            getB={r => Math.round(safe(r.sell_i_volume) * safe(r.pc) / 1e10 * 10) / 10}
            archiveHref={ah('ival')} />
        )}

        {tapeRows.length > 0 && (
          <BarChartPanel t={t} title="ارزش خرید و فروش حقوقی" subtitle="میلیارد تومان"
            rows={tapeRows} colorA="#60A5FA" colorB="#F59E0B" labelA="خرید" labelB="فروش"
            getA={r => Math.round(safe(r.buy_n_volume) * safe(r.pc) / 1e10 * 10) / 10}
            getB={r => Math.round(safe(r.sell_n_volume) * safe(r.pc) / 1e10 * 10) / 10}
            archiveHref={ah('nval')} />
        )}

        {tapeRows.length > 0 && (
          <BarChartPanel t={t} title="حجم خرید و فروش حقیقی" subtitle="میلیون سهم"
            rows={tapeRows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
            getA={r => Math.round(safe(r.buy_i_volume) / 1e6 * 10) / 10}
            getB={r => Math.round(safe(r.sell_i_volume) / 1e6 * 10) / 10}
            archiveHref={ah('ivol')} />
        )}

        {tapeRows.length > 0 && (
          <BarChartPanel t={t} title="حجم خرید و فروش حقوقی" subtitle="میلیون سهم"
            rows={tapeRows} colorA="#60A5FA" colorB="#F59E0B" labelA="خرید" labelB="فروش"
            getA={r => Math.round(safe(r.buy_n_volume) / 1e6 * 10) / 10}
            getB={r => Math.round(safe(r.sell_n_volume) / 1e6 * 10) / 10}
            archiveHref={ah('nvol')} />
        )}

        {noTapeYet}
      </div>
    </div>
  )
}

export default function TapePageClient({ symbol }: { symbol: string }) {
  const t = useTapeTheme()
  const isMobile = useIsMobile()
  const rows = useTapeRows(symbol, 10)

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px' : '40px 24px' }}>
        <Link href={`/stock/${encodeURIComponent(symbol)}`} style={{ fontSize: 12, color: t.muted, textDecoration: 'none' }}>
          ← بازگشت به صفحه {symbol}
        </Link>
        <h1 style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: isMobile ? 19 : 24, fontWeight: 800, margin: '16px 0 4px', color: t.text,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#00E5A0', flexShrink: 0, boxShadow: '0 0 10px #00E5A0' }} />
          نمودار تابلوخوانی {symbol}
        </h1>
        <div style={{ fontSize: 11.5, color: t.muted, marginBottom: 18, lineHeight: 1.9 }}>
          ۱۰ روز معاملاتی اخیر — برای روزهای بیشتر، دکمه «آرشیو» گوشه هر نمودار
        </div>

        {rows === null && (
          <div style={{ fontSize: 12.5, color: t.muted, padding: '40px 0', textAlign: 'center' }}>در حال بارگذاری…</div>
        )}
        {rows !== null && rows.length === 0 && (
          <div style={{ fontSize: 12.5, color: t.muted, padding: '40px 0', textAlign: 'center' }}>
            هنوز داده تابلوخوانی برای «{symbol}» ثبت نشده است.
          </div>
        )}
        {rows !== null && rows.length > 0 && (
          <TapeCharts symbol={symbol} rows={rows} t={t} isMobile={isMobile} withArchiveLinks />
        )}
      </div>
    </main>
  )
}
