'use client'

// رجیستری نمودارهای تابلوخوانی صندوق — مشترک بین صفحهٔ تابلوخوانی (۱۰ روز) و آرشیو (نامحدود)
// از پنل‌های مشترک app/components/TapeChartPanels استفاده می‌کند (همان ظاهر + دکمهٔ «آرشیو» گوشه)

import { safe } from '../../../lib/format'
import { FlowBarsPanel, LineChartPanel, BarChartPanel } from '../../components/TapeChartPanels'

const isRial = (r: any) => safe(r.trade_value) > 1e6

export type FundMetricKey =
  | 'flow' | 'percap' | 'tval' | 'tvol' | 'power'
  | 'codes' | 'ival' | 'nval' | 'ivol' | 'nvol'

export const FUND_TAPE_METRICS: { key: FundMetricKey; title: string }[] = [
  { key: 'flow', title: 'ورود و خروج پول حقیقی روزانه' },
  { key: 'percap', title: 'سرانهٔ خرید و فروش حقیقی روزانه' },
  { key: 'tval', title: 'ارزش معاملات' },
  { key: 'tvol', title: 'حجم معاملات' },
  { key: 'power', title: 'قدرت خریدار حقیقی' },
  { key: 'codes', title: 'تعداد کدهای معاملاتی حقیقی' },
  { key: 'ival', title: 'ارزش خرید و فروش حقیقی' },
  { key: 'nval', title: 'ارزش خرید و فروش حقوقی' },
  { key: 'ivol', title: 'حجم خرید و فروش حقیقی' },
  { key: 'nvol', title: 'حجم خرید و فروش حقوقی' },
]

export function FundTapeChart({ m, rows, t, archiveHref }: {
  m: FundMetricKey; rows: any[]; t: any; archiveHref?: string
}) {
  switch (m) {
    case 'flow': {
      const flows = rows.map(r => ({
        date: r.trade_date_shamsi || '',
        net: Math.round((safe(r.buy_i_volume) - safe(r.sell_i_volume)) * safe(r.price_close) / (isRial(r) ? 1e10 : 1e9) * 10) / 10,
      }))
      return <FlowBarsPanel t={t} title="ورود و خروج پول حقیقی روزانه" unit="میلیارد تومان" flows={flows} archiveHref={archiveHref} />
    }
    case 'percap':
      return <BarChartPanel t={t} title="سرانهٔ خرید و فروش حقیقی روزانه" subtitle="میلیون تومان"
        rows={rows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
        getA={r => { const d = isRial(r) ? 1e7 : 1e6; return safe(r.buy_count_i) > 0 ? Math.round(safe(r.buy_i_volume) * safe(r.price_close) / safe(r.buy_count_i) / d) : 0 }}
        getB={r => { const d = isRial(r) ? 1e7 : 1e6; return safe(r.sell_count_i) > 0 ? Math.round(safe(r.sell_i_volume) * safe(r.price_close) / safe(r.sell_count_i) / d) : 0 }}
        archiveHref={archiveHref} />
    case 'tval':
      return <BarChartPanel t={t} title="ارزش معاملات" subtitle="میلیارد تومان"
        rows={rows} colorA={t.accent} labelA="ارزش"
        getA={r => { const tv = safe(r.trade_value); return tv > 1e6 ? Math.round(tv / 1e9) : tv }} archiveHref={archiveHref} />
    case 'tvol':
      return <BarChartPanel t={t} title="حجم معاملات" subtitle="میلیون سهم"
        rows={rows} colorA="#A78BFA" labelA="حجم"
        getA={r => Math.round(safe(r.volume) / 1e6 * 10) / 10} archiveHref={archiveHref} />
    case 'power':
      return <LineChartPanel t={t} title="قدرت خریدار حقیقی" subtitle="برابر · بالای ۱ = خریدار قوی‌تر"
        rows={rows}
        getValue={r => {
          const bc = safe(r.buy_count_i), sc = safe(r.sell_count_i)
          const bA = bc > 0 ? safe(r.buy_i_volume) / bc : 0
          const sA = sc > 0 ? safe(r.sell_i_volume) / sc : 0
          return sA > 0 ? Math.round(bA / sA * 100) / 100 : 0
        }}
        colorAbove="#00E5A0" colorBelow="#FF4D6A" threshold={1} archiveHref={archiveHref} />
    case 'codes':
      return <BarChartPanel t={t} title="تعداد کدهای معاملاتی حقیقی" subtitle="نفر"
        rows={rows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خریدار" labelB="فروشنده"
        getA={r => safe(r.buy_count_i)} getB={r => safe(r.sell_count_i)} archiveHref={archiveHref} />
    case 'ival':
      return <BarChartPanel t={t} title="ارزش خرید و فروش حقیقی" subtitle="میلیارد تومان"
        rows={rows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
        getA={r => { const d = isRial(r) ? 1e10 : 1e9; return Math.round(safe(r.buy_i_volume) * safe(r.price_close) / d * 10) / 10 }}
        getB={r => { const d = isRial(r) ? 1e10 : 1e9; return Math.round(safe(r.sell_i_volume) * safe(r.price_close) / d * 10) / 10 }}
        archiveHref={archiveHref} />
    case 'nval':
      return <BarChartPanel t={t} title="ارزش خرید و فروش حقوقی" subtitle="میلیارد تومان"
        rows={rows} colorA="#60A5FA" colorB="#F59E0B" labelA="خرید" labelB="فروش"
        getA={r => { const d = isRial(r) ? 1e10 : 1e9; return Math.round(Math.max(safe(r.volume) - safe(r.buy_i_volume), 0) * safe(r.price_close) / d * 10) / 10 }}
        getB={r => { const d = isRial(r) ? 1e10 : 1e9; return Math.round(Math.max(safe(r.volume) - safe(r.sell_i_volume), 0) * safe(r.price_close) / d * 10) / 10 }}
        archiveHref={archiveHref} />
    case 'ivol':
      return <BarChartPanel t={t} title="حجم خرید و فروش حقیقی" subtitle="میلیون سهم"
        rows={rows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
        getA={r => safe(r.buy_i_volume) / 1e6} getB={r => safe(r.sell_i_volume) / 1e6} archiveHref={archiveHref} />
    case 'nvol':
      return <BarChartPanel t={t} title="حجم خرید و فروش حقوقی" subtitle="میلیون سهم"
        rows={rows} colorA="#60A5FA" colorB="#F59E0B" labelA="خرید" labelB="فروش"
        getA={r => Math.max(safe(r.volume) - safe(r.buy_i_volume), 0) / 1e6}
        getB={r => Math.max(safe(r.volume) - safe(r.sell_i_volume), 0) / 1e6} archiveHref={archiveHref} />
    default:
      return null
  }
}
