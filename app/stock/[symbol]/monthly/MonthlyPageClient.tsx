'use client'

// صفحه کامل گزارش فعالیت ماهانه یک نماد — /stock/[symbol]/monthly

import { useEffect, useState } from 'react'
import { useIsMobile } from '../../../../lib/useIsMobile'
import type { Reports } from '../../../../lib/stockInsights'
import { StockSubShell, MonthlySection, PortfolioSection, M_ACCENT } from '../sections'

export default function MonthlyPageClient({ symbol, initialReports }: {
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

  const months = reports?.months ?? []
  const isPortfolio = months.length > 0 && months[months.length - 1].kind === 'portfolio'

  return (
    <StockSubShell symbol={symbol} title={isPortfolio ? 'پرتفوی سرمایه‌گذاری' : 'گزارش فعالیت ماهانه'} accent={M_ACCENT} isMobile={isMobile}>
      {t => months.length > 0 ? (
        isPortfolio
          ? <PortfolioSection months={months} t={t} isMobile={isMobile} />
          : <MonthlySection months={months} t={t} isMobile={isMobile} />
      ) : (
        <div style={{ fontSize: 12.5, color: t.muted, padding: '40px 0', textAlign: 'center' }}>
          گزارش فعالیت ماهانه‌ای برای نماد «{symbol}» در کدال ثبت نشده است.
        </div>
      )}
    </StockSubShell>
  )
}
