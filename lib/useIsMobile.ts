'use client'

import { useEffect, useState } from 'react'

/**
 * تشخیص موبایل با شنونده resize — همان رفتار کد قبلی صفحه‌ها:
 * مقدار اولیه false (سمت سرور) و به‌روزرسانی بعد از mount.
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])

  return isMobile
}
