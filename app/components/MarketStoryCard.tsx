'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Row = { trade_date_shamsi: string; regime: string; headline: string; body: string }

// Market Story خودکار روزانه — روایت کوتاه «چرا بازار امروز این‌طور بود» (فاز ۳ نقشه راه)
// scripts/market-story-daily.js هر روز محاسبه و ذخیره می‌کند؛ این کامپوننت فقط می‌خواند.
export default function MarketStoryCard({ isDark }: { isDark: boolean }) {
  const panel = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,46,0.02)'
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,30,46,0.08)'
  const text = isDark ? '#E8F4FF' : '#0F1E2E'
  const cream = '#ddd5bd'
  const muted = isDark ? '#94A3B8' : '#64748B'
  const accent = '#38BDF8'

  const [row, setRow] = useState<Row | null>(null)

  useEffect(() => {
    supabase.from('market_story_daily').select('*')
      .order('trade_date_shamsi', { ascending: false }).limit(1)
      .then(({ data }) => setRow(data?.[0] ?? null))
  }, [])

  if (!row) return null

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12, background: panel, border: `0.5px solid ${border}`,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 15 }}>📰</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>{row.headline}</div>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.9, color: isDark ? cream : text }}>{row.body}</div>
      <div style={{ fontSize: 10.5, color: muted, marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span>⚠️ تولید هوش مصنوعی؛ صرفاً اطلاع‌رسانی است و توصیه سرمایه‌گذاری نیست.</span>
        <span>{row.trade_date_shamsi}</span>
      </div>
    </div>
  )
}
