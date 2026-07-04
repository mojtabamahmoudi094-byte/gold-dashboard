'use client'

import React from 'react'

/**
 * اسکلتون‌های بارگذاری مشترک — از کلاس `.skeleton` در globals.css استفاده می‌کنند.
 * ابعاد را نزدیک به محتوای نهایی بدهید تا پرش لی‌اوت نداشته باشیم.
 */

export function Skeleton({
  width = '100%',
  height = 14,
  radius = 8,
  style,
}: {
  width?: number | string
  height?: number | string
  radius?: number
  style?: React.CSSProperties
}) {
  return (
    <div
      className="skeleton"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  )
}

/** بلوک بزرگ — جای نمودار یا کارت */
export function SkeletonBlock({
  height = 200,
  radius = 14,
  style,
}: {
  height?: number | string
  radius?: number
  style?: React.CSSProperties
}) {
  return <Skeleton width="100%" height={height} radius={radius} style={style} />
}

/** چند ردیف پشت‌سرهم — جای جدول یا لیست */
export function SkeletonRows({
  rows = 6,
  height = 40,
  gap = 10,
  radius = 10,
  style,
}: {
  rows?: number
  height?: number
  gap?: number
  radius?: number
  style?: React.CSSProperties
}) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width="100%" height={height} radius={radius} />
      ))}
    </div>
  )
}
