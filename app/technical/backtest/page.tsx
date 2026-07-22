'use client'

// بازده تاریخی سیگنال‌ها — بک‌تست ۳ساله روی کل تاریخچه stock_candles (scripts/backtest-signals.js)
// زبان طراحی یکسان با /technical/screener

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AuthGate from '../../../components/AuthGate'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { CANDLE_PATTERN_LABELS } from '../../../lib/candlePatternLabels'
import { GREEN, RED } from '../colors'
import { glassStyle, TA_KEYFRAMES, enterAnim } from '../uiTokens'
import { shouldUseDark } from '../../../lib/theme'

type StatRow = {
  signal_key: string
  horizon_days: number
  bias: 'bull' | 'bear'
  sample_count: number
  win_rate: number
  avg_return_pct: number
  median_return_pct: number
}

const SIGNAL_LABELS: Record<string, string> = {
  golden_cross: 'کراس طلایی', death_cross: 'کراس مرگ',
  rsi_oversold: 'RSI اشباع فروش', rsi_overbought: 'RSI اشباع خرید',
  macd_cross_up: 'سیگنال خرید مکدی', macd_cross_down: 'سیگنال فروش مکدی',
  vol_spike: 'حجم مشکوک', new_high_52w: 'سقف جدید ۵۲ هفته', new_low_52w: 'کف جدید ۵۲ هفته',
  baseline_all_days: 'خط پایه (همه روزها)',
}

function labelOf(key: string): string {
  if (key.startsWith('candle_')) return CANDLE_PATTERN_LABELS[key.slice(7)] ?? key
  return SIGNAL_LABELS[key] ?? key
}

const HORIZONS = [5, 10, 20] as const

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })

type SignalGroup = { key: string; bias: 'bull' | 'bear'; byHorizon: Map<number, StatRow> }

