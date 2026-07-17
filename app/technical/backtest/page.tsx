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
}

function labelOf(key: string): string {
  if (key.startsWith('candle_')) return CANDLE_PATTERN_LABELS[key.slice(7)] ?? key
  return SIGNAL_LABELS[key] ?? key
}

const HORIZONS = [5, 10, 20] as const

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })

export default function BacktestPage() {
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [rows, setRows] = useState<StatRow[] | null>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    supabase.from('signal_backtest_stats').select('*').then(({ data, error }) => {
      if (!error && data) setRows(data as StatRow[])
    })
  }, [])

  const bySignal = useMemo(() => {
    if (!rows) return []
    const map = new Map<string, { key: string; bias: 'bull' | 'bear'; byHorizon: Map<number, StatRow> }>()
    for (const r of rows) {
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
  }, [rows])

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#475569'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)'
  const glass = glassStyle(isDark)

  const th = (label: string) => (
    <th style={{ padding: '10px 12px', fontSize: 11.5, fontWeight: 700, color: muted, textAlign: 'right', whiteSpace: 'nowrap' }}>
      {label}
    </th>
  )

  return (
    <AuthGate title="تحلیل تکنیکال">
      <main style={{
        minHeight: '100vh', background: bg, color: text,
        fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
        position: 'relative', overflow: 'hidden',
      }}>
        <style>{TA_KEYFRAMES}</style>

        <div aria-hidden className="ta-anim" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: isDark ? 1 : 0.35 }}>
          <div style={{ position: 'absolute', top: '3%', left: '10%', width: 460, height: 460, borderRadius: '50%', background: '#3b82f6', opacity: 0.14, filter: 'blur(90px)', animation: 'taBlob1 18s ease-in-out infinite alternate' }} />
          <div style={{ position: 'absolute', bottom: '5%', right: '8%', width: 400, height: 400, borderRadius: '50%', background: '#8b5cf6', opacity: 0.11, filter: 'blur(90px)', animation: 'taBlob2 24s ease-in-out infinite alternate' }} />
        </div>

        <div className="ta-anim" style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '28px 14px' : '40px 24px', position: 'relative' }}>

        <Link href="/technical/screener" style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>
          ← دیده‌بان تکنیکال
        </Link>

        <h1 style={{
          fontSize: isMobile ? 23 : 28, fontWeight: 800, margin: '12px 0 6px',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
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

        <div style={{ ...glass, borderRadius: 20, overflowX: 'auto', ...enterAnim(2) }}>
          {rows === null ? (
            <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>در حال بارگذاری…</div>
          ) : bySignal.length === 0 ? (
            <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
              داده‌ای نیست — اسکریپت بک‌تست هنوز روی سرور اجرا نشده
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${line}` }}>
                  {th('سیگنال')}
                  {th('تعداد رخداد')}
                  {HORIZONS.flatMap(h => [th(`نرخ برد ${fa(h)}روزه`), th(`میانگین بازده ${fa(h)}روزه`)])}
                </tr>
              </thead>
              <tbody>
                {bySignal.map(g => (
                  <tr key={g.key} style={{ borderBottom: `1px solid ${line}` }}>
                    <td style={{ padding: '9px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      <span style={{ color: g.bias === 'bull' ? GREEN : RED }}>{g.bias === 'bull' ? '▲' : '▼'}</span> {labelOf(g.key)}
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: muted }}>
                      {fa(g.byHorizon.get(10)?.sample_count ?? 0)}
                    </td>
                    {HORIZONS.flatMap(h => {
                      const s = g.byHorizon.get(h)
                      return [
                        <td key={`wr${h}`} style={{ padding: '9px 12px', fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {s ? `${fa(s.win_rate, 1)}٪` : '—'}
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
          )}
        </div>

        <p style={{ fontSize: 11, color: muted, lineHeight: 1.9, marginTop: 14 }}>
          این آمار صرفاً بازتاب رفتار تاریخی قیمت در دوره بک‌تست است (ممکن است تحت تأثیر روند کلی بازار در همان بازه باشد)
          و تضمینی برای آینده نیست؛ توصیه خرید یا فروش نیست، مسئولیت تصمیم‌های معاملاتی با خود شماست.
        </p>
      </div>
      </main>
    </AuthGate>
  )
}
