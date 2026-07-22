'use client'

/**
 * نوار دیداری RSI (۰ تا ۱۰۰). زیر ۳۰ اشباع فروش (سبز)، بالای ۷۰ اشباع خرید (قرمز)، بینابین خنثی.
 */
export default function RsiBar({
  value,
  width = 64,
  height = 6,
  overbought = 70,
  oversold = 30,
  overboughtColor = 'oklch(0.68 0.2 25)',
  oversoldColor = 'oklch(0.74 0.17 155)',
  neutralColor = 'rgba(255,255,255,0.35)',
  trackColor = 'rgba(255,255,255,0.08)',
}: {
  value: number | null | undefined
  width?: number
  height?: number
  overbought?: number
  oversold?: number
  overboughtColor?: string
  oversoldColor?: string
  neutralColor?: string
  trackColor?: string
}) {
  if (value == null || Number.isNaN(value)) {
    return <div aria-hidden style={{ width, height, borderRadius: height, background: trackColor, flexShrink: 0 }} />
  }

  const pct = Math.min(Math.max(value, 0), 100)
  const color = value >= overbought ? overboughtColor : value <= oversold ? oversoldColor : neutralColor

  return (
    <div
      role="img"
      aria-label={`RSI ${value.toFixed(1)}`}
      style={{ width, height, borderRadius: height, background: trackColor, overflow: 'hidden', flexShrink: 0 }}
    >
      <div style={{ width: '100%', height: '100%', background: color, transformOrigin: 'right', transform: `scaleX(${pct / 100})`, transition: 'transform .3s ease' }} />
    </div>
  )
}
