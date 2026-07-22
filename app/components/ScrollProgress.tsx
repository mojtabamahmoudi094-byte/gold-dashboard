'use client'

import { useEffect, useRef } from 'react'

export default function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const h = document.documentElement
      const scrollable = h.scrollHeight - h.clientHeight
      const pct = scrollable > 0 ? h.scrollTop / scrollable : 0
      const bar = barRef.current
      if (bar) {
        bar.style.transform = `scaleX(${pct})`
        bar.style.boxShadow = pct > 0.005 ? '0 0 12px rgba(244,215,149,0.6)' : 'none'
      }
    }
    const onScrollOrResize = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', top: 0, insetInlineStart: 0, insetInlineEnd: 0, height: 2.5, zIndex: 300, background: 'transparent', pointerEvents: 'none' }}>
      <div
        ref={barRef}
        style={{
          height: '100%',
          width: '100%',
          transformOrigin: 'right',
          transform: 'scaleX(0)',
          background: 'linear-gradient(90deg, #d9b45b, #6366f1, #f4d795, #a78bfa)',
          backgroundSize: '200% 100%',
          animation: 'bs-shimmer 3s linear infinite',
        }}
      />
    </div>
  )
}