function StatsTable({ groups, muted, line, baseline }: { groups: SignalGroup[]; muted: string; line: string; baseline?: Map<number, StatRow> }) {
  const th = (label: string) => (
    <th key={label} style={{ padding: '10px 12px', fontSize: 11.5, fontWeight: 700, color: muted, textAlign: 'right', whiteSpace: 'nowrap' }}>
      {label}
    </th>
  )
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${line}` }}>
          {th('سیگنال')}
          {th('تعداد رخداد')}
          {HORIZONS.flatMap(h => [th(`نرخ برد ${fa(h)}روزه`), th(`میانگین بازده ${fa(h)}روزه`)])}
        </tr>
      </thead>
      <tbody>
        {groups.map(g => (
          <tr key={g.key} style={{ borderBottom: `1px solid ${line}` }}>
            <td style={{ padding: '9px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
              <span style={{ color: g.bias === 'bull' ? GREEN : RED }}>{g.bias === 'bull' ? '▲' : '▼'}</span> {labelOf(g.key)}
            </td>
            <td style={{ padding: '9px 12px', fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: muted }}>
              {fa(g.byHorizon.get(10)?.sample_count ?? 0)}
            </td>
            {HORIZONS.flatMap(h => {
              const s = g.byHorizon.get(h)
              const b = baseline?.get(h)
              // برتری (edge) نسبت به خط پایه: برای سیگنال گاوی مقایسه با نرخ مثبت‌بودن بازار،
              // برای خرسی با مکملش (اگر بازار ۵۵٪ روزها مثبت است، شانس خام سیگنال خرسی ۴۵٪ است)
              const baseWr = s && b ? (g.bias === 'bull' ? b.win_rate : 100 - b.win_rate) : null
              const edge = s && baseWr !== null ? s.win_rate - baseWr : null
              return [
                <td key={`wr${h}`} style={{ padding: '9px 12px', fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {s ? `${fa(s.win_rate, 1)}٪` : '—'}
                  {edge !== null && (
                    <div style={{ fontSize: 9.5, color: edge >= 0 ? GREEN : RED }} title="اختلاف با خط پایهٔ بازار (بدون سیگنال)">
                      {edge >= 0 ? '+' : ''}{fa(edge, 1)} نسبت به پایه
                    </div>
                  )}
                </td>,
                <td key={`ar${h}`} style={{
                  padding: '9px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                  color: !s ? muted : s.avg_return_pct >= 0 ? GREEN : RED,
                }}>
                  {s ? `${s.avg_return_pct >= 0 ? '+' : ''}${fa(s.avg_return_pct, 2)}٪` : '—'}
                </td>,
              ]
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function BacktestPage() {
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [rows, setRows] = useState<StatRow[] | null>(null)

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    supabase.from('signal_backtest_stats').select('*').then(({ data, error }) => {
      if (!error && data) setRows(data as StatRow[])
    })
  }, [])

  const groupBySignal = (list: StatRow[]) => {
    const map = new Map<string, { key: string; bias: 'bull' | 'bear'; byHorizon: Map<number, StatRow> }>()
    for (const r of list) {
      let g = map.get(r.signal_key)
      if (!g) { g = { key: r.signal_key, bias: r.bias, byHorizon: new Map() }; map.set(r.signal_key, g) }
      g.byHorizon.set(r.horizon_days, r)
    }
    return [...map.values()].sort((a, b) => {
      const as = a.byHorizon.get(10), bs = b.byHorizon.get(10)
      // نمونه‌های کم (زیر ۵ رخداد) قابل اتکا نیستند — به انتهای فهرست می‌روند، نه اول
      const aReliable = (as?.sample_count ?? 0) >= 5, bReliable = (bs?.sample_count ?? 0) >= 5
      if (aReliable !== bReliable) return aReliable ? -1 : 1
      return (bs?.win_rate ?? -1) - (as?.win_rate ?? -1)
    })
  }

  // خط پایه: بازده آتی همهٔ روزها بدون سیگنال — مرجع مقایسهٔ همهٔ سیگنال‌ها
  const baseline = useMemo(() => {
    const m = new Map<number, StatRow>()
    for (const r of rows ?? []) if (r.signal_key === 'baseline_all_days') m.set(r.horizon_days, r)
    return m
  }, [rows])

  const bySignal = useMemo(
    () => (rows ? groupBySignal(rows.filter(r => r.signal_key !== 'baseline_all_days')) : []),
    [rows],
  )

  // بک‌تست تعاملی — نماد دلخواه کاربر (زنده از /api/backtest-signal-symbol، نه جدول تجمیعی)
  const [allSymbols, setAllSymbols] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [symbolRows, setSymbolRows] = useState<StatRow[] | null>(null)
  const [symbolLoading, setSymbolLoading] = useState(false)
  const [symbolError, setSymbolError] = useState<string | null>(null)
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    fetch('/api/stocks-industries').then(r => r.json()).then(j => {
      const syms = new Set<string>()
      for (const ind of j.industries ?? []) for (const s of ind.symbols ?? []) if (s.l18) syms.add(s.l18)
      setAllSymbols([...syms])
    }).catch(() => {})
  }, [])

  useEffect(() => setActiveIdx(0), [query])

  const suggestions = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    return allSymbols.filter(s => s.includes(q)).slice(0, 8)
  }, [query, allSymbols])

  const runSymbolBacktest = async (symbol: string) => {
    setQuery(symbol)
    setActiveSymbol(symbol)
    setSymbolLoading(true)
    setSymbolError(null)
    setSymbolRows(null)
    try {
      const res = await fetch(`/api/backtest-signal-symbol?symbol=${encodeURIComponent(symbol)}`)
      const j = await res.json()
      if (j.error) setSymbolError(j.error)
      setSymbolRows(j.rows ?? [])
    } catch {
      setSymbolError('دریافت داده ناموفق بود')
    } finally {
      setSymbolLoading(false)
    }
  }

  const symbolGrouped = useMemo(() => (symbolRows ? groupBySignal(symbolRows) : []), [symbolRows])

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#475569'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)'
  const glass = glassStyle(isDark)

  return (
    <AuthGate title="تحلیل تکنیکال">
      <main style={{
        minHeight: '100vh', background: bg, color: text,
        fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
        position: 'relative', overflow: 'hidden',
      }}>
        <style>{TA_KEYFRAMES}</style>

        <div aria-hidden className="ta-anim" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: isDark ? 1 : 0.35 }}>
          <div style={{ position: 'absolute', top: '3%', left: '10%', width: 460, height: 460, borderRadius: '50%', background: '#d9b45b', opacity: 0.14, filter: 'blur(90px)', animation: 'taBlob1 18s ease-in-out infinite alternate' }} />
          <div style={{ position: 'absolute', bottom: '5%', right: '8%', width: 400, height: 400, borderRadius: '50%', background: '#f4d795', opacity: 0.11, filter: 'blur(90px)', animation: 'taBlob2 24s ease-in-out infinite alternate' }} />
        </div>

        <div className="ta-anim" style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '28px 14px' : '40px 24px', position: 'relative' }}>

        <Link href="/technical/screener" style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>
          ← دیده‌بان تکنیکال
        </Link>

        <h1 style={{
          fontSize: isMobile ? 23 : 28, fontWeight: 800, margin: '12px 0 6px',
          background: 'linear-gradient(135deg, #d9b45b, #f4d795)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          ...enterAnim(0),
        }}>
          بازده تاریخی سیگنال‌ها
        </h1>

        <p style={{ fontSize: 13, color: muted, margin: '0 0 20px', lineHeight: 1.8, ...enterAnim(1) }}>
          هر بار این سیگنال در ۳ سال اخیر (روی کل تاریخچه نمادها) رخ داده، بازده ۵/۱۰/۲۰ روز بعد چقدر بوده —
          نرخ برد یعنی چند درصد رخدادها هم‌جهت با بایاس سیگنال جواب داده‌اند. فهرست بر اساس نرخ برد ۱۰روزه
          مرتب شده (سیگنال‌های با کمتر از ۵ رخداد، غیرقابل‌اتکا و در انتها هستند).
        </p>

        {baseline.size > 0 && (
          <div style={{ ...glass, borderRadius: 14, padding: '12px 16px', marginBottom: 14, ...enterAnim(1) }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>خط پایهٔ بازار (بدون هیچ سیگنالی)</div>
            <div style={{ fontSize: 11.5, color: muted, lineHeight: 2 }}>
              {HORIZONS.map(h => {
                const b = baseline.get(h)
                return b ? `افق ${fa(h)}روزه: ${fa(b.win_rate, 1)}٪ روزها مثبت (میانگین ${b.avg_return_pct >= 0 ? '+' : ''}${fa(b.avg_return_pct, 2)}٪)` : null
              }).filter(Boolean).join(' · ')}
            </div>
            <div style={{ fontSize: 10.5, color: muted, marginTop: 4 }}>
              سیگنالی «برتری» دارد که نرخ بردش از این خط پایه بالاتر بزند — عدد ریز زیر هر نرخ برد همین اختلاف است.
            </div>
          </div>
        )}

        <div style={{ ...glass, borderRadius: 20, overflowX: 'auto', ...enterAnim(2) }}>
          {rows === null ? (
            <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>در حال بارگذاری…</div>
          ) : bySignal.length === 0 ? (
            <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
              داده‌ای نیست — اسکریپت بک‌تست هنوز روی سرور اجرا نشده
            </div>
          ) : (
            <StatsTable groups={bySignal} muted={muted} line={line} baseline={baseline} />
          )}
        </div>

        <p style={{ fontSize: 11, color: muted, lineHeight: 1.9, marginTop: 14 }}>
          این آمار صرفاً بازتاب رفتار تاریخی قیمت در دوره بک‌تست است (ممکن است تحت تأثیر روند کلی بازار در همان بازه باشد)
          و تضمینی برای آینده نیست؛ توصیه خرید یا فروش نیست، مسئولیت تصمیم‌های معاملاتی با خود شماست.
        </p>

        {/* بک‌تست تعاملی — نماد دلخواه کاربر */}
        <h2 style={{ fontSize: isMobile ? 18 : 21, fontWeight: 800, margin: '36px 0 6px', color: text }}>
          بک‌تست تعاملی روی نماد دلخواه
        </h2>
        <p style={{ fontSize: 12.5, color: muted, margin: '0 0 16px', lineHeight: 1.8 }}>
          به‌جای میانگین همه نمادها، ببین همین سیگنال‌ها دقیقاً روی یک نماد خاص در ۳ سال اخیر چه بازدهی داشته‌اند.
        </p>
        <div style={{ position: 'relative', maxWidth: 340, marginBottom: 16 }}>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveSymbol(null) }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter' && suggestions[activeIdx]) { runSymbolBacktest(suggestions[activeIdx]) }
            }}
            placeholder="نام نماد را بنویس… (مثلاً فولاد)"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!!query && !activeSymbol && suggestions.length > 0}
            aria-controls="backtest-symbol-listbox"
            aria-activedescendant={suggestions[activeIdx] ? `backtest-symbol-option-${suggestions[activeIdx]}` : undefined}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontFamily: 'inherit',
              background: isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: text,
              border: `0.5px solid ${line}`,
            }}
          />
          {query && !activeSymbol && suggestions.length > 0 && (
            <div id="backtest-symbol-listbox" role="listbox" style={{
              position: 'absolute', top: '100%', right: 0, left: 0, marginTop: 4, zIndex: 10,
              background: isDark ? '#0B1220' : '#fff', border: `0.5px solid ${line}`, borderRadius: 10,
              overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            }}>
              {suggestions.map((s, i) => (
                <div
                  key={s}
                  id={`backtest-symbol-option-${s}`}
                  role="option"
                  aria-selected={i === activeIdx}
                  onMouseDown={() => runSymbolBacktest(s)}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: text,
                    background: i === activeIdx ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.05)') : 'transparent',
                  }}>{s}</div>
              ))}
            </div>
          )}
        </div>

        {activeSymbol && (
          <div style={{ ...glass, borderRadius: 20, overflowX: 'auto' }}>
            {symbolLoading ? (
              <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>در حال محاسبه بک‌تست {activeSymbol}…</div>
            ) : symbolError ? (
              <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>{symbolError}</div>
            ) : symbolGrouped.length === 0 ? (
              <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>هیچ سیگنالی در تاریخچه این نماد رخ نداده</div>
            ) : (
              <>
                <StatsTable groups={symbolGrouped} muted={muted} line={line} />
                <div style={{ fontSize: 10.5, color: muted, padding: '10px 14px', lineHeight: 1.8 }}>
                  الگوهای کندلی این‌جا پوشش داده نمی‌شوند — برای آن‌ها جدول بالا (میانگین همه نمادها) را ببین.
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </main>
    </AuthGate>
  )
}
