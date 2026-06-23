'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import dynamic from 'next/dynamic'
import persian from 'react-date-object/calendars/persian'
import persian_fa from 'react-date-object/locales/persian_fa'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'

const DatePicker = dynamic(() => import('react-multi-date-picker'), { ssr: false })

// ── helpers ──────────────────────────────────────────────
const safe = (v: any) => Number(v || 0)

function calcMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) =>
    i < period - 1
      ? null
      : Math.round(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period)
  )
}

function getSignal(values: number[]): { label: string; color: string; bg: string } {
  if (values.length < 10) return { label: 'WAIT', color: '#8B9DB0', bg: 'rgba(139,157,176,0.1)' }
  const ma5 = calcMA(values, 5)
  const ma10 = calcMA(values, 10)
  const last = values.length - 1
  const prev = values.length - 2
  const m5Last = ma5[last] ?? 0
  const m5Prev = ma5[prev] ?? 0
  const m10Last = ma10[last] ?? 0
  const m10Prev = ma10[prev] ?? 0
  if (m5Prev <= m10Prev && m5Last > m10Last)
    return { label: 'BUY', color: '#00E5A0', bg: 'rgba(0,229,160,0.12)' }
  if (m5Prev >= m10Prev && m5Last < m10Last)
    return { label: 'SELL', color: '#FF4D6A', bg: 'rgba(255,77,106,0.12)' }
  return { label: 'HOLD', color: '#00C8FF', bg: 'rgba(0,200,255,0.1)' }
}

function detectAnomalies(values: number[]): boolean[] {
  return values.map((v, i) => {
    if (i < 7) return false
    const window = values.slice(i - 7, i)
    const avg = window.reduce((a, b) => a + b, 0) / window.length
    const std = Math.sqrt(window.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / window.length)
    return Math.abs(v - avg) > 2 * std
  })
}

// ── custom tooltip ────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(13,23,38,0.95)',
      border: '0.5px solid rgba(0,200,255,0.25)',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      direction: 'rtl',
      backdropFilter: 'blur(8px)',
    }}>
      <p style={{ color: '#4A6B8A', marginBottom: 6 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? '#00C8FF', margin: '2px 0', fontWeight: 600 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString('fa-IR') : '—'}
        </p>
      ))}
    </div>
  )
}

