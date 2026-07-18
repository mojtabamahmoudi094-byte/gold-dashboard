'use client'

/**
 * نوار دیداری حباب/اختلاف قیمت (مثلاً تابلو نسبت به ارزش ذاتی، یا NAV نسبت به قیمت).
 * مقدار منفی سمت چپ رشد می‌کند، مقدار مثبت سمت راست.
 * posColor/negColor پیش‌فرض سبز/قرمز استانداردن؛ برای صفحاتی مثل حباب طلا که «حباب مثبت = بد»
 * است می‌شه این دو رو جابه‌جا پاس داد تا رنگ‌دهی با معنای واقعی صفحه هم‌خوان بمونه.
 * maxPct: درصدی که معادل پر شدن کامل یک طرف نوار در نظر گرفته می‌شود.
 */
export default function BubbleBar({
  value,
  maxPct = 20,
  height = 6,
  width = 72,
  posColor = 'oklch(0.74 0.17 155)',
  negColor = 'oklch(0.68 0.2 25)',
  trackColor = 'rgba(255,255,255,0.08)',
}: {
  value: number | null | undefined
  maxPct?: number
  height?: number
  width?: number
  posColor?: string
  negColor?: string
  trackColor?: string
}) {
  if (value == null || Number.isNaN(value)) {
    return (
      <div
        aria-hidden
        style={{ width, height, borderRadius: height, background: trackColor, flexShrink: 0 }}
      />
    )
  }

  const pct = Math.min(Math.abs(value) / maxPct, 1) * 100
  const isPositive = value >= 0

  return (
    <div
      role="img"
      aria-label={`${isPositive ? '+' : ''}${value.toFixed(1)} درصد`}
      style={{ display: 'flex', alignItems: 'center', width, height, flexShrink: 0 }}
    >
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', height }}>
        <div
          style={{
            height,
            borderRadius: `${height}px 0 0 ${height}px`,
            background: !isPositive ? negColor : trackColor,
            width: !isPositive ? `${pct}%` : '2px',
            transition: 'width .3s ease',
          }}
        />
      </div>
      <div style={{ width: 1, height: height + 8, background: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
      <div style={{ flex: 1, height }}>
        <div
          style={{
            height,
            borderRadius: `0 ${height}px ${height}px 0`,
            background: isPositive ? posColor : trackColor,
            width: isPositive ? `${pct}%` : '2px',
            transition: 'width .3s ease',
          }}
        />
      </div>
    </div>
  )
}
