'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Row = { trade_date_shamsi: string; index_value: number; daily_return_pct: number; fund_count: number }

const GREEN = '#00E5A0'
const RED = '#FF4D6A'
const ACCENT = '#d9b45b'

// شاخص هم‌وزن صندوق‌های طلا/نقره‌ی بورس‌سنج — فیچر اختصاصی (رقبا شاخص مشابه ندارند)
// scripts/equal-weight-index.js هر روز محاسبه می‌کند؛ این کامپوننت فقط می‌خواند + تفسیر AI می‌سازد
export default function EqualWeightIndexCard({ category, isDark }: { category: 'طلا' | 'نقره'; isDark: boolean }) {
  const panel = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,46,0.02)'
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,30,46,0.08)'
  const text = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#94A3B8' : '#64748B'
  const cream = '#ddd5bd'

  const [rows, setRows] = useState<Row[] | null>(null)
  const [narrative, setNarrative] = useState<{ headline: string; text: string } | null>(null)
  const [narrLoading, setNarrLoading] = useState(false)

  useEffect(() => {
    setRows(null)
    setNarrative(null)
    supabase.from('equal_weight_index').select('trade_date_shamsi, index_value, daily_return_pct, fund_count')
      .eq('category', category).order('trade_date_shamsi', { ascending: true }).limit(365)
      .then(({ data }) => setRows(data ?? []))
  }, [category])

  const last = rows && rows.length > 0 ? rows[rows.length - 1] : null
  const first = rows && rows.length > 0 ? rows[0] : null
  const totalReturn = last && first ? ((last.index_value - first.index_value) / first.index_value) * 100 : null

  useEffect(() => {
    if (!last || !first || narrative || narrLoading) return
    setNarrLoading(true)
    const facts = [
      `شاخص هم‌وزن صندوق‌های ${category} بورس‌سنج امروز (${last.trade_date_shamsi}): ${last.index_value.toLocaleString('fa-IR')} واحد`,
      `بازده امروز شاخص: ${last.daily_return_pct.toLocaleString('fa-IR')}٪`,
      `بازده تجمعی شاخص از ${first.trade_date_shamsi} تا امروز: ${totalReturn?.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`,
      `تعداد صندوق‌های محاسبه‌شده در این شاخص امروز: ${last.fund_count}`,
    ].join(' · ')
    fetch('/api/signal-narrative', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: `شاخص هم‌وزن صندوق‌های ${category}`, reason: facts }),
    }).then(r => r.json()).then(j => { if (j.ok) setNarrative({ headline: j.headline, text: j.text }) })
      .catch(() => {}).finally(() => setNarrLoading(false))
  }, [last, first, category, narrative, narrLoading, totalReturn])

  if (rows === null) return null
  if (rows.length === 0) return null

  const maxV = Math.max(...rows.map(r => r.index_value))
  const minV = Math.min(...rows.map(r => r.index_value))
  const range = maxV - minV || 1

  return (
    <section style={{
      background: panel, border: `0.5px solid ${border}`, borderRadius: 16,
      padding: '20px 20px 22px', marginTop: 22, backdropFilter: 'blur(12px)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: ACCENT, flexShrink: 0, boxShadow: `0 0 10px ${ACCENT}` }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: text }}>شاخص هم‌وزن صندوق‌های {category} بورس‌سنج</span>
          <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 7, background: `${ACCENT}14`, border: `0.5px solid ${ACCENT}40`, color: ACCENT }}>اختصاصی</span>
        </div>
        {last && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: text, fontFamily: 'system-ui, sans-serif' }}>
              {last.index_value.toLocaleString('fa-IR')}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: last.daily_return_pct >= 0 ? GREEN : RED }}>
              {last.daily_return_pct >= 0 ? '+' : ''}{last.daily_return_pct.toLocaleString('fa-IR')}٪
            </span>
          </div>
        )}
      </div>

      {/* نمودار خطی ساده */}
      <div style={{ display: 'flex', direction: 'ltr', alignItems: 'flex-end', gap: rows.length > 60 ? 1 : 3, height: 80, minWidth: 0, marginBottom: 10 }}>
        {rows.map((r, i) => {
          const h = Math.max(((r.index_value - minV) / range) * 100, 4)
          return (
            <div key={r.trade_date_shamsi + i} title={`${r.trade_date_shamsi}: ${r.index_value.toLocaleString('fa-IR')}`}
              style={{ flex: 1, minWidth: 0, maxWidth: 14, height: `${h}%`, borderRadius: 2, background: `${ACCENT}${i === rows.length - 1 ? 'ff' : '80'}` }} />
          )
        })}
      </div>
      <div style={{ fontSize: 9.5, color: muted, marginBottom: 16 }}>
        پایه ۱۰۰ در {first?.trade_date_shamsi} · بازده تجمعی: {totalReturn !== null ? `${totalReturn >= 0 ? '+' : ''}${totalReturn.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪` : '—'}
      </div>

      {narrative && (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: `${ACCENT}0c`, border: `0.5px solid ${ACCENT}30` }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: text, marginBottom: 5 }}>{narrative.headline}</div>
          <div style={{ fontSize: 12, color: cream, lineHeight: 1.9 }}>{narrative.text}</div>
        </div>
      )}
    </section>
  )
}
