'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import dynamic from 'next/dynamic'
import persian from 'react-date-object/calendars/persian'
import persian_fa from 'react-date-object/locales/persian_fa'
import DateObject from 'react-date-object'
import gregorian from 'react-date-object/calendars/gregorian'

const DatePicker = dynamic(() => import('react-multi-date-picker'), { ssr: false })
const TerminalChart = dynamic(() => import('./TerminalChart'), { ssr: false })

const safe = (v: any) => Number(v || 0)

function shamsiToGregorian(shamsi: string): string {
  try {
    const d = new DateObject({ date: shamsi, format: 'YYYY/MM/DD', calendar: persian })
    return d.convert(gregorian).format('YYYY-MM-DD')
  } catch {
    return ''
  }
}

function calcMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) =>
    i < period - 1
      ? null
      : Math.round(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period)
  )
}

function stdDev(arr: number[]): number {
  if (!arr.length) return 0
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((a, b) => a + (b - avg) ** 2, 0) / arr.length)
}

export default function TerminalPage() {
  const [date, setDate] = useState('')
  const [value, setValue] = useState('')
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

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
    await supabase.from('gold_funds').insert([{ trade_date_shamsi: date, trade_value: safe(value) }])
    setLoading(false); setDate(''); setValue(''); loadData()
  }
  const deleteRecord = async (id: number) => {
    if (!confirm('حذف شود؟')) return
    await supabase.from('gold_funds').delete().eq('id', id); loadData()
  }
  const saveEdit = async (id: number) => {
    await supabase.from('gold_funds').update({ trade_value: safe(editValue) }).eq('id', id)
    setEditingId(null); loadData()
  }

  const intel = useMemo(() => {
    const vals = records.map(r => safe(r.trade_value))
    const n = vals.length
    const last = vals.at(-1) ?? 0
    const prev = vals.at(-2) ?? 0
    const change = prev ? ((last - prev) / prev) * 100 : 0
    const avg = n ? Math.round(vals.reduce((a, b) => a + b, 0) / n) : 0
    const max = n ? Math.max(...vals) : 0
    const min = n ? Math.min(...vals) : 0

    const ma5arr = calcMA(vals, 5)
    const ma10arr = calcMA(vals, 10)

    let signal = { label: 'WAIT', color: '#8B9DB0', bg: 'rgba(139,157,176,0.12)', desc: 'داده کافی نیست' }
    if (n >= 10) {
      const m5 = ma5arr[n - 1] ?? 0, m5p = ma5arr[n - 2] ?? 0
      const m10 = ma10arr[n - 1] ?? 0, m10p = ma10arr[n - 2] ?? 0
      if (m5p <= m10p && m5 > m10)
        signal = { label: 'BUY', color: '#00E5A0', bg: 'rgba(0,229,160,0.14)', desc: 'MA5 از MA10 عبور کرد' }
      else if (m5p >= m10p && m5 < m10)
        signal = { label: 'SELL', color: '#FF4D6A', bg: 'rgba(255,77,106,0.14)', desc: 'MA5 زیر MA10 رفت' }
      else if (m5 > m10)
        signal = { label: 'HOLD', color: '#00C8FF', bg: 'rgba(0,200,255,0.12)', desc: 'روند صعودی پایدار' }
      else
        signal = { label: 'HOLD', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', desc: 'روند نزولی پایدار' }
    }

    const recent = vals.slice(-10)
    const vol = recent.length > 1 ? (stdDev(recent) / (avg || 1)) * 100 : 0
    const last5 = vals.slice(-5)
    const slope = last5.length === 5 ? (last5[4] - last5[0]) / last5[0] * 100 : 0
    let regime = { label: 'نامشخص', color: '#8B9DB0', desc: '' }
    if (n >= 10) {
      if (vol > 5) regime = { label: 'پرنوسان', color: '#FF4D6A', desc: 'نوسان بالا، ریسک زیاد' }
      else if (slope > 2) regime = { label: 'صعودی پرقدرت', color: '#00E5A0', desc: 'روند صعودی پایدار' }
      else if (slope < -2) regime = { label: 'نزولی', color: '#FF4D6A', desc: 'فشار فروش' }
      else regime = { label: 'رنج / خنثی', color: '#00C8FF', desc: 'بازار بدون جهت مشخص' }
    }

    const last3 = vals.slice(-3)
    let continuation = 50
    if (last3.length === 3) {
      const up = last3[2] > last3[1] && last3[1] > last3[0]
      const down = last3[2] < last3[1] && last3[1] < last3[0]
      if (up || down) continuation = Math.min(85, 55 + Math.abs(slope) * 3)
      else continuation = Math.max(30, 50 - vol)
    }
    continuation = Math.round(continuation)

    const anomalyFlags = vals.map((v, i) => {
      if (i < 7) return false
      const w = vals.slice(i - 7, i)
      const a = w.reduce((s, x) => s + x, 0) / w.length
      return Math.abs(v - a) > 2 * stdDev(w)
    })

    let score = 50
    if (n >= 10) {
      score = 50
      score += slope * 2
      score += signal.label === 'BUY' ? 15 : signal.label === 'SELL' ? -15 : 0
      score -= vol
      score = Math.max(0, Math.min(100, Math.round(score)))
    }

    const alerts: { type: string; msg: string }[] = []
    if (anomalyFlags.at(-1)) alerts.push({ type: 'danger', msg: 'ارزش آخرین روز خارج از محدوده نرمال است' })
    if (signal.label === 'BUY') alerts.push({ type: 'success', msg: 'سیگنال خرید فعال شد' })
    if (signal.label === 'SELL') alerts.push({ type: 'danger', msg: 'سیگنال فروش فعال شد' })
    if (last >= max * 0.98 && n > 5) alerts.push({ type: 'info', msg: 'نزدیک سقف تاریخی' })
    if (vol > 5) alerts.push({ type: 'warn', msg: 'نوسانات بازار بالاست' })

    const chartData = records.map((r) => ({ time: shamsiToGregorian(r.trade_date_shamsi), value: safe(r.trade_value), shamsi: r.trade_date_shamsi })).filter(p => p.time)
    const ma5Data = records.map((r, i) => ({ time: shamsiToGregorian(r.trade_date_shamsi), value: ma5arr[i] })).filter(p => p.time && p.value != null) as { time: string; value: number }[]
    const ma10Data = records.map((r, i) => ({ time: shamsiToGregorian(r.trade_date_shamsi), value: ma10arr[i] })).filter(p => p.time && p.value != null) as { time: string; value: number }[]
    const anomalyData = records.map((r, i) => anomalyFlags[i] ? { time: shamsiToGregorian(r.trade_date_shamsi), value: safe(r.trade_value) } : null).filter(Boolean) as { time: string; value: number }[]

    return {
      n, last, prev, change, avg, max, min, vol, slope,
      signal, regime, continuation, score, alerts, anomalyFlags,
      chartData, ma5Data, ma10Data, anomalyData,
    }
  }, [records])

  const isUp = intel.change >= 0

  return (
    <main style={{
      minHeight: '100vh', background: '#060B14', color: '#E2E8F0',
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', borderBottom: '0.5px solid rgba(0,200,255,0.12)',
        background: 'rgba(6,11,20,0.97)', position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00C8FF', boxShadow: '0 0 8px #00C8FF' }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
              GOLD MARKET INTELLIGENCE TERMINAL
            </div>
            <div style={{ fontSize: 10, color: '#4A6B8A' }}>شاگرد تنبل بازار · t.me/shagerdebazar</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge color={intel.signal.color} bg={intel.signal.bg} bold>{intel.signal.label}</Badge>
          <Badge color={isUp ? '#00E5A0' : '#FF4D6A'} bg={isUp ? 'rgba(0,229,160,0.08)' : 'rgba(255,77,106,0.08)'} bold>
            {isUp ? '+' : ''}{intel.change.toFixed(2)}٪
          </Badge>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <IntelCard title="رژیم بازار" main={intel.regime.label} sub={intel.regime.desc} color={intel.regime.color} />
          <IntelCard title="سیگنال" main={intel.signal.label} sub={intel.signal.desc} color={intel.signal.color} />
          <IntelCard title="احتمال ادامه روند" main={`${intel.continuation}٪`} sub="بر اساس مومنتوم" color="#00C8FF" bar={intel.continuation} />
          <IntelCard title="امتیاز بازار" main={`${intel.score}`} sub="۰ تا ۱۰۰" color={intel.score >= 60 ? '#00E5A0' : intel.score <= 40 ? '#FF4D6A' : '#F59E0B'} bar={intel.score} />
        </div>

        {intel.alerts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {intel.alerts.map((a, i) => {
              const c = a.type === 'danger' ? '#FF4D6A' : a.type === 'success' ? '#00E5A0' : a.type === 'warn' ? '#F59E0B' : '#00C8FF'
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                  background: `${c}14`, border: `0.5px solid ${c}33`,
                  borderRadius: 8, padding: '8px 14px', color: c,
                }}>
                  <span>●</span><span>{a.msg}</span>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
          <Panel>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <PanelTitle>نمودار ارزش معاملات</PanelTitle>
              <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
                <span style={{ color: '#00C8FF' }}>● ارزش</span>
                <span style={{ color: '#F59E0B' }}>● MA5</span>
                <span style={{ color: '#8B5CF6' }}>● MA10</span>
                <span style={{ color: '#FF4D6A' }}>⚠ anomaly</span>
              </div>
            </div>
            {intel.n > 0 ? (
              <TerminalChart
                data={intel.chartData}
                ma5={intel.ma5Data}
                ma10={intel.ma10Data}
                anomalies={intel.anomalyData}
                height={340}
              />
            ) : (
              <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2A3D55', fontSize: 13 }}>
                داده‌ای برای نمایش وجود ندارد
              </div>
            )}
          </Panel>

          <Panel>
            <PanelTitle>ثبت داده جدید</PanelTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <div>
                <Label>تاریخ شمسی</Label>
                <DatePicker calendar={persian} locale={persian_fa} value={date}
                  onChange={(v: any) => setDate(v?.format?.('YYYY/MM/DD') || '')}
                  inputClass="db-input" />
              </div>
              <div>
                <Label>ارزش معامله (تومان)</Label>
                <input value={value} onChange={e => setValue(e.target.value)} placeholder="مثال: ۱۲۵۰۰۰۰۰" style={inputStyle} />
              </div>
              <button onClick={saveData} disabled={loading} style={{
                width: '100%', background: loading ? 'rgba(0,200,255,0.04)' : 'rgba(0,200,255,0.1)',
                border: '0.5px solid rgba(0,200,255,0.35)', borderRadius: 8, color: '#00C8FF',
                fontSize: 13, fontWeight: 700, padding: '11px', cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}>
                {loading ? 'در حال ثبت...' : 'ثبت رکورد'}
              </button>

              <div style={{ borderTop: '0.5px solid rgba(0,200,255,0.08)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Stat label="میانگین کل" val={intel.avg.toLocaleString('fa-IR')} />
                <Stat label="سقف تاریخی" val={intel.max.toLocaleString('fa-IR')} />
                <Stat label="کف تاریخی" val={intel.min.toLocaleString('fa-IR')} />
                <Stat label="نوسان (vol)" val={`${intel.vol.toFixed(1)}٪`} />
              </div>
            </div>
          </Panel>
        </div>

        <Panel>
          <PanelTitle>آخرین رکوردها</PanelTitle>
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['#', 'تاریخ', 'ارزش معامله', 'تغییر', 'وضعیت', 'عملیات'].map(h => (
                    <th key={h} style={{ color: '#4A6B8A', fontWeight: 500, textAlign: 'right', padding: '8px 10px', borderBottom: '0.5px solid rgba(0,200,255,0.08)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...records].reverse().map((r) => {
                  const idx = records.findIndex(x => x.id === r.id)
                  const prevVal = safe(records[idx - 1]?.trade_value)
                  const cur = safe(r.trade_value)
                  const chg = prevVal ? (((cur - prevVal) / prevVal) * 100).toFixed(2) : null
                  const isAnomaly = intel.anomalyFlags[idx]
                  return (
                    <tr key={r.id} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.03)', background: isAnomaly ? 'rgba(255,77,106,0.04)' : 'transparent' }}>
                      <td style={{ padding: '9px 10px', color: '#2A3D55' }}>{r.id}</td>
                      <td style={{ padding: '9px 10px', color: '#C8D8E8' }}>{r.trade_date_shamsi}</td>
                      <td style={{ padding: '9px 10px', color: '#E2E8F0', fontWeight: 500 }}>
                        {editingId === r.id ? (
                          <input value={editValue} onChange={e => setEditValue(e.target.value)}
                            style={{ background: '#060B14', border: '0.5px solid rgba(0,200,255,0.3)', borderRadius: 6, padding: '4px 8px', color: '#E2E8F0', fontSize: 12, fontFamily: 'inherit', width: 130 }} />
                        ) : cur.toLocaleString('fa-IR')}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {chg !== null && (
                          <span style={{ display: 'inline-block', background: Number(chg) >= 0 ? 'rgba(0,229,160,0.1)' : 'rgba(255,77,106,0.1)', color: Number(chg) >= 0 ? '#00E5A0' : '#FF4D6A', borderRadius: 4, padding: '2px 7px', fontSize: 11 }}>
                            {Number(chg) >= 0 ? '+' : ''}{chg}٪
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {isAnomaly && <span style={{ background: 'rgba(255,77,106,0.1)', color: '#FF4D6A', borderRadius: 4, padding: '2px 7px', fontSize: 10 }}>⚠ anomaly</span>}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {editingId === r.id ? (
                          <span onClick={() => saveEdit(r.id)} style={{ color: '#00C8FF', cursor: 'pointer', fontSize: 11 }}>ذخیره</span>
                        ) : (
                          <span style={{ display: 'flex', gap: 10 }}>
                            <span onClick={() => { setEditingId(r.id); setEditValue(String(r.trade_value)) }} style={{ color: '#4A6B8A', cursor: 'pointer', fontSize: 11 }}>ویرایش</span>
                            <span onClick={() => deleteRecord(r.id)} style={{ color: '#FF4D6A', cursor: 'pointer', fontSize: 11 }}>حذف</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
        .db-input {
          width: 100% !important; background: #060B14 !important;
          border: 0.5px solid rgba(0,200,255,0.2) !important; border-radius: 8px !important;
          padding: 10px 12px !important; color: #E2E8F0 !important; font-size: 13px !important;
          outline: none !important; box-sizing: border-box !important;
          font-family: Vazirmatn, Arial, sans-serif !important; direction: rtl !important;
        }
        .rmdp-wrapper { background: #0D1726 !important; border: 0.5px solid rgba(0,200,255,0.2) !important; border-radius: 10px !important; }
        .rmdp-day.rmdp-selected span { background: #00C8FF !important; }
        .rmdp-day:not(.rmdp-disabled):not(.rmdp-day-hidden) span:hover { background: rgba(0,200,255,0.2) !important; }
        .rmdp-header-values, .rmdp-day, .rmdp-week-day { color: #E2E8F0 !important; }
        .rmdp-arrow { border-color: #00C8FF !important; }
      `}</style>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#060B14', border: '0.5px solid rgba(0,200,255,0.2)',
  borderRadius: 8, padding: '10px 12px', color: '#E2E8F0', fontSize: 13,
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', direction: 'rtl',
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'rgba(13,23,38,0.8)', border: '0.5px solid rgba(0,200,255,0.1)', borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>{children}</div>
}
function PanelTitle({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, color: '#4A6B8A', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{children}</span>
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: '#4A6B8A', marginBottom: 6 }}>{children}</div>
}
function Badge({ children, color, bg, bold }: any) {
  return <span style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, background: bg, border: `0.5px solid ${color}44`, color, fontWeight: bold ? 700 : 400, letterSpacing: '0.03em' }}>{children}</span>
}
function Stat({ label, val }: { label: string; val: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span style={{ color: '#4A6B8A' }}>{label}</span><span style={{ color: '#C8D8E8' }}>{val}</span></div>
}
function IntelCard({ title, main, sub, color, bar }: any) {
  return (
    <div style={{ background: 'rgba(13,23,38,0.8)', border: '0.5px solid rgba(0,200,255,0.1)', borderRadius: 12, padding: '14px 16px', backdropFilter: 'blur(12px)' }}>
      <div style={{ fontSize: 10, color: '#4A6B8A', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{main}</div>
      <div style={{ fontSize: 10, color: '#2A3D55', marginTop: 4 }}>{sub}</div>
      {typeof bar === 'number' && (
        <div style={{ marginTop: 8, height: 3, background: 'rgba(0,200,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${bar}%`, height: '100%', background: color, borderRadius: 2 }} />
        </div>
      )}
    </div>
  )
}