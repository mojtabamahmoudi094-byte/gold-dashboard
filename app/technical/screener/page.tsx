'use client'

// دیده‌بان تکنیکال — فیلتر سیگنال‌های محاسبه‌شده شبانه (جدول stock_screener)

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { GREEN, RED } from '../colors'

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
}

const FILTERS: { key: keyof Row | 'all'; label: string; tone?: 'pos' | 'neg' }[] = [
  { key: 'all', label: 'همه' },
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
]

type SortKey = 'change_pct' | 'rsi' | 'vol_ratio'

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const toSlug = (s: string) => encodeURIComponent(s.replace(/\s+/g, '-'))

export default function ScreenerPage() {
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('change_pct')
  const [sortDesc, setSortDesc] = useState(true)
  const [q, setQ] = useState('')

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
    if (filter !== 'all') out = out.filter(r => r[filter as keyof Row] === true)
    const query = q.trim()
    if (query) out = out.filter(r => r.symbol.includes(query))
    return [...out].sort((a, b) => {
      const av = (a[sortKey] ?? -Infinity) as number
      const bv = (b[sortKey] ?? -Infinity) as number
      return sortDesc ? bv - av : av - bv
    })
  }, [rows, filter, q, sortKey, sortDesc])

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const panel = isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.9)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'

  const chip = (active: boolean, tone?: 'pos' | 'neg'): React.CSSProperties => {
    const clr = tone === 'pos' ? GREEN : tone === 'neg' ? RED : '#3b82f6'
    return {
      fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
      padding: '7px 14px', borderRadius: 9, minHeight: 34,
      border: `1px solid ${active ? clr : line}`,
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
    return out
  }

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '28px 14px' : '40px 24px' }}>

        <Link href="/technical" style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>
          ← تحلیل تکنیکال
        </Link>

        <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: '12px 0 6px' }}>دیده‌بان تکنیکال</h1>
        <p style={{ fontSize: 13, color: muted, margin: '0 0 20px', lineHeight: 1.8 }}>
          سیگنال‌های محاسبه‌شده روی همه نمادها — به‌روزرسانی هر روز پس از پایان بازار
          {rows && rows[0] ? ` · آخرین به‌روزرسانی: ${rows[0].trade_date_shamsi}` : ''}
        </p>

        {/* فیلترها */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {FILTERS.map(f => (
            <button key={f.key as string} onClick={() => setFilter(f.key as string)} style={chip(filter === f.key, f.tone)}>
              {f.label}
            </button>
          ))}
        </div>

        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="جست‌وجوی نماد…"
          aria-label="جست‌وجوی نماد"
          style={{
            width: '100%', boxSizing: 'border-box', fontSize: 13.5, fontFamily: 'inherit',
            padding: '11px 16px', borderRadius: 12, outline: 'none', marginBottom: 14,
            background: panel, color: text, border: `1px solid ${line}`,
          }}
        />

        {/* جدول */}
        <div style={{
          background: panel, border: `1px solid ${line}`, borderRadius: 16,
          overflowX: 'auto',
        }}>
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
                  <tr key={r.symbol} style={{ borderBottom: `1px solid ${line}` }}>
                    <td style={{ padding: '9px 12px' }}>
                      <Link href={`/technical/${toSlug(r.symbol)}`} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: 13.5, fontWeight: 700 }}>
                        {r.symbol}
                      </Link>
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 13, whiteSpace: 'nowrap' }}>{fa(r.close)}</td>
                    <td style={{
                      padding: '9px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
                      color: r.change_pct === null ? muted : r.change_pct >= 0 ? GREEN : RED,
                    }}>
                      {r.change_pct === null ? '—' : `${r.change_pct >= 0 ? '▲' : '▼'} ${fa(Math.abs(r.change_pct), 2)}٪`}
                    </td>
                    <td style={{
                      padding: '9px 12px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                      color: r.rsi === null ? muted : r.rsi >= 70 ? RED : r.rsi <= 30 ? GREEN : text,
                    }}>
                      {r.rsi === null ? '—' : fa(r.rsi, 1)}
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 12.5, whiteSpace: 'nowrap', color: (r.vol_ratio ?? 0) >= 2.5 ? '#d97706' : text }}>
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
