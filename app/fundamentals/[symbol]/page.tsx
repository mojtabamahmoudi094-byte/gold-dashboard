'use client'

/**
 * نسبت‌های مالی یک نماد — P/E, P/B, ROE, ROA, حاشیه سود، اهرم مالی
 * داده از /api/fundamentals/<نماد> (جدول stock_fundamentals، محاسبه‌شده در fundamentals-compute.js
 * از روی گزارش‌های سالانه کدال + قیمت لحظه‌ای)
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { darkTheme, lightTheme } from '../../../lib/theme'
import { useIsMobile } from '../../../lib/useIsMobile'
import { SkeletonBlock } from '../../components/ui/Skeleton'

type Fundamentals = {
  symbol: string
  period: string
  pe: number | null; pb: number | null
  roe: number | null; roa: number | null
  netMargin: number | null; opMargin: number | null
  assetTurnover: number | null; equityMultiplier: number | null
  debtToEquity: number | null; bookValuePerShare: number | null
  marketCap: number | null; enterpriseValue: number | null; evToEbit: number | null
  updated: string
}

const fa = (v: number, d = 1) => v.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: 0 })
const pct = (v: number | null) => (v == null ? '—' : `${fa(v * 100)}٪`)
const ratio = (v: number | null) => (v == null ? '—' : fa(v, 2))
// میلیون ریال → میلیارد تومان (همان الگوی scripts/quarterly-report-card.js)
const toman = (v: number | null) => (v == null ? '—' : `${fa(v / 1e4, Math.abs(v / 1e4) < 10 ? 1 : 0)} م.ت`)

export default function FundamentalsPage() {
  const params = useParams<{ symbol: string }>()
  const symbol = decodeURIComponent(params.symbol ?? '').replace(/-/g, ' ')
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  const t = isDark ? darkTheme : lightTheme
  const cream = isDark ? '#ddd5bd' : '#6B5A3A'

  const [data, setData] = useState<Fundamentals | null | 'missing'>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    if (!symbol) return
    setData(null)
    fetch(`/api/fundamentals/${encodeURIComponent(symbol)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData('missing'))
  }, [symbol])

  const panelStyle = (accent: string): React.CSSProperties => ({
    background: `linear-gradient(160deg, ${accent}0e, transparent 45%), ${t.panel}`,
    border: `0.5px solid ${t.border}`, borderTop: `2px solid ${accent}66`,
    borderRadius: 14, padding: '16px 18px', backdropFilter: 'blur(12px)', minWidth: 0,
    boxShadow: t.cardShadow,
  })

  const Card = ({ title, value, formula, accent }: { title: string; value: string; formula: string; accent: string }) => (
    <div style={panelStyle(accent)}>
      <div style={{ fontSize: 11.5, color: t.muted, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: accent, fontFamily: 'system-ui, sans-serif' }}>{value}</div>
      <div style={{ fontSize: 10, color: cream, marginTop: 4, fontFamily: 'system-ui, sans-serif', opacity: 0.85 }}>{formula}</div>
    </div>
  )

  return (
    <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: isMobile ? '24px 16px 60px' : '32px 24px 64px' }}>
        <Link href="/analysis" style={{ fontSize: 12, color: t.muted, textDecoration: 'none' }}>← بازگشت به تحلیل</Link>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 20px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textBright, margin: 0 }}>نسبت‌های مالی</h1>
          <span style={{ fontSize: 14, color: cream }}>{symbol}</span>
        </div>

        {data === null && <SkeletonBlock height={280} />}

        {data === 'missing' && (
          <div style={{ ...panelStyle(t.red), textAlign: 'center', color: t.muted, fontSize: 13 }}>
            نسبت مالی این نماد هنوز محاسبه نشده — یا گزارش سالانه کدال ندارد، یا داده ترازنامه هنوز تأیید نشده است.
          </div>
        )}

        {data && data !== 'missing' && (
          <>
            <div style={{ fontSize: 11.5, color: t.muted, marginBottom: 16 }}>
              مبنای محاسبه: صورت مالی سالانه دوره {data.period}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <Card title="P/E" value={ratio(data.pe)} formula="قیمت ÷ EPS" accent={t.accent} />
              <Card title="P/B" value={ratio(data.pb)} formula="قیمت ÷ ارزش دفتری هر سهم" accent={t.brand2} />
              <Card title="ROE" value={pct(data.roe)} formula="سود خالص ÷ حقوق صاحبان سهام" accent={t.green} />
              <Card title="ROA" value={pct(data.roa)} formula="سود خالص ÷ جمع دارایی‌ها" accent={t.green} />
              <Card title="حاشیه سود خالص" value={pct(data.netMargin)} formula="سود خالص ÷ درآمد عملیاتی" accent="#f59e0b" />
              <Card title="حاشیه سود عملیاتی" value={pct(data.opMargin)} formula="سود عملیاتی ÷ درآمد عملیاتی" accent="#f59e0b" />
              <Card title="گردش دارایی" value={ratio(data.assetTurnover)} formula="درآمد ÷ جمع دارایی‌ها" accent={t.muted} />
              <Card title="اهرم مالی" value={ratio(data.equityMultiplier)} formula="جمع دارایی‌ها ÷ حقوق صاحبان سهام" accent={t.red} />
              <Card title="نسبت بدهی به حقوق صاحبان سهام" value={ratio(data.debtToEquity)} formula="جمع بدهی‌ها ÷ حقوق صاحبان سهام" accent={t.red} />
              <Card title="ارزش دفتری هر سهم" value={data.bookValuePerShare == null ? '—' : `${fa(data.bookValuePerShare, 0)} ریال`} formula="حقوق صاحبان سهام ÷ تعداد سهم" accent={t.text} />
              <Card title="ارزش بازار" value={toman(data.marketCap)} formula="قیمت × تعداد سهم" accent={t.accent} />
              <Card title="ارزش شرکت (EV)" value={toman(data.enterpriseValue)} formula="ارزش بازار + بدهی بهره‌دار − نقد" accent={t.brand2} />
              <Card title="EV/EBIT" value={ratio(data.evToEbit)} formula="ارزش شرکت ÷ سود عملیاتی (نه EBITDA — بدون استهلاک)" accent={t.muted} />
            </div>

            <div style={{ fontSize: 10, color: cream, marginTop: 10, textAlign: 'center', opacity: 0.75 }}>
              محاسبه‌شده از صورت‌های مالی رسمی کدال — این صفحه تحلیل کمکی است و توصیه سرمایه‌گذاری نیست.
              نسبت‌های وابسته به ترازنامه (P/B, ROE, ROA, اهرم مالی) ممکن است برای برخی نمادها هنوز در دسترس نباشند.
            </div>
          </>
        )}
      </div>
    </main>
  )
}
