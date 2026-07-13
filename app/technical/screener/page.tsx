'use client'

// دیده‌بان تکنیکال — فیلتر سیگنال‌های محاسبه‌شده شبانه (جدول stock_screener)
// زبان طراحی ۲۰۲۶ یکسان با هاب و صفحه نماد — شیشه‌ای + aurora + چیپ ضربان بازار

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { CANDLE_PATTERN_LABELS } from '../../../lib/candlePatternLabels'
import { GREEN, RED } from '../colors'
import { glassStyle, marketOpen, TA_KEYFRAMES, enterAnim } from '../uiTokens'

type Row = {
  symbol: string
  trade_date_shamsi: string
  close: number
  change_pct: number | null
  rsi: number | null
  vol_ratio: number | null
  trend: string | null
  rsi_oversold: boolean
  rsi_overbought: boolean
  golden_cross: boolean
  death_cross: boolean
  macd_cross_up: boolean
  macd_cross_down: boolean
  near_high_52w: boolean
  near_low_52w: boolean
  new_high_52w: boolean
  new_low_52w: boolean
  vol_spike: boolean
  structure_break?: string | null
  fvg_bull_near?: boolean
  fvg_bear_near?: boolean
  ob_bull_near?: boolean
  ob_bear_near?: boolean
  candle_pattern?: string | null
  candle_pattern_bias?: string | null
}

// فیلترها با هم AND می‌شوند — چند چیپ فعال یعنی نمادهایی که همه شرط‌ها را دارند
const FILTERS: { key: string; label: string; tone?: 'pos' | 'neg' }[] = [
  { key: 'rsi_oversold', label: 'اشباع فروش (RSI≤۳۰)', tone: 'pos' },
  { key: 'rsi_overbought', label: 'اشباع خرید (RSI≥۷۰)', tone: 'neg' },
  { key: 'golden_cross', label: 'کراس طلایی', tone: 'pos' },
  { key: 'death_cross', label: 'کراس مرگ', tone: 'neg' },
  { key: 'macd_cross_up', label: 'سیگنال خرید مکدی', tone: 'pos' },
  { key: 'macd_cross_down', label: 'سیگنال فروش مکدی', tone: 'neg' },
  { key: 'new_high_52w', label: 'سقف جدید ۵۲ هفته', tone: 'pos' },
  { key: 'near_high_52w', label: 'نزدیک سقف ۵۲ هفته' },
  { key: 'near_low_52w', label: 'نزدیک کف ۵۲ هفته' },
  { key: 'vol_spike', label: 'حجم مشکوک' },
  { key: 'structure_up', label: 'شکست ساختار صعودی', tone: 'pos' },
  { key: 'structure_down', label: 'شکست ساختار نزولی', tone: 'neg' },
  { key: 'fvg_bull_near', label: 'FVG صعودی نزدیک قیمت', tone: 'pos' },
  { key: 'fvg_bear_near', label: 'FVG نزولی نزدیک قیمت', tone: 'neg' },
  { key: 'ob_bull_near', label: 'اردر بلاک حمایتی', tone: 'pos' },
  { key: 'ob_bear_near', label: 'اردر بلاک مقاومتی', tone: 'neg' },
  { key: 'candle_bull', label: 'الگوی کندلی صعودی', tone: 'pos' },
  { key: 'candle_bear', label: 'الگوی کندلی نزولی', tone: 'neg' },
]

function passes(r: Row, key: string): boolean {
  if (key === 'structure_up') return r.structure_break === 'bos_up' || r.structure_break === 'choch_up'
  if (key === 'structure_down') return r.structure_break === 'bos_down' || r.structure_break === 'choch_down'
  if (key === 'candle_bull') return r.candle_pattern_bias === 'bull'
  if (key === 'candle_bear') return r.candle_pattern_bias === 'bear'
  return r[key as keyof Row] === true
}

type SortKey = 'change_pct' | 'rsi' | 'vol_ratio'

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const toSlug = (s: string) => encodeURIComponent(s.replace(/\s+/g, '-'))

