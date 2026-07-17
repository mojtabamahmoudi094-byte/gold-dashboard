'use client'

/**
 * مودال تاریخچه یک کارت عددی (نمودار خطی) — برای صفحه نماد سهام و صفحه صندوق
 * ظاهر و رفتار عیناً از مودال نمودار «رصد لحظه‌ای بازار» گرفته شده (app/monitor/[cat]/page.tsx)
 * تفاوت: دیتا لحظه‌ای/۵دقیقه‌ای نیست، یک ردیف روزانه‌ست — بدون liveDot تپنده، فقط dot ثابت آخر خط.
 */

import { useEffect, useCallback } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
} from 'recharts'
import { useIsMobile } from '../lib/useIsMobile'

const FONT = 'Vazirmatn, Arial, sans-serif'
const C = { text: '#a9b0c2', cream: '#ddd5bd', border: 'rgba(255,255,255,0.09)', bg: '#0a0d14', panel: '#12161f' }
const axisTick = { fontSize: 10, fill: C.text, fontFamily: FONT }
const tooltipStyle = {
  background: 'rgba(18,22,31,0.96)', border: `1px solid ${C.border}`, borderRadius: 12,
  fontFamily: FONT, fontSize: 12, direction: 'rtl' as const,
  boxShadow: '0 12px 40px rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
}

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })

// dot ثابت روی آخرین نقطه non-null — بدون پالس زنده چون دیتا روزانه است نه لحظه‌ای
function endDot(color: string, lastValidIndex: number) {
  return function EndDot(props: any) {
    const { cx, cy, index } = props
    if (index !== lastValidIndex || cx == null || cy == null) return <g key={`d${index}`} />
    return <circle key={`d${index}`} cx={cx} cy={cy} r={4} fill={color} stroke={C.bg} strokeWidth={1.5} />
  }
}

export type ChartModalPoint = { t: string; v: number | null }

export default function ChartModal({
  open, onClose, title, unit, color, data, loading,
}: {
  open: boolean
  onClose: () => void
  title: string
  unit?: string
  color: string
  data: ChartModalPoint[]
  loading?: boolean
}) {
  const isMobile = useIsMobile()
  const close = useCallback(() => onClose(), [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, close])

  if (!open) return null

  const lastValidIndex = (() => {
    for (let i = data.length - 1; i >= 0; i--) if (data[i].v != null) return i
    return -1
  })()

  return (
    <div onClick={close} role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(4,6,10,0.78)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      padding: isMobile ? 10 : 32,
    }}>
      <div className="chart-modal" onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 1200, height: isMobile ? '82vh' : '78vh',
        background: `linear-gradient(165deg, ${color}0e, ${C.panel})`,
        border: `1px solid ${C.border}`, borderTop: `2px solid ${color}77`,
        borderRadius: 20, padding: isMobile ? '14px 8px 10px' : '20px 16px 14px',
        display: 'flex', flexDirection: 'column', boxShadow: '0 30px 90px rgba(0,0,0,0.7)',
        fontFamily: FONT, direction: 'rtl',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, padding: '0 8px' }}>
          <span style={{ fontSize: isMobile ? 15 : 18, fontWeight: 800, color: '#eef1f8' }}>{title}</span>
          <button onClick={close} aria-label="بستن" style={{
            all: 'unset', cursor: 'pointer', width: 34, height: 34, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.text, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)',
            fontSize: 16, fontWeight: 700,
          }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.text, fontSize: 13 }}>
              در حال بارگذاری…
            </div>
          ) : data.length < 2 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.cream, fontSize: 13 }}>
              هنوز داده کافی برای نمودار ثبت نشده — ثبت روزانه همین امروز شروع شد
            </div>
          ) : (
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 6, left: 4, right: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="chartmodal-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.42} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" tick={axisTick} tickMargin={8} interval="preserveStartEnd" minTickGap={40} />
                <YAxis tick={axisTick} tickFormatter={(v: number) => fa(v, 1)} width={62} orientation="right" domain={['auto', 'auto']} />
                <ReTooltip
                  contentStyle={tooltipStyle}
                  cursor={{ stroke: 'rgba(255,255,255,0.28)', strokeDasharray: '4 4' }}
                  formatter={(v: any) => [v == null ? '—' : `${fa(Number(v), 1)}${unit ?? ''}`, title]}
                />
                <Line type="monotone" dataKey="v" name={title} stroke={color} strokeWidth={2.6} strokeLinecap="round"
                  connectNulls={false} dot={endDot(color, lastValidIndex)} activeDot={{ r: 5, strokeWidth: 0 }}
                  style={{ filter: `drop-shadow(0 0 7px ${color}55)` }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
