'use client'

// توزیع چیپ — حجم معاملات ۲۱۰ روز اخیر روی بازه قیمتی (میانگین بهای تمام‌شده، درصد حامل سودده)
// داده از stock_chip_distribution (یک ردیف به‌ازای هر نماد، cron شبانه scripts/chip-distribution-daily.js)

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GREEN, RED } from './colors'
import { glassStyle } from './uiTokens'

type Bin = { price: number; weight: number }
type Row = {
  symbol: string
  trade_date_shamsi: string
  bins: Bin[]
  avg_cost: number
  concentration_pct: number
  profit_ratio: number
  current_close: number
}

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })

type Props = { symbol: string; isDark: boolean }

export default function ChipDistribution({ symbol, isDark }: Props) {
  const [row, setRow] = useState<Row | null | undefined>(undefined) // undefined=در حال بارگذاری، null=داده‌ای نیست

  useEffect(() => {
    if (!symbol) return
    setRow(undefined)
    supabase
      .from('stock_chip_distribution')
      .select('symbol, trade_date_shamsi, bins, avg_cost, concentration_pct, profit_ratio, current_close')
      .eq('symbol', symbol)
      .order('trade_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => setRow(error || !data ? null : (data as Row)))
  }, [symbol])

  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#475569'
  const line  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,30,46,0.1)'
  const track = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,30,46,0.04)'

  const maxWeight = useMemo(() => row?.bins ? Math.max(...row.bins.map(b => b.weight)) : 1, [row])
  // بالا = بیشترین قیمت، مثل نردبان قیمت
  const rows = useMemo(() => (row?.bins ? [...row.bins].reverse() : []), [row])

  if (row === undefined) return null // در حال بارگذاری — چیزی نشان نده تا پرش UI نداشته باشیم
  if (row === null) return null // نماد هنوز توزیع چیپ ندارد (کمتر از ۶۰ روز معامله)

  const priceOf = (idx: number) => rows[idx]?.price ?? 0
  const yPct = (price: number) => {
    const min = rows[rows.length - 1]?.price ?? price
    const max = rows[0]?.price ?? price
    if (max === min) return 50
    return ((max - price) / (max - min)) * 100
  }

  return (
    <section aria-label={`توزیع چیپ ${symbol}`} style={{
      ...glassStyle(isDark), padding: '16px 18px', marginTop: 14, color: text,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>توزیع چیپ {symbol}</h2>
        <span style={{
          fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
          color: row.profit_ratio >= 50 ? GREEN : RED,
          background: `color-mix(in srgb, ${row.profit_ratio >= 50 ? GREEN : RED} 13%, transparent)`,
          border: `1px solid color-mix(in srgb, ${row.profit_ratio >= 50 ? GREEN : RED} 35%, transparent)`,
        }}>
          {fa(row.profit_ratio, 1)}٪ حامل‌ها سودده
        </span>
        <span style={{
          fontSize: 11.5, padding: '4px 10px', borderRadius: 8,
          background: isDark ? 'rgba(10,18,30,0.6)' : 'rgba(15,30,46,0.05)',
          border: `1px solid ${line}`, color: muted,
        }}>
          تمرکز چیپ {fa(row.concentration_pct, 1)}٪
        </span>
        <span style={{ fontSize: 11, color: muted }}>میانگین بهای تمام‌شده {fa(row.avg_cost)} ریال</span>
      </div>

      <div style={{
        position: 'relative', height: 260, marginTop: 14,
        borderInlineStart: `1px solid ${line}`, paddingInlineStart: 10,
      }}>
        {/* بارها — بالا بیشترین قیمت، پایین کمترین قیمت */}
        <div dir="ltr" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
          {rows.map((b, i) => {
            const inProfit = b.price < row.current_close
            const color = inProfit ? GREEN : RED
            const w = Math.max(2, (b.weight / maxWeight) * 100)
            return (
              <div key={i} title={`${fa(b.price)} ریال — ${fa(b.weight * 100, 2)}٪`}
                style={{ flex: 1, position: 'relative', background: track }}>
                <div style={{
                  position: 'absolute', insetBlock: '10%', insetInlineStart: 0,
                  width: `${w}%`, minWidth: 3, borderRadius: '0 3px 3px 0',
                  background: color, opacity: isDark ? 0.55 : 0.6,
                }} />
              </div>
            )
          })}
        </div>

        {/* خط قیمت فعلی */}
        <div style={{
          position: 'absolute', insetInline: 0, top: `${yPct(row.current_close)}%`,
          borderTop: `2px dashed ${text}`, opacity: 0.85,
        }}>
          <span style={{
            position: 'absolute', insetInlineEnd: 0, top: -9, fontSize: 10, fontWeight: 700,
            padding: '1px 6px', borderRadius: 6, background: isDark ? '#060B14' : '#F4F7FB', color: text,
          }}>
            قیمت فعلی {fa(row.current_close)}
          </span>
        </div>

        {/* خط میانگین بهای تمام‌شده */}
        <div style={{
          position: 'absolute', insetInline: 0, top: `${yPct(row.avg_cost)}%`,
          borderTop: `2px dashed #d9b45b`, opacity: 0.85,
        }}>
          <span style={{
            position: 'absolute', insetInlineEnd: 0, top: 2, fontSize: 10, fontWeight: 700,
            padding: '1px 6px', borderRadius: 6, background: isDark ? '#060B14' : '#F4F7FB', color: '#d9b45b',
          }}>
            میانگین بها {fa(row.avg_cost)}
          </span>
        </div>

        {/* برچسب سقف/کف بازه */}
        <span style={{ position: 'absolute', top: -2, insetInlineStart: 0, fontSize: 10, color: muted }}>
          {fa(priceOf(0))}
        </span>
        <span style={{ position: 'absolute', bottom: -2, insetInlineStart: 0, fontSize: 10, color: muted }}>
          {fa(priceOf(rows.length - 1))}
        </span>
      </div>

      <p style={{ fontSize: 10.5, color: muted, lineHeight: 1.8, margin: '12px 0 0' }}>
        برآورد تقریبی از حجم معاملات ۲۱۰ روز اخیر، بدون داده سهام شناور روزانه — سبز یعنی بازه قیمتی زیر
        قیمت فعلی (حامل سودده)، قرمز یعنی بالای قیمت فعلی. صرفاً جنبه اطلاع‌رسانی دارد و توصیه خرید یا
        فروش نیست.
      </p>
    </section>
  )
}
