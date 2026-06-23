'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

import dynamic from 'next/dynamic'
import persian from 'react-date-object/calendars/persian'
import persian_fa from 'react-date-object/locales/persian_fa'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

const DatePicker = dynamic(() => import('react-multi-date-picker'), { ssr: false })

export default function DashboardPage() {
  const [date, setDate] = useState('')
  const [value, setValue] = useState('')
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const safe = (v: any) => Number(v || 0)

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
    await supabase.from('gold_funds').delete().eq('id', id)
    loadData()
  }

  const startEdit = (record: any) => {
    setEditingId(record.id)
    setEditValue(String(record.trade_value))
  }

  const saveEdit = async (id: number) => {
    await supabase.from('gold_funds').update({ trade_value: safe(editValue) }).eq('id', id)
    setEditingId(null)
    loadData()
  }

  const sorted = [...records]
  const last = safe(sorted.at(-1)?.trade_value)
  const prev = safe(sorted.at(-2)?.trade_value)
  const change = prev ? (((last - prev) / prev) * 100).toFixed(2) : '0'
  const avg = sorted.length
    ? Math.round(sorted.reduce((s, r) => s + safe(r.trade_value), 0) / sorted.length)
    : 0

  const isUp = Number(change) >= 0

  // 3-day trend detection
  const last3 = sorted.slice(-3).map(r => safe(r.trade_value))
  const trend =
    last3.length === 3 && last3[2] > last3[1] && last3[1] > last3[0]
      ? 'up'
      : last3.length === 3 && last3[2] < last3[1] && last3[1] < last3[0]
      ? 'down'
      : 'neutral'

  const chartData = sorted.map(i => ({
    date: i.trade_date_shamsi,
    value: safe(i.trade_value),
  }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div style={{
          background: '#0D1726',
          border: '0.5px solid rgba(0,200,255,0.25)',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: 12,
          direction: 'rtl',
        }}>
          <p style={{ color: '#4A6B8A', marginBottom: 4 }}>{label}</p>
          <p style={{ color: '#00C8FF', fontWeight: 700 }}>
            {safe(payload[0].value).toLocaleString('fa-IR')}
          </p>
        </div>
      )
    }
    return null
  }

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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 28px',
        borderBottom: '0.5px solid rgba(0,200,255,0.15)',
        background: 'rgba(6,11,20,0.97)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#00C8FF',
          }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
              شاگرد تنبل بازار
            </div>
            <div style={{ fontSize: 11, color: '#4A6B8A', marginTop: 1 }}>
              داشبورد تحلیل ارزش معاملات طلا
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 12,
            padding: '4px 12px',
            borderRadius: 20,
            background: isUp ? 'rgba(0,229,160,0.08)' : 'rgba(255,77,106,0.08)',
            border: `0.5px solid ${isUp ? 'rgba(0,229,160,0.3)' : 'rgba(255,77,106,0.3)'}`,
            color: isUp ? '#00E5A0' : '#FF4D6A',
            fontWeight: 700,
          }}>
            {isUp ? '+' : ''}{change}٪
          </span>
          <span style={{
            fontSize: 11,
            padding: '4px 12px',
            borderRadius: 20,
            background: 'rgba(0,200,255,0.06)',
            border: '0.5px solid rgba(0,200,255,0.2)',
            color: '#00C8FF',
          }}>
            {trend === 'up' ? '▲ روند صعودی' : trend === 'down' ? '▼ روند نزولی' : '◆ خنثی'}
          </span>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* KPI GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'آخرین ارزش', value: last.toLocaleString('fa-IR'), sub: 'تومان' },
            { label: 'تغییر روزانه', value: `${isUp ? '+' : ''}${change}٪`, sub: 'نسبت به قبل', color: isUp ? '#00E5A0' : '#FF4D6A' },
            { label: 'میانگین کل', value: avg.toLocaleString('fa-IR'), sub: 'تومان' },
            { label: 'تعداد رکورد', value: records.length.toLocaleString('fa-IR'), sub: 'رکورد ثبت‌شده' },
          ].map((kpi, i) => (
            <div key={i} style={{
              background: '#0D1726',
              border: '0.5px solid rgba(0,200,255,0.12)',
              borderRadius: 12,
              padding: '16px 18px',
            }}>
              <div style={{ fontSize: 11, color: '#4A6B8A', marginBottom: 8 }}>{kpi.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: kpi.color || '#E2E8F0' }}>
                {kpi.value}
              </div>
              <div style={{ fontSize: 10, color: '#4A6B8A', marginTop: 4 }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* CHART + FORM */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

          {/* CHART */}
          <div style={{
            background: '#0D1726',
            border: '0.5px solid rgba(0,200,255,0.12)',
            borderRadius: 12,
            padding: '18px 20px',
          }}>
            <div style={{ fontSize: 11, color: '#4A6B8A', marginBottom: 16, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              نمودار ارزش معاملات
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00C8FF" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#00C8FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    stroke="#2A3D55"
                    tick={{ fill: '#4A6B8A', fontSize: 10 }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#2A3D55"
                    tick={{ fill: '#4A6B8A', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => (v / 1_000_000).toFixed(1) + 'M'}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#00C8FF"
                    strokeWidth={1.5}
                    fill="url(#blueGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#00C8FF', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* FORM */}
          <div style={{
            background: '#0D1726',
            border: '0.5px solid rgba(0,200,255,0.12)',
            borderRadius: 12,
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}>
            <div style={{ fontSize: 11, color: '#4A6B8A', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              ثبت داده جدید
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#4A6B8A', marginBottom: 6 }}>تاریخ شمسی</div>
              <DatePicker
                calendar={persian}
                locale={persian_fa}
                value={date}
                onChange={(v: any) => setDate(v?.format?.('YYYY/MM/DD') || '')}
                inputClass="db-input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#4A6B8A', marginBottom: 6 }}>ارزش معامله (تومان)</div>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="مثال: ۱۲۵۰۰۰۰۰"
                style={{
                  width: '100%',
                  background: '#060B14',
                  border: '0.5px solid rgba(0,200,255,0.2)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  color: '#E2E8F0',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  direction: 'rtl',
                }}
              />
            </div>

            <button
              onClick={saveData}
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? 'rgba(0,200,255,0.05)' : 'rgba(0,200,255,0.1)',
                border: '0.5px solid rgba(0,200,255,0.35)',
                borderRadius: 8,
                color: '#00C8FF',
                fontSize: 13,
                fontWeight: 700,
                padding: '11px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'در حال ثبت...' : 'ثبت رکورد'}
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div style={{
          background: '#0D1726',
          border: '0.5px solid rgba(0,200,255,0.12)',
          borderRadius: 12,
          padding: '18px 20px',
        }}>
          <div style={{ fontSize: 11, color: '#4A6B8A', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            آخرین رکوردها
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['#', 'تاریخ', 'ارزش معامله', 'تغییر', 'عملیات'].map(h => (
                    <th key={h} style={{
                      color: '#4A6B8A',
                      fontWeight: 500,
                      textAlign: 'right',
                      padding: '8px 10px',
                      borderBottom: '0.5px solid rgba(0,200,255,0.1)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...sorted].reverse().map((r, i) => {
                  const idx = sorted.indexOf(r)
                  const prevVal = safe(sorted[idx - 1]?.trade_value)
                  const cur = safe(r.trade_value)
                  const chg = prevVal ? (((cur - prevVal) / prevVal) * 100).toFixed(2) : null
                  return (
                    <tr key={r.id} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '9px 10px', color: '#4A6B8A' }}>{r.id}</td>
                      <td style={{ padding: '9px 10px', color: '#C8D8E8' }}>{r.trade_date_shamsi}</td>
                      <td style={{ padding: '9px 10px', color: '#E2E8F0' }}>
                        {editingId === r.id ? (
                          <input
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            style={{
                              background: '#060B14',
                              border: '0.5px solid rgba(0,200,255,0.3)',
                              borderRadius: 6,
                              padding: '4px 8px',
                              color: '#E2E8F0',
                              fontSize: 12,
                              fontFamily: 'inherit',
                              width: 120,
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
                            borderRadius: 4,
                            padding: '2px 7px',
                            fontSize: 11,
                          }}>
                            {Number(chg) >= 0 ? '+' : ''}{chg}٪
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {editingId === r.id ? (
                          <span
                            onClick={() => saveEdit(r.id)}
                            style={{ color: '#00C8FF', cursor: 'pointer', fontSize: 11 }}
                          >ذخیره</span>
                        ) : (
                          <span style={{ display: 'flex', gap: 10 }}>
                            <span
                              onClick={() => startEdit(r)}
                              style={{ color: '#4A6B8A', cursor: 'pointer', fontSize: 11 }}
                            >ویرایش</span>
                            <span
                              onClick={() => deleteRecord(r.id)}
                              style={{ color: '#FF4D6A', cursor: 'pointer', fontSize: 11 }}
                            >حذف</span>
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
        .rmdp-day.rmdp-selected span {
          background: #00C8FF !important;
        }
        .rmdp-day:not(.rmdp-disabled):not(.rmdp-day-hidden) span:hover {
          background: rgba(0,200,255,0.2) !important;
        }
        .rmdp-header-values, .rmdp-day, .rmdp-week-day {
          color: #E2E8F0 !important;
        }
        .rmdp-arrow { border-color: #00C8FF !important; }
        .rmdp-arrow-container:hover { background: rgba(0,200,255,0.1) !important; }
      `}</style>

    </main>
  )
}