export default function ScreenerPage() {
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [active, setActive] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('change_pct')
  const [sortDesc, setSortDesc] = useState(true)
  const [q, setQ] = useState('')
  const isOpen = marketOpen()

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    const load = async () => {
      const all: Row[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('stock_screener')
          .select('*')
          .range(from, from + 999)
        if (error || !data) break
        all.push(...(data as Row[]))
        if (data.length < 1000) break
      }
      setRows(all)
    }
    load()
  }, [])

  const visible = useMemo(() => {
    if (!rows) return []
    let out = rows
    if (active.length > 0) out = out.filter(r => active.every(k => passes(r, k)))
    const query = q.trim()
    if (query) out = out.filter(r => r.symbol.includes(query))
    return [...out].sort((a, b) => {
      const av = (a[sortKey] ?? -Infinity) as number
      const bv = (b[sortKey] ?? -Infinity) as number
      return sortDesc ? bv - av : av - bv
    })
  }, [rows, active, q, sortKey, sortDesc])

  const toggleFilter = (key: string) =>
    setActive(v => (v.includes(key) ? v.filter(x => x !== key) : [...v, key]))

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#475569'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'
  const glass = glassStyle(isDark)

  const chip = (active: boolean, tone?: 'pos' | 'neg'): React.CSSProperties => {
    const clr = tone === 'pos' ? GREEN : tone === 'neg' ? RED : '#3b82f6'
    return {
      fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
      padding: '7px 14px', borderRadius: 99, minHeight: 34,
      border: `1px solid ${active ? clr : (isDark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.09)')}`,
      background: active ? `color-mix(in srgb, ${clr} 14%, transparent)` : 'transparent',
      color: active ? clr : muted,
      transition: 'all 0.2s',
    }
  }

  const th = (label: string, key?: SortKey): React.ReactNode => (
    <th
      onClick={key ? () => { if (sortKey === key) setSortDesc(!sortDesc); else { setSortKey(key); setSortDesc(true) } } : undefined}
      style={{
        padding: '10px 12px', fontSize: 11.5, fontWeight: 700, color: muted,
        textAlign: 'right', whiteSpace: 'nowrap',
        cursor: key ? 'pointer' : 'default', userSelect: 'none',
      }}>
      {label}{key && sortKey === key ? (sortDesc ? ' ↓' : ' ↑') : ''}
    </th>
  )

  const badge = (label: string, tone: 'pos' | 'neg' | 'mid') => (
    <span key={label} style={{
      fontSize: 10, fontWeight: 700, padding: '2.5px 8px', borderRadius: 6, whiteSpace: 'nowrap',
      color: tone === 'pos' ? GREEN : tone === 'neg' ? RED : '#3b82f6',
      background: tone === 'pos' ? 'rgba(38,166,154,0.12)' : tone === 'neg' ? 'rgba(239,83,80,0.12)' : 'rgba(59,130,246,0.12)',
    }}>
      {label}
    </span>
  )

  const rowBadges = (r: Row) => {
    const out: React.ReactNode[] = []
    if (r.golden_cross) out.push(badge('کراس طلایی', 'pos'))
    if (r.death_cross) out.push(badge('کراس مرگ', 'neg'))
    if (r.macd_cross_up) out.push(badge('مکدی ↑', 'pos'))
    if (r.macd_cross_down) out.push(badge('مکدی ↓', 'neg'))
    if (r.new_high_52w) out.push(badge('سقف ۵۲هفته', 'pos'))
    else if (r.near_high_52w) out.push(badge('نزدیک سقف', 'mid'))
    if (r.new_low_52w) out.push(badge('کف ۵۲هفته', 'neg'))
    else if (r.near_low_52w) out.push(badge('نزدیک کف', 'mid'))
    if (r.vol_spike) out.push(badge('حجم مشکوک', 'mid'))
    if (r.structure_break === 'bos_up') out.push(badge('BOS صعودی', 'pos'))
    if (r.structure_break === 'bos_down') out.push(badge('BOS نزولی', 'neg'))
    if (r.structure_break === 'choch_up') out.push(badge('CHoCH صعودی', 'pos'))
    if (r.structure_break === 'choch_down') out.push(badge('CHoCH نزولی', 'neg'))
    if (r.fvg_bull_near) out.push(badge('FVG صعودی', 'pos'))
    if (r.fvg_bear_near) out.push(badge('FVG نزولی', 'neg'))
    if (r.ob_bull_near) out.push(badge('OB حمایتی', 'pos'))
    if (r.ob_bear_near) out.push(badge('OB مقاومتی', 'neg'))
    if (r.candle_pattern) {
      const label = CANDLE_PATTERN_LABELS[r.candle_pattern] ?? r.candle_pattern
      out.push(badge(label, r.candle_pattern_bias === 'bull' ? 'pos' : r.candle_pattern_bias === 'bear' ? 'neg' : 'mid'))
    }
    return out
  }

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{TA_KEYFRAMES}</style>

      {/* aurora پس‌زمینه — همان زبان طراحی هاب */}
      <div aria-hidden className="ta-anim" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: isDark ? 1 : 0.35 }}>
        <div style={{ position: 'absolute', top: '3%', left: '10%', width: 460, height: 460, borderRadius: '50%', background: '#3b82f6', opacity: 0.14, filter: 'blur(90px)', animation: 'taBlob1 18s ease-in-out infinite alternate' }} />
        <div style={{ position: 'absolute', bottom: '5%', right: '8%', width: 400, height: 400, borderRadius: '50%', background: '#8b5cf6', opacity: 0.11, filter: 'blur(90px)', animation: 'taBlob2 24s ease-in-out infinite alternate' }} />
      </div>

      <div className="ta-anim" style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '28px 14px' : '40px 24px', position: 'relative' }}>

        <Link href="/technical" style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>
          ← تحلیل تکنیکال
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '12px 0 6px', ...enterAnim(0) }}>
          <h1 style={{
            fontSize: isMobile ? 23 : 28, fontWeight: 800, margin: 0,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            دیده‌بان تکنیکال
          </h1>

          {/* چیپ ضربان بازار */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 11.5, fontWeight: 700, padding: '6px 13px',
            ...glass, borderRadius: 99,
            color: isOpen ? GREEN : muted,
          }}>
            <span style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: isOpen ? GREEN : (isDark ? '#4b5563' : '#9ca3af') }} />
              {isOpen && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: GREEN, animation: 'taPing 2s ease-out infinite' }} />}
            </span>
            {isOpen ? 'بازار باز' : 'بازار بسته'}
          </span>
        </div>

        <p style={{ fontSize: 13, color: muted, margin: '0 0 20px', lineHeight: 1.8, ...enterAnim(1) }}>
          سیگنال‌های محاسبه‌شده روی همه نمادها — به‌روزرسانی هر روز پس از پایان بازار
          {rows && rows[0] ? ` · آخرین به‌روزرسانی: ${rows[0].trade_date_shamsi}` : ''}
          {rows && ` · ${fa(rows.length)} نماد`}
        </p>

        {/* فیلترها — قابل ترکیب (AND) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, ...enterAnim(2) }}>
          <button onClick={() => setActive([])} style={chip(active.length === 0)}>
            همه
          </button>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => toggleFilter(f.key)} aria-pressed={active.includes(f.key)}
              style={chip(active.includes(f.key), f.tone)}>
              {f.label}
            </button>
          ))}
        </div>
        {active.length > 1 && (
          <p style={{ fontSize: 11, color: muted, margin: '0 0 12px' }}>
            {fa(active.length)} فیلتر فعال — نمادهایی که «همه» شرط‌ها را دارند
          </p>
        )}

        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="جست‌وجوی نماد…"
          aria-label="جست‌وجوی نماد"
          style={{
            width: '100%', boxSizing: 'border-box', fontSize: 13.5, fontFamily: 'inherit',
            padding: '12px 16px', outline: 'none', marginBottom: 14,
            ...glass, borderRadius: 99, color: text, transition: 'border-color 0.2s',
            ...enterAnim(3),
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.55)' }}
          onBlur={e => { e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)' }}
        />

        {/* جدول */}
        <div style={{ ...glass, borderRadius: 20, overflowX: 'auto', ...enterAnim(4) }}>
          {rows === null ? (
            <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>در حال بارگذاری…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: muted, fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
              {rows.length === 0 ? 'داده‌ای نیست — اسکریپت دیده‌بان هنوز روی سرور اجرا نشده' : 'نمادی با این فیلتر پیدا نشد'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${line}` }}>
                  {th('نماد')}
                  {th('قیمت')}
                  {th('٪ تغییر', 'change_pct')}
                  {th('RSI', 'rsi')}
                  {th('حجم نسبی', 'vol_ratio')}
                  {th('روند')}
                  {th('سیگنال‌ها')}
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 300).map(r => (
                  <tr key={r.symbol} style={{ borderBottom: `1px solid ${line}`, transition: 'background 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={{ padding: '9px 12px' }}>
                      <Link href={`/technical/${toSlug(r.symbol)}`} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: 13.5, fontWeight: 700 }}>
                        {r.symbol}
                      </Link>
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 13, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fa(r.close)}</td>
                    <td style={{
                      padding: '9px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                      color: r.change_pct === null ? muted : r.change_pct >= 0 ? GREEN : RED,
                    }}>
                      {r.change_pct === null ? '—' : `${r.change_pct >= 0 ? '▲' : '▼'} ${fa(Math.abs(r.change_pct), 2)}٪`}
                    </td>
                    <td style={{
                      padding: '9px 12px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                      color: r.rsi === null ? muted : r.rsi >= 70 ? RED : r.rsi <= 30 ? GREEN : text,
                    }}>
                      {r.rsi === null ? '—' : fa(r.rsi, 1)}
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: (r.vol_ratio ?? 0) >= 2.5 ? '#d97706' : text }}>
                      {r.vol_ratio === null ? '—' : `${fa(r.vol_ratio, 1)}×`}
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 12, whiteSpace: 'nowrap', color: r.trend === 'up' ? GREEN : r.trend === 'down' ? RED : muted }}>
                      {r.trend === 'up' ? 'صعودی' : r.trend === 'down' ? 'نزولی' : r.trend === 'side' ? 'خنثی' : '—'}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{rowBadges(r)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {visible.length > 300 && (
          <p style={{ fontSize: 11.5, color: muted, marginTop: 10 }}>
            ۳۰۰ نماد اول نمایش داده شد — با فیلتر یا جست‌وجو محدودتر کنید
          </p>
        )}

        <p style={{ fontSize: 11, color: muted, lineHeight: 1.9, marginTop: 14 }}>
          این سیگنال‌ها صرفاً خروجی فرمول‌های تکنیکال است و توصیه خرید یا فروش نیست؛
          مسئولیت تصمیم‌های معاملاتی با خود شماست.
        </p>
      </div>
    </main>
  )
}