// ── main component ────────────────────────────────────────
export default function DashboardPage() {
  const [date, setDate] = useState('')
  const [value, setValue] = useState('')
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showAlerts, setShowAlerts] = useState(true)

  const loadData = async () => {
    const { data } = await supabase
      .from('gold_funds')
      .select('*')
      .order('id', { ascending: true })
    if (data) setRecords(data)
  }

  useEffect(() => { loadData() }, [])

  const saveData = async () => {
    if (!date || !value) return alert('تاریخ و مقدار را وارد کنید')
    setLoading(true)
    await supabase.from('gold_funds').insert([{
      trade_date_shamsi: date,
      trade_value: safe(value),
    }])
    setLoading(false)
    setDate('')
    setValue('')
    loadData()
  }

  const deleteRecord = async (id: number) => {
    if (!confirm('حذف شود؟')) return
    await supabase.from('gold_funds').delete().eq('id', id)
    loadData()
  }

  const saveEdit = async (id: number) => {
    await supabase.from('gold_funds').update({ trade_value: safe(editValue) }).eq('id', id)
    setEditingId(null)
    loadData()
  }

  // ── analytics ──────────────────────────────────────────
  const analytics = useMemo(() => {
    const vals = records.map(r => safe(r.trade_value))
    const last = vals.at(-1) ?? 0
    const prev = vals.at(-2) ?? 0
    const change = prev ? (((last - prev) / prev) * 100).toFixed(2) : '0'
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
    const max = vals.length ? Math.max(...vals) : 0
    const min = vals.length ? Math.min(...vals) : 0

    const ma5 = calcMA(vals, 5)
    const ma10 = calcMA(vals, 10)
    const signal = getSignal(vals)
    const anomalies = detectAnomalies(vals)

    const last3 = vals.slice(-3)
    const trend =
      last3.length === 3 && last3[2] > last3[1] && last3[1] > last3[0] ? 'up' :
      last3.length === 3 && last3[2] < last3[1] && last3[1] < last3[0] ? 'down' : 'neutral'

    const avg7 = vals.length >= 7
      ? Math.round(vals.slice(-7).reduce((a, b) => a + b, 0) / 7)
      : avg

    const alertList: string[] = []
    if (anomalies.at(-1)) alertList.push(`ارزش آخرین روز خارج از محدوده نرمال است`)
    if (signal.label === 'BUY') alertList.push('سیگنال خرید: MA5 از MA10 عبور کرد')
    if (signal.label === 'SELL') alertList.push('سیگنال فروش: MA5 زیر MA10 رفت')
    if (last > max * 0.98 && vals.length > 5) alertList.push('ارزش به نزدیکی سقف تاریخی رسیده')

    const chartData = records.map((r, i) => ({
      date: r.trade_date_shamsi,
      value: safe(r.trade_value),
      ma5: ma5[i],
      ma10: ma10[i],
      anomaly: anomalies[i] ? safe(r.trade_value) : undefined,
    }))

    return { last, prev, change, avg, max, min, avg7, signal, trend, alertList, chartData, anomalies }
  }, [records])

  const isUp = Number(analytics.change) >= 0

  return (
    <main style={{
      minHeight: '100vh',
      background: '#060B14',
      color: '#E2E8F0',
      fontFamily: 'Vazirmatn, Arial, sans-serif',
      direction: 'rtl',
    }}>

      {/* TOPBAR */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 28px',
        borderBottom: '0.5px solid rgba(0,200,255,0.12)',
        background: 'rgba(6,11,20,0.97)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00C8FF' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>شاگرد تنبل بازار</div>
            <div style={{ fontSize: 11, color: '#4A6B8A' }}>داشبورد تحلیل ارزش معاملات طلا</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* SIGNAL BADGE */}
          <div style={{
            padding: '5px 14px', borderRadius: 20, fontWeight: 700, fontSize: 13,
            background: analytics.signal.bg,
            border: `0.5px solid ${analytics.signal.color}44`,
            color: analytics.signal.color,
            letterSpacing: '0.05em',
          }}>
            {analytics.signal.label}
          </div>
          <div style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12,
            background: isUp ? 'rgba(0,229,160,0.08)' : 'rgba(255,77,106,0.08)',
            border: `0.5px solid ${isUp ? 'rgba(0,229,160,0.3)' : 'rgba(255,77,106,0.3)'}`,
            color: isUp ? '#00E5A0' : '#FF4D6A', fontWeight: 700,
          }}>
            {isUp ? '+' : ''}{analytics.change}٪
          </div>
          <div style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 11,
            background: 'rgba(0,200,255,0.06)',
            border: '0.5px solid rgba(0,200,255,0.2)',
            color: '#00C8FF',
          }}>
            {analytics.trend === 'up' ? '▲ صعودی' : analytics.trend === 'down' ? '▼ نزولی' : '◆ خنثی'}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* ALERTS */}
        {showAlerts && analytics.alertList.length > 0 && (
          <div style={{
            background: 'rgba(255,200,0,0.05)',
            border: '0.5px solid rgba(255,200,0,0.2)',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {analytics.alertList.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ color: '#FFC800', fontSize: 14 }}>⚠</span>
                  <span style={{ color: '#C8A800' }}>{a}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowAlerts(false)}
              style={{ background: 'none', border: 'none', color: '#4A6B8A', cursor: 'pointer', fontSize: 16, padding: 0 }}
            >×</button>
          </div>
        )}

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {[
            { label: 'آخرین ارزش', value: analytics.last.toLocaleString('fa-IR'), sub: 'تومان' },
            { label: 'تغییر روزانه', value: `${isUp ? '+' : ''}${analytics.change}٪`, color: isUp ? '#00E5A0' : '#FF4D6A', sub: 'نسبت به قبل' },
            { label: 'میانگین ۷ روزه', value: analytics.avg7.toLocaleString('fa-IR'), sub: 'تومان' },
            { label: 'سقف تاریخی', value: analytics.max.toLocaleString('fa-IR'), sub: 'تومان', color: '#00C8FF' },
            { label: 'تعداد رکورد', value: records.length.toLocaleString('fa-IR'), sub: 'داده' },
          ].map((k, i) => (
            <div key={i} style={{
              background: 'rgba(13,23,38,0.8)',
              border: '0.5px solid rgba(0,200,255,0.1)',
              borderRadius: 12, padding: '14px 16px',
              backdropFilter: 'blur(12px)',
            }}>
              <div style={{ fontSize: 10, color: '#4A6B8A', marginBottom: 8 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.color ?? '#E2E8F0' }}>{k.value}</div>
              <div style={{ fontSize: 10, color: '#2A3D55', marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* CHART + FORM */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

          {/* CHART */}
          <div style={{
            background: 'rgba(13,23,38,0.8)',
            border: '0.5px solid rgba(0,200,255,0.1)',
            borderRadius: 12, padding: '18px 20px',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 11, color: '#4A6B8A', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                نمودار ارزش معاملات
              </span>
              <div style={{ display: 'flex', gap: 14, fontSize: 10 }}>
                <span style={{ color: '#00C8FF' }}>● ارزش</span>
                <span style={{ color: '#F59E0B' }}>● MA5</span>
                <span style={{ color: '#8B5CF6' }}>● MA10</span>
                <span style={{ color: '#FF4D6A' }}>● Anomaly</span>
              </div>
            </div>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00C8FF" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#00C8FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.05)" />
                  <XAxis dataKey="date" stroke="#2A3D55" tick={{ fill: '#4A6B8A', fontSize: 9 }} tickLine={false} />
                  <YAxis stroke="#2A3D55" tick={{ fill: '#4A6B8A', fontSize: 9 }} tickLine={false} axisLine={false}
                    tickFormatter={v => (v / 1_000_000).toFixed(1) + 'M'} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="value" name="ارزش"
                    stroke="#00C8FF" strokeWidth={1.5} fill="url(#blueGrad)"
                    dot={false} activeDot={{ r: 4, fill: '#00C8FF', strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="ma5" name="MA5"
                    stroke="#F59E0B" strokeWidth={1} fill="none"
                    dot={false} strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="ma10" name="MA10"
                    stroke="#8B5CF6" strokeWidth={1} fill="none"
                    dot={false} strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="anomaly" name="Anomaly"
                    stroke="none" fill="rgba(255,77,106,0.15)"
                    dot={{ r: 5, fill: '#FF4D6A', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* FORM */}
          <div style={{
            background: 'rgba(13,23,38,0.8)',
            border: '0.5px solid rgba(0,200,255,0.1)',
            borderRadius: 12, padding: '18px 20px',
            display: 'flex', flexDirection: 'column', gap: 14,
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ fontSize: 11, color: '#4A6B8A', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              ثبت داده جدید
            </div>

            {/* signal insight */}
            <div style={{
              background: analytics.signal.bg,
              border: `0.5px solid ${analytics.signal.color}33`,
              borderRadius: 8, padding: '10px 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 11, color: '#4A6B8A' }}>سیگنال فعلی</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: analytics.signal.color }}>
                {analytics.signal.label}
              </span>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#4A6B8A', marginBottom: 6 }}>تاریخ شمسی</div>
              <DatePicker
                calendar={persian} locale={persian_fa} value={date}
                onChange={(v: any) => setDate(v?.format?.('YYYY/MM/DD') || '')}
                inputClass="db-input"
              />
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#4A6B8A', marginBottom: 6 }}>ارزش معامله (تومان)</div>
              <input
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="مثال: ۱۲۵۰۰۰۰۰"
                style={{
                  width: '100%', background: '#060B14',
                  border: '0.5px solid rgba(0,200,255,0.2)',
                  borderRadius: 8, padding: '10px 12px',
                  color: '#E2E8F0', fontSize: 13, outline: 'none',
                  boxSizing: 'border-box', fontFamily: 'inherit', direction: 'rtl',
                }}
              />
            </div>

            <button
              onClick={saveData} disabled={loading}
              style={{
                width: '100%',
                background: loading ? 'rgba(0,200,255,0.04)' : 'rgba(0,200,255,0.1)',
                border: '0.5px solid rgba(0,200,255,0.35)',
                borderRadius: 8, color: '#00C8FF',
                fontSize: 13, fontWeight: 700, padding: '11px',
                cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {loading ? 'در حال ثبت...' : 'ثبت رکورد'}
            </button>

            {/* mini stats */}
            <div style={{ borderTop: '0.5px solid rgba(0,200,255,0.08)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'میانگین کل', val: analytics.avg.toLocaleString('fa-IR') },
                { label: 'کمترین ارزش', val: analytics.min.toLocaleString('fa-IR') },
                { label: 'بیشترین ارزش', val: analytics.max.toLocaleString('fa-IR') },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: '#4A6B8A' }}>{s.label}</span>
                  <span style={{ color: '#C8D8E8' }}>{s.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* TABLE */}
        <div style={{
          background: 'rgba(13,23,38,0.8)',
          border: '0.5px solid rgba(0,200,255,0.1)',
          borderRadius: 12, padding: '18px 20px',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: 11, color: '#4A6B8A', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            آخرین رکوردها
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['#', 'تاریخ', 'ارزش معامله', 'تغییر', 'وضعیت', 'عملیات'].map(h => (
                    <th key={h} style={{
                      color: '#4A6B8A', fontWeight: 500, textAlign: 'right',
                      padding: '8px 10px',
                      borderBottom: '0.5px solid rgba(0,200,255,0.08)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...records].reverse().map((r) => {
                  const idx = records.findIndex(x => x.id === r.id)
                  const prevVal = safe(records[idx - 1]?.trade_value)
                  const cur = safe(r.trade_value)
                  const chg = prevVal ? (((cur - prevVal) / prevVal) * 100).toFixed(2) : null
                  const isAnomaly = analytics.anomalies[idx]

                  return (
                    <tr key={r.id}
                      style={{
                        borderBottom: '0.5px solid rgba(255,255,255,0.03)',
                        background: isAnomaly ? 'rgba(255,77,106,0.04)' : 'transparent',
                      }}>
                      <td style={{ padding: '9px 10px', color: '#2A3D55' }}>{r.id}</td>
                      <td style={{ padding: '9px 10px', color: '#C8D8E8' }}>{r.trade_date_shamsi}</td>
                      <td style={{ padding: '9px 10px', color: '#E2E8F0', fontWeight: 500 }}>
                        {editingId === r.id ? (
                          <input
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            style={{
                              background: '#060B14',
                              border: '0.5px solid rgba(0,200,255,0.3)',
                              borderRadius: 6, padding: '4px 8px',
                              color: '#E2E8F0', fontSize: 12,
                              fontFamily: 'inherit', width: 130,
                            }}
                          />
                        ) : cur.toLocaleString('fa-IR')}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {chg !== null && (
                          <span style={{
                            display: 'inline-block',
                            background: Number(chg) >= 0 ? 'rgba(0,229,160,0.1)' : 'rgba(255,77,106,0.1)',
                            color: Number(chg) >= 0 ? '#00E5A0' : '#FF4D6A',
                            borderRadius: 4, padding: '2px 7px', fontSize: 11,
                          }}>
                            {Number(chg) >= 0 ? '+' : ''}{chg}٪
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {isAnomaly && (
                          <span style={{
                            background: 'rgba(255,77,106,0.1)',
                            color: '#FF4D6A',
                            borderRadius: 4, padding: '2px 7px', fontSize: 10,
                          }}>⚠ anomaly</span>
                        )}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {editingId === r.id ? (
                          <span onClick={() => saveEdit(r.id)}
                            style={{ color: '#00C8FF', cursor: 'pointer', fontSize: 11 }}>ذخیره</span>
                        ) : (
                          <span style={{ display: 'flex', gap: 10 }}>
                            <span onClick={() => { setEditingId(r.id); setEditValue(String(r.trade_value)) }}
                              style={{ color: '#4A6B8A', cursor: 'pointer', fontSize: 11 }}>ویرایش</span>
                            <span onClick={() => deleteRecord(r.id)}
                              style={{ color: '#FF4D6A', cursor: 'pointer', fontSize: 11 }}>حذف</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
        .db-input {
          width: 100% !important;
          background: #060B14 !important;
          border: 0.5px solid rgba(0,200,255,0.2) !important;
          border-radius: 8px !important;
          padding: 10px 12px !important;
          color: #E2E8F0 !important;
          font-size: 13px !important;
          outline: none !important;
          box-sizing: border-box !important;
          font-family: Vazirmatn, Arial, sans-serif !important;
          direction: rtl !important;
        }
        .rmdp-wrapper {
          background: #0D1726 !important;
          border: 0.5px solid rgba(0,200,255,0.2) !important;
          border-radius: 10px !important;
        }
        .rmdp-day.rmdp-selected span { background: #00C8FF !important; }
        .rmdp-day:not(.rmdp-disabled):not(.rmdp-day-hidden) span:hover {
          background: rgba(0,200,255,0.2) !important;
        }
        .rmdp-header-values, .rmdp-day, .rmdp-week-day { color: #E2E8F0 !important; }
        .rmdp-arrow { border-color: #00C8FF !important; }
        .rmdp-arrow-container:hover { background: rgba(0,200,255,0.1) !important; }
      `}</style>
    </main>
  )
}
