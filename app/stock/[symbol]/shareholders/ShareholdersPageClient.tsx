'use client'

// صفحه کامل سهامداران عمده یک نماد — /stock/[symbol]/shareholders

import { useIsMobile } from '../../../../lib/useIsMobile'
import { StockSubShell, ShareholdersSection, H_ACCENT } from '../sections'

export default function ShareholdersPageClient({ symbol }: { symbol: string }) {
  const isMobile = useIsMobile()
  return (
    <StockSubShell symbol={symbol} title="سهامداران عمده" accent={H_ACCENT} isMobile={isMobile}>
      {t => (
        <ShareholdersSection
          symbol={symbol}
          t={t}
          limit={50}
          emptyMessage={`داده سهامداران عمده برای نماد «${symbol}» فعلاً در دسترس نیست — بعد از بسته‌شدن بازار به‌روز می‌شود.`}
        />
      )}
    </StockSubShell>
  )
}
