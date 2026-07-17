'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { darkTheme, lightTheme, shouldUseDark } from '../../lib/theme'
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

type Narrative = { loading: boolean; text?: string; headline?: string | null; error?: string }

export default function TrackRecordPage() {
  const [isDark, setIsDark] = useState(true)
  const [data, setData] = useState<Payload | null>(null)
  const [failed, setFailed] = useState(false)
  const [narratives, setNarratives] = useState<Record<number, Narrative>>({})
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
    fetch('/api/signals-track-record')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  // برترین سیگنال‌های اخیر تسویه‌شده — بر اساس بازده واقعی هم‌جهت با بایاس سیگنال (خرید مثبت، فروش منفی بهتر است)
  const topRecent = useMemo(() => {
    if (!data) return []
    return data.recent
      .filter(r => r.outcomePct !== null)
      .map(r => ({ ...r, rankScore: r.type === 'فروش' ? -(r.outcomePct as number) : (r.outcomePct as number) }))
      .sort((a, b) => b.rankScore - a.rankScore)
      .slice(0, 5)
  }, [data])

  const panelStyle = (accent: string): React.CSSProperties => ({
    background: `linear-gradient(160deg, ${accent}0e, transparent 45%), ${t.panel}`,
    border: `0.5px solid ${t.border}`, borderTop: `2px solid ${accent}66`,
    borderRadius: 14, padding: '16px 18px', backdropFilter: 'blur(12px)', minWidth: 0,
    boxShadow: t.cardShadow,
  })

  const narrate = async (i: number, r: Row) => {
    if (narratives[i]?.text || narratives[i]?.loading) {
      // اگر قبلاً باز شده، دوباره تاگل کن (بستن)
      setNarratives(prev => {
        const cur = prev[i]
        if (!cur || cur.loading) return prev
        const { [i]: _drop, ...rest } = prev
        return rest
      })
      return
    }
    if (!r.reason) return
    setNarratives(prev => ({ ...prev, [i]: { loading: true } }))
    try {
      const res = await fetch('/api/signal-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: r.type, category: r.categoryLabel, symbol: r.symbol, reason: r.reason, confidence: r.confidence }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'خطا')
      setNarratives(prev => ({ ...prev, [i]: { loading: false, text: json.text, headline: json.headline } }))
    } catch (e) {
      setNarratives(prev => ({ ...prev, [i]: { loading: false, error: e instanceof Error ? e.message : 'خطا' } }))
    }
  }

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

            {topRecent.length > 0 && (
              <div style={{ ...panelStyle(t.green), marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright, marginBottom: 10 }}>
                  🏆 برترین سیگنال‌های اخیر (تسویه‌شده)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {topRecent.map((r, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                      fontSize: 12.5, padding: '7px 4px', borderTop: i > 0 ? `0.5px solid ${t.border}` : 'none',
                    }}>
                      <span style={{ color: t.muted, fontFamily: 'system-ui, sans-serif', width: 18 }}>{fa(i + 1)}</span>
                      <span style={{ color: t.muted }}>{r.date}</span>
                      <span>{r.categoryLabel}{r.symbol ? ` · ${r.symbol}` : ''}</span>
                      <span style={{ fontWeight: 700, color: r.type === 'خرید' ? t.green : t.red }}>{r.type}</span>
                      <span style={{
                        marginInlineStart: 'auto', fontWeight: 800, fontFamily: 'system-ui, sans-serif',
                        color: r.rankScore >= 0 ? t.green : t.red,
                      }}>
                        {r.rankScore >= 0 ? '+' : ''}{fa(r.rankScore, 1)}٪ سود
                      </span>
                    </div>
                  ))}
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
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r, i) => (
                      <Fragment key={i}>
                        <tr style={{ borderTop: `0.5px solid ${t.border}` }}>
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
                          <td style={{ padding: '7px 8px' }}>
                            {r.reason && (
                              <button
                                type="button"
                                onClick={() => narrate(i, r)}
                                style={{
                                  all: 'unset', cursor: 'pointer', fontSize: 10.5, color: t.brand2,
                                  border: `0.5px solid ${t.brand2}55`, borderRadius: 7, padding: '3px 9px',
                                }}
                              >
                                {narratives[i]?.loading ? 'در حال روایت…' : narratives[i]?.text ? 'بستن ▲' : '📝 روایت کن'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {(narratives[i]?.text || narratives[i]?.error) && (
                          <tr>
                            <td colSpan={6} style={{
                              padding: '10px 14px', whiteSpace: 'normal', fontSize: 12,
                              color: narratives[i]?.error ? t.red : cream, lineHeight: 2,
                              background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,30,46,0.02)',
                            }}>
                              {narratives[i]?.error ? `خطا: ${narratives[i]?.error}` : (
                                <>
                                  {narratives[i]?.headline && (
                                    <div style={{ fontWeight: 800, color: t.textBright, marginBottom: 6 }}>
                                      {narratives[i]?.headline}
                                    </div>
                                  )}
                                  {narratives[i]?.text}
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
