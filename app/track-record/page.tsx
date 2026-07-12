'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { darkTheme, lightTheme } from '../../lib/theme'
import { useIsMobile } from '../../lib/useIsMobile'
import { Skeleton, SkeletonBlock, SkeletonRows } from '../components/ui/Skeleton'
import { TutorialPanel } from '../components/ui/TutorialPanel'

type Row = {
  date: string; type: string; category: string; categoryLabel: string
  symbol: string | null; confidence: number; reason: string | null
  outcomePct: number | null
}
type CatStat = { n: number; winRate: number | null; avgReturn: number | null }
type Payload = {
  updated: string; horizonDays: number
  overall: { n: number; pending: number; winRate: number | null; avgReturn: number | null }
  byCategory: Record<string, CatStat>
  categoryLabels: Record<string, string>
  recent: Row[]
}

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })

export default function TrackRecordPage() {
  const [isDark, setIsDark] = useState(true)
  const [data, setData] = useState<Payload | null>(null)
  const [failed, setFailed] = useState(false)
  const isMobile = useIsMobile()
  const t: any = isDark ? darkTheme : lightTheme
  const cream = isDark ? '#ddd5bd' : '#6B5A3A'

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    fetch('/api/signals-track-record')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  const panelStyle = (accent: string): React.CSSProperties => ({
    background: `linear-gradient(160deg, ${accent}0e, transparent 45%), ${t.panel}`,
    border: `0.5px solid ${t.border}`, borderTop: `2px solid ${accent}66`,
    borderRadius: 14, padding: '16px 18px', backdropFilter: 'blur(12px)', minWidth: 0,
    boxShadow: t.cardShadow,
  })

  const stat = (label: string, value: string, color: string) => (
    <div style={{ ...panelStyle(color), padding: '14px 16px' }}>
      <div style={{ fontSize: 10.5, color: t.muted, marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: 'system-ui, sans-serif' }}>{value}</div>
    </div>
  )

  return (
    <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: isMobile ? '24px 16px 60px' : '32px 24px 64px' }}>

        <Link href="/signals" style={{ fontSize: 12, color: t.muted, textDecoration: 'none' }}>← بازگشت به سیگنال‌ها</Link>
        <h1 style={{ fontSize: isMobile ? 19 : 22, fontWeight: 800, color: t.textBright, margin: '10px 0 4px' }}>
          رکورد عملکرد سیگنال‌ها
        </h1>
        <div style={{ fontSize: 12.5, color: t.muted, marginBottom: 20 }}>
          نتیجه واقعی همه سیگنال‌های خرید/فروش صادرشده — بدون حذف نمونه‌های ناموفق
        </div>

        <TutorialPanel t={t} isDark={isDark} storageKey="track_record_tutorial_open" title="این عدد یعنی چی؟">
          هر سیگنال «خرید» یا «فروش» که موتور سایت صادر می‌کند، ۱۰ روز کاری بعد بررسی می‌شود: قیمت دارایی مرجع
          (طلا، نقره، شاخص ترکیبی صندوق‌های بورسی، یا خود سهم) در روز صدور سیگنال با ۱۰ روز بعد مقایسه می‌شود.
          اگر سیگنال «خرید» بود و قیمت بالا رفت، یا سیگنال «فروش» بود و قیمت پایین آمد، آن سیگنال «برنده» حساب
          می‌شود. همه سیگنال‌های صادرشده اینجا هستند — چه درست از آب دربیایند چه غلط — چیزی حذف نمی‌شود.
        </TutorialPanel>

        {failed && (
          <div style={{ color: t.muted, fontSize: 13, padding: '50px 0', textAlign: 'center' }}>
            داده رکورد عملکرد در دسترس نیست
          </div>
        )}

        {!data && !failed && (
          <div style={{ margin: '20px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} height={70} />)}
            </div>
            <SkeletonRows rows={8} height={40} />
          </div>
        )}

        {data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {stat('نرخ موفقیت (۱۰ روزه)', data.overall.winRate === null ? '—' : `${fa(data.overall.winRate)}٪`,
                data.overall.winRate === null ? t.muted : data.overall.winRate >= 60 ? t.green : data.overall.winRate >= 40 ? '#F59E0B' : t.red)}
              {stat('میانگین بازده', data.overall.avgReturn === null ? '—' : `${data.overall.avgReturn >= 0 ? '+' : ''}${fa(data.overall.avgReturn, 1)}٪`,
                data.overall.avgReturn === null ? t.muted : data.overall.avgReturn >= 0 ? t.green : t.red)}
              {stat('نمونه بررسی‌شده', fa(data.overall.n), t.accent)}
              {stat('در انتظار (کمتر از ۱۰ روز)', fa(data.overall.pending), t.muted)}
            </div>

            {Object.keys(data.byCategory).length > 0 && (
              <div style={{ ...panelStyle(t.accent), marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright, marginBottom: 10 }}>تفکیک بر اساس دسته</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: t.muted, textAlign: 'right' }}>
                        <th style={{ padding: '6px 8px', fontWeight: 600 }}>دسته</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600 }}>نمونه</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600 }}>نرخ موفقیت</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600 }}>میانگین بازده</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.byCategory).map(([key, c]) => (
                        <tr key={key} style={{ borderTop: `0.5px solid ${t.border}` }}>
                          <td style={{ padding: '8px', fontWeight: 700 }}>{data.categoryLabels[key] ?? key}</td>
                          <td style={{ padding: '8px', fontFamily: 'system-ui, sans-serif' }}>{fa(c.n)}</td>
                          <td style={{ padding: '8px', fontFamily: 'system-ui, sans-serif', color: (c.winRate ?? 0) >= 50 ? t.green : t.red, fontWeight: 700 }}>
                            {c.winRate === null ? '—' : `${fa(c.winRate)}٪`}
                          </td>
                          <td style={{ padding: '8px', fontFamily: 'system-ui, sans-serif', color: (c.avgReturn ?? 0) >= 0 ? t.green : t.red }}>
                            {c.avgReturn === null ? '—' : `${c.avgReturn >= 0 ? '+' : ''}${fa(c.avgReturn, 1)}٪`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={panelStyle(t.brand2)}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright, marginBottom: 10 }}>سیگنال‌های اخیر</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ color: t.muted, textAlign: 'right' }}>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>تاریخ</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>دسته</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>نوع</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>اطمینان</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>نتیجه ۱۰ روزه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r, i) => (
                      <tr key={i} style={{ borderTop: `0.5px solid ${t.border}` }}>
                        <td style={{ padding: '7px 8px', color: t.muted }}>{r.date}</td>
                        <td style={{ padding: '7px 8px' }}>{r.categoryLabel}{r.symbol ? ` · ${r.symbol}` : ''}</td>
                        <td style={{ padding: '7px 8px', fontWeight: 700, color: r.type === 'خرید' ? t.green : t.red }}>{r.type}</td>
                        <td style={{ padding: '7px 8px', fontFamily: 'system-ui, sans-serif' }}>{fa(r.confidence)}٪</td>
                        <td style={{
                          padding: '7px 8px', fontFamily: 'system-ui, sans-serif', fontWeight: 700,
                          color: r.outcomePct === null ? t.muted : r.outcomePct > 0 ? t.green : r.outcomePct < 0 ? t.red : t.muted,
                        }}>
                          {r.outcomePct === null ? 'در انتظار' : `${r.outcomePct >= 0 ? '+' : ''}${fa(r.outcomePct, 1)}٪`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ fontSize: 10.5, color: cream, marginTop: 18, lineHeight: 1.9, textAlign: 'center' }}>
              عملکرد گذشته تضمینی برای آینده نیست. این صفحه صرفاً اطلاع‌رسانی است و توصیه مالی محسوب نمی‌شود —
              تصمیم سرمایه‌گذاری بر عهده خود شماست.
            </div>
          </>
        )}
      </div>
    </main>
  )
}
