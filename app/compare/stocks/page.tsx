'use client'

/**
 * مقایسه چندنمادی سهام — تا ۴ نماد هم‌زمان، نمودار درصد تغییر قیمت (نرمال‌شده از شروع بازه) روی هم،
 * به‌همراه جدول خلاصه (آخرین قیمت/تغییر/RSI). مکمل /compare که فقط صندوق‌ها را دوبه‌دو مقایسه می‌کند.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../../../lib/supabase'
import { darkTheme, lightTheme, shouldUseDark } from '../../../lib/theme'
import { useIsMobile } from '../../../lib/useIsMobile'
import { rsi } from '../../../lib/indicators'

type CandleRow = { trade_date: string; trade_date_shamsi: string; close: number; adj_close: number | null; offset_combined: number | null }
type SymSeries = { symbol: string; rows: CandleRow[]; color: string }

const COLORS = ['#00C8FF', '#F59E0B', '#00E5A0', '#EF476F']
const RANGES = [
  { key: '1m', label: '۱ ماه', days: 22 },
  { key: '3m', label: '۳ ماه', days: 66 },
  { key: '6m', label: '۶ ماه', days: 132 },
  { key: '1y', label: '۱ سال', days: 250 },
] as const

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })

// قیمت تعدیل‌شده جمعی — ترکیب افزایش سرمایه + سود نقدی (offset_combined از پایپ‌لاین candles-adjusted.js، بر پایه
// سرمایه فصلی واقعی کدال)؛ بدون این، بازده نمادی که افزایش سرمایه داده (افت مصنوعی قیمت) به‌شدت منفی و نادرست می‌شود.
// اگر offset_combined هنوز محاسبه نشده، به adj_close نسبی (tsetmc) و در نهایت close خام برمی‌گردیم.
const finalPrice = (r: CandleRow) => {
  if (r.offset_combined != null) return r.close - r.offset_combined
  if (r.adj_close != null && r.adj_close > 0) return r.adj_close
  return r.close
}

export default function CompareStocksPage() {
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [allSymbols, setAllSymbols] = useState<{ symbol: string; name: string }[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [range, setRange] = useState<typeof RANGES[number]['key']>('3m')
  const [series, setSeries] = useState<Record<string, SymSeries>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    fetch('/stocks/all-symbols.json')
      .then(r => r.json())
      .then((data: { l18: string; l30: string }[]) => setAllSymbols((data ?? []).map(d => ({ symbol: d.l18, name: d.l30 || d.l18 }))))
      .catch(() => {})
  }, [])

  const rangeDays = RANGES.find(r => r.key === range)!.days

  useEffect(() => {
    let cancelled = false
    const missing = selected.filter(s => !series[s])
    if (missing.length === 0) return
    setLoading(true)
    Promise.all(missing.map(async (symbol, i) => {
      let { data, error } = await supabase
        .from('stock_candles')
        .select('trade_date, trade_date_shamsi, close, adj_close, offset_combined')
        .eq('symbol', symbol)
        .order('trade_date', { ascending: false })
        .limit(280)
      if (error) {
        // ستون‌های offset_combined/adj_close هنوز ساخته نشده (migration اجرا نشده) — بدون تعدیل ادامه بده
        const fallback = await supabase
          .from('stock_candles')
          .select('trade_date, trade_date_shamsi, close')
          .eq('symbol', symbol)
          .order('trade_date', { ascending: false })
          .limit(280)
        data = (fallback.data ?? []).map(r => ({ ...r, adj_close: null, offset_combined: null })) as any
      }
      const rows = ((data ?? []) as CandleRow[]).slice().reverse()

      return { symbol, rows, color: COLORS[(Object.keys(series).length + i) % COLORS.length] } as SymSeries
    })).then(results => {
      if (cancelled) return
      setSeries(prev => {
        const next = { ...prev }
        for (const r of results) next[r.symbol] = r
        return next
      })
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [selected, series])

  const t: any = isDark ? darkTheme : lightTheme

  const addSymbol = () => {
    const sym = input.trim()
    if (!sym || selected.includes(sym) || selected.length >= 4) return
    setSelected(prev => [...prev, sym])
    setInput('')
  }
  const removeSymbol = (sym: string) => setSelected(prev => prev.filter(s => s !== sym))

  // نمودار: درصد تغییر نسبت به اولین قیمت هر نماد در بازه انتخابی، روی محور تاریخ مشترک (union تاریخ‌های شمسی)
  const chartData = useMemo(() => {
    const active = selected.filter(s => series[s]?.rows?.length)
    if (active.length === 0) return []
    const sliced = active.map(s => ({ symbol: s, rows: series[s].rows.slice(-rangeDays) }))
    const dateSet = new Set<string>()
    sliced.forEach(s => s.rows.forEach(r => dateSet.add(r.trade_date_shamsi)))
    const dates = [...dateSet].sort()
    const baseline: Record<string, number | null> = {}
    sliced.forEach(s => { baseline[s.symbol] = s.rows[0] ? finalPrice(s.rows[0]) : null })
    return dates.map(date => {
      const point: Record<string, number | string | null> = { date }
      for (const s of sliced) {
        const row = s.rows.find(r => r.trade_date_shamsi === date)
        const base = baseline[s.symbol]
        point[s.symbol] = row && base ? Math.round(((finalPrice(row) - base) / base) * 1000) / 10 : null
      }
      return point
    })
  }, [selected, series, rangeDays])

  const summary = useMemo(() => selected.map(sym => {
    const s = series[sym]
    if (!s || s.rows.length < 15) return { symbol: sym, close: null, changePct: null, rsiVal: null, color: s?.color ?? COLORS[0], dilutionAdjusted: false }
    // بازه نمایش (چند ماه انتخاب‌شده) — تغییر روزانه/RSI را هم روی همان بازه بگیریم، نه کل ۲۸۰ روز
    const rangeRows = s.rows.slice(-rangeDays)
    const finalCloses = rangeRows.map(r => finalPrice(r))
    const rsiSeries = rsi(finalCloses, 14)
    const lastRow = rangeRows[rangeRows.length - 1]
    const prevFinal = finalCloses[finalCloses.length - 2]
    const lastFinal = finalCloses[finalCloses.length - 1]
    return {
      symbol: sym, close: lastRow?.close ?? null,
      changePct: prevFinal ? ((lastFinal - prevFinal) / prevFinal) * 100 : null,
      rsiVal: rsiSeries[rsiSeries.length - 1], color: s.color,
      dilutionAdjusted: rangeRows.some(r => r.offset_combined != null && r.offset_combined !== 0),
    }
  }), [selected, series, rangeDays])

  const line = t.border, muted = t.muted, panel = t.panel

  return (
    <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '20px 12px' : '28px 24px' }}>

        <div style={{ fontSize: 12, color: muted, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          <Link href="/compare" style={{ color: t.accent, textDecoration: 'none' }}>مقایسه صندوق‌ها</Link>
          <span>›</span><span>مقایسه سهام</span>
        </div>

        <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, marginBottom: 6 }}>مقایسه چندنمادی سهام</h1>
        <p style={{ fontSize: 13, color: muted, marginBottom: 18 }}>
          تا ۴ نماد را هم‌زمان روی یک نمودار (درصد تغییر از ابتدای بازه) مقایسه کنید.
        </p>

        {/* افزودن نماد */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <input list="compare-symbols" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSymbol()}
            placeholder="نماد را بنویسید (مثلاً فولاد)…" disabled={selected.length >= 4}
            style={{ flex: '1 1 200px', padding: '9px 12px', borderRadius: 8, border: `1px solid ${line}`, background: t.inputBg, color: t.text, fontSize: 13 }} />
          <datalist id="compare-symbols">
            {allSymbols.map(s => <option key={s.symbol} value={s.symbol}>{s.name}</option>)}
          </datalist>
          <button onClick={addSymbol} disabled={selected.length >= 4} style={{
            padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: t.brand, color: '#fff', fontWeight: 700, fontSize: 13, opacity: selected.length >= 4 ? 0.5 : 1,
          }}>+ افزودن</button>

          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)} style={{
              fontSize: 12, fontWeight: 700, padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
              background: range === r.key ? t.brand : 'transparent',
              color: range === r.key ? '#fff' : muted,
              border: `1px solid ${range === r.key ? t.brand : line}`,
            }}>{r.label}</button>
          ))}
        </div>

        {selected.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {selected.map((sym, i) => (
              <span key={sym} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700,
                padding: '5px 10px', borderRadius: 99, color: COLORS[i % COLORS.length],
                background: `${COLORS[i % COLORS.length]}1c`, border: `1px solid ${COLORS[i % COLORS.length]}44`,
              }}>
                {sym}
                <button onClick={() => removeSymbol(sym)} style={{ all: 'unset', cursor: 'pointer', fontSize: 13 }}>×</button>
              </span>
            ))}
          </div>
        )}

        {selected.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: muted, fontSize: 13 }}>
            حداقل یک نماد اضافه کنید تا نمودار مقایسه‌ای ساخته شود
          </div>
        ) : (
          <>
            <div style={{ background: panel, border: `1px solid ${line}`, borderRadius: 12, padding: '16px 12px', marginBottom: 16, height: 340 }}>
              {loading && chartData.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: muted, fontSize: 13 }}>در حال بارگذاری…</div>
              ) : (
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={line} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: muted }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 10, fill: muted }} tickFormatter={v => `${v}٪`} width={44} />
                    <ReTooltip
                      contentStyle={{ background: t.panelSolid, border: `1px solid ${line}`, borderRadius: 8, fontSize: 12, direction: 'rtl' }}
                      formatter={(v) => (v == null ? '—' : `${Number(v) >= 0 ? '+' : ''}${fa(Number(v), 1)}٪`)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {selected.map((sym, i) => (
                      <Line key={sym} type="monotone" dataKey={sym} stroke={COLORS[i % COLORS.length]}
                        dot={false} strokeWidth={2} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* جدول خلاصه */}
            <div style={{ background: panel, border: `1px solid ${line}`, borderRadius: 12, padding: '14px 16px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {['نماد', 'آخرین قیمت (ریال)', 'تغییر روزانه', 'RSI'].map(h => (
                      <th key={h} style={{ padding: '8px', color: muted, fontWeight: 600, textAlign: 'right', borderBottom: `1px solid ${line}`, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.map(s => (
                    <tr key={s.symbol} style={{ borderBottom: `1px solid ${line}` }}>
                      <td style={{ padding: '9px 8px', fontWeight: 700, color: s.color }}>
                        <Link href={`/technical/${encodeURIComponent(s.symbol.replace(/\s+/g, '-'))}`} style={{ color: s.color, textDecoration: 'none' }}>
                          {s.symbol}
                        </Link>
                        {s.dilutionAdjusted && (
                          <span title="بازده این نماد بابت افزایش سرمایه + سود نقدی تعدیل شده — بر اساس سرمایه فصلی کدال"
                            style={{ marginInlineStart: 6, fontSize: 10, color: muted, cursor: 'help' }}>
                            *تعدیل‌شده
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 8px' }}>{s.close == null ? '—' : fa(s.close)}</td>
                      <td style={{ padding: '9px 8px', fontWeight: 700, color: s.changePct == null ? muted : s.changePct >= 0 ? t.green : t.red }}>
                        {s.changePct == null ? '—' : `${s.changePct >= 0 ? '+' : ''}${fa(s.changePct, 2)}٪`}
                      </td>
                      <td style={{ padding: '9px 8px', color: s.rsiVal == null ? muted : s.rsiVal >= 70 ? t.red : s.rsiVal <= 30 ? t.green : t.text }}>
                        {s.rsiVal == null ? '—' : fa(s.rsiVal, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
