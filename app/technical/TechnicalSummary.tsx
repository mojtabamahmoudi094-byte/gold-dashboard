'use client'

// جمع‌بندی خودکار وضعیت تکنیکال — rule-based، زیر نمودار هر نماد

import { useMemo } from 'react'
import { buildTechnicalSummary, type SummaryTone } from '../../lib/technicalSummary'
import type { Candle } from '../../lib/indicators'
import { GREEN, RED } from './colors'
import { glassStyle } from './uiTokens'

const toneColor = (t: SummaryTone) => (t === 'pos' ? GREEN : t === 'neg' ? RED : '#3b82f6')
const fa = (v: number) => v.toLocaleString('fa-IR')

type Props = { symbol: string; candles: Candle[]; isDark: boolean }

export default function TechnicalSummary({ symbol, candles, isDark }: Props) {
  const summary = useMemo(() => buildTechnicalSummary(candles), [candles])
  if (!summary) return null

  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#475569'

  const biasLabel = summary.bias === 'pos' ? 'مثبت' : summary.bias === 'neg' ? 'منفی' : 'خنثی'
  const biasClr = toneColor(summary.bias)

  return (
    <section aria-label={`جمع‌بندی تکنیکال ${symbol}`} style={{
      ...glassStyle(isDark),
      padding: '16px 18px', marginTop: 14,
      fontFamily: 'inherit', color: text,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>جمع‌بندی خودکار {symbol}</h2>
        <span style={{
          fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
          color: biasClr, background: `color-mix(in srgb, ${biasClr} 13%, transparent)`,
          border: `1px solid color-mix(in srgb, ${biasClr} 35%, transparent)`,
        }}>
          برآیند سیگنال‌ها: {biasLabel} ({fa(summary.posCount)} مثبت · {fa(summary.negCount)} منفی)
        </span>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {summary.items.map((it, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, lineHeight: 1.9 }}>
            <span aria-hidden style={{
              width: 7, height: 7, borderRadius: '50%', background: toneColor(it.tone),
              flexShrink: 0, marginTop: 9,
            }} />
            <span style={{ color: text }}>{it.text}</span>
          </li>
        ))}
      </ul>

      <p style={{ fontSize: 10.5, color: muted, lineHeight: 1.8, margin: '12px 0 0' }}>
        این جمع‌بندی به‌صورت خودکار از فرمول‌های تکنیکال روی داده‌های روزانه ساخته می‌شود،
        توصیه خرید یا فروش نیست و مسئولیت تصمیم‌های معاملاتی با خود شماست.
      </p>
    </section>
  )
}
