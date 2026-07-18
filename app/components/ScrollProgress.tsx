'use client'

import { useEffect, useState } from 'react'

export default function ScrollProgress() {
  const [pct, setPct] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement
      const scrollable = h.scrollHeight - h.clientHeight
      setPct(scrollable > 0 ? (h.scrollTop / scrollable) * 100 : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', top: 0, insetInlineStart: 0, insetInlineEnd: 0, height: 2.5, zIndex: 300, background: 'transparent', pointerEvents: 'none' }}>
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #d9b45b, #6366f1, #f4d795, #a78bfa)',
          backgroundSize: '200% 100%',
          animation: 'bs-shimmer 3s linear infinite',
          boxShadow: pct > 0.5 ? '0 0 12px rgba(244,215,149,0.6)' : 'none',
          transition: 'width 0.12s ease-out',
        }}
      />
    </div>
  )
}
