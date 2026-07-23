'use client'

// صفحه کامل اطلاعیه‌های کدال یک نماد — /stock/[symbol]/codal
// دریافت کلاینت‌ساید (مرورگر کاربر IP ایران دارد) با صفحه‌بندی ۵تایی

import { useIsMobile } from '../../../../lib/useIsMobile'
import CodalAnnouncements from '../../../components/CodalAnnouncements'
import { StockSubShell, C_ACCENT } from '../sections'

export default function CodalPageClient({ symbol }: { symbol: string }) {
  const isMobile = useIsMobile()
  return (
    <StockSubShell symbol={symbol} title="اطلاعیه‌های کدال" accent={C_ACCENT} isMobile={isMobile}>
      {t => <CodalAnnouncements symbol={symbol} isDark={t.isDark} isMobile={isMobile} pageSize={5} />}
    </StockSubShell>
  )
}
