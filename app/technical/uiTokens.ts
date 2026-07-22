// توکن‌های مشترک زبان طراحی ۲۰۲۶ بخش تکنیکال (اسپک ایجنت UI Designer)

import type React from 'react'

/** بازار تهران: شنبه تا چهارشنبه ۹:۰۰–۱۲:۳۰ */
export function marketOpen(): boolean {
  const now = new Date()
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', weekday: 'short' }).format(now)
  if (day === 'Thu' || day === 'Fri') return false
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(now).split(':').map(Number)
  const mins = h * 60 + m
  return mins >= 540 && mins <= 750
}

/** سطح شیشه‌ای — تیره/روشن */
export const glassStyle = (isDark: boolean): React.CSSProperties => ({
  background: isDark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.82)',
  backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)'}`,
  borderRadius: 16,
  boxShadow: isDark
    ? '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)'
    : '0 8px 24px rgba(217,180,91,0.08)',
})

/** keyframe های مشترک — یک بار در هر صفحه رندر شود */
export const TA_KEYFRAMES = `
  @keyframes taIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes taPing { 0% { transform: scale(1); opacity: 0.7 } 100% { transform: scale(2.4); opacity: 0 } }
  @keyframes taBlob1 { from { transform: translate(0,0) scale(1) } to { transform: translate(-60px,50px) scale(1.15) } }
  @keyframes taBlob2 { from { transform: translate(0,0) scale(1.1) } to { transform: translate(70px,-40px) scale(0.95) } }
  @keyframes taBlob3 { from { transform: translate(0,0) scale(1) } to { transform: translate(40px,60px) scale(1.2) } }
  @keyframes taSkeletonPulse { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }
  .ta-skeleton-pulse { animation: taSkeletonPulse 1.3s ease-in-out infinite }
  @media (prefers-reduced-motion: reduce) { .ta-anim, .ta-anim *, .ta-skeleton-pulse { animation: none !important } }
`

export const enterAnim = (i: number): React.CSSProperties => ({
  animation: 'taIn 450ms cubic-bezier(0.22,1,0.36,1) both',
  animationDelay: `${i * 60}ms`,
})
