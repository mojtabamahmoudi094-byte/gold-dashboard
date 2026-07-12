'use client'

import { useEffect, useState } from 'react'
import type { Theme } from '../../../lib/theme'

/**
 * پنل آموزشی جمع‌شونده «چطور استفاده کنم؟» — الگوی مشترک از app/valuation/page.tsx
 * وضعیت باز/بسته در localStorage با storageKey جداگانه هر صفحه نگه داشته می‌شود.
 */
export function TutorialPanel({
  t, isDark, storageKey, title, defaultOpen = true, children,
}: {
  t: Theme
  isDark: boolean
  storageKey: string
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const cream = isDark ? '#ddd5bd' : '#6B5A3A'

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey)
    if (saved != null) setOpen(saved !== '0')
  }, [storageKey])

  const toggle = () => setOpen(v => {
    window.localStorage.setItem(storageKey, v ? '0' : '1')
    return !v
  })

  return (
    <div style={{
      background: `linear-gradient(160deg, ${t.green}0e, transparent 45%), ${t.panel}`,
      border: `0.5px solid ${t.border}`, borderTop: `2px solid ${t.green}66`,
      borderRadius: 14, padding: '18px 20px', backdropFilter: 'blur(12px)',
      boxShadow: t.cardShadow, marginBottom: 20,
    }}>
      <button
        type="button"
        onClick={toggle}
        style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', width: '100%', boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: t.textBright }}>📘 {title}</span>
        <span style={{ fontSize: 11, color: t.muted }}>{open ? 'بستن ▲' : 'باز کردن ▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 16, fontSize: 12, color: cream, lineHeight: 2 }}>
          {children}
        </div>
      )}
    </div>
  )
}
