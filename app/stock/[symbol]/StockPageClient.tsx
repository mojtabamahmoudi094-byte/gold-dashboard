'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useIsMobile } from '../../../lib/useIsMobile'
import { supabase } from '../../../lib/supabase'
import CodalAnnouncements from '../../components/CodalAnnouncements'
import CommentsSection from '../../components/CommentsSection'
import TelegramChannelCta from '../../components/TelegramChannelCta'
import { type ChartModalPoint } from '../../../components/ChartModal'

const ChartModal = dynamic(() => import('../../../components/ChartModal'), { ssr: false })
import { downloadCSV } from '../../../lib/csvExport'
import { buildInsights, monthLabel, type RMonth, type RQuarter, type Reports } from '../../../lib/stockInsights'
import { shouldUseDark } from '../../../lib/theme'
import {
  type Theme, M_ACCENT, Q_ACCENT, H_ACCENT, GREEN, RED,
  hemat, mrial, gPct, pct, toneColor, ToneIcon,
  SectionCard, SectionLinkCard, MonthlySection, PortfolioSection, QuarterlyFinSection, ShareholdersSection,
} from './sections'

// حالت کارتی — فعلاً فقط شبندر (آزمایشی)؛ بعد از تأیید برای همه نمادها فعال می‌شود
const CARD_MODE_SYMBOLS = new Set(['شبندر'])

type SnapshotRow = {
  trade_date_shamsi: string
  pc: number | null; pcp: number | null; pl: number | null; plp: number | null
  tval: number | null; tvol: number | null; mv: number | null; mv_usd: number | null; pe: number | null
}
const SNAPSHOT_UNITS: Record<string, string> = { pcp: '٪', plp: '٪', mv_usd: '$' }

type Sym = {
  l18: string; l30: string
  pl: number | null; plp: number | null
  pc: number | null; pcp: number | null
  tval: number | null; tvol: number | null
  mv: number | null; mv_usd?: number | null; pe: number | null
  // نماد متوقف — از فید لحظه‌ای حذف شده، قیمت آخرین روز معاملاتی carry-forward شده
  halted?: boolean; haltedLastDate?: string
}
type Industry = {
  id: number | null; name: string; count: number
  tval: number; mv: number; mv_usd?: number; up: number; down: number
  symbols: Sym[]
}
type ExtraGroup = {
  id: number; name: string; kind: string; count: number
  tval: number; mv: number; up: number; down: number
  symbols: Sym[]
}
type Payload = { updated: string; industries: Industry[]; extraGroups?: ExtraGroup[]; usdRate?: number | null }

// ارزش بازار دلاری — روزی یک‌بار ساعت ۱۳ تهران توسط sync-usd-market-value.js محاسبه می‌شود
const husd = (v: number | null | undefined) =>
  v == null ? null : v >= 1e9
    ? `$${(v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })}B`
    : `$${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`

