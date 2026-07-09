'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { darkTheme, lightTheme } from '../../lib/theme'
import { useIsMobile } from '../../lib/useIsMobile'
import { safe, fmtNum as fmtVal } from '../../lib/format'
import dynamic from 'next/dynamic'
import persian from 'react-date-object/calendars/persian'
import persian_fa from 'react-date-object/locales/persian_fa'
import DateObject from 'react-date-object'
import gregorian from 'react-date-object/calendars/gregorian'
import * as XLSX from 'xlsx'

const DatePicker = dynamic(() => import('react-multi-date-picker'), { ssr: false })
const TerminalChart = dynamic(() => import('./TerminalChart'), { ssr: false })

// safe/fmtVal از lib/format مشترک
// نمایش ارزش به میلیارد تومان
const UNIT = 'میلیارد تومان'

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
  const router = useRouter()
  const [date, setDate] = useState('')
  const [value, setValue] = useState('')
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editDate, setEditDate] = useState('')
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()

  // خواندن قالب از حافظه و گوش دادن به تغییرات هدر
  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => {
      const th = window.localStorage.getItem('theme')
      setIsDark(th !== 'light')
    }
    window.addEventListener('themechange', handler)

    return () => {
      window.removeEventListener('themechange', handler)
    }
  }, [])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [signalHistory, setSignalHistory] = useState<any[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [importing, setImporting] = useState(false)
  const [assets, setAssets] = useState<any[]>([])
  const [selectedAsset, setSelectedAsset] = useState<any>(null)
  const [page, setPage] = useState(1)
  const perPage = 15

  const t: any = isDark ? darkTheme : lightTheme
  const cream = isDark ? '#ddd5bd' : '#6B5A3A'

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

  const loadAssets = async () => {
    const { data } = await supabase
      .from('assets')
      .select('*')
      .eq('slug', 'gold')
      .limit(1)
    if (data && data.length > 0) {
      setAssets(data)
      setSelectedAsset((prev: any) => prev || data[0])
    }
  }

  const loadData = async (assetId?: number) => {
    const id = assetId ?? selectedAsset?.id
    if (!id) return
    const { data } = await supabase
      .from('gold_funds')
      .select('*')
      .eq('asset_id', id)
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

  // load assets once on mount
  useEffect(() => { loadAssets(); loadSignalHistory() }, [])

  // reload data whenever the selected asset changes
  useEffect(() => {
    if (selectedAsset?.id) {
      loadData(selectedAsset.id)
      setPage(1)
    }
  }, [selectedAsset])

  const saveData = async () => {
    if (!date || !value) return alert('تاریخ و مقدار را وارد کنید')
    if (!selectedAsset?.id) return alert('دارایی انتخاب نشده است')
    setLoading(true)
    const { error } = await supabase.from('gold_funds').insert([{ trade_date_shamsi: date, trade_value: safe(value), asset_id: selectedAsset.id }])
    setLoading(false)
    if (error) return alert('خطا: فقط مدیر می‌تواند داده ثبت کند')
    setDate(''); setValue(''); loadData()
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!selectedAsset?.id) { alert('دارایی انتخاب نشده است'); return }
    setImporting(true)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

      // skip header row (row 0), read from row 1
      const dataRows = rows.slice(1)

      const toInsert: { trade_date_shamsi: string; trade_value: number; asset_id: number }[] = []
      for (const row of dataRows) {
        const rawDate = row[0]
        const rawValue = row[1]
        if (rawDate == null || rawValue == null) continue
        const d = String(rawDate).trim()
        const v = safe(rawValue)
        if (!d || !v) continue
        toInsert.push({ trade_date_shamsi: d, trade_value: v, asset_id: selectedAsset.id })
      }

      if (toInsert.length === 0) {
        alert('هیچ داده‌ی معتبری در فایل پیدا نشد')
        setImporting(false)
        e.target.value = ''
        return
      }

      const ok = confirm(`${toInsert.length} ردیف پیدا شد. وارد شود؟`)
      if (!ok) {
        setImporting(false)
        e.target.value = ''
        return
      }

      const { error } = await supabase.from('gold_funds').insert(toInsert)
      if (error) {
        alert('خطا: فقط مدیر می‌تواند داده وارد کند')
      } else {
        alert(`${toInsert.length} ردیف با موفقیت وارد شد`)
        loadData()
      }
    } catch (err) {
      alert('خطا در خواندن فایل. مطمئن شوید فایل اکسل یا CSV معتبر است')
    }

    setImporting(false)
    e.target.value = ''
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

  // ثبت خودکار سیگنال به صفحه /signals منتقل شد (موتور v2 — حباب واقعی بورس کالا).
  // سیگنال MA این صفحه فقط نمایشی است و دیگر در تاریخچه ذخیره نمی‌شود.

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      transition: 'background 0.3s, color 0.3s',
    }}>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '12px 12px' : '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* هیرو */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: t.textBright }}>
              ارزش معاملات صندوق‌های طلا
            </div>
            <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
              تحلیل هوشمند روند ارزش معاملات · {records.length > 0 ? `${records.length} روز داده` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge color={intel.signal.color} bg={intel.signal.bg} bold>{intel.signal.label}</Badge>
            <Badge color={isUp ? '#00E5A0' : '#FF4D6A'} bg={isUp ? 'rgba(0,229,160,0.08)' : 'rgba(255,77,106,0.08)'} bold>
              {isUp ? '+' : ''}{intel.change.toFixed(2)}٪
            </Badge>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12 }}>
          <IntelCard t={t} title="رژیم بازار" main={intel.regime.label} sub={intel.regime.desc} color={intel.regime.color} tooltip="وضعیت کلی بازار: صعودی، نزولی، رنج یا پرنوسان" />
          <IntelCard t={t} title="سیگنال" main={intel.signal.label} sub={intel.signal.desc} color={intel.signal.color} tooltip="پیشنهاد خرید، فروش یا نگه‌داری بر اساس تحلیل میانگین‌ها" />
          <IntelCard t={t} title="احتمال ادامه روند" main={`${intel.continuation}٪`} sub="بر اساس مومنتوم" color={t.accent} bar={intel.continuation} tooltip="احتمال ادامه‌ی روند فعلی بازار بر اساس شتاب حرکت قیمت" />
          <IntelCard t={t} title="امتیاز بازار" main={`${intel.score}`} sub="۰ تا ۱۰۰" color={intel.score >= 60 ? '#00E5A0' : intel.score <= 40 ? '#FF4D6A' : '#F59E0B'} bar={intel.score} tooltip="امتیاز کلی سلامت بازار از ۰ (بدترین) تا ۱۰۰ (بهترین)" />
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

        <div style={{ display: 'grid', gridTemplateColumns: isLoggedIn && !isMobile ? '1fr 300px' : '1fr', gap: 16 }}>
          <Panel t={t}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <PanelTitle t={t}>نمودار ارزش معاملات</PanelTitle>
              <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
                <span style={{ color: t.accent }}>● ارزش</span>
                <span style={{ color: '#F59E0B' }}>● میانگین ۵</span>
                <span style={{ color: '#8B5CF6' }}>● میانگین ۱۰</span>
                <Tooltip text="زمانی که ارزش معاملات به‌طور غیرعادی بالا یا پایین باشد نسبت به میانگین ۷ روزه" t={t}>
                  <span style={{ color: '#FF4D6A', cursor: 'help' }}>⚠ ناهنجاری</span>
                </Tooltip>
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

                <label style={{
                  width: '100%', boxSizing: 'border-box', textAlign: 'center',
                  background: importing ? 'rgba(0,229,160,0.05)' : 'rgba(0,229,160,0.1)',
                  border: '0.5px solid rgba(0,229,160,0.4)', borderRadius: 8, color: '#00E5A0',
                  fontSize: 13, fontWeight: 700, padding: '11px', cursor: importing ? 'wait' : 'pointer',
                  fontFamily: 'inherit', display: 'block',
                }}>
                  {importing ? 'در حال وارد کردن...' : '📑 وارد کردن اکسل / CSV'}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImport}
                    disabled={importing}
                    style={{ display: 'none' }}
                  />
                </label>

                <button onClick={logout} style={{
                  fontSize: 11, padding: '6px', borderRadius: 8, cursor: 'pointer',
                  background: 'transparent', border: `0.5px solid ${t.border}`,
                  color: t.muted, fontFamily: 'inherit',
                }}>
                  خروج از حساب
                </button>

                <div style={{ borderTop: `0.5px solid ${t.border}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Stat t={t} label="میانگین کل" val={`${fmtVal(intel.avg)} ${UNIT}`} />
                  <Stat t={t} label="سقف تاریخی" val={`${fmtVal(intel.max)} ${UNIT}`} />
                  <Stat t={t} label="کف تاریخی" val={`${fmtVal(intel.min)} ${UNIT}`} />
                  <Stat t={t} label="نوسان" val={`${intel.vol.toFixed(1)}٪`} />
                </div>
              </div>
            </Panel>
          )}
        </div>

        {/* لینک‌های سریع */}
        {!isLoggedIn && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
            <QuickLink t={t} href="/funds" emoji="📊" title="دیدبان صندوق‌ها" desc="جدول، نقشه‌ی بازار و ورود/خروج پول حقیقی" />
            <QuickLink t={t} href="/signals" emoji="📡" title="تاریخچه سیگنال" desc="سیگنال‌های خرید و فروش صادر شده" />
            <QuickLink t={t} href="/funds" emoji="🗺️" title="نقشه‌ی بازار" desc="نقشه‌ی حرارتی صندوق‌های کالایی" />
          </div>
        )}

        {/* جدول رکوردها - فقط مدیر */}
        {isLoggedIn && (
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
                      <td style={{ padding: '9px 10px', color: cream }}>{r.id}</td>
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
                        ) : <span>{fmtVal(cur)} <span style={{ color: cream, fontSize: 10 }}>{UNIT}</span></span>}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {chg !== null && (
                          <span style={{ display: 'inline-block', background: Number(chg) >= 0 ? 'rgba(0,229,160,0.1)' : 'rgba(255,77,106,0.1)', color: Number(chg) >= 0 ? '#00E5A0' : '#FF4D6A', borderRadius: 4, padding: '2px 7px', fontSize: 11 }}>
                            {Number(chg) >= 0 ? '+' : ''}{chg}٪
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        {isAnomaly && (
                          <Tooltip text="ارزش معاملات این روز به‌طور غیرعادی بالا یا پایین بوده نسبت به میانگین ۷ روزه" t={t}>
                            <span style={{ background: 'rgba(255,77,106,0.1)', color: '#FF4D6A', borderRadius: 4, padding: '2px 7px', fontSize: 10, cursor: 'help' }}>⚠ ناهنجاری</span>
                          </Tooltip>
                        )}
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
                  color: page === 1 ? t.muted : t.accent,
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
                  color: page >= Math.ceil(records.length / perPage) ? t.muted : t.accent,
                  cursor: page >= Math.ceil(records.length / perPage) ? 'not-allowed' : 'pointer',
                }}
              >
                بعدی
              </button>
            </div>
          )}
        </Panel>
        )}
      </div>

      <style>{`
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
function Tooltip({ text, children, t }: any) {
  const [show, setShow] = useState(false)
  return (
    <div
      style={{ position: 'relative', display: 'inline-block', width: '100%' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && text && (
        <div style={{
          position: 'absolute', bottom: '105%', right: 0, left: 0,
          zIndex: 100, pointerEvents: 'none',
          display: 'flex', justifyContent: 'center',
        }}>
          <div style={{
            background: t.panelSolid || '#0D1726',
            border: `1px solid ${t.accent}44`,
            borderRadius: 10, padding: '10px 14px',
            fontSize: 11, color: t.text || '#E2E8F0', lineHeight: 1.7,
            boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 12px ${t.accent}22`,
            backdropFilter: 'blur(16px)',
            maxWidth: 260, textAlign: 'center',
            fontFamily: 'Vazirmatn, Arial, sans-serif',
            direction: 'rtl',
          }}>
            {text}
          </div>
        </div>
      )}
    </div>
  )
}

function IntelCard({ title, main, sub, color, bar, t, tooltip }: any) {
  const cream = t === darkTheme ? '#ddd5bd' : '#6B5A3A'
  return (
    <Tooltip text={tooltip} t={t}>
      <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '14px 16px', backdropFilter: 'blur(12px)', cursor: tooltip ? 'help' : 'default' }}>
        <div style={{ fontSize: 10, color: t.muted, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color }}>{main}</div>
        <div style={{ fontSize: 10, color: cream, marginTop: 4 }}>{sub}</div>
        {typeof bar === 'number' && (
          <div style={{ marginTop: 8, height: 3, background: `${t.accent}1A`, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${bar}%`, height: '100%', background: color, borderRadius: 2 }} />
          </div>
        )}
      </div>
    </Tooltip>
  )
}

function QuickLink({ t, href, emoji, title, desc }: any) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12,
        padding: '18px 16px', backdropFilter: 'blur(12px)',
        cursor: 'pointer', transition: 'border-color 0.2s, transform 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.transform = 'translateY(0)' }}
      >
        <div style={{ fontSize: 20, marginBottom: 8 }}>{emoji}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.textBright, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 11, color: t.muted, lineHeight: 1.6 }}>{desc}</div>
      </div>
    </Link>
  )
}
