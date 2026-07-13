'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import persian from 'react-date-object/calendars/persian'
import persian_fa from 'react-date-object/locales/persian_fa'
import DateObject from 'react-date-object'
import gregorian from 'react-date-object/calendars/gregorian'

const DatePicker = dynamic(() => import('react-multi-date-picker'), { ssr: false })

export type RangeKey = '1w' | '1m' | '3m' | '1y' | 'custom'

export const RANGE_DAYS: Record<Exclude<RangeKey, 'custom'>, number> = {
  '1w': 7,
  '1m': 30,
  '3m': 91,
  '1y': 365,
}

const RANGE_LABELS: { key: Exclude<RangeKey, 'custom'>; label: string }[] = [
  { key: '1w', label: '۱ هفته' },
  { key: '1m', label: '۱ ماه' },
  { key: '3m', label: '۳ ماه' },
  { key: '1y', label: '۱ سال' },
]

function shamsiToGregorianIso(d: DateObject): string {
  try {
    return d.convert(gregorian).format('YYYY-MM-DD')
  } catch {
    return ''
  }
}

export default function TimeRangeSelector({
  value,
  customRange,
  onChange,
  isDark,
  accentColor = '#3b82f6',
}: {
  value: RangeKey
  customRange: [string, string] | null
  onChange: (key: RangeKey, customRange?: [string, string]) => void
  isDark: boolean
  accentColor?: string
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftRange, setDraftRange] = useState<DateObject[]>([])

  const text = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'
  const panelBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px',
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    border: `0.5px solid ${active ? accentColor : border}`,
    background: active ? `${accentColor}1F` : panelBg,
    color: active ? accentColor : muted,
    whiteSpace: 'nowrap',
  })

  const customLabel = value === 'custom' && customRange
    ? `${new DateObject({ date: customRange[0], calendar: gregorian }).convert(persian).format('YYYY/MM/DD')} تا ${new DateObject({ date: customRange[1], calendar: gregorian }).convert(persian).format('YYYY/MM/DD')}`
    : 'بازه دلخواه'

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
      {RANGE_LABELS.map(r => (
        <button key={r.key} type="button" style={btnStyle(value === r.key)} onClick={() => onChange(r.key)}>
          {r.label}
        </button>
      ))}
      <button
        type="button"
        style={btnStyle(value === 'custom')}
        onClick={() => setPickerOpen(o => !o)}
      >
        📅 {customLabel}
      </button>

      {pickerOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 20,
          background: isDark ? '#0A1220' : '#fff', border: `0.5px solid ${border}`,
          borderRadius: 12, padding: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', gap: 10, minWidth: 240,
        }}>
          <span style={{ fontSize: 12, color: muted }}>از تاریخ تا تاریخ (شمسی)</span>
          <DatePicker
            calendar={persian}
            locale={persian_fa}
            range
            value={draftRange}
            onChange={(v: any) => setDraftRange(Array.isArray(v) ? v : [])}
            inputClass="db-input"
          />
          <button
            type="button"
            disabled={draftRange.length < 2}
            onClick={() => {
              const from = shamsiToGregorianIso(draftRange[0])
              const to = shamsiToGregorianIso(draftRange[1])
              if (!from || !to) return
              onChange('custom', from <= to ? [from, to] : [to, from])
              setPickerOpen(false)
            }}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
              cursor: draftRange.length < 2 ? 'not-allowed' : 'pointer',
              opacity: draftRange.length < 2 ? 0.5 : 1,
              background: accentColor, color: '#fff', border: 'none', fontFamily: 'inherit',
            }}
          >
            اعمال بازه
          </button>
        </div>
      )}
    </div>
  )
}