export default function StockPage({ symbol, initialData, initialReports }: {
  symbol: string
  initialData: Payload | null
  initialReports: Reports | null
}) {
  const [data, setData] = useState<Payload | null>(initialData)
  const [failed, setFailed] = useState(false)
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  // اگر داده سرور موجود بود، فقط برای تازه‌ماندن (لحظه‌ای) دوباره فچ می‌کنیم؛ خطای این فچ باعث failed نمی‌شود چون initialData از قبل معتبر است
  useEffect(() => {
    fetch('/api/stocks-industries')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => { if (!initialData) setFailed(true) })
  }, [initialData])

  // تاریخچه روزانه کارت‌ها — برای مودال نمودار، فقط وقتی کاربر روی یک کارت کلیک کرد فچ می‌شود
  const [snapshotRows, setSnapshotRows] = useState<SnapshotRow[] | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [modalMetric, setModalMetric] = useState<{ key: string; label: string; color: string } | null>(null)

  const openMetric = (key: string, label: string, color: string) => {
    setModalMetric({ key, label, color })
    if (snapshotRows === null && !snapshotLoading) {
      setSnapshotLoading(true)
      fetch(`/api/stock-snapshot?symbol=${encodeURIComponent(symbol)}`)
        .then(r => r.json())
        .then(j => setSnapshotRows(j.rows ?? []))
        .catch(() => setSnapshotRows([]))
        .finally(() => setSnapshotLoading(false))
    }
  }

  useEffect(() => { setSnapshotRows(null); setModalMetric(null) }, [symbol])

  const modalData: ChartModalPoint[] = useMemo(() => {
    if (!modalMetric || !snapshotRows) return []
    return snapshotRows.map(r => ({ t: r.trade_date_shamsi, v: (r as any)[modalMetric.key] }))
  }, [modalMetric, snapshotRows])

  const [reports, setReports] = useState<Reports | null>(initialReports)
  useEffect(() => {
    if (!symbol || initialReports) return
    fetch(`/api/stock-reports/${encodeURIComponent(symbol.replace(/\s+/g, '-'))}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setReports)
      .catch(() => setReports(null))
  }, [symbol, initialReports])

  const found = useMemo(() => {
    if (!data) return null
    for (const ind of data.industries) {
      const s = ind.symbols.find(x => x.l18 === symbol)
      if (s) return { s, ind }
    }
    // صندوق‌ها/حق تقدم/کالایی‌ها در extraGroups هستند، نه industries
    for (const grp of data.extraGroups ?? []) {
      const s = grp.symbols.find(x => x.l18 === symbol)
      if (s) return { s, ind: { id: null, name: grp.name, count: grp.count, tval: grp.tval, mv: grp.mv, up: grp.up, down: grp.down, symbols: grp.symbols } as Industry }
    }
    return null
  }, [data, symbol])

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const panel = isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.9)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'

  const pcColor = (v: number | null) => (v === null || v === 0 ? text : v > 0 ? GREEN : RED)

  // حالت کارتی: بخش‌های ماهانه/فصلی/سهامداران کارت لینکی می‌شوند و اطلاعیه‌های کدال ۵تایی صفحه‌بندی
  const cardMode = CARD_MODE_SYMBOLS.has(symbol)
  const enc = encodeURIComponent(symbol)

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px' : '40px 24px' }}>

        {found && (
          <Link href={found.ind.id != null ? `/stocks/${found.ind.id}` : '/market-map'} style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>
            ← بازگشت به {found.ind.name}
          </Link>
        )}
        {!found && (
          <Link href="/stocks" style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>
            ← بازگشت به صنایع
          </Link>
        )}

        {(failed || (data && !found)) && (
          <div style={{ color: muted, fontSize: 13, padding: '50px 0', textAlign: 'center' }}>
            نماد «{symbol}» پیدا نشد
          </div>
        )}

        {!data && !failed && (
          <div style={{ color: muted, fontSize: 13, padding: '50px 0', textAlign: 'center' }}>
            در حال بارگذاری…
          </div>
        )}

        {found && (() => {
          const { s, ind } = found
          const cards: [string, string, string, string][] = [
            ['قیمت پایانی', s.pc === null ? '—' : s.pc.toLocaleString('fa-IR'), pcColor(s.pcp) as string, 'pc'],
            ['٪ پایانی', pct(s.pcp), pcColor(s.pcp) as string, 'pcp'],
            ['آخرین معامله', s.pl === null ? '—' : s.pl.toLocaleString('fa-IR'), pcColor(s.plp) as string, 'pl'],
            ['٪ آخرین', pct(s.plp), pcColor(s.plp) as string, 'plp'],
            ['ارزش معاملات', s.tval === null ? '—' : hemat(s.tval), text, 'tval'],
            ['حجم معاملات', s.tvol === null ? '—' : s.tvol >= 1e6
              ? `${(s.tvol / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} م`
              : s.tvol.toLocaleString('fa-IR'), text, 'tvol'],
            ['ارزش بازار', s.mv === null ? '—' : hemat(s.mv), text, 'mv'],
            ['ارزش بازار (دلار)', husd(s.mv_usd) ?? '—', text, 'mv_usd'],
            ['P/E', s.pe === null ? '—' : s.pe.toLocaleString('fa-IR', { maximumFractionDigits: 1 }), text, 'pe'],
          ]
          const up = (s.pcp ?? 0) > 0, down = (s.pcp ?? 0) < 0
          const chgC = up ? GREEN : down ? RED : muted
          const t: Theme = { panel, text, muted, line, isDark }
          const lastM = reports && reports.months.length > 0 ? reports.months[reports.months.length - 1] : null
          const lastQ = reports && reports.quarters.length > 0 ? reports.quarters[reports.quarters.length - 1] : null
          return (
            <>
              {s.halted && (
                <div style={{
                  marginTop: 14, padding: '12px 16px', borderRadius: 12, fontSize: 13, lineHeight: 1.9,
                  background: 'rgba(239,168,80,0.1)', border: '1px solid rgba(239,168,80,0.35)', color: text,
                }}>
                  ⏸️ نماد «{s.l18}» متوقف است و فعلاً معامله نمی‌شود
                  {s.haltedLastDate ? ` — قیمت‌ها مربوط به آخرین روز معاملاتی (${new Date(s.haltedLastDate + 'T12:00:00').toLocaleDateString('fa-IR')}) است.` : ' — قیمت‌ها مربوط به آخرین روز معاملاتی است.'}
                </div>
              )}
              {/* هدر hero */}
              <div style={{
                position: 'relative', overflow: 'hidden',
                marginTop: 14, marginBottom: 16, padding: isMobile ? '18px 18px' : '22px 26px',
                borderRadius: 20, border: `0.5px solid ${line}`,
                background: isDark
                  ? 'linear-gradient(135deg, rgba(217,180,91,0.12), rgba(244,215,149,0.08) 55%, rgba(10,18,30,0.4))'
                  : 'linear-gradient(135deg, rgba(217,180,91,0.09), rgba(244,215,149,0.06) 55%, rgba(255,255,255,0.7))',
                backdropFilter: 'blur(12px)',
              }}>
                <div style={{
                  position: 'absolute', top: -60, left: -40, width: 200, height: 200, borderRadius: '50%',
                  background: `radial-gradient(circle, ${chgC}22, transparent 70%)`, pointerEvents: 'none',
                }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: isMobile ? 24 : 30, fontWeight: 800, letterSpacing: '-0.01em',
                        background: 'linear-gradient(135deg, #d9b45b, #f4d795)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                      }}>{s.l18}</span>
                      <span style={{ fontSize: 12.5, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: '1 1 auto' }}>{s.l30}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      <Link href={ind.id != null ? `/stocks/${ind.id}` : '/market-map'} style={{
                        display: 'inline-block',
                        fontSize: 11, color: isDark ? '#7FB5E8' : '#2563EB', textDecoration: 'none',
                        padding: '4px 11px', borderRadius: 8,
                        background: 'rgba(217,180,91,0.1)', border: '0.5px solid rgba(217,180,91,0.28)',
                      }}>
                        {ind.name}
                      </Link>
                      <Link href={`/technical/${encodeURIComponent(symbol.replace(/\s+/g, '-'))}`} style={{
                        display: 'inline-block',
                        fontSize: 11, color: isDark ? '#7FB5E8' : '#2563EB', textDecoration: 'none',
                        padding: '4px 11px', borderRadius: 8,
                        background: 'rgba(217,180,91,0.1)', border: '0.5px solid rgba(217,180,91,0.28)',
                      }}>
                        نمودار تکنیکال
                      </Link>
                      <Link href={`/fundamentals/${encodeURIComponent(symbol.replace(/\s+/g, '-'))}`} style={{
                        display: 'inline-block',
                        fontSize: 11, color: isDark ? '#7FB5E8' : '#2563EB', textDecoration: 'none',
                        padding: '4px 11px', borderRadius: 8,
                        background: 'rgba(217,180,91,0.1)', border: '0.5px solid rgba(217,180,91,0.28)',
                      }}>
                        نسبت‌های مالی
                      </Link>
                    </div>
                  </div>
                  {/* پیل قیمت پایانی */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 14,
                    background: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.6)',
                    border: `0.5px solid ${chgC}40`,
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: muted, marginBottom: 3 }}>قیمت پایانی</div>
                      <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: text }}>
                        {s.pc === null ? '—' : s.pc.toLocaleString('fa-IR')}
                      </div>
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 9,
                      background: `${chgC}18`, color: chgC, fontWeight: 800, fontSize: 13.5,
                    }}>
                      {(up || down) && <ToneIcon tone={up ? 'pos' : 'neg'} size={14} />}
                      {pct(s.pcp)}
                    </div>
                  </div>
                </div>
              </div>

              {/* اطلاعات تابلو */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                gap: 10, marginBottom: 20,
              }}>
                {cards.map(([k, v, c, metricKey]) => {
                  const accent = c === (GREEN as string) || c === (RED as string)
                  return (
                    <button key={k} onClick={() => openMetric(metricKey, k, accent ? c : '#d9b45b')} style={{
                      position: 'relative', overflow: 'hidden', cursor: 'pointer',
                      background: panel, border: `0.5px solid ${accent ? `${c}33` : line}`, borderRadius: 14,
                      padding: '14px 16px', backdropFilter: 'blur(12px)', minWidth: 0,
                      display: 'block', width: '100%', textAlign: 'right', fontFamily: 'inherit',
                    }}>
                      {accent && <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3, background: c }} />}
                      <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>{k}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: c, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
                    </button>
                  )
                })}
              </div>

              <ChartModal
                open={!!modalMetric}
                onClose={() => setModalMetric(null)}
                title={modalMetric?.label ?? ''}
                unit={modalMetric ? SNAPSHOT_UNITS[modalMetric.key] : undefined}
                color={modalMetric?.color ?? '#d9b45b'}
                data={modalData}
                loading={snapshotLoading}
              />

              <div style={{ fontSize: 10.5, color: muted }}>
                داده تابلو مربوط به آخرین به‌روزرسانی صنایع است
                {data?.updated ? ` — ${new Date(data.updated).toLocaleDateString('fa-IR')}` : ''}
              </div>

              {reports && (reports.months.length > 0 || reports.quarters.length > 0) && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => downloadCSV(`${symbol}-codal-reports.csv`, [
                        ...reports.months.map(m => ({
                          نوع: 'ماهانه', دوره: m.period, انتشار: m.publish,
                          فروش_ماه: m.month, فروش_تجمعی: m.cum, تجمعی_سال_قبل: m.lastYearCum,
                        })),
                        ...reports.quarters.map(q => ({
                          نوع: 'فصلی', دوره: q.period, انتشار: q.publish,
                          فروش: q.revenue, فروش_سال_قبل: q.revenue_ly,
                          سود_ناخالص: q.gross, سود_خالص: q.net, سود_خالص_سال_قبل: q.net_ly,
                          eps: q.eps, سرمایه: q.capital,
                        })),
                      ])}
                      style={{
                        fontSize: 11.5, color: muted, cursor: 'pointer',
                        padding: '6px 12px', borderRadius: 8,
                        background: panel, border: `1px solid ${line}`,
                      }}
                    >
                      دانلود گزارش‌های کدال (CSV)
                    </button>
                  </div>
                  <AnalysisSection months={reports.months} quarters={reports.quarters} t={t} isMobile={isMobile} />
                </>
              )}

              {cardMode ? (
                <>
                  {/* کارت گزارش ماهانه — لینک به صفحه کامل */}
                  {lastM && (
                    <SectionLinkCard
                      href={`/stock/${enc}/monthly`}
                      title={lastM.kind === 'portfolio' ? 'پرتفوی سرمایه‌گذاری' : 'گزارش فعالیت ماهانه'}
                      badge={`${reports!.months.length.toLocaleString('fa-IR')} ماه`}
                      accent={M_ACCENT}
                      t={t}
                      chips={lastM.kind === 'portfolio' ? [
                        { label: `ارزش پرتفوی ${monthLabel(lastM.period)}`, value: mrial(lastM.totalMv), color: M_ACCENT },
                        { label: 'سود تحقق‌نیافته', value: mrial(lastM.gain), color: (lastM.gain ?? 0) >= 0 ? GREEN : RED },
                      ] : [
                        { label: `${(lastM.kind ?? 'production') === 'production' ? 'فروش' : 'درآمد'} ${monthLabel(lastM.period)}`, value: mrial(lastM.month), color: M_ACCENT },
                        { label: 'تجمعی سال مالی', value: mrial(lastM.cum) },
                      ]}
                      desc="روند ماهانه، محصولات برتر و نرخ فروش — برای مشاهده جزئیات کامل کلیک کنید"
                    />
                  )}
                  {/* کارت گزارش‌های فصلی */}
                  {lastQ && (
                    <SectionLinkCard
                      href={`/stock/${enc}/quarterly`}
                      title="گزارش‌های فصلی"
                      badge={`${reports!.quarters.length.toLocaleString('fa-IR')} دوره`}
                      accent={Q_ACCENT}
                      t={t}
                      chips={[
                        { label: 'درآمد عملیاتی آخرین دوره', value: mrial(lastQ.revenue), color: Q_ACCENT },
                        { label: 'سود خالص دوره', value: mrial(lastQ.net), color: (lastQ.net ?? 0) >= 0 ? GREEN : RED },
                        { label: 'سود هر سهم (EPS)', value: lastQ.eps === null ? '—' : `${lastQ.eps.toLocaleString('fa-IR')} ریال` },
                      ]}
                      desc="صورت سود و زیان دوره‌ای، حاشیه سود و جدول همه دوره‌ها — برای مشاهده کامل کلیک کنید"
                    />
                  )}
                  {/* کارت سهامداران عمده */}
                  <SectionLinkCard
                    href={`/stock/${enc}/shareholders`}
                    title="سهامداران عمده"
                    accent={H_ACCENT}
                    t={t}
                    desc="ترکیب مالکیت سهامداران عمده، ورود و خروج روزانه — برای مشاهده کامل کلیک کنید"
                  />
                </>
              ) : (
                <>
                  {reports && reports.months.length > 0 && (
                    reports.months[reports.months.length - 1].kind === 'portfolio'
                      ? <PortfolioSection months={reports.months} t={t} isMobile={isMobile} />
                      : <MonthlySection months={reports.months} t={t} isMobile={isMobile} />
                  )}
                  {reports && reports.quarters.length > 0 && (
                    <QuarterlyFinSection quarters={reports.quarters} t={t} isMobile={isMobile} />
                  )}
                  <ShareholdersSection symbol={symbol} t={t} />
                </>
              )}
              {/* بعضی شرکت‌ها (باشگاه‌های ورزشی، برخی سرمایه‌گذاری‌ها) اصلاً گزارش ماهانه منتشر نمی‌کنند */}
              {reports && reports.months.length === 0 && reports.quarters.length > 0 && (
                <SectionCard title="گزارش فعالیت ماهانه" accent={M_ACCENT} t={t}>
                  <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.9, padding: '6px 0' }}>
                    این شرکت گزارش فعالیت ماهانه در کدال منتشر نمی‌کند؛ عملکرد آن در صورت‌های مالی دوره‌ای زیر بررسی شده است.
                  </div>
                </SectionCard>
              )}
              <CodalAnnouncements symbol={symbol} isDark={isDark} isMobile={isMobile} pageSize={cardMode ? 5 : undefined} />
              <AiChatSection symbol={symbol} t={t} isMobile={isMobile} />
              <TelegramChannelCta context="stock" />
              <CommentsSection targetType="stock" targetKey={symbol} isDark={isDark} />
            </>
          )
        })()}
      </div>
    </main>
  )
}

const A_ACCENT = '#A78BFA'   // بنفش — تحلیل هوشمند
const AI_ACCENT = '#2DD4BF'  // فیروزه‌ای — دستیار تحلیلگر
// از پروکسی خودمان عبور می‌کند (نه مستقیم به بات خارجی) تا rate limit و لاگ سوال/جواب اعمال شود
const AI_API = '/api/chat'

// ═══ تحلیل هوشمند ═══
function AnalysisSection({ months, quarters, t, isMobile }: { months: RMonth[]; quarters: RQuarter[]; t: Theme; isMobile: boolean }) {
  const { verdict, items } = buildInsights(months, quarters)
  if (items.length === 0) return null
  return (
    <SectionCard title="تحلیل هوشمند" badge="خودکار" accent={A_ACCENT} t={t}>
      {/* حکم کلی */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, marginBottom: 14,
        background: `${toneColor(verdict.tone)}12`, border: `0.5px solid ${toneColor(verdict.tone)}40`,
      }}>
        <span style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${toneColor(verdict.tone)}18`, border: `0.5px solid ${toneColor(verdict.tone)}45`,
        }}>
          <ToneIcon tone={verdict.tone} size={18} />
        </span>
        <span style={{ fontSize: isMobile ? 12.5 : 13.5, fontWeight: 700, color: toneColor(verdict.tone), lineHeight: 1.7 }}>
          {verdict.text}
        </span>
      </div>
      {/* بندها */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: toneColor(it.tone), marginTop: 6, flexShrink: 0 }} />
            <span style={{ fontSize: isMobile ? 12 : 12.5, color: t.text, lineHeight: 1.9 }}>{it.text}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9.5, color: t.muted, marginTop: 14, lineHeight: 1.7 }}>
        این تحلیل خودکار و صرفاً بر پایه گزارش‌های کدال محاسبه شده است و توصیه خرید یا فروش نیست.
      </div>
    </SectionCard>
  )
}

