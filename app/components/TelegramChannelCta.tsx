'use client'

import { useEffect, useState } from 'react'
import { darkTheme, lightTheme } from '../../lib/theme'
import { useIsMobile } from '../../lib/useIsMobile'

// بنر عضویت کانال تلگرام — انتهای صفحه‌های پرتردد محتوایی (سهم/صندوق).
// کلیک با data-attribute در PostHog autocapture قابل تفکیک است (UTM روی t.me معنا ندارد).
export default function TelegramChannelCta({ context }: { context: string }) {
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved) setIsDark(saved !== 'light')
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  const t = isDark ? darkTheme : lightTheme

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      background: t.panel, border: `1px solid ${t.borderData}`, borderRadius: 14,
      padding: isMobile ? '14px 16px' : '16px 22px', margin: '18px 0',
    }}>
      <div style={{ fontSize: 30, flexShrink: 0 }} aria-hidden>📣</div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: t.text, marginBottom: 3 }}>
          کانال تلگرام بورس سنج
        </div>
        <div style={{ fontSize: 12.5, color: t.muted, lineHeight: 1.9 }}>
          گزارش لحظه‌ای بازار، تحلیل گزارش‌های کدال و رصد پول هوشمند — همان لحظه در تلگرام‌تان.
        </div>
      </div>
      <a
        href="https://t.me/bourssanjj"
        target="_blank"
        rel="noopener noreferrer"
        data-cta="telegram-channel"
        data-cta-context={context}
        style={{
          display: 'inline-block', padding: '11px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: 'linear-gradient(135deg, #d9b45b, #f4d795)', color: '#0A0805',
          textDecoration: 'none', whiteSpace: 'nowrap', minHeight: 44, boxSizing: 'border-box',
        }}>
        عضویت در کانال
      </a>
    </div>
  )
}
