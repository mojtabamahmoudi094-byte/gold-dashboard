'use client'

// صفحه کامل گزارش‌های فصلی یک نماد — /stock/[symbol]/quarterly

import { useEffect, useState } from 'react'
import { useIsMobile } from '../../../../lib/useIsMobile'
import type { Reports } from '../../../../lib/stockInsights'
import { StockSubShell, QuarterlyFinSection, Q_ACCENT } from '../sections'

export default function QuarterlyPageClient({ symbol, initialReports }: {
  symbol: string; initialReports: Reports | null
}) {
  const isMobile = useIsMobile()
  const [reports, setReports] = useState<Reports | null>(initialReports)

  useEffect(() => {
    if (!symbol || initialReports) return
    fetch(`/api/stock-reports/${encodeURIComponent(symbol.replace(/\s+/g, '-'))}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setReports)
      .catch(() => setReports(null))
  }, [symbol, initialReports])

  const quarters = reports?.quarters ?? []

  return (
    <StockSubShell symbol={symbol} title="گزارش‌های فصلی" accent={Q_ACCENT} isMobile={isMobile}>
      {t => quarters.length > 0 ? (
        <QuarterlyFinSection quarters={quarters} t={t} isMobile={isMobile} />
      ) : (
        <div style={{ fontSize: 12.5, color: t.muted, padding: '40px 0', textAlign: 'center' }}>
          گزارش فصلی‌ای برای نماد «{symbol}» در کدال ثبت نشده است.
        </div>
      )}
    </StockSubShell>
  )
}
