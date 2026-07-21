'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Row = { trade_date_shamsi: string; regime: string; breadth_pct: number; avg_change_pct: number; net_flow: number }

const REGIME_COLOR: Record<string, string> = {
  'صعودی': '#00E5A0', 'نزولی': '#FF4D6A', 'نوسانی': '#F59E0B',
  'تجمیع': '#38BDF8', 'توزیع': '#A78BFA',
}
const REGIME_ICON: Record<string, string> = {
  'صعودی': '▲', 'نزولی': '▼', 'نوسانی': '↔', 'تجمیع': '⇡', 'توزیع': '⇣',
}

// Regime Engine ساده — وضعیت کلی روزانه بازار سهام (فاز ۳ نقشه راه)
// scripts/market-regime-daily.js هر روز محاسبه می‌کند؛ این کامپوننت فقط می‌خواند.
export default function MarketRegimeBadge({ isDark }: { isDark: boolean }) {
  const panel = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,46,0.02)'
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,30,46,0.08)'
  const text = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#94A3B8' : '#64748B'

  const [row, setRow] = useState<Row | null>(null)

  useEffect(() => {
    supabase.from('market_regime_daily').select('*')
      .order('trade_date_shamsi', { ascending: false }).limit(1)
      .then(({ data }) => setRow(data?.[0] ?? null))
  }, [])

  if (!row) return null
  const color = REGIME_COLOR[row.regime] || muted

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 12,
      background: panel, border: `0.5px solid ${border}`, marginBottom: 16,
    }}
      title={`نسبت نمادهای مثبت: ${row.breadth_pct.toLocaleString('fa-IR')}٪ · میانگین تغییر: ${row.avg_change_pct.toLocaleString('fa-IR')}٪`}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8,
        background: `${color}18`, color, fontSize: 15, fontWeight: 700, flexShrink: 0,
      }}>{REGIME_ICON[row.regime] || '·'}</span>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: text }}>
          وضعیت بازار امروز: <span style={{ color }}>{row.regime}</span>
        </div>
        <div style={{ fontSize: 10.5, color: muted }}>
          {row.breadth_pct.toLocaleString('fa-IR')}٪ نمادها مثبت · {row.trade_date_shamsi}
        </div>
      </div>
    </div>
  )
}
