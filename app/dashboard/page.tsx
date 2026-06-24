'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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

const darkTheme = {
  bg: '#060B14',
  panel: 'rgba(13,23,38,0.8)',
  panelSolid: '#0D1726',
  border: 'rgba(0,200,255,0.1)',
  borderStrong: 'rgba(0,200,255,0.2)',
  text: '#E2E8F0',
  textBright: '#FFFFFF',
  muted: '#7B93AC',
  faint: '#5A7088',
  accent: '#00C8FF',
  inputBg: '#060B14',
  headerBg: 'rgba(6,11,20,0.97)',
}
const lightTheme = {
  bg: '#F4F7FB',
  panel: 'rgba(255,255,255,0.9)',
  panelSolid: '#FFFFFF',
  border: 'rgba(0,120,170,0.15)',
  borderStrong: 'rgba(0,120,170,0.3)',
  text: '#1A2433',
  textBright: '#0A0E16',
  muted: '#5A6B7E',
  faint: '#8595A8',
  accent: '#0095C8',
  inputBg: '#FFFFFF',
  headerBg: 'rgba(244,247,251,0.97)',
}

export default function TerminalPage() {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [value, setValue] = useState('')
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editDate, setEditDate] = useState('')
  const [isDark, setIsDark] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [signalHistory, setSignalHistory] = useState<any[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [page, setPage] = useState(1)
  const perPage = 15

  const t: any = isDark ? darkTheme : lightTheme

  // check auth status
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
  }

  const loadData = async () => {
    const { data } = await supabase
      .from('gold_funds')
      .select('*')
      .order('id', { ascending: true })
    if (data) setRecords(data)
  }

  const loadSignalHistory = async () => {
    const { data } = await supabase
      .from('signals')
      .select('*')
      .order('id', { ascending: false })
      .limit(20)
    if (data) setSignalHistory(data)
    setHistoryLoaded(true)
  }

  useEffect(() => { loadData(); loadSignalHistory() }, [])

  const saveData = async () => {
    if (!date || !value) return alert('تاریخ و مقدار را وارد کنید')
    setLoading(true)
    const { error } = await supabase.from('gold_funds').insert([{ trade_date_shamsi: date, trade_value: safe(value) }])
    setLoading(false)
    if (error) return alert('خطا: فقط مدیر می‌تواند داده ثبت کند')
    setDate(''); setValue(''); loadData()
  }
  const deleteRecord = async (id: number) => {
    if (!confirm('حذف شود؟')) return
    const { error } = await supabase.from('gold_funds').delete().eq('id', id)
    if (error) return alert('خطا: فقط مدیر می‌تواند حذف کند')
    loadData()
  }
  const saveEdit = async (id: number) => {
    const { error } = await supabase.from('gold_funds').update({
      trade_value: safe(editValue),
      trade_date_shamsi: editDate,
    }).eq('id', id)
    if (error) return alert('خطا: فقط مدیر می‌تواند ویرایش کند')
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

    let signal = { label: 'منتظر', color: '#8B9DB0', bg: 'rgba(139,157,176,0.12)', desc: 'داده کافی نیست' }
    if (n >= 10) {
      const m5 = ma5arr[n - 1] ?? 0, m5p = ma5arr[n - 2] ?? 0
      const m10 = ma10arr[n - 1] ?? 0, m10p = ma10arr[n - 2] ?? 0
      if (m5p <= m10p && m5 > m10)
        signal = { label: 'خرید', color: '#00E5A0', bg: 'rgba(0,229,160,0.14)', desc: 'میانگین کوتاه از بلند عبور کرد' }
      else if (m5p >= m10p && m5 < m10)
        signal = { label: 'فروش', color: '#FF4D6A', bg: 'rgba(255,77,106,0.14)', desc: 'میانگین کوتاه زیر بلند رفت' }
      else if (m5 > m10)
        signal = { label: 'نگه‌داری', color: '#00C8FF', bg: 'rgba(0,200,255,0.12)', desc: 'روند صعودی پایدار' }
      else
        signal = { label: 'نگه‌داری', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', desc: 'روند نزولی پایدار' }
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
      score += signal.label === 'خرید' ? 15 : signal.label === 'فروش' ? -15 : 0
      score -= vol
      score = Math.max(0, Math.min(100, Math.round(score)))
    }

    const alerts: { type: string; msg: string }[] = []
    if (anomalyFlags.at(-1)) alerts.push({ type: 'danger', msg: 'ارزش آخرین روز خارج از محدوده نرمال است' })
    if (signal.label === 'خرید') alerts.push({ type: 'success', msg: 'سیگنال خرید فعال شد' })
    if (signal.label === 'فروش') alerts.push({ type: 'danger', msg: 'سیگنال فروش فعال شد' })
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

  // auto-save signal to history when it changes (admin only)
  useEffect(() => {
    if (!isLoggedIn) return
    if (!historyLoaded) return          // wait until previous history is fully loaded
    if (intel.n < 10) return
    if (intel.signal.label === 'منتظر') return

    const lastSaved = signalHistory[0]?.signal_type
    if (lastSaved === intel.signal.label) return   // same as last → skip

    let cancelled = false
    const saveSignal = async () => {
      // double-check right before insert to avoid duplicate
      const { data: latest } = await supabase
        .from('signals')
        .select('signal_type')
        .order('id', { ascending: false })
        .limit(1)
      if (cancelled) return
      if (latest && latest[0]?.signal_type === intel.signal.label) return

      const lastRecord = records.at(-1)
      const { error } = await supabase.from('signals').insert([{
        signal_date_shamsi: lastRecord?.trade_date_shamsi || '',
        signal_type: intel.signal.label,
        market_value: intel.last,
        note: intel.signal.desc,
      }])
      if (!error && !cancelled) loadSignalHistory()
    }
    saveSignal()

    return () => { cancelled = true }
  }, [intel.signal.label, isLoggedIn, historyLoaded])

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      transition: 'background 0.3s, color 0.3s',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', borderBottom: `0.5px solid ${t.border}`,
        background: t.headerBg, position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.accent, boxShadow: `0 0 8px ${t.accent}` }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.textBright, letterSpacing: '0.02em' }}>
              ترمینال هوشمند بازار طلا
            </div>
            <div style={{ fontSize: 10, color: t.muted }}>شاگرد تنبل بازار · t.me/shagerdebazar</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
            onClick={() => router.push('/signals')}
            style={{
              fontSize: 12, padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
              background: 'linear-gradient(135deg, #FFD24A, #E0A500)',
              border: 'none',
              color: '#1A1200', fontFamily: 'inherit', fontWeight: 700,
              boxShadow: '0 2px 10px rgba(224,165,0,0.4)',
            }}
          >
            ★ تاریخچه سیگنال
          </button>
          {isLoggedIn ? (
            <button
              onClick={logout}
              style={{
                fontSize: 12, padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
                background: 'rgba(255,77,106,0.1)', border: '0.5px solid rgba(255,77,106,0.4)',
                color: '#FF4D6A', fontFamily: 'inherit', fontWeight: 700,
              }}
            >
              خروج
            </button>
          ) : (
            <button
              onClick={() => router.push('/admin')}
              style={{
                fontSize: 12, padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
                background: `${t.accent}1A`, border: `0.5px solid ${t.accent}66`,
                color: t.accent, fontFamily: 'inherit', fontWeight: 700,
              }}
            >
              ورود مدیر
            </button>
          )}
          <button
            onClick={() => setIsDark(!isDark)}
            title="تغییر قالب"
            style={{
              fontSize: 15, padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
              background: t.panel, border: `0.5px solid ${t.borderStrong}`, color: t.text,
              fontFamily: 'inherit',
            }}
          >
            {isDark ? '☀' : '☾'}
          </button>
          <Badge color={intel.signal.color} bg={intel.signal.bg} bold>{intel.signal.label}</Badge>
          <Badge color={isUp ? '#00E5A0' : '#FF4D6A'} bg={isUp ? 'rgba(0,229,160,0.08)' : 'rgba(255,77,106,0.08)'} bold>
            {isUp ? '+' : ''}{intel.change.toFixed(2)}٪
          </Badge>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <IntelCard t={t} title="رژیم بازار" main={intel.regime.label} sub={intel.regime.desc} color={intel.regime.color} />
          <IntelCard t={t} title="سیگنال" main={intel.signal.label} sub={intel.signal.desc} color={intel.signal.color} />
          <IntelCard t={t} title="احتمال ادامه روند" main={`${intel.continuation}٪`} sub="بر اساس مومنتوم" color={t.accent} bar={intel.continuation} />
          <IntelCard t={t} title="امتیاز بازار" main={`${intel.score}`} sub="۰ تا ۱۰۰" color={intel.score >= 60 ? '#00E5A0' : intel.score <= 40 ? '#FF4D6A' : '#F59E0B'} bar={intel.score} />
        </div>

        {intel.alerts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {intel.alerts.map((a, i) => {
              const c = a.type === 'danger' ? '#FF4D6A' : a.type === 'success' ? '#00E5A0' : a.type === 'warn' ? '#F59E0B' : t.accent
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                  background: `${c}1A`, border: `0.5px solid ${c}40`,
                  borderRadius: 8, padding: '8px 14px', color: c,
                }}>
                  <span>●</span><span>{a.msg}</span>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: isLoggedIn ? '1fr 300px' : '1fr', gap: 16 }}>
          <Panel t={t}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <PanelTitle t={t}>نمودار ارزش معاملات</PanelTitle>
              <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
                <span style={{ color: t.accent }}>● ارزش</span>
                <span style={{ color: '#F59E0B' }}>● میانگین ۵</span>
                <span style={{ color: '#8B5CF6' }}>● میانگین ۱۰</span>
                <span style={{ color: '#FF4D6A' }}>⚠ ناهنجاری</span>
              </div>
            </div>
            {intel.n > 0 ? (
              <TerminalChart
                data={intel.chartData}
                ma5={intel.ma5Data}
                ma10={intel.ma10Data}
                anomalies={intel.anomalyData}
                height={340}
                isDark={isDark}
              />
            ) : (
              <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.muted, fontSize: 13 }}>
                داده‌ای برای نمایش وجود ندارد
              </div>
            )}
          </Panel>

          {isLoggedIn && (
            <Panel t={t}>
              <PanelTitle t={t}>ثبت داده جدید</PanelTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                <div>
                  <Label t={t}>تاریخ شمسی</Label>
                  <DatePicker calendar={persian} locale={persian_fa} value={date}
                    onChange={(v: any) => setDate(v?.format?.('YYYY/MM/DD') || '')}
                    inputClass="db-input" />
                </div>
                <div>
                  <Label t={t}>ارزش معامله (تومان)</Label>
                  <input value={value} onChange={e => setValue(e.target.value)} placeholder="مثال: ۱۲۵۰۰۰۰۰"
                    style={{
                      width: '100%', background: t.inputBg, border: `0.5px solid ${t.borderStrong}`,
                      borderRadius: 8, padding: '10px 12px', color: t.text, fontSize: 13,
                      outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', direction: 'rtl',
                    }} />
                </div>
                <button onClick={saveData} disabled={loading} style={{
                  width: '100%', background: loading ? `${t.accent}0A` : `${t.accent}1A`,
                  border: `0.5px solid ${t.accent}59`, borderRadius: 8, color: t.accent,
                  fontSize: 13, fontWeight: 700, padding: '11px', cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}>
                  {loading ? 'در حال ثبت...' : 'ثبت رکورد'}
                </button>

                <div style={{ borderTop: `0.5px solid ${t.border}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Stat t={t} label="میانگین کل" val={intel.avg.toLocaleString('fa-IR')} />
                  <Stat t={t} label="سقف تاریخی" val={intel.max.toLocaleString('fa-IR')} />
                  <Stat t={t} label="کف تاریخی" val={intel.min.toLocaleString('fa-IR')} />
                  <Stat t={t} label="نوسان" val={`${intel.vol.toFixed(1)}٪`} />
                </div>
              </div>
            </Panel>
          )}
        </div>

        <Panel t={t}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <PanelTitle t={t}>آخرین رکوردها</PanelTitle>
            <span style={{ fontSize: 11, color: t.muted }}>
              {records.length.toLocaleString('fa-IR')} رکورد
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['#', 'تاریخ', 'ارزش معامله', 'تغییر', 'وضعیت', ...(isLoggedIn ? ['عملیات'] : [])].map(h => (
                    <th key={h} style={{ color: t.muted, fontWeight: 500, textAlign: 'right', padding: '8px 10px', borderBottom: `0.5px solid ${t.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...records].reverse().slice((page - 1) * perPage, page * perPage).map((r) => {
                  const idx = records.findIndex(x => x.id === r.id)
                  const prevVal = safe(records[idx - 1]?.trade_value)
                  const cur = safe(r.trade_value)
                  const chg = prevVal ? (((cur - prevVal) / prevVal) * 100).toFixed(2) : null
                  const isAnomaly = intel.anomalyFlags[idx]
                  return (
                    <tr key={r.id} style={{ borderBottom: `0.5px solid ${t.border}`, background: isAnomaly ? 'rgba(255,77,106,0.04)' : 'transparent' }}>
                      <td style={{ padding: '9px 10px', color: t.faint }}>{r.id}</td>
                      <td style={{ padding: '9px 10px', color: t.text }}>
                        {editingId === r.id ? (
                          <input value={editDate} onChange={e => setEditDate(e.target.value)}
                            placeholder="۱۴۰۴/۰۳/۱۵"
                            style={{ background: t.inputBg, border: `0.5px solid ${t.borderStrong}`, borderRadius: 6, padding: '4px 8px', color: t.text, fontSize: 12, fontFamily: 'inherit', width: 110, direction: 'ltr', textAlign: 'center' }} />
                        ) : r.trade_date_shamsi}
                      </td>
                      <td style={{ padding: '9px 10px', color: t.textBright, fontWeight: 500 }}>
                        {editingId === r.id ? (
                          <input value={editValue} onChange={e => setEditValue(e.target.value)}
                            style={{ background: t.inputBg, border: `0.5px solid ${t.borderStrong}`, borderRadius: 6, padding: '4px 8px', color: t.text, fontSize: 12, fontFamily: 'inherit', width: 130 }} />
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
                        {isAnomaly && <span style={{ background: 'rgba(255,77,106,0.1)', color: '#FF4D6A', borderRadius: 4, padding: '2px 7px', fontSize: 10 }}>⚠ ناهنجاری</span>}
                      </td>
                      {isLoggedIn && (
                        <td style={{ padding: '9px 10px' }}>
                          {editingId === r.id ? (
                            <span onClick={() => saveEdit(r.id)} style={{ color: t.accent, cursor: 'pointer', fontSize: 11 }}>ذخیره</span>
                          ) : (
                            <span style={{ display: 'flex', gap: 10 }}>
                              <span onClick={() => { setEditingId(r.id); setEditValue(String(r.trade_value)); setEditDate(r.trade_date_shamsi) }} style={{ color: t.muted, cursor: 'pointer', fontSize: 11 }}>ویرایش</span>
                              <span onClick={() => deleteRecord(r.id)} style={{ color: '#FF4D6A', cursor: 'pointer', fontSize: 11 }}>حذف</span>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* pagination controls */}
          {records.length > perPage && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  fontSize: 12, padding: '6px 16px', borderRadius: 8, fontFamily: 'inherit',
                  background: page === 1 ? 'transparent' : `${t.accent}1A`,
                  border: `0.5px solid ${page === 1 ? t.border : `${t.accent}59`}`,
                  color: page === 1 ? t.faint : t.accent,
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                قبلی
              </button>
              <span style={{ fontSize: 12, color: t.muted }}>
                صفحه {page.toLocaleString('fa-IR')} از {Math.ceil(records.length / perPage).toLocaleString('fa-IR')}
              </span>
              <button
                onClick={() => setPage(p => Math.min(Math.ceil(records.length / perPage), p + 1))}
                disabled={page >= Math.ceil(records.length / perPage)}
                style={{
                  fontSize: 12, padding: '6px 16px', borderRadius: 8, fontFamily: 'inherit',
                  background: page >= Math.ceil(records.length / perPage) ? 'transparent' : `${t.accent}1A`,
                  border: `0.5px solid ${page >= Math.ceil(records.length / perPage) ? t.border : `${t.accent}59`}`,
                  color: page >= Math.ceil(records.length / perPage) ? t.faint : t.accent,
                  cursor: page >= Math.ceil(records.length / perPage) ? 'not-allowed' : 'pointer',
                }}
              >
                بعدی
              </button>
            </div>
          )}
        </Panel>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
        .db-input {
          width: 100% !important; background: ${t.inputBg} !important;
          border: 0.5px solid ${t.borderStrong} !important; border-radius: 8px !important;
          padding: 10px 12px !important; color: ${t.text} !important; font-size: 13px !important;
          outline: none !important; box-sizing: border-box !important;
          font-family: Vazirmatn, Arial, sans-serif !important; direction: rtl !important;
        }
        .rmdp-wrapper { background: ${t.panelSolid} !important; border: 0.5px solid ${t.borderStrong} !important; border-radius: 10px !important; }
        .rmdp-day.rmdp-selected span { background: ${t.accent} !important; }
        .rmdp-day:not(.rmdp-disabled):not(.rmdp-day-hidden) span:hover { background: ${t.accent}33 !important; }
        .rmdp-header-values, .rmdp-day, .rmdp-week-day { color: ${t.text} !important; }
        .rmdp-arrow { border-color: ${t.accent} !important; }
      `}</style>
    </main>
  )
}

function Panel({ children, t }: any) {
  return <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>{children}</div>
}
function PanelTitle({ children, t }: any) {
  return <span style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em' }}>{children}</span>
}
function Label({ children, t }: any) {
  return <div style={{ fontSize: 11, color: t.muted, marginBottom: 6 }}>{children}</div>
}
function Badge({ children, color, bg, bold }: any) {
  return <span style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, background: bg, border: `0.5px solid ${color}44`, color, fontWeight: bold ? 700 : 400, letterSpacing: '0.03em' }}>{children}</span>
}
function Stat({ label, val, t }: any) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span style={{ color: t.muted }}>{label}</span><span style={{ color: t.text }}>{val}</span></div>
}
function IntelCard({ title, main, sub, color, bar, t }: any) {
  return (
    <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '14px 16px', backdropFilter: 'blur(12px)' }}>
      <div style={{ fontSize: 10, color: t.muted, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{main}</div>
      <div style={{ fontSize: 10, color: t.faint, marginTop: 4 }}>{sub}</div>
      {typeof bar === 'number' && (
        <div style={{ marginTop: 8, height: 3, background: `${t.accent}1A`, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${bar}%`, height: '100%', background: color, borderRadius: 2 }} />
        </div>
      )}
    </div>
  )
}
