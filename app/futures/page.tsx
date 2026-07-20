'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
} from 'recharts'
import AuthGate from '../../components/AuthGate'
import { supabase } from '../../lib/supabase'
import type { Candle } from '../../lib/indicators'
import { glassStyle, TA_KEYFRAMES, enterAnim } from '../technical/uiTokens'
import { shouldUseDark } from '../../lib/theme'

const KlineChart = dynamic(() => import('../technical/KlineChart'), { ssr: false })

const GLOBAL_FUTURES: { symbol: string; label: string }[] = [
  { symbol: 'GC=F', label: 'طلا (کامکس)' },
  { symbol: 'SI=F', label: 'نقره (کامکس)' },
  { symbol: 'CL=F', label: 'نفت خام WTI' },
  { symbol: 'BZ=F', label: 'نفت خام برنت' },
  { symbol: 'HG=F', label: 'مس (دلار/تن)' },
  { symbol: 'NG=F', label: 'گاز طبیعی' },
]

type GlobalRow = {
  trade_date: string
  trade_date_shamsi: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

type ImeRow = {
  contract_code: string
  contract_description: string | null
  trade_date: string
  trade_date_shamsi: string
  close: number | null
  volume: number | null
  open_interest: number | null
  day_remain: number | null
}

const fa = (v: number | null | undefined, d = 0) =>
  v == null ? '—' : v.toLocaleString('fa-IR', { maximumFractionDigits: d })

export default function FuturesPage() {
  const [isDark, setIsDark] = useState(true)
  const [symbol, setSymbol] = useState(GLOBAL_FUTURES[0].symbol)
  const [rows, setRows] = useState<GlobalRow[] | null>(null)
  const [imeAll, setImeAll] = useState<ImeRow[]>([])
  const [imeSelected, setImeSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    setRows(null)
    supabase
      .from('global_futures_candles')
      .select('trade_date, trade_date_shamsi, open, high, low, close, volume')
      .eq('symbol', symbol)
      .order('trade_date', { ascending: true })
      .then(({ data }) => setRows((data as GlobalRow[]) ?? []))
  }, [symbol])

  useEffect(() => {
    supabase
      .from('ime_futures_candles')
      .select('contract_code, contract_description, trade_date, trade_date_shamsi, close, volume, open_interest, day_remain')
      .order('trade_date', { ascending: true })
      .then(({ data }) => setImeAll((data as ImeRow[]) ?? []))
  }, [])

  const candles: Candle[] = useMemo(() => {
    if (!rows) return []
    return rows
      .filter(r => r.close != null && r.close > 0)
      .map(r => ({
        time: r.trade_date,
        shamsi: r.trade_date_shamsi,
        open: r.open ?? r.close!,
        high: r.high ?? r.close!,
        low: r.low ?? r.close!,
        close: r.close!,
        volume: r.volume ?? 0,
      }))
  }, [rows])

  // آخرین ردیف هر قرارداد IME — برای جدول خلاصه
  const imeLatest = useMemo(() => {
    const byContract = new Map<string, ImeRow>()
    for (const r of imeAll) byContract.set(r.contract_code, r) // صعودی مرتب شده، آخرین می‌ماند
    return [...byContract.values()].sort((a, b) => a.contract_code.localeCompare(b.contract_code, 'fa'))
  }, [imeAll])

  const imeHistory = useMemo(() => {
    if (!imeSelected) return []
    return imeAll.filter(r => r.contract_code === imeSelected)
  }, [imeAll, imeSelected])

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#475569'
  const line  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,30,46,0.1)'
  const glass = glassStyle(isDark)

  return (
    <AuthGate title="قراردادهای آتی" description="برای مشاهدهٔ قراردادهای آتی جهانی و داخلی باید عضو سایت شوید.">
      <style>{TA_KEYFRAMES}</style>
      <div style={{ minHeight: '100vh', background: bg, color: text, padding: '20px 16px 60px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ ...enterAnim(0), marginBottom: 18 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>قراردادهای آتی</h1>
            <p style={{ fontSize: 13, color: muted, marginTop: 6, lineHeight: 1.8 }}>
              آتی جهانی پیوسته (طلا/نقره/نفت/مس/گاز — منبع Yahoo Finance) و آتی داخلی بورس کالا (سکه/زعفران — منبع BrsApi).
              داده IME فقط از تاریخ راه‌اندازی این صفحه به بعد جمع می‌شود؛ تاریخچهٔ گذشته موجود نیست.
            </p>
          </div>

          {/* ── آتی جهانی پیوسته ── */}
          <div style={{ ...glass, ...enterAnim(1), padding: 16, marginBottom: 24 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {GLOBAL_FUTURES.map(f => (
                <button key={f.symbol}
                  onClick={() => setSymbol(f.symbol)}
                  style={{
                    padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${symbol === f.symbol ? '#d9b45b' : line}`,
                    background: symbol === f.symbol ? 'rgba(217,180,91,0.15)' : 'transparent',
                    color: symbol === f.symbol ? '#d9b45b' : text,
                  }}>
                  {f.label}
                </button>
              ))}
            </div>

            {rows === null && <div style={{ color: muted, fontSize: 13, padding: 24, textAlign: 'center' }}>در حال بارگذاری…</div>}
            {rows !== null && candles.length === 0 && (
              <div style={{ color: muted, fontSize: 13, padding: 24, textAlign: 'center' }}>
                داده‌ای برای این نماد نیست — اسکریپت scripts/global-futures-backfill.js باید روی سرور اجرا شود.
              </div>
            )}
            {candles.length > 0 && (
              <div style={{ height: 560, borderRadius: 12, overflow: 'hidden' }}>
                <KlineChart symbol={symbol} candles={candles} isDark={isDark} />
              </div>
            )}
          </div>

          {/* ── آتی داخلی IME ── */}
          <div style={{ ...glass, ...enterAnim(2), padding: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>آتی بورس کالا (سکه/زعفران)</h2>
            {imeLatest.length === 0 && (
              <div style={{ color: muted, fontSize: 13, padding: 16, textAlign: 'center' }}>
                هنوز داده‌ای آرشیو نشده — اسکریپت scripts/ime-futures-daily.js باید روی سرور به‌عنوان کرون نصب شود.
              </div>
            )}
            {imeLatest.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${line}`, color: muted, textAlign: 'right' }}>
                      <th style={{ padding: '6px 10px' }}>قرارداد</th>
                      <th style={{ padding: '6px 10px' }}>آخرین قیمت تسویه</th>
                      <th style={{ padding: '6px 10px' }}>حجم</th>
                      <th style={{ padding: '6px 10px' }}>موقعیت‌های باز</th>
                      <th style={{ padding: '6px 10px' }}>روز مانده</th>
                      <th style={{ padding: '6px 10px' }}>تاریخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imeLatest.map(r => (
                      <tr key={r.contract_code}
                        onClick={() => setImeSelected(r.contract_code === imeSelected ? null : r.contract_code)}
                        style={{ borderBottom: `1px solid ${line}`, cursor: 'pointer', background: imeSelected === r.contract_code ? 'rgba(217,180,91,0.08)' : 'transparent' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.contract_description ?? r.contract_code}</td>
                        <td style={{ padding: '8px 10px' }}>{fa(r.close)}</td>
                        <td style={{ padding: '8px 10px' }}>{fa(r.volume)}</td>
                        <td style={{ padding: '8px 10px' }}>{fa(r.open_interest)}</td>
                        <td style={{ padding: '8px 10px' }}>{r.day_remain != null ? fa(r.day_remain) : '—'}</td>
                        <td style={{ padding: '8px 10px', color: muted }}>{r.trade_date_shamsi}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {imeSelected && imeHistory.length >= 2 && (
              <div style={{ height: 220, marginTop: 16 }}>
                <ResponsiveContainer>
                  <LineChart data={imeHistory.map(r => ({ date: r.trade_date_shamsi, close: r.close }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={line} />
                    <XAxis dataKey="date" tick={{ fill: muted, fontSize: 11 }} />
                    <YAxis tick={{ fill: muted, fontSize: 11 }} domain={['auto', 'auto']} />
                    <ReTooltip contentStyle={{ background: bg, border: `1px solid ${line}`, borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="close" stroke="#d9b45b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {imeSelected && imeHistory.length < 2 && (
              <div style={{ color: muted, fontSize: 12, padding: '12px 4px' }}>
                هنوز فقط {imeHistory.length} روز از این قرارداد آرشیو شده — چارت با تجمع داده‌های روزانه ساخته می‌شود.
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGate>
  )
}
