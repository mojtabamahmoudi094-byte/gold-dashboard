'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { Skeleton } from '../components/ui/Skeleton'
import { useIsMobile } from '../../lib/useIsMobile'
import { safe, fmtNum as fmtVal } from '../../lib/format'
import { darkTheme, lightTheme } from '../../lib/theme'


export default function ComparePage() {
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  const [assets, setAssets] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [fund1, setFund1] = useState<string>('')
  const [fund2, setFund2] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const t: any = isDark ? darkTheme : lightTheme

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => {
      window.removeEventListener('themechange', handler)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const { data: assetData } = await supabase
          .from('assets').select('id, name, slug, category')
          .neq('slug', 'gold').order('id', { ascending: true })
        if (!assetData) return
        setAssets(assetData)

        const { data: latest } = await supabase
          .from('gold_funds').select('trade_date_shamsi')
          .order('id', { ascending: false }).limit(1)
        if (!latest?.[0]) return

        const { data: recs } = await supabase
          .from('gold_funds').select('*')
          .eq('trade_date_shamsi', latest[0].trade_date_shamsi)
        if (recs) setRecords(recs)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const getFundData = (slug: string) => {
    const asset = assets.find(a => a.slug === slug)
    if (!asset) return null
    const rec = records.find(r => r.asset_id === asset.id)
    if (!rec) return null
    const buyAvg = safe(rec.buy_count_i) > 0 ? Math.round((safe(rec.buy_i_volume) * safe(rec.price_close)) / safe(rec.buy_count_i) / 1000000) : 0
    const sellAvg = safe(rec.sell_count_i) > 0 ? Math.round((safe(rec.sell_i_volume) * safe(rec.price_close)) / safe(rec.sell_count_i) / 1000000) : 0
    const netFlow = Math.round(((safe(rec.buy_i_volume) - safe(rec.sell_i_volume)) * safe(rec.price_close)) / 1000000000 * 10) / 10
    return {
      name: asset.name, slug: asset.slug, category: asset.category,
      priceClose: safe(rec.price_close), priceLast: safe(rec.price_last),
      changePct: safe(rec.price_change_pct), tradeValue: safe(rec.trade_value),
      marketValue: safe(rec.market_value), volume: safe(rec.volume),
      buyCountI: safe(rec.buy_count_i), sellCountI: safe(rec.sell_count_i),
      buyAvg, sellAvg, netFlow,
      power: sellAvg > 0 ? Math.round((buyAvg / sellAvg) * 100) / 100 : 0,
      date: rec.trade_date_shamsi,
    }
  }

  const d1 = fund1 ? getFundData(fund1) : null
  const d2 = fund2 ? getFundData(fund2) : null

  const selectStyle = {
    fontSize: 14, padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
    background: t.panel, border: `0.5px solid ${t.borderStrong}`,
    color: t.text, fontFamily: 'inherit', outline: 'none', width: '100%',
  }

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      transition: 'background 0.3s',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '12px 12px' : '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* بردکرامب */}
        <div style={{ fontSize: 12, color: t.muted, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link href="/funds" style={{ color: t.accent, textDecoration: 'none' }}>صندوق‌ها</Link>
          <span>›</span>
          <span>مقایسه</span>
        </div>

        <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: t.textBright }}>
          مقایسه‌ی صندوق‌ها
        </div>

        {/* انتخاب دو صندوق */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
            <Skeleton height={42} radius={10} />
            <div style={{ fontSize: 20, color: t.accent, textAlign: 'center', fontWeight: 700 }}>⚡</div>
            <Skeleton height={42} radius={10} />
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
          <select value={fund1} onChange={e => setFund1(e.target.value)} aria-label="انتخاب صندوق اول" style={selectStyle}>
            <option value="">صندوق اول را انتخاب کنید</option>
            {assets.map(a => <option key={a.slug} value={a.slug}>{a.name} ({a.category})</option>)}
          </select>
          <div style={{ fontSize: 20, color: t.accent, textAlign: 'center', fontWeight: 700 }}>⚡</div>
          <select value={fund2} onChange={e => setFund2(e.target.value)} aria-label="انتخاب صندوق دوم" style={selectStyle}>
            <option value="">صندوق دوم را انتخاب کنید</option>
            {assets.map(a => <option key={a.slug} value={a.slug}>{a.name} ({a.category})</option>)}
          </select>
        </div>
        )}

        {/* نتیجه‌ی مقایسه */}
        {d1 && d2 && (
          <>
            {/* هدر مقایسه */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#00C8FF' }}>{d1.name}</div>
              <div style={{ fontSize: 12, color: t.muted, alignSelf: 'center' }}>در مقابل</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#F59E0B' }}>{d2.name}</div>
            </div>

            {/* جدول مقایسه */}
            <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '10px 8px', color: '#00C8FF', fontWeight: 700, textAlign: 'center', borderBottom: `0.5px solid ${t.border}` }}>{d1.name}</th>
                    <th style={{ padding: '10px 8px', color: t.muted, fontWeight: 600, textAlign: 'center', borderBottom: `0.5px solid ${t.border}`, fontSize: 11 }}>معیار</th>
                    <th style={{ padding: '10px 8px', color: '#F59E0B', fontWeight: 700, textAlign: 'center', borderBottom: `0.5px solid ${t.border}` }}>{d2.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'قیمت پایانی (تومان)', v1: d1.priceClose, v2: d2.priceClose, fmt: (v: number) => v.toLocaleString('fa-IR'), higher: 'neutral' },
                    { label: 'تغییر قیمت', v1: d1.changePct, v2: d2.changePct, fmt: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}٪`, higher: 'green' },
                    { label: 'ارزش معاملات (م.ت)', v1: d1.tradeValue, v2: d2.tradeValue, fmt: (v: number) => fmtVal(v), higher: 'green' },
                    { label: 'ارزش بازار (م.ت)', v1: d1.marketValue, v2: d2.marketValue, fmt: (v: number) => fmtVal(v), higher: 'green' },
                    { label: 'حجم معاملات', v1: d1.volume, v2: d2.volume, fmt: (v: number) => v.toLocaleString('fa-IR'), higher: 'green' },
                    { label: 'جریان پول (میلیارد)', v1: d1.netFlow, v2: d2.netFlow, fmt: (v: number) => `${v > 0 ? '+' : ''}${v}`, higher: 'green' },
                    { label: 'سرانه خرید (م.ت)', v1: d1.buyAvg, v2: d2.buyAvg, fmt: (v: number) => v.toLocaleString('fa-IR'), higher: 'green' },
                    { label: 'سرانه فروش (م.ت)', v1: d1.sellAvg, v2: d2.sellAvg, fmt: (v: number) => v.toLocaleString('fa-IR'), higher: 'red' },
                    { label: 'قدرت خریدار', v1: d1.power, v2: d2.power, fmt: (v: number) => v.toFixed(2), higher: 'green' },
                    { label: 'تعداد خریدار', v1: d1.buyCountI, v2: d2.buyCountI, fmt: (v: number) => v.toLocaleString('fa-IR'), higher: 'green' },
                    { label: 'تعداد فروشنده', v1: d1.sellCountI, v2: d2.sellCountI, fmt: (v: number) => v.toLocaleString('fa-IR'), higher: 'red' },
                  ].map((row, i) => {
                    const w1 = row.higher === 'green' ? row.v1 > row.v2 : row.higher === 'red' ? row.v1 < row.v2 : false
                    const w2 = row.higher === 'green' ? row.v2 > row.v1 : row.higher === 'red' ? row.v2 < row.v1 : false
                    return (
                      <tr key={i} style={{ borderBottom: `0.5px solid ${t.border}` }}>
                        <td style={{
                          padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: 13,
                          color: w1 ? '#00E5A0' : t.text,
                          background: w1 ? 'rgba(0,229,160,0.06)' : 'transparent',
                        }}>
                          {row.fmt(row.v1)} {w1 && '✓'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', color: t.muted, fontSize: 11 }}>
                          {row.label}
                        </td>
                        <td style={{
                          padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: 13,
                          color: w2 ? '#00E5A0' : t.text,
                          background: w2 ? 'rgba(0,229,160,0.06)' : 'transparent',
                        }}>
                          {row.fmt(row.v2)} {w2 && '✓'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* نمودار مقایسه‌ای */}
            <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
              <div style={{ fontSize: 11, color: t.muted, marginBottom: 16 }}>مقایسه‌ی بصری</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'ارزش معاملات', v1: d1.tradeValue, v2: d2.tradeValue },
                  { label: 'جریان پول', v1: Math.max(d1.netFlow, 0), v2: Math.max(d2.netFlow, 0) },
                  { label: 'سرانه خرید', v1: d1.buyAvg, v2: d2.buyAvg },
                  { label: 'قدرت خریدار', v1: d1.power, v2: d2.power },
                ].map((item, i) => {
                  const max = Math.max(item.v1, item.v2, 1)
                  const w1 = (item.v1 / max) * 100
                  const w2 = (item.v2 / max) * 100
                  return (
                    <div key={i}>
                      <div style={{ fontSize: 10, color: t.muted, marginBottom: 4, textAlign: 'center' }}>{item.label}</div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                          <div style={{ width: `${w1}%`, height: 20, borderRadius: '6px 0 0 6px', background: 'linear-gradient(270deg, rgba(0,200,255,0.3), rgba(0,200,255,0.7))', minWidth: 2 }} />
                        </div>
                        <div style={{ width: 2, height: 20, background: t.muted, opacity: 0.3 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ width: `${w2}%`, height: 20, borderRadius: '0 6px 6px 0', background: 'linear-gradient(90deg, rgba(245,158,11,0.3), rgba(245,158,11,0.7))', minWidth: 2 }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: t.muted, marginTop: 4 }}>
                  <span style={{ color: '#00C8FF' }}>■ {d1.name}</span>
                  <span style={{ color: '#F59E0B' }}>■ {d2.name}</span>
                </div>
              </div>
            </div>

            {/* جمع‌بندی */}
            <div style={{ background: t.panel, border: `0.5px solid ${t.accent}22`, borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🤖</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: t.textBright }}>جمع‌بندی مقایسه</span>
              </div>
              <p style={{ fontSize: 12, color: t.text, lineHeight: 2.2, margin: 0 }}>
                {(() => {
                  let score1 = 0, score2 = 0
                  if (d1.changePct > d2.changePct) score1++; else score2++
                  if (d1.tradeValue > d2.tradeValue) score1++; else score2++
                  if (d1.netFlow > d2.netFlow) score1++; else score2++
                  if (d1.power > d2.power) score1++; else score2++
                  if (d1.buyAvg > d2.buyAvg) score1++; else score2++
                  const winner = score1 > score2 ? d1 : d2
                  const loser = score1 > score2 ? d2 : d1
                  const ws = Math.max(score1, score2)
                  const ls = Math.min(score1, score2)
                  return `از ۵ معیار کلیدی (تغییر قیمت، ارزش معاملات، جریان پول، قدرت خریدار، سرانه خرید)، ${winner.name} در ${ws.toLocaleString('fa-IR')} معیار و ${loser.name} در ${ls.toLocaleString('fa-IR')} معیار برتری دارد. در مجموع ${winner.name} عملکرد بهتری نسبت به ${loser.name} داشته است.`
                })()}
              </p>
            </div>
          </>
        )}

        {/* راهنما وقتی هنوز انتخاب نشده */}
        {(!d1 || !d2) && (
          <div style={{ textAlign: 'center', padding: 40, color: t.muted, fontSize: 13 }}>
            دو صندوق را از بالا انتخاب کنید تا مقایسه شروع شود
          </div>
        )}

      </div>

    </main>
  )
}
