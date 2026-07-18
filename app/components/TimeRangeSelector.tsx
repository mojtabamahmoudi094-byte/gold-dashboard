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

function toIso(d: DateObject | null): string {
  if (!d) return ''
  try { return d.convert(gregorian).format('YYYY-MM-DD') } catch { return '' }
}

function isoToPersianLabel(iso: string): string {
  try { return new DateObject({ date: iso, calendar: gregorian }).convert(persian).format('YYYY/MM/DD') } catch { return iso }
}

export default function TimeRangeSelector({
  value,
  customRange,
  onChange,
  isDark,
  accentColor = '#d9b45b',
}: {
  value: RangeKey
  customRange: [string, string] | null
  onChange: (key: RangeKey, customRange?: [string, string]) => void
  isDark: boolean
  accentColor?: string
}) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [fromDate, setFromDate] = useState<DateObject | null>(
    customRange ? new DateObject({ date: customRange[0], calendar: gregorian }).convert(persian) : null
  )
  const [toDate, setToDate] = useState<DateObject | null>(
    customRange ? new DateObject({ date: customRange[1], calendar: gregorian }).convert(persian) : null
  )

  // پس‌زمینه‌ی روشن‌تر از خود مودال (نه شفافیت خیلی کم) + مرز واضح — تشخیص «این دکمه‌ست» برای چشم ضعیف راحت‌تر باشد
  const cardBg = isDark ? '#0F1B2E' : '#fff'
  const text = isDark ? '#F2F6FA' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#5B6B7A'
  const border = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)'

  const rangeBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '12px 18px',
    minHeight: 46,
    borderRadius: 10,
    fontSize: 15,
    fontWeight: active ? 800 : 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    border: `1.5px solid ${active ? accentColor : border}`,
    background: active ? accentColor : cardBg,
    color: active ? '#fff' : text,
    whiteSpace: 'nowrap',
  })

  const customLabel = value === 'custom' && customRange
    ? `${isoToPersianLabel(customRange[0])} تا ${isoToPersianLabel(customRange[1])}`
    : 'بازه دلخواه'

  const canApply = !!fromDate && !!toDate

  const apply = () => {
    if (!fromDate || !toDate) return
    const from = toIso(fromDate)
    const to = toIso(toDate)
    if (!from || !to) return
    onChange('custom', from <= to ? [from, to] : [to, from])
    setPanelOpen(false)
  }

  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {RANGE_LABELS.map(r => (
          <button key={r.key} type="button" style={rangeBtnStyle(value === r.key)} onClick={() => { onChange(r.key); setPanelOpen(false) }}>
            {r.label}
          </button>
        ))}
        <button
          type="button"
          style={rangeBtnStyle(value === 'custom')}
          onClick={() => setPanelOpen(o => !o)}
        >
          {customLabel}
        </button>
      </div>

      {panelOpen && (
        <div style={{
          position: 'relative', marginTop: 12, zIndex: 20,
          background: cardBg, border: `1.5px solid ${border}`,
          borderRadius: 14, padding: 18, boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 8 }}>از تاریخ</div>
              <DatePicker
                calendar={persian}
                locale={persian_fa}
                value={fromDate}
                onChange={(v: any) => setFromDate(v || null)}
                inputClass="db-input db-input-lg"
                placeholder="انتخاب تاریخ"
              />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 8 }}>تا تاریخ</div>
              <DatePicker
                calendar={persian}
                locale={persian_fa}
                value={toDate}
                onChange={(v: any) => setToDate(v || null)}
                inputClass="db-input db-input-lg"
                placeholder="انتخاب تاریخ"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={!canApply}
            onClick={apply}
            style={{
              padding: '14px 18px', borderRadius: 10, fontSize: 16, fontWeight: 800,
              cursor: canApply ? 'pointer' : 'not-allowed',
              opacity: canApply ? 1 : 0.45,
              background: accentColor, color: '#fff', border: 'none', fontFamily: 'inherit',
              width: '100%',
            }}
          >
            اعمال بازه
          </button>
          {!canApply && (
            <div style={{ fontSize: 12.5, color: muted, textAlign: 'center' }}>
              اول تاریخ شروع، بعد تاریخ پایان رو انتخاب کن
            </div>
          )}
        </div>
      )}
    </div>
  )
}
