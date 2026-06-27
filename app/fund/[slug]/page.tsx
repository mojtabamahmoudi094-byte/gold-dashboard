'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'

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

export default function FundDetailPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [isDark, setIsDark] = useState(true)
  const [asset, setAsset] = useState<any>(null)
  const [record, setRecord] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  const t: any = isDark ? darkTheme : lightTheme

  // خواندن قالب از حافظه
  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)

    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => {
      window.removeEventListener('themechange', handler)
      window.removeEventListener('resize', checkMobile)
    }
  }, [])

  useEffect(() => {
    if (!slug) return
    const load = async () => {
      // گرفتن اطلاعات دارایی
      const { data: assetData } = await supabase
        .from('assets')
        .select('*')
        .eq('slug', slug)
        .single()
      if (!assetData) { setLoading(false); return }
      setAsset(assetData)

      // گرفتن تاریخچه‌ی داده‌ها
      const { data: records } = await supabase
        .from('gold_funds')
        .select('*')
        .eq('asset_id', assetData.id)
        .order('id', { ascending: false })
        .limit(30)
      if (records && records.length > 0) {
        setRecord(records[0]) // آخرین رکورد
        setHistory(records.reverse())
      }
      setLoading(false)
    }
    load()
  }, [slug])

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: t.muted }}>در حال بارگذاری...</div>
      </main>
    )
  }

  if (!asset || !record) {
    return (
      <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ color: t.muted, fontSize: 14 }}>صندوق پیدا نشد</div>
        <Link href="/funds" style={{ color: t.accent, fontSize: 13, textDecoration: 'none' }}>بازگشت به صندوق‌ها</Link>
      </main>
    )
  }

  const changePct = safe(record.price_change_pct)
  const isPositive = changePct > 0
  const isNegative = changePct < 0

  // محاسبه‌ی ورود/خروج پول حقیقی
  const buyValue = safe(record.buy_i_volume) * safe(record.price_close)
  const sellValue = safe(record.sell_i_volume) * safe(record.price_close)
  const netFlow = buyValue - sellValue
  const netFlowBillion = Math.round((netFlow / 1000000000) * 10) / 10

  // سرانه‌ی خرید و فروش حقیقی
  const buyAvg = safe(record.buy_count_i) > 0
    ? Math.round(safe(record.buy_i_volume) / safe(record.buy_count_i))
    : 0
  const sellAvg = safe(record.sell_count_i) > 0
    ? Math.round(safe(record.sell_i_volume) / safe(record.sell_count_i))
    : 0

  // قدرت خریدار
  const buyPower = sellAvg > 0 ? (buyAvg / sellAvg).toFixed(2) : '—'

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      transition: 'background 0.3s',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* بردکرامب */}
        <div style={{ fontSize: 12, color: t.muted, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link href="/funds" style={{ color: t.accent, textDecoration: 'none' }}>صندوق‌ها</Link>
          <span>›</span>
          <span style={{ color: t.text }}>{asset.name}</span>
        </div>

        {/* هدر صندوق */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: t.textBright }}>{asset.name}</div>
            <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
              {slug} · {record.trade_date_shamsi}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              fontSize: 22, fontWeight: 700,
              color: isPositive ? '#00E5A0' : isNegative ? '#FF4D6A' : t.textBright,
            }}>
              {isPositive ? '+' : ''}{changePct.toFixed(2)}٪
            </span>
          </div>
        </div>

        {/* کارت‌های اصلی */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12 }}>
          <MetricCard t={t} label="قیمت پایانی" value={`${safe(record.price_close).toLocaleString('fa-IR')} تومان`} />
          <MetricCard t={t} label="آخرین قیمت" value={`${safe(record.price_last).toLocaleString('fa-IR')} تومان`} />
          <MetricCard t={t} label="ارزش معاملات" value={`${fmtVal(record.trade_value)} میلیارد تومان`} />
          <MetricCard t={t} label="ارزش بازار" value={`${fmtVal(record.market_value)} میلیارد تومان`} />
        </div>

        {/* ردیف دوم کارت‌ها */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12 }}>
          <MetricCard t={t} label="حجم معاملات" value={safe(record.volume).toLocaleString('fa-IR')} />
          <MetricCard t={t} label="جریان پول حقیقی"
            value={`${netFlowBillion >= 0 ? '+' : ''}${netFlowBillion.toLocaleString('fa-IR')} میلیارد`}
            color={netFlowBillion >= 0 ? '#00E5A0' : '#FF4D6A'}
            tooltip="تفاوت ارزش خرید و فروش حقیقی‌ها" />
          <MetricCard t={t} label="سرانه خریدار" value={buyAvg.toLocaleString('fa-IR')}
            tooltip="میانگین حجم خرید هر خریدار حقیقی" />
          <MetricCard t={t} label="قدرت خریدار" value={buyPower}
            color={Number(buyPower) > 1 ? '#00E5A0' : Number(buyPower) < 1 ? '#FF4D6A' : t.textBright}
            tooltip="نسبت سرانه خریدار به سرانه فروشنده. بالای ۱ یعنی خریداران قوی‌ترند" />
        </div>

        {/* جدول معاملات حقیقی */}
        <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
          <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em', marginBottom: 12 }}>
            جزئیات معاملات حقیقی
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            {/* خریداران */}
            <div style={{ background: 'rgba(0,229,160,0.04)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#00E5A0', marginBottom: 10 }}>خریداران حقیقی</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <StatRow label="تعداد" value={safe(record.buy_count_i).toLocaleString('fa-IR')} color="#00E5A0" />
                <StatRow label="حجم خرید" value={safe(record.buy_i_volume).toLocaleString('fa-IR')} color="#00E5A0" />
                <StatRow label="سرانه" value={buyAvg.toLocaleString('fa-IR')} color="#00E5A0" />
              </div>
            </div>
            {/* فروشندگان */}
            <div style={{ background: 'rgba(255,77,106,0.04)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#FF4D6A', marginBottom: 10 }}>فروشندگان حقیقی</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <StatRow label="تعداد" value={safe(record.sell_count_i).toLocaleString('fa-IR')} color="#FF4D6A" />
                <StatRow label="حجم فروش" value={safe(record.sell_i_volume).toLocaleString('fa-IR')} color="#FF4D6A" />
                <StatRow label="سرانه" value={sellAvg.toLocaleString('fa-IR')} color="#FF4D6A" />
              </div>
            </div>
          </div>
        </div>

        {/* تاریخچه */}
        {history.length > 1 && (
          <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
            <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em', marginBottom: 12 }}>
              تاریخچه‌ی معاملات · {history.length} روز
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['تاریخ', 'قیمت پایانی', 'تغییر', 'ارزش معاملات', 'حجم'].map(h => (
                      <th key={h} style={{ color: t.muted, fontWeight: 600, textAlign: 'right', padding: '8px', borderBottom: `0.5px solid ${t.border}`, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((r, i) => {
                    const chg = safe(r.price_change_pct)
                    return (
                      <tr key={i} style={{ borderBottom: `0.5px solid ${t.border}` }}>
                        <td style={{ padding: '8px', color: t.text }}>{r.trade_date_shamsi}</td>
                        <td style={{ padding: '8px', color: t.text }}>{safe(r.price_close).toLocaleString('fa-IR')}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{
                            color: chg > 0 ? '#00E5A0' : chg < 0 ? '#FF4D6A' : t.muted,
                            fontWeight: 700,
                          }}>
                            {chg > 0 ? '+' : ''}{chg.toFixed(2)}٪
                          </span>
                        </td>
                        <td style={{ padding: '8px', color: t.text }}>{fmtVal(r.trade_value)} م.ت</td>
                        <td style={{ padding: '8px', color: t.text }}>{safe(r.volume).toLocaleString('fa-IR')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
      `}</style>
    </main>
  )
}

function MetricCard({ t, label, value, color, tooltip }: any) {
  return (
    <div title={tooltip || ''} style={{
      background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12,
      padding: '14px 16px', backdropFilter: 'blur(12px)', cursor: tooltip ? 'help' : 'default',
    }}>
      <div style={{ fontSize: 10, color: t.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || t.textBright }}>{value}</div>
    </div>
  )
}

function StatRow({ label, value, color }: any) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
      <span style={{ color: '#A0B4C8' }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  )
}
