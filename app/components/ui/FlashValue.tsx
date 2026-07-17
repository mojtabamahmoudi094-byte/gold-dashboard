'use client'

import { useEffect, useRef, useState } from 'react'

/** پس‌زمینه رو موقتی سبز/قرمز می‌کنه وقتی value نسبت به رندر قبلی تغییر کرد — برای قیمت‌های لحظه‌ای */
export default function FlashValue({
  value,
  children,
  style,
}: {
  value: number
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const prev = useRef(value)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (prev.current !== value) {
      setFlash(value > prev.current ? 'up' : 'down')
      prev.current = value
      const t = window.setTimeout(() => setFlash(null), 900)
      return () => window.clearTimeout(t)
    }
  }, [value])

  return (
    <span
      style={{
        display: 'inline-block',
        borderRadius: 4,
        padding: '1px 5px',
        transition: 'background-color 0.8s ease-out',
        backgroundColor: flash === 'up' ? 'rgba(0,229,160,0.28)' : flash === 'down' ? 'rgba(255,77,106,0.28)' : 'transparent',
        ...style,
      }}
    >
      {children}
    </span>
  )
}
