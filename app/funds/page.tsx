'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const safe = (v: any) => Number(v || 0)
const fmtVal = (v: any) => safe(v).toLocaleString('fa-IR', { maximumFractionDigits: 1 })

const darkTheme = {
  bg: '#060B14', panel: 'rgba(13,23,38,0.8)', border: 'rgba(0,200,255,0.1)',
  borderStrong: 'rgba(0,200,255,0.2)', text: '#E2E8F0', textBright: '#FFFFFF',
  muted: '#7B93AC', faint: '#5A7088', accent: '#00C8FF', panelSolid: '#0D1726',
}
const lightTheme = {
  bg: '#F4F7FB', panel: 'rgba(255,255,255,0.9)', border: 'rgba(0,120,170,0.15)',
  borderStrong: 'rgba(0,120,170,0.3)', text: '#1A2433', textBright: '#0A0E16',
  muted: '#5A6B7E', faint: '#8595A8', accent: '#0095C8', panelSolid: '#FFFFFF',
}

export default function FundsPage() {
  const [isDark, setIsDark] = useState(true)
  const [funds, setFunds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<string>('trade_value')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const t: any = isDark ? darkTheme : lightTheme

  // خواندن قالب از حافظه
  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => {
      const th = window.localStorage.getItem('theme')
      setIsDark(th !== 'light')
    }
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    const load = async () => {
      // گرفتن لیست دارایی‌ها (بدون صندوق طلای قدیمی)
      const { data: assets } = await supabase
        .from('assets')
        .select('id, name, slug')
        .neq('slug', 'gold')
        .order('id', { ascending: true })

      if (!assets || assets.length === 0) { setLoading(false); return }

      // گرفتن آخرین داده‌ی هر صندوق
      // ابتدا آخرین تاریخ ثبت‌شده رو پیدا می‌کنیم
      const { data: latest } = await supabase
        .from('gold_funds')
        .select('trade_date_shamsi')
        .order('id', { ascending: false })
        .limit(1)

      const latestDate = latest?.[0]?.trade_date_shamsi
      if (!latestDate) { setLoading(false); return }

      // داده‌های آخرین روز
      const { data: records } = await supabase
        .from('gold_funds')
        .select('*')
        .eq('trade_date_shamsi', latestDate)

      if (!records) { setLoading(false); return }

      // ترکیب داده‌ها
      const combined = assets.map(asset => {
        const rec = records.find(r => r.asset_id === asset.id)
        return {
          symbol: asset.name,
          slug: asset.slug,
          tradeValue: safe(rec?.trade_value),
          priceClose: safe(rec?.price_close),
          priceLast: safe(rec?.price_last),
          changePct: safe(rec?.price_change_pct),
          marketValue: safe(rec?.market_value),
          volume: safe(rec?.volume),
          buyCountI: safe(rec?.buy_count_i),
          sellCountI: safe(rec?.sell_count_i),
          buyIVolume: safe(rec?.buy_i_volume),
          sellIVolume: safe(rec?.sell_i_volume),
          date: rec?.trade_date_shamsi || '',
        }
      }).filter(f => f.tradeValue > 0) // فقط صندوق‌هایی که داده دارن

      setFunds(combined)
      setLoading(false)
    }
    load()
  }, [])

  // مرتب‌سازی
  const sorted = [...funds].sort((a, b) => {
    const av = (a as any)[sortBy] ?? 0
    const bv = (b as any)[sortBy] ?? 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const sortArrow = (col: string) => sortBy === col ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''

  // محاسبه‌ی خلاصه‌ی بازار
  const totalTradeValue = funds.reduce((s, f) => s + f.tradeValue, 0)
  const avgChange = funds.length > 0 ? funds.reduce((s, f) => s + f.changePct, 0) / funds.length : 0
  const positiveCount = funds.filter(f => f.changePct > 0).length
  const negativeCount = funds.filter(f => f.changePct < 0).length

  // ورود و خروج پول حقیقی (میلیارد تومان)
  const netFlow = funds.reduce((s, f) => {
    const buyValue = f.buyIVolume * (f.priceClose || 1)
    const sellValue = f.sellIVolume * (f.priceClose || 1)
    return s + (buyValue - sellValue)
  }, 0)

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      transition: 'background 0.3s, color 0.3s',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* نوار ابزار */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.textBright }}>
            دیدبان صندوق‌های کالایی
            <span style={{ fontSize: 11, color: t.muted, fontWeight: 400, marginRight: 10 }}>
              {funds.length > 0 ? `${funds[0].date} · ${funds.length} صندوق` : ''}
            </span>
          </div>
        </div>

        {/* کارت‌های خلاصه */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <SummaryCard t={t} label="ارزش کل معاملات" value={`${fmtVal(totalTradeValue)} میلیارد`} tooltip="مجموع ارزش معاملات همه‌ی صندوق‌ها" />
          <SummaryCard t={t} label="میانگین تغییر" value={`${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}٪`}
            color={avgChange >= 0 ? '#00E5A0' : '#FF4D6A'} tooltip="میانگین درصد تغییر قیمت پایانی همه‌ی صندوق‌ها" />
          <SummaryCard t={t} label="مثبت / منفی" value={`${positiveCount.toLocaleString('fa-IR')} / ${negativeCount.toLocaleString('fa-IR')}`}
            tooltip="تعداد صندوق‌هایی که قیمت‌شان مثبت یا منفی شده" />
          <SummaryCard t={t} label="جریان پول حقیقی" value={netFlow >= 0 ? 'ورودی' : 'خروجی'}
            color={netFlow >= 0 ? '#00E5A0' : '#FF4D6A'} tooltip="تفاوت حجم خرید و فروش حقیقی‌ها — نشان‌دهنده‌ی جهت پول هوشمند" />
        </div>

        {/* جدول اصلی */}
        <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: t.muted }}>در حال بارگذاری...</div>
          ) : funds.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: t.muted }}>داده‌ای یافت نشد</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {[
                      { key: 'symbol', label: 'نماد' },
                      { key: 'priceClose', label: 'قیمت پایانی' },
                      { key: 'priceLast', label: 'آخرین قیمت' },
                      { key: 'changePct', label: 'تغییر٪' },
                      { key: 'tradeValue', label: 'ارزش معاملات' },
                      { key: 'marketValue', label: 'ارزش بازار' },
                      { key: 'volume', label: 'حجم' },
                      { key: 'buyCountI', label: 'خریدار حقیقی' },
                      { key: 'sellCountI', label: 'فروشنده حقیقی' },
                    ].map(col => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        style={{
                          color: sortBy === col.key ? t.accent : t.muted,
                          fontWeight: 600, textAlign: 'right', padding: '10px 8px',
                          borderBottom: `0.5px solid ${t.border}`,
                          cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
                          fontSize: 11,
                        }}
                      >
                        {col.label}{sortArrow(col.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((f, i) => {
                    const isPositive = f.changePct > 0
                    const isNegative = f.changePct < 0
                    return (
                      <tr key={i} style={{
                        borderBottom: `0.5px solid ${t.border}`,
                        transition: 'background 0.15s',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = `${t.accent}08`)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 8px', fontWeight: 700, color: t.textBright }}>{f.symbol}</td>
                        <td style={{ padding: '10px 8px', color: t.text }}>{f.priceClose.toLocaleString('fa-IR')}</td>
                        <td style={{ padding: '10px 8px', color: t.text }}>{f.priceLast.toLocaleString('fa-IR')}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{
                            display: 'inline-block',
                            background: isPositive ? 'rgba(0,229,160,0.1)' : isNegative ? 'rgba(255,77,106,0.1)' : `${t.accent}10`,
                            color: isPositive ? '#00E5A0' : isNegative ? '#FF4D6A' : t.muted,
                            borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                          }}>
                            {isPositive ? '+' : ''}{f.changePct.toFixed(2)}٪
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', color: t.text }}>{fmtVal(f.tradeValue)} <span style={{ color: t.faint, fontSize: 10 }}>م.ت</span></td>
                        <td style={{ padding: '10px 8px', color: t.text }}>{fmtVal(f.marketValue)} <span style={{ color: t.faint, fontSize: 10 }}>م.ت</span></td>
                        <td style={{ padding: '10px 8px', color: t.text }}>{f.volume.toLocaleString('fa-IR')}</td>
                        <td style={{ padding: '10px 8px', color: '#00E5A0' }}>{f.buyCountI.toLocaleString('fa-IR')}</td>
                        <td style={{ padding: '10px 8px', color: '#FF4D6A' }}>{f.sellCountI.toLocaleString('fa-IR')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
      `}</style>
    </main>
  )
}

function SummaryCard({ t, label, value, color, tooltip }: any) {
  return (
    <div title={tooltip || ''} style={{
      background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12,
      padding: '14px 16px', backdropFilter: 'blur(12px)', cursor: tooltip ? 'help' : 'default',
    }}>
      <div style={{ fontSize: 10, color: t.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || t.textBright }}>{value}</div>
    </div>
  )
}
