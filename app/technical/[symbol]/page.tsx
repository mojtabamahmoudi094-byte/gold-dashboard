'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { rsi, macd, type Candle } from '../../../lib/indicators'
import { CANDLE_PATTERN_LABELS } from '../../../lib/candlePatternLabels'
import { GREEN, RED } from '../colors'
import { glassStyle, marketOpen, TA_KEYFRAMES, enterAnim } from '../uiTokens'

const KlineChart = dynamic(() => import('../KlineChart'), { ssr: false })
const TechnicalSummary = dynamic(() => import('../TechnicalSummary'), { ssr: false })
const ChipDistribution = dynamic(() => import('../ChipDistribution'), { ssr: false })

type Row = {
  trade_date: string
  trade_date_shamsi: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
  adj_open: number | null
  adj_high: number | null
  adj_low: number | null
  adj_close: number | null
}
type SymRow = {
  l18: string; pcp: number | null; pl?: number | null; plp?: number | null; pc?: number | null
  bi?: number | null; si?: number | null   // حجم خرید/فروش حقیقی — برای badge خرید/فروش
}

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const toSlug = (s: string) => encodeURIComponent(s.replace(/\s+/g, '-'))

export default function TechnicalSymbolPage() {
  const params = useParams()
  const symbol = decodeURIComponent((params?.symbol as string) || '').replace(/-/g, ' ')
  const isMobile = useIsMobile()

  const [isDark, setIsDark] = useState(true)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [symbols, setSymbols] = useState<SymRow[]>([])
  const [candlePattern, setCandlePattern] = useState<{ pattern: string; bias: string | null } | null>(null)

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
      .select('trade_date, trade_date_shamsi, open, high, low, close, volume, adj_open, adj_high, adj_low, adj_close')
      .eq('symbol', symbol)
      .order('trade_date', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) { setRows(data as Row[]); return }
        // ستون‌های adj هنوز ساخته نشده (migration اجرا نشده) — بدون تعدیل ادامه بده
        supabase
          .from('stock_candles')
          .select('trade_date, trade_date_shamsi, open, high, low, close, volume')
          .eq('symbol', symbol)
          .order('trade_date', { ascending: true })
          .then(({ data: d2, error: e2 }) => {
            if (e2 || !d2) setFailed(true)
            else setRows((d2 as Omit<Row, 'adj_open' | 'adj_high' | 'adj_low' | 'adj_close'>[]).map(r => ({
              ...r, adj_open: null, adj_high: null, adj_low: null, adj_close: null,
            })))
          })
      })
  }, [symbol])

  useEffect(() => {
    if (!symbol) return
    setCandlePattern(null)
    supabase
      .from('stock_screener')
      .select('candle_pattern, candle_pattern_bias')
      .eq('symbol', symbol)
      .order('trade_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data?.candle_pattern) setCandlePattern({ pattern: data.candle_pattern, bias: data.candle_pattern_bias })
      })
  }, [symbol])

  // فهرست نمادها برای سوییچ سریع + قیمت زنده — در ساعت بازار هر ۶۰ ثانیه تازه می‌شود
  // (منبع: /api/stocks-industries که cron سرور ایرانی هر ۵ دقیقه پر می‌کند — بدون مصرف بودجه BrsApi)
  const isOpen = marketOpen()
  useEffect(() => {
    let stop = false
    const load = () =>
      fetch('/api/stocks-industries')
        .then(r => r.json())
        .then((d: { industries?: { symbols: SymRow[] }[] }) => {
          if (!stop) setSymbols((d.industries ?? []).flatMap(i => i.symbols))
        })
        .catch(() => {})
    load()
    const t = isOpen ? setInterval(load, 60_000) : null
    return () => { stop = true; if (t) clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const liveRow = useMemo(() => symbols.find(s => s.l18 === symbol) ?? null, [symbols, symbol])

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

  // سری تعدیل‌شده — ردیف‌های بدون adj (مثل کندل امروز تا اجرای cron شب) به خام برمی‌گردند
  const candlesAdj: Candle[] | undefined = useMemo(() => {
    if (!rows || !rows.some(r => r.adj_close != null && r.adj_close > 0)) return undefined
    return rows
      .filter(r => r.close != null && r.close > 0)
      .map(r => {
        const c = (r.adj_close != null && r.adj_close > 0) ? r.adj_close : r.close
        return {
          time: r.trade_date,
          shamsi: r.trade_date_shamsi,
          open: r.adj_open ?? r.open ?? c,
          high: r.adj_high ?? r.high ?? c,
          low: r.adj_low ?? r.low ?? c,
          close: c,
          volume: r.volume ?? 0,
        }
      })
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

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const panel = isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.9)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#475569'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'
  const glass = glassStyle(isDark)

  // نشان خرید/نگه‌دار/فروش — rule ساده: RSI + هیستوگرام مکدی + خالص پول حقیقی امروز
  // هر سیگنال ±۱ می‌دهد؛ حداقل ۲ سیگنال معتبر لازم است، جمع ≥۲ خرید و ≤−۲ فروش
  const tradeBadge = useMemo(() => {
    if (!summary) return null
    let score = 0, signals = 0
    if (summary.rsi !== null) {
      signals++
      if (summary.rsi < 30) score++
      else if (summary.rsi > 70) score--
    }
    if (summary.macdHist !== null) {
      signals++
      if (summary.macdHist > 0) score++
      else if (summary.macdHist < 0) score--
    }
    if (liveRow?.bi != null && liveRow?.si != null) {
      signals++
      const net = liveRow.bi - liveRow.si
      if (net > 0) score++
      else if (net < 0) score--
    }
    if (signals < 2) return null
    if (score >= 2) return { label: 'خرید', color: GREEN }
    if (score <= -2) return { label: 'فروش', color: RED }
    return { label: 'نگه‌دار', color: '#F5B93E' }
  }, [summary, liveRow])

  // قیمت نمایشی: در ساعت بازار آخرین معامله زنده، وگرنه پایانی آخرین کندل
  const showLive = isOpen && liveRow?.pl != null
  const shownPrice = showLive ? (liveRow!.pl as number) : summary?.last.close ?? null
  const shownPct = showLive ? (liveRow!.plp ?? null) : summary?.chg ?? null

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{TA_KEYFRAMES}</style>

      {/* aurora پس‌زمینه — همان زبان طراحی هاب */}
      <div aria-hidden className="ta-anim" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: isDark ? 1 : 0.35 }}>
        <div style={{ position: 'absolute', top: '2%', right: '6%', width: 440, height: 440, borderRadius: '50%', background: '#3b82f6', opacity: 0.14, filter: 'blur(90px)', animation: 'taBlob1 18s ease-in-out infinite alternate' }} />
        <div style={{ position: 'absolute', top: '38%', left: '14%', width: 380, height: 380, borderRadius: '50%', background: '#8b5cf6', opacity: 0.1, filter: 'blur(90px)', animation: 'taBlob2 24s ease-in-out infinite alternate' }} />
      </div>

      <div className="ta-anim" style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '20px 12px' : '28px 24px', position: 'relative' }}>

        {/* هدر شیشه‌ای: نماد + قیمت زنده + سوییچ سریع */}
        <div style={{
          ...glass,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          marginBottom: 12, padding: isMobile ? '12px 14px' : '14px 18px',
          ...enterAnim(0),
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

          {/* نشان خرید/نگه‌دار/فروش — RSI + مکدی + خالص پول حقیقی */}
          {tradeBadge && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 99,
              color: tradeBadge.color, background: `${tradeBadge.color}1c`,
              border: `1px solid ${tradeBadge.color}44`, flexShrink: 0,
            }}>
              {tradeBadge.label}
            </span>
          )}

          {/* چیپ ضربان بازار */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 99,
            border: `1px solid ${line}`,
            color: isOpen ? GREEN : muted, flexShrink: 0,
          }}>
            <span style={{ position: 'relative', width: 7, height: 7, flexShrink: 0 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: isOpen ? GREEN : (isDark ? '#4b5563' : '#9ca3af') }} />
              {isOpen && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: GREEN, animation: 'taPing 2s ease-out infinite' }} />}
            </span>
            {isOpen ? 'زنده' : 'بازار بسته'}
          </span>

          {shownPrice !== null && (
            <>
              <span style={{ fontSize: isMobile ? 17 : 21, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {fa(shownPrice)}
                <span style={{ fontSize: 11, color: muted, marginRight: 4 }}>ریال</span>
              </span>
              {shownPct !== null && (
                <span style={{
                  fontSize: 12.5, fontWeight: 700, padding: '3px 10px', borderRadius: 7,
                  color: shownPct >= 0 ? GREEN : RED,
                  background: shownPct >= 0 ? 'rgba(38,166,154,0.12)' : 'rgba(239,83,80,0.12)',
                }}>
                  {shownPct >= 0 ? '▲' : '▼'} {fa(Math.abs(shownPct), 2)}٪
                </span>
              )}
              {showLive && <span style={{ fontSize: 10, color: muted }}>آخرین معامله لحظه‌ای</span>}
              {summary && summary.rsi !== null && (
                <span style={{
                  fontSize: 11.5, padding: '4px 10px', borderRadius: 8,
                  background: panel, border: `1px solid ${line}`, color: muted,
                }}>
                  RSI{' '}
                  <b style={{ color: summary!.rsi! >= 70 ? RED : summary!.rsi! <= 30 ? GREEN : text }}>
                    {fa(summary!.rsi!, 1)}
                  </b>
                  {summary!.rsi! >= 70 ? ' اشباع خرید' : summary!.rsi! <= 30 ? ' اشباع فروش' : ''}
                </span>
              )}
              {summary && summary.macdHist !== null && (
                <span style={{
                  fontSize: 11.5, padding: '4px 10px', borderRadius: 8,
                  background: panel, border: `1px solid ${line}`, color: muted,
                }}>
                  MACD <b style={{ color: summary!.macdHist! >= 0 ? GREEN : RED }}>{summary!.macdHist! >= 0 ? 'مثبت' : 'منفی'}</b>
                </span>
              )}
              {candlePattern && (
                <span style={{
                  fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                  color: candlePattern.bias === 'bull' ? GREEN : candlePattern.bias === 'bear' ? RED : '#3b82f6',
                  background: candlePattern.bias === 'bull' ? 'rgba(38,166,154,0.12)' : candlePattern.bias === 'bear' ? 'rgba(239,83,80,0.12)' : 'rgba(59,130,246,0.12)',
                }}>
                  {CANDLE_PATTERN_LABELS[candlePattern.pattern] ?? candlePattern.pattern}
                </span>
              )}
              {summary && <span style={{ fontSize: 11, color: muted }}>{summary.last.shamsi}</span>}
            </>
          )}

          <Link href={`/stock/${toSlug(symbol)}`} style={{
            marginInlineStart: 'auto',
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
            ...glass,
          }}>
            دریافت داده‌های «{symbol}» ناموفق بود
          </div>
        )}
        {!failed && rows === null && (
          <div style={{
            color: muted, fontSize: 13, padding: '70px 0', textAlign: 'center',
            ...glass,
          }}>
            در حال بارگذاری…
          </div>
        )}
        {!failed && rows !== null && candles.length === 0 && (
          <div style={{
            color: muted, fontSize: 13, padding: '70px 0', textAlign: 'center',
            ...glass,
          }}>
            داده‌ای برای «{symbol}» ثبت نشده — نماد دیگری جست‌وجو کنید
          </div>
        )}
        {!failed && candles.length > 0 && (
          <>
            <div style={enterAnim(1)}>
              <KlineChart
                symbol={symbol}
                candles={candles}
                candlesAdj={candlesAdj}
                isDark={isDark}
                symbols={symbols}
                livePrice={showLive && liveRow?.pl != null ? { pl: liveRow.pl, plp: liveRow.plp ?? 0 } : null}
              />
            </div>
            <div style={enterAnim(2)}>
              <TechnicalSummary symbol={symbol} candles={candles} isDark={isDark} />
            </div>
            <div style={enterAnim(3)}>
              <ChipDistribution symbol={symbol} isDark={isDark} />
            </div>
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
