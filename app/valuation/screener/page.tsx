'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AuthGate from '../../../components/AuthGate'
import { darkTheme, lightTheme, shouldUseDark } from '../../../lib/theme'
import { useIsMobile } from '../../../lib/useIsMobile'
import { SkeletonBlock, SkeletonRows } from '../../components/ui/Skeleton'
import { TutorialPanel } from '../../components/ui/TutorialPanel'

type Row = {
  symbol: string; name: string; price: number; pe: number | null
  eps: number; growthPct: number; intrinsic: number; ratio: number
  intrinsicBear: number; intrinsicBull: number; ratioBear: number; ratioBull: number
  verdict: 'undervalued' | 'overvalued' | 'fair'
}
type Payload = {
  updated: string
  assumptions: { expectedReturnPct: number; payoutPct: number; defaultGrowthPct: number }
  count: number
  rows: Row[]
}

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const VERDICT_LABEL: Record<Row['verdict'], string> = {
  undervalued: 'زیر ارزش ذاتی', overvalued: 'بالای ارزش ذاتی', fair: 'نزدیک منصفانه',
}

export default function ValuationScreenerPage() {
  const [isDark, setIsDark] = useState(true)
  const [data, setData] = useState<Payload | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<'all' | Row['verdict']>('all')
  const [query, setQuery] = useState('')
  const isMobile = useIsMobile()
  const t: any = isDark ? darkTheme : lightTheme
  const cream = isDark ? '#ddd5bd' : '#6B5A3A'

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    fetch('/api/valuation-screener')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    let out = data.rows
    if (filter !== 'all') out = out.filter(r => r.verdict === filter)
    const q = query.trim()
    if (q) out = out.filter(r => r.symbol.includes(q) || r.name.includes(q))
    return out
  }, [data, filter, query])

  const panelStyle = (accent: string): React.CSSProperties => ({
    background: `linear-gradient(160deg, ${accent}0e, transparent 45%), ${t.panel}`,
    border: `0.5px solid ${t.border}`, borderTop: `2px solid ${accent}66`,
    borderRadius: 14, padding: '16px 18px', backdropFilter: 'blur(12px)', minWidth: 0,
    boxShadow: t.cardShadow,
  })

  const verdictColor = (v: Row['verdict']) => v === 'undervalued' ? t.green : v === 'overvalued' ? t.red : t.muted

  const chip = (label: string, key: typeof filter) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      style={{
        fontSize: 11.5, padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
        border: `0.5px solid ${filter === key ? t.accent : t.border}`,
        background: filter === key ? `${t.accent}18` : t.panel,
        color: filter === key ? t.accent : t.muted, fontWeight: filter === key ? 700 : 500,
      }}
    >
      {label}
    </button>
  )

  return (
    <AuthGate title="ماشین‌حساب ارزش‌گذاری">
      <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '24px 16px 60px' : '32px 24px 64px' }}>

          <Link href="/valuation" style={{ fontSize: 12, color: t.muted, textDecoration: 'none' }}>← ماشین‌حساب ارزش‌گذاری</Link>
          <h1 style={{ fontSize: isMobile ? 19 : 22, fontWeight: 800, color: t.textBright, margin: '10px 0 4px' }}>
            اسکرینر ارزش‌گذاری
          </h1>
          <div style={{ fontSize: 12.5, color: t.muted, marginBottom: 20 }}>
            مدل رشد گوردون روی همه نمادهای دارای EPS سالانه واقعی کدال — با فرضیات پیش‌فرض یکسان برای مقایسه سریع
          </div>

          <TutorialPanel t={t} isDark={isDark} storageKey="valuation_screener_tutorial_open" title="این عددها یعنی چی؟">
          برای هر نماد، ارزش ذاتی با مدل رشد گوردون (P = D₁ / (r − g)) با فرضیات یکسان محاسبه می‌شود:
          {data && ` بازده مورد انتظار ${fa(data.assumptions.expectedReturnPct)}٪، نسبت تقسیم سود ${fa(data.assumptions.payoutPct)}٪،`}
          {' '}و نرخ رشد از میانگین رشد واقعی EPS همان شرکت در گزارش‌های کدال. ستون «نسبت» یعنی ارزش ذاتی تقسیم بر
          قیمت روز و عدد ریز زیرش، همین نسبت در سناریوی بدبینانه (بازده بالاتر، رشد کمتر) تا خوش‌بینانه است.
          برچسب «زیر ارزش ذاتی» فقط وقتی داده می‌شود که سهم حتی در سناریوی بدبینانه هم ارزنده باشد و «بالای ارزش ذاتی»
          فقط وقتی حتی در خوش‌بینانه هم گران باشد — تا اطمینان کاذب ندهد. این فرضیات
          پیش‌فرض برای مقایسه سریع همه نمادهاست؛ برای بررسی دقیق یک نماد با فرضیات دلخواه خودتان،
          از <Link href="/valuation" style={{ color: t.accent }}>ماشین‌حساب</Link> استفاده کنید.
          </TutorialPanel>

          {failed && (
            <div style={{ color: t.muted, fontSize: 13, padding: '50px 0', textAlign: 'center' }}>
              داده اسکرینر در دسترس نیست
            </div>
          )}

          {!data && !failed && (
            <div style={{ margin: '20px 0' }}>
              <SkeletonBlock height={40} style={{ marginBottom: 16 }} />
              <SkeletonRows rows={10} height={40} />
            </div>
          )}

          {data && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {chip(`همه (${fa(data.count)})`, 'all')}
              {chip('زیر ارزش ذاتی', 'undervalued')}
              {chip('نزدیک منصفانه', 'fair')}
              {chip('بالای ارزش ذاتی', 'overvalued')}
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="جستجوی نماد یا شرکت…"
                style={{
                  marginRight: 'auto', minWidth: 160, padding: '7px 12px', borderRadius: 999,
                  border: `0.5px solid ${t.border}`, background: t.inputBg, color: t.text,
                  fontSize: 11.5, fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={panelStyle(t.brand2)}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ color: t.muted, textAlign: 'right' }}>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>نماد</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>قیمت</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>EPS</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>رشد</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>ارزش ذاتی</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>نسبت</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.symbol} style={{ borderTop: `0.5px solid ${t.border}` }}>
                        <td style={{ padding: '8px' }}>
                          <Link href={`/stock/${encodeURIComponent(r.symbol)}`} style={{ color: t.text, textDecoration: 'none', fontWeight: 700 }}>
                            {r.symbol}
                          </Link>
                          <div style={{ fontSize: 10, color: cream, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                        </td>
                        <td style={{ padding: '8px', fontFamily: 'system-ui, sans-serif' }}>{fa(r.price)}</td>
                        <td style={{ padding: '8px', fontFamily: 'system-ui, sans-serif' }}>{fa(r.eps)}</td>
                        <td style={{ padding: '8px', fontFamily: 'system-ui, sans-serif' }}>{r.growthPct >= 0 ? '+' : ''}{fa(r.growthPct, 1)}٪</td>
                        <td style={{ padding: '8px', fontFamily: 'system-ui, sans-serif' }}>
                          {fa(r.intrinsic)}
                          <div style={{ fontSize: 9.5, color: cream }} title="بازهٔ بدبینانه تا خوش‌بینانه">{fa(r.intrinsicBear)}–{fa(r.intrinsicBull)}</div>
                        </td>
                        <td style={{ padding: '8px', fontFamily: 'system-ui, sans-serif', fontWeight: 700, color: verdictColor(r.verdict) }}>
                          {fa(r.ratio, 2)}
                          <div style={{ fontSize: 9.5, color: cream, fontWeight: 400 }} title="نسبت در سناریوی بدبینانه تا خوش‌بینانه">{fa(r.ratioBear, 2)}–{fa(r.ratioBull, 2)}</div>
                        </td>
                        <td style={{ padding: '8px', color: verdictColor(r.verdict), fontWeight: 700 }}>{VERDICT_LABEL[r.verdict]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <div style={{ padding: '30px 0', textAlign: 'center', color: t.muted, fontSize: 12.5 }}>موردی یافت نشد</div>
                )}
              </div>
            </div>

            <div style={{ fontSize: 10.5, color: cream, marginTop: 18, lineHeight: 1.9, textAlign: 'center' }}>
              مدل رشد گوردون فرضیات ساده‌کننده دارد و EPS تاریخی تضمینی برای آینده نیست — این صفحه صرفاً اطلاع‌رسانی
              است و توصیه مالی محسوب نمی‌شود.
            </div>
          </>
        )}
        </div>
      </main>
    </AuthGate>
  )
}
