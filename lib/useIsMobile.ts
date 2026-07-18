'use client'

import { useEffect, useLayoutEffect, useState } from 'react'

// useLayoutEffect سمت کلاینت (قبل از paint اجرا می‌شود، برخلاف useEffect) —
// چشمک‌زدن دسکتاپ→موبایل بعد از mount را کم می‌کند بدون ایجاد mismatch هیدریشن
// (مقدار اولیه هنوز false است، دقیقاً مطابق خروجی SSR).
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * تشخیص موبایل با شنونده resize — همان رفتار کد قبلی صفحه‌ها:
 * مقدار اولیه false (سمت سرور) و به‌روزرسانی بعد از mount.
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)

  useIsomorphicLayoutEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])

  return isMobile
}
