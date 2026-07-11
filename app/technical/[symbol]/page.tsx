'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { rsi, macd, type Candle } from '../../../lib/indicators'
import { GREEN, RED } from '../colors'

const KlineChart = dynamic(() => import('../KlineChart'), { ssr: false })
const TechnicalSummary = dynamic(() => import('../TechnicalSummary'), { ssr: false })

type Row = {
  trade_date: string
  trade_date_shamsi: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
}
type SymRow = { l18: string; pcp: number | null }

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const toSlug = (s: string) => encodeURIComponent(s.replace(/\s+/g, '-'))

export default function TechnicalSymbolPage() {
  const params = useParams()
  const router = useRouter()
  const symbol = decodeURIComponent((params?.symbol as string) || '').replace(/-/g, ' ')
  const isMobile = useIsMobile()

  const [isDark, setIsDark] = useState(true)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const [symbols, setSymbols] = useState<SymRow[]>([])

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    if (!symbol) return
    setRows(null)
    setFailed(false)
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

  // فهرست نمادها برای سوییچ سریع
  useEffect(() => {
    fetch('/api/stocks-industries')
      .then(r => r.json())
      .then((d: { industries?: { symbols: SymRow[] }[] }) => {
        setSymbols((d.industries ?? []).flatMap(i => i.symbols))
      })
      .catch(() => {})
  }, [])

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

  const summary = useMemo(() => {
    if (candles.length < 2) return null
    const closes = candles.map(c => c.close)
    const last = candles[candles.length - 1]
    const prev = candles[candles.length - 2]
    const r = rsi(closes)
    const m = macd(closes)
    return {
      last,
      chg: ((last.close - prev.close) / prev.close) * 100,
      rsi: r[r.length - 1],
      macdHist: m[m.length - 1].hist,
    }
  }, [candles])

  const matches = useMemo(() => {
    const query = q.trim()
    if (!query) return []
    return symbols.filter(s => s.l18.includes(query) && s.l18 !== symbol).slice(0, 8)
  }, [q, symbols, symbol])

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const panel = isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.9)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '20px 12px' : '28px 24px' }}>

        {/* هدر: نماد + قیمت + سوییچ سریع */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          marginBottom: 12,
        }}>
          <Link href="/technical" aria-label="بازگشت به تحلیل تکنیکال" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: 9, textDecoration: 'none', flexShrink: 0,
            border: `1px solid ${line}`, color: muted,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 5 12 12 19" />
            </svg>
          </Link>

          <h1 style={{
            fontSize: isMobile ? 20 : 26, fontWeight: 800, margin: 0,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            {symbol}
          </h1>

          {summary && (
            <>
              <span style={{ fontSize: isMobile ? 17 : 21, fontWeight: 700 }}>
                {fa(summary.last.close)}
                <span style={{ fontSize: 11, color: muted, marginRight: 4 }}>ریال</span>
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: summary.chg >= 0 ? GREEN : RED }}>
                {summary.chg >= 0 ? '▲' : '▼'} {fa(Math.abs(summary.chg), 2)}٪
              </span>
              {summary.rsi !== null && (
                <span style={{
                  fontSize: 11.5, padding: '4px 10px', borderRadius: 8,
                  background: panel, border: `1px solid ${line}`, color: muted,
                }}>
                  RSI{' '}
                  <b style={{ color: summary.rsi >= 70 ? RED : summary.rsi <= 30 ? GREEN : text }}>
                    {fa(summary.rsi, 1)}
                  </b>
                  {summary.rsi >= 70 ? ' اشباع خرید' : summary.rsi <= 30 ? ' اشباع فروش' : ''}
                </span>
              )}
              {summary.macdHist !== null && (
                <span style={{
                  fontSize: 11.5, padding: '4px 10px', borderRadius: 8,
                  background: panel, border: `1px solid ${line}`, color: muted,
                }}>
                  MACD <b style={{ color: summary.macdHist >= 0 ? GREEN : RED }}>{summary.macdHist >= 0 ? 'مثبت' : 'منفی'}</b>
                </span>
              )}
              <span style={{ fontSize: 11, color: muted }}>{summary.last.shamsi}</span>
            </>
          )}

          {/* سوییچ سریع نماد */}
          <div style={{ position: 'relative', marginInlineStart: 'auto', minWidth: isMobile ? '100%' : 220 }}>
            <label htmlFor="ta-switch" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              تغییر نماد
            </label>
            <input
              id="ta-switch"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && matches.length > 0) {
                  setQ('')
                  router.push(`/technical/${toSlug(matches[0].l18)}`)
                }
              }}
              placeholder="تغییر نماد…"
              style={{
                width: '100%', boxSizing: 'border-box', fontSize: 13, fontFamily: 'inherit',
                padding: '9px 14px', borderRadius: 10, outline: 'none',
                background: panel, color: text, border: `1px solid ${line}`,
              }}
            />
            {matches.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 70, marginTop: 5,
                background: isDark ? '#12161f' : '#fffdf8', borderRadius: 12, padding: 5,
                border: `1px solid ${line}`,
                boxShadow: isDark ? '0 18px 50px rgba(0,0,0,0.6)' : '0 14px 40px rgba(0,0,0,0.14)',
              }}>
                {matches.map(m => (
                  <Link key={m.l18} href={`/technical/${toSlug(m.l18)}`} onClick={() => setQ('')} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 12px', borderRadius: 8, textDecoration: 'none',
                    fontSize: 13, color: text, fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <span>{m.l18}</span>
                    {m.pcp !== null && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: m.pcp >= 0 ? GREEN : RED }}>
                        {m.pcp >= 0 ? '▲' : '▼'} {fa(Math.abs(m.pcp), 2)}٪
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link href={`/stock/${toSlug(symbol)}`} style={{
            fontSize: 12, color: '#3b82f6', textDecoration: 'none', whiteSpace: 'nowrap',
            padding: '7px 12px', borderRadius: 9,
            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
          }}>
            بنیادی و کدال ←
          </Link>
        </div>

        {/* ترمینال نمودار */}
        {failed && (
          <div style={{
            color: muted, fontSize: 13, padding: '70px 0', textAlign: 'center',
            background: panel, border: `1px solid ${line}`, borderRadius: 16,
          }}>
            دریافت داده‌های «{symbol}» ناموفق بود
          </div>
        )}
        {!failed && rows === null && (
          <div style={{
            color: muted, fontSize: 13, padding: '70px 0', textAlign: 'center',
            background: panel, border: `1px solid ${line}`, borderRadius: 16,
          }}>
            در حال بارگذاری…
          </div>
        )}
        {!failed && rows !== null && candles.length === 0 && (
          <div style={{
            color: muted, fontSize: 13, padding: '70px 0', textAlign: 'center',
            background: panel, border: `1px solid ${line}`, borderRadius: 16,
          }}>
            داده‌ای برای «{symbol}» ثبت نشده — نماد دیگری جست‌وجو کنید
          </div>
        )}
        {!failed && candles.length > 0 && (
          <>
            <KlineChart symbol={symbol} candles={candles} isDark={isDark} />
            <TechnicalSummary symbol={symbol} candles={candles} isDark={isDark} />
          </>
        )}

        <p style={{ fontSize: 11, color: muted, lineHeight: 1.9, marginTop: 12 }}>
          داده‌ها: قیمت پایانی روزانه بورس تهران — به‌روزرسانی هر روز پس از پایان بازار.
          این ابزار صرفاً جنبه اطلاع‌رسانی دارد و توصیه خرید یا فروش نیست؛ مسئولیت تصمیم‌های
          معاملاتی با خود شماست.
        </p>
      </div>
    </main>
  )
}