// ————— دستیار تحلیلگر هوشمند (RAG کتاب‌های بنیادی + داده کدال + Gemini) —————
type ChatMsg = { role: 'user' | 'ai'; text: string }

const SUGGESTED_QS = [
  'وضعیت بنیادی این سهم چطوره؟',
  'روند فروش و سودآوری رو تحلیل کن',
  'EPS و رشدش نسبت به سال قبل چطوره؟',
]

const THINKING_STEPS = [
  'در حال خواندن گزارش‌های کدال…',
  'مرور کتاب‌های تحلیل بنیادی…',
  'محاسبه نسبت‌های مالی…',
  'نوشتن جواب…',
]

// حذف نشانه‌گذاری markdown از جواب (bold/heading) برای نمایش تمیز
const stripMd = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,4}\s*/gm, '').replace(/^\s*[*-]\s+/gm, '• ')

// صدای اعلان ding دو-نتی با WebAudio — بدون فایل صوتی
function playDing() {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    type AC = typeof AudioContext
    const Ctx: AC = window.AudioContext || (window as unknown as { webkitAudioContext: AC }).webkitAudioContext
    const ctx = new Ctx()
    const notes: [number, number][] = [[660, 0], [990, 0.09]]
    for (const [freq, at] of notes) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.28)
      o.connect(g); g.connect(ctx.destination)
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.3)
    }
    setTimeout(() => ctx.close(), 800)
  } catch { /* صدا حیاتی نیست */ }
}

