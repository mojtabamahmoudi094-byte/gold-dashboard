'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { rsi, macd, type Candle } from '../../../lib/indicators'
import { GREEN, RED, LINE_COLORS, type IndicatorToggles } from '../TechnicalChart'

const TechnicalChart = dynamic(() => import('../TechnicalChart'), { ssr: false })

type Row = {
  trade_date: string
  trade_date_shamsi: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
}

const RANGES = [
  { label: '۳ ماه', days: 66 },
  { label: '۶ ماه', days: 132 },
  { label: '۱ سال', days: 250 },
  { label: '۳ سال', days: 800 },
] as const

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })

export default function TechnicalPage() {
  const params = useParams()
  const symbol = decodeURIComponent((params?.symbol as string) || '').replace(/-/g, ' ')
  const isMobile = useIsMobile()

  const [isDark, setIsDark] = useState(true)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [rangeDays, setRangeDays] = useState<number>(250)
  const [toggles, setToggles] = useState<IndicatorToggles>({
    ma20: true, ma50: true, bollinger: false, rsi: true, macd: false,
  })

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    if (!symbol) return
    supabase
      .from('stock_candles')
      .select('trade_date, trade_date_shamsi, open, high, low, close, volume')
      .eq('symbol', symbol)
      .order('trade_date', { ascending: true })
      .then(({ data, error }) => {
        if (error || !data) setFailed(true)
        else setRows(data as Row[])
      })
  }, [symbol])

  const candles: Candle[] = useMemo(() => {
    if (!rows) return []
    return rows
      .filter(r => r.close != null && r.close > 0)
      .map(r => ({
        time: r.trade_date,
        shamsi: r.trade_date_shamsi,
        open: r.open ?? r.close,
        high: r.high ?? r.close,
        low: r.low ?? r.close,
        close: r.close,
        volume: r.volume ?? 0,
      }))
  }, [rows])

  const visible = useMemo(() => candles.slice(-rangeDays), [candles, rangeDays])

  // سنجه‌های خلاصه از کل تاریخچه (اندیکاتور روی بازه کوتاه بی‌معنی می‌شود)
  const summary = useMemo(() => {
    if (candles.length < 2) return null
    const closes = candles.map(c => c.close)
    const last = candles[candles.length - 1]
    const prev = candles[candles.length - 2]
    const r = rsi(closes)
    const m = macd(closes)
    const lastRsi = r[r.length - 1]
    const lastMacd = m[m.length - 1]
    const chg = ((last.close - prev.close) / prev.close) * 100
    return { last, chg, rsi: lastRsi, macdHist: lastMacd.hist }
  }, [candles])

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const panel = isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.9)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'

  const chip = (active: boolean): React.CSSProperties => ({
    fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
    padding: '7px 14px', borderRadius: 8, minHeight: 34,
    border: `1px solid ${active ? 'rgba(59,130,246,0.5)' : line}`,
    background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
    color: active ? '#3b82f6' : muted,
    transition: 'all 0.2s',
  })

  const toggleKeys: { key: keyof IndicatorToggles; label: string; color?: string }[] = [
    { key: 'ma20', label: 'میانگین ۲۰', color: LINE_COLORS.ma20 },
    { key: 'ma50', label: 'میانگین ۵۰', color: LINE_COLORS.ma50 },
    { key: 'bollinger', label: 'بولینگر', color: LINE_COLORS.boll },
    { key: 'rsi', label: 'RSI' },
    { key: 'macd', label: 'MACD' },
  ]

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px' : '40px 24px' }}>

        <Link href="/technical" style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>
          ← تحلیل تکنیکال
        </Link>

        {/* هدر نماد */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
          margin: '14px 0 6px',
        }}>
          <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: 0 }}>{symbol}</h1>
          {summary && (
            <>
              <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700 }}>
                {fa(summary.last.close)}
                <span style={{ fontSize: 12, color: muted, marginRight: 5 }}>ریال</span>
              </span>
              <span style={{
                fontSize: 14, fontWeight: 700,
                color: summary.chg >= 0 ? GREEN : RED,
              }}>
                {summary.chg >= 0 ? '▲' : '▼'} {fa(Math.abs(summary.chg), 2)}٪
              </span>
              <span style={{ fontSize: 11.5, color: muted }}>
                آخرین به‌روزرسانی: {summary.last.shamsi}
              </span>
            </>
          )}
          <Link href={`/stock/${encodeURIComponent(symbol.replace(/\s+/g, '-'))}`} style={{
            fontSize: 12, color: '#3b82f6', textDecoration: 'none', marginInlineStart: 'auto',
          }}>
            بنیادی و گزارش‌های کدال ←
          </Link>
        </div>

        {/* سنجه‌های سریع */}
        {summary && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0 18px' }}>
            {summary.rsi !== null && (
              <div style={{
                fontSize: 12, padding: '7px 14px', borderRadius: 10,
                background: panel, border: `1px solid ${line}`,
              }}>
                RSI(14):{' '}
                <b style={{ color: summary.rsi >= 70 ? RED : summary.rsi <= 30 ? GREEN : text }}>
                  {fa(summary.rsi, 1)}
                </b>
                <span style={{ color: muted, marginRight: 6 }}>
                  {summary.rsi >= 70 ? '· اشباع خرید' : summary.rsi <= 30 ? '· اشباع فروش' : ''}
                </span>
              </div>
            )}
            {summary.macdHist !== null && (
              <div style={{
                fontSize: 12, padding: '7px 14px', borderRadius: 10,
                background: panel, border: `1px solid ${line}`,
              }}>
                هیستوگرام MACD:{' '}
                <b style={{ color: summary.macdHist >= 0 ? GREEN : RED }}>
                  {summary.macdHist >= 0 ? 'مثبت' : 'منفی'}
                </b>
              </div>
            )}
          </div>
        )}

        {/* کنترل‌ها: بازه + اندیکاتورها */}
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          padding: '12px 14px', borderRadius: 14, marginBottom: 14,
          background: panel, border: `1px solid ${line}`,
        }}>
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setRangeDays(r.days)} style={chip(rangeDays === r.days)}>
              {r.label}
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: line, margin: '0 4px' }} />
          {toggleKeys.map(t => (
            <button
              key={t.key}
              onClick={() => setToggles(v => ({ ...v, [t.key]: !v[t.key] }))}
              aria-pressed={toggles[t.key]}
              style={{ ...chip(toggles[t.key]), display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {t.color && (
                <span style={{
                  width: 10, height: 3, borderRadius: 2, background: t.color, display: 'inline-block',
                }} />
              )}
              {t.label}
            </button>
          ))}
        </div>

        {/* نمودار */}
        <div style={{
          background: panel, border: `1px solid ${line}`, borderRadius: 16,
          padding: isMobile ? '10px 6px' : '16px 12px',
        }}>
          {failed && (
            <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
              دریافت داده‌های «{symbol}» ناموفق بود
            </div>
          )}
          {!failed && rows === null && (
            <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
              در حال بارگذاری…
            </div>
          )}
          {!failed && rows !== null && candles.length === 0 && (
            <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
              داده‌ای برای «{symbol}» ثبت نشده — نماد را از صفحه تحلیل تکنیکال جست‌وجو کنید
            </div>
          )}
          {!failed && visible.length > 0 && (
            <TechnicalChart
              candles={visible}
              toggles={toggles}
              isDark={isDark}
              height={isMobile ? 320 : 460}
            />
          )}
        </div>

        <p style={{ fontSize: 11, color: muted, lineHeight: 1.9, marginTop: 14 }}>
          داده‌ها: قیمت پایانی روزانه بورس تهران (به‌روزرسانی هر روز پس از پایان بازار).
          این ابزار صرفاً جنبه اطلاع‌رسانی دارد و توصیه خرید یا فروش نیست؛ مسئولیت تصمیم‌های
          معاملاتی با خود شماست.
        </p>
      </div>
    </main>
  )
}