// آیکن‌های SVG (بدون وابستگی)
const SparkIcon = ({ size = 18, color = AI_ACCENT }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z" fill={color} />
    <path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z" fill={color} opacity={0.7} />
  </svg>
)
const SendIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: 'scaleX(-1)' }}>
    <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
)
const CopyIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
)
const CheckIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

function AiAvatar({ pulsing }: { pulsing?: boolean }) {
  return (
    <span style={{
      flexShrink: 0, width: 30, height: 30, borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${AI_ACCENT}28, ${AI_ACCENT}10)`,
      border: `0.5px solid ${AI_ACCENT}50`,
      boxShadow: pulsing ? `0 0 14px ${AI_ACCENT}50` : `0 0 8px ${AI_ACCENT}20`,
      animation: pulsing ? 'aiPulse 1.6s ease-in-out infinite' : undefined,
    }}>
      <SparkIcon size={16} />
    </span>
  )
}

function AiChatSection({ symbol, t, isMobile }: { symbol: string; t: Theme; isMobile: boolean }) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [copied, setCopied] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // چرخش پیام وضعیت هنگام انتظار
  useEffect(() => {
    if (!loading) return
    setStep(0)
    const id = setInterval(() => setStep(s => (s + 1) % THINKING_STEPS.length), 6000)
    return () => clearInterval(id)
  }, [loading])

  // اسکرول خودکار به آخرین پیام
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const send = async (raw?: string) => {
    const q = (raw ?? input).trim()
    if (!q || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: q }])
    setLoading(true)
    try {
      // اگر کاربر نماد را نگفته، به سوال اضافه کن تا داده کدال درست وصل شود
      const full = q.includes(symbol) ? q : `درباره نماد ${symbol}: ${q}`
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(AI_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ question: full }),
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'ai', text: stripMd(data.answer || data.error || 'خطایی رخ داد.') }])
      playDing()
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'ارتباط با دستیار برقرار نشد. کمی بعد دوباره امتحان کنید.' }])
    }
    setLoading(false)
  }

  const copyAnswer = async (i: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(i)
      setTimeout(() => setCopied(null), 1800)
    } catch { /* clipboard در دسترس نیست */ }
  }

  const bubbleBase = {
    padding: '12px 15px', borderRadius: 14, lineHeight: 2,
    fontSize: isMobile ? 12 : 12.5, whiteSpace: 'pre-wrap' as const, color: t.text,
    animation: 'aiMsgIn 0.35s ease both',
  }

  return (
    <SectionCard title="دستیار تحلیلگر" badge="هوش مصنوعی" accent={AI_ACCENT} t={t}>
      <style>{`
        @keyframes aiMsgIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        @keyframes aiPulse { 0%,100% { box-shadow: 0 0 8px ${AI_ACCENT}30 } 50% { box-shadow: 0 0 18px ${AI_ACCENT}60 } }
        @keyframes aiDot { 0%,80%,100% { transform: translateY(0); opacity: .45 } 40% { transform: translateY(-4px); opacity: 1 } }
        @keyframes aiShimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }
        @media (prefers-reduced-motion: reduce) {
          .ai-anim, .ai-anim * { animation: none !important; transition: none !important }
        }
        .ai-chip { transition: transform .18s ease, box-shadow .18s ease, background .18s ease }
        .ai-chip:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 14px ${AI_ACCENT}25; background: ${AI_ACCENT}1e }
        .ai-send { transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease }
        .ai-send:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px ${AI_ACCENT}40 }
        .ai-send:active:not(:disabled) { transform: translateY(0) }
        .ai-input:focus { border-color: ${AI_ACCENT}70 !important; box-shadow: 0 0 0 3px ${AI_ACCENT}22 }
        .ai-copy { transition: color .15s ease, background .15s ease }
        .ai-copy:hover { background: ${AI_ACCENT}18 }
      `}</style>

      <div className="ai-anim">
        {/* حالت خالی: معرفی + سوال‌های پیشنهادی */}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: isMobile ? '18px 4px 22px' : '26px 10px 30px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <span style={{
                width: 54, height: 54, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${AI_ACCENT}25, ${AI_ACCENT}08)`,
                border: `0.5px solid ${AI_ACCENT}45`, animation: 'aiPulse 2.4s ease-in-out infinite',
              }}>
                <SparkIcon size={26} />
              </span>
            </div>
            <div style={{ fontSize: isMobile ? 13.5 : 15, fontWeight: 800, color: t.text, marginBottom: 6 }}>
              درباره {symbol} هر سوالی داری بپرس
            </div>
            <div style={{ fontSize: isMobile ? 11 : 11.5, color: t.muted, marginBottom: 18, lineHeight: 1.9 }}>
              تحلیل بر پایه ۱۷ کتاب تحلیل بنیادی و گزارش‌های واقعی کدال
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {SUGGESTED_QS.map(q => (
                <button key={q} className="ai-chip" onClick={() => send(q)} disabled={loading} aria-label={`پرسیدن: ${q}`} style={{
                  fontSize: isMobile ? 11 : 11.5, padding: '10px 15px', borderRadius: 999, cursor: 'pointer',
                  background: `${AI_ACCENT}10`, border: `0.5px solid ${AI_ACCENT}38`, color: t.text,
                  fontFamily: 'inherit', minHeight: 44,
                }}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {/* پیام‌ها */}
        {messages.length > 0 && (
          <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, maxHeight: 460, overflowY: 'auto', paddingLeft: 2 }}>
            {messages.map((m, i) => m.role === 'user' ? (
              <div key={i} style={{
                ...bubbleBase, alignSelf: 'flex-start', maxWidth: '82%',
                background: `linear-gradient(135deg, ${AI_ACCENT}1c, ${AI_ACCENT}0d)`,
                border: `0.5px solid ${AI_ACCENT}42`,
                borderTopRightRadius: 4,
              }}>
                {m.text}
              </div>
            ) : (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <AiAvatar />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: AI_ACCENT }}>دستیار بورس سنج</span>
                    <button className="ai-copy" onClick={() => copyAnswer(i, m.text)} aria-label="کپی جواب" style={{
                      display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                      fontSize: 9.5, padding: '3px 8px', borderRadius: 6, fontFamily: 'inherit',
                      background: 'transparent', border: `0.5px solid ${t.line}`,
                      color: copied === i ? GREEN : t.muted,
                    }}>
                      {copied === i ? <CheckIcon /> : <CopyIcon />}
                      {copied === i ? 'کپی شد' : 'کپی'}
                    </button>
                  </div>
                  <div style={{
                    ...bubbleBase,
                    background: t.isDark ? 'rgba(255,255,255,0.028)' : 'rgba(15,30,46,0.028)',
                    border: `0.5px solid ${t.line}`,
                    borderTopLeftRadius: 4,
                  }}>
                    {m.text}
                  </div>
                </div>
              </div>
            ))}

            {/* وضعیت در حال فکرکردن */}
            {loading && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <AiAvatar pulsing />
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 15px', borderRadius: 14, borderTopLeftRadius: 4,
                  background: t.isDark ? 'rgba(255,255,255,0.028)' : 'rgba(15,30,46,0.028)', border: `0.5px solid ${t.line}`,
                }}>
                  <span style={{ display: 'flex', gap: 4 }} aria-hidden="true">
                    {[0, 1, 2].map(d => (
                      <span key={d} style={{
                        width: 6, height: 6, borderRadius: 3, background: AI_ACCENT,
                        animation: `aiDot 1.2s ease-in-out ${d * 0.18}s infinite`,
                      }} />
                    ))}
                  </span>
                  <span aria-live="polite" style={{
                    fontSize: 11.5, fontWeight: 600,
                    backgroundImage: `linear-gradient(90deg, ${t.muted}, ${AI_ACCENT}, ${t.muted})`,
                    backgroundSize: '200% 100%', animation: 'aiShimmer 2.2s linear infinite',
                    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                  }}>
                    {THINKING_STEPS[step]}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ورودی */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="ai-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send() }}
            placeholder={`سوالت درباره ${symbol} رو بپرس…`}
            disabled={loading}
            aria-label={`سوال درباره ${symbol}`}
            style={{
              flex: 1, minWidth: 0, padding: '13px 17px', borderRadius: 999, fontSize: isMobile ? 12 : 12.5,
              background: t.isDark ? 'rgba(255,255,255,0.045)' : 'rgba(15,30,46,0.045)',
              border: `0.5px solid ${t.line}`, color: t.text,
              fontFamily: 'inherit', minHeight: 46, transition: 'border-color .2s ease, box-shadow .2s ease',
            }}
          />
          <button className="ai-send" onClick={() => send()} disabled={loading || !input.trim()} aria-label="ارسال سوال" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: isMobile ? '0 16px' : '0 20px', minHeight: 46, minWidth: 46,
            borderRadius: 999, fontSize: 12.5, fontWeight: 800,
            cursor: loading || !input.trim() ? 'default' : 'pointer',
            background: loading || !input.trim()
              ? (t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,30,46,0.05)')
              : `linear-gradient(135deg, ${AI_ACCENT}, #14B8A6)`,
            border: 'none', color: loading || !input.trim() ? t.muted : '#04241F',
            opacity: loading ? 0.7 : 1, flexShrink: 0, fontFamily: 'inherit',
          }}>
            <SendIcon />
            {!isMobile && 'بپرس'}
          </button>
        </div>

        <div style={{ fontSize: 9.5, color: t.muted, marginTop: 12, lineHeight: 1.7 }}>
          پاسخ‌ها با هوش مصنوعی بر پایه کتاب‌های تحلیل بنیادی و گزارش‌های کدال تولید می‌شوند و توصیه خرید یا فروش نیستند.
        </div>
      </div>
    </SectionCard>
  )
}
