'use client'

// بخش‌های مشترک صفحه نماد — هم در StockPageClient و هم در صفحات مستقل
// (/stock/[symbol]/monthly ، /quarterly ، /shareholders) استفاده می‌شوند

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { growth, monthLabel, monthlyYoY, type RMonth, type RQuarter, type RHolding, type Tone } from '../../../lib/stockInsights'
import { shouldUseDark } from '../../../lib/theme'

export type Theme = { panel: string; text: string; muted: string; line: string; isDark: boolean }

export const M_ACCENT = '#FACC15'   // زرد طلایی — فعالیت ماهانه
export const Q_ACCENT = '#F59E0B'   // کهربایی — گزارش فصلی
export const H_ACCENT = '#a78bfa'   // بنفش — سهامداران عمده
export const C_ACCENT = '#38BDF8'   // آبی آسمانی — اطلاعیه‌های کدال
export const T_ACCENT = '#00E5A0'   // سبز نئونی — نمودار تابلوخوانی (هماهنگ با نمودارهای صندوق)
export const GREEN = 'oklch(0.74 0.16 150)'
export const RED   = 'oklch(0.68 0.19 25)'
const AI_ACCENT = '#2DD4BF'

export const hemat = (rial: number) =>
  rial >= 1e13
    ? `${(rial / 1e13).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} همت`
    : `${Math.round(rial / 1e10).toLocaleString('fa-IR')} میلیارد ت`

// مقادیر گزارش‌های کدال به میلیون ریال هستند
export const mrial = (v: number | null | undefined) => (v == null ? '—' : hemat(v * 1e6))

export const gPct = (v: number | null) =>
  v === null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`

export const pct = (v: number | null) =>
  v === null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`

// نرخ فروش کدال به ریال بر واحد است → میلیون تومان بر واحد
export const rateFmt = (v: number | null) =>
  v === null || v === 0 ? '—' : `${(v / 1e7).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} م.ت`

export const toneColor = (tone: Tone) => tone === 'pos' ? GREEN : tone === 'neg' ? RED : '#94A3B8'

export const ToneIcon = ({ tone, size = 18 }: { tone: Tone; size?: number }) => {
  const c = toneColor(tone)
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, style: { pointerEvents: 'none' as const } }
  if (tone === 'pos') return (<svg {...common}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>)
  if (tone === 'neg') return (<svg {...common}><polyline points="3 7 9 13 13 9 21 17" /><polyline points="15 17 21 17 21 11" /></svg>)
  return (<svg {...common}><line x1="5" y1="12" x2="19" y2="12" /></svg>)
}

// تم مشترک صفحات نماد — همان الگوی themechange + lib/theme.ts
export function useStockTheme() {
  const [isDark, setIsDark] = useState(true)
  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])
  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const panel = isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.9)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'
  const t: Theme = { panel, text, muted, line, isDark }
  return { isDark, bg, panel, text, muted, line, t }
}

// پوسته صفحات زیرمجموعه نماد (گزارش ماهانه/فصلی/سهامداران)
export function StockSubShell({ symbol, title, accent, isMobile, children }: {
  symbol: string; title: string; accent: string; isMobile: boolean; children: (t: Theme) => React.ReactNode
}) {
  const { bg, text, muted, t } = useStockTheme()
  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px' : '40px 24px' }}>
        <Link href={`/stock/${encodeURIComponent(symbol)}`} style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>
          ← بازگشت به صفحه {symbol}
        </Link>
        <h1 style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: isMobile ? 19 : 24, fontWeight: 800, margin: '16px 0 4px', color: text,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: accent, flexShrink: 0, boxShadow: `0 0 10px ${accent}` }} />
          {title} {symbol}
        </h1>
        {children(t)}
      </div>
    </main>
  )
}

export function SectionCard({ title, badge, accent, t, children }: {
  title: string; badge?: string; accent: string; t: Theme; children: React.ReactNode
}) {
  return (
    <section style={{
      background: t.panel, border: `0.5px solid ${t.line}`, borderRadius: 16,
      padding: '20px 20px 22px', marginTop: 22, backdropFilter: 'blur(12px)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: accent, flexShrink: 0, boxShadow: `0 0 10px ${accent}` }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{title}</span>
        {badge && (
          <span style={{
            fontSize: 10, padding: '3px 9px', borderRadius: 7,
            background: `${accent}14`, border: `0.5px solid ${accent}40`, color: accent,
          }}>{badge}</span>
        )}
      </div>
      {children}
    </section>
  )
}

// نگاشت اکسنت برای تم روشن — نسخهٔ تیره‌تر با کنتراست کافی (WCAG) روی پس‌زمینه سفید
const LIGHT_TEXT_ACCENT: Record<string, string> = {
  '#FACC15': '#A16207',  // ماهانه
  '#F59E0B': '#B45309',  // فصلی
  '#a78bfa': '#7C3AED',  // سهامداران
  '#38BDF8': '#0369A1',  // کدال
  '#00E5A0': '#047857',  // تابلوخوانی
}

// شبکه کارت‌های مربعی — دسکتاپ مربع‌های ثابت کنار هم، موبایل ۳تایی=یک ردیف / ۴تایی=۲×۲
export function SquareLinkGrid({ isMobile, cols = 3, children }: {
  isMobile: boolean; cols?: number; children: React.ReactNode
}) {
  const mobileCols = cols >= 4 ? 2 : 3
  const colW = cols >= 5 ? 196 : 224   // ۵ کارت باید در کانتینر ۱۱۰۰px جا شود
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? `repeat(${mobileCols}, minmax(0, 1fr))` : `repeat(${cols}, ${colW}px)`,
      gap: isMobile ? 10 : 16,
      marginTop: 22,
      justifyContent: 'flex-start',   // در RTL یعنی چسبیده به راست، هم‌تراز با بقیه سکشن‌ها
    }}>
      {children}
    </div>
  )
}

const sqIconProps = (accent: string, size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none' as const,
  stroke: accent, strokeWidth: 1.9,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

// آیکن‌های سه کارت (بدون کتابخانه)
export const MonthlyIcon = ({ size = 23 }: { size?: number }) => (
  <svg {...sqIconProps(M_ACCENT, size)}>
    <path d="M4 20h16" />
    <line x1="8"  y1="17" x2="8"  y2="13" strokeWidth={2.6} />
    <line x1="12" y1="17" x2="12" y2="9"  strokeWidth={2.6} />
    <line x1="16" y1="17" x2="16" y2="5"  strokeWidth={2.6} />
  </svg>
)
export const QuarterlyIcon = ({ size = 23 }: { size?: number }) => (
  <svg {...sqIconProps(Q_ACCENT, size)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="13" y2="17" />
  </svg>
)
export const CodalIcon = ({ size = 23 }: { size?: number }) => (
  <svg {...sqIconProps(C_ACCENT, size)}>
    <path d="M3 11l14-5v12L3 13v-2z" />
    <path d="M17 8a4 4 0 0 1 0 6" />
    <path d="M7 13.5V18a1.5 1.5 0 0 0 3 0v-3" />
  </svg>
)
export const TapeIcon = ({ size = 23 }: { size?: number }) => (
  <svg {...sqIconProps(T_ACCENT, size)}>
    <path d="M3 20h18" />
    <rect x="5" y="9" width="3" height="8" rx="1" />
    <rect x="10.5" y="5" width="3" height="12" rx="1" />
    <rect x="16" y="12" width="3" height="5" rx="1" />
    <path d="M4 6l4-2 4 3 5-4" strokeWidth={1.6} />
  </svg>
)
export const ShareholdersIcon = ({ size = 23 }: { size?: number }) => (
  <svg {...sqIconProps(H_ACCENT, size)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c0-3.1 2.5-5.1 5.5-5.1s5.5 2 5.5 5.1" />
    <circle cx="17.5" cy="9" r="2.4" />
    <path d="M16.5 15.4c2.5.4 4.2 2.2 4.2 4.6" />
  </svg>
)

// کارت مربعی لینکی — آیکن + عنوان + یک آمار کلیدی + «مشاهده»؛ کل کارت لینک است
export function SquareLinkCard({ href, title, accent, stat, t, isMobile, icon }: {
  href: string; title: string; accent: string
  stat: { label: string; value: string; color?: string }
  t: Theme; isMobile: boolean; icon: React.ReactNode
}) {
  const textAccent = t.isDark ? accent : (LIGHT_TEXT_ACCENT[accent] ?? accent)
  const cls = `sq-card-${accent.replace('#', '')}`   // کلاس یکتا per-accent — جلوگیری از تداخل hover سه کارت
  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block', minWidth: 0 }}
      aria-label={`${title} — مشاهده صفحه کامل`}>
      <div className={cls} style={{
        position: 'relative', overflow: 'hidden', minWidth: 0,
        aspectRatio: isMobile ? '1 / 1.18' : '1 / 1.02',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: isMobile ? 7 : 11, textAlign: 'center',
        padding: isMobile ? '10px 8px' : '18px 16px',
        background: t.panel,
        border: `0.5px solid ${t.line}`,
        borderRadius: isMobile ? 14 : 20,
        backdropFilter: 'blur(12px)',
        cursor: 'pointer',
        transition: 'border-color .18s ease, transform .18s ease, box-shadow .18s ease',
      }}>
        <style>{`
          .${cls}:hover {
            border-color: ${accent}66 !important;
            transform: translateY(-3px);
            box-shadow: ${t.isDark
              ? `0 12px 32px rgba(0,0,0,0.35), 0 0 0 1px ${accent}22`
              : `0 10px 26px rgba(15,30,46,0.10), 0 0 0 1px ${accent}33`};
          }
          .${cls}:active { transform: translateY(-1px) scale(0.99); }
          a:focus-visible .${cls} { outline: 3px solid ${accent}; outline-offset: 3px; }
          @media (prefers-reduced-motion: reduce) {
            .${cls}, .${cls}:hover, .${cls}:active { transform: none; transition: border-color .18s ease; }
          }
        `}</style>

        {/* هالهٔ اکسنت بالای کارت — صرفاً تزئینی */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 90% 55% at 50% -10%, ${accent}${t.isDark ? '1f' : '14'}, transparent 70%)`,
        }} />

        {/* آیکون در نشان مربع‌گرد */}
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          width: isMobile ? 36 : 46, height: isMobile ? 36 : 46,
          borderRadius: isMobile ? 10 : 13,
          background: `${accent}14`, border: `0.5px solid ${accent}40`,
          boxShadow: t.isDark ? `0 0 14px ${accent}22` : 'none',
        }}>
          {icon}
        </span>

        <span style={{
          fontSize: isMobile ? 12.5 : 15, fontWeight: 800, color: t.text,
          lineHeight: 1.45, maxWidth: '100%',
        }}>{title}</span>

        {/* یک آمار کلیدی — الگوی flex برای ellipsis فارسی */}
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0, maxWidth: '100%' }}>
          <span style={{ fontSize: isMobile ? 10 : 10.5, color: t.muted }}>{stat.label}</span>
          <span style={{
            fontSize: isMobile ? 12 : 15.5, fontWeight: 700,
            color: stat.color ?? textAccent,
            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{stat.value}</span>
        </span>

        <span style={{
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
          fontSize: isMobile ? 10 : 11.5, fontWeight: 700, color: textAccent,
        }}>
          مشاهده
          <svg width={isMobile ? 11 : 13} height={isMobile ? 11 : 13} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
        </span>
      </div>
    </Link>
  )
}

export function Chip({ label, value, color, t }: { label: string; value: string; color?: string; t: Theme }) {
  return (
    <div style={{
      flex: '1 1 130px', minWidth: 0, padding: '10px 14px', borderRadius: 12,
      background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,46,0.03)',
      border: `0.5px solid ${t.line}`,
    }}>
      <div style={{ fontSize: 10, color: t.muted, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: color ?? t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}

// خلاصه ۳خطی AI روی آخرین گزارش کدال — مثبت/منفی + تأثیر EPS + یعنی‌چی برای سهام‌دار.
// مولد Gemini است، در scripts/codal-watch.js محاسبه و در stock_reports ذخیره می‌شود.
export function AiVerdictBox({ verdict, t }: { verdict: { verdict: string; epsImpact: string; meaning: string }; t: Theme }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 14px', borderRadius: 12,
      marginBottom: 16, background: `${AI_ACCENT}0e`, border: `0.5px solid ${AI_ACCENT}35`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: AI_ACCENT, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: AI_ACCENT }}>خلاصه هوش مصنوعی</span>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text, lineHeight: 1.8 }}>{verdict.verdict}</div>
      <div style={{ fontSize: 12, color: t.text, lineHeight: 1.8 }}>{verdict.epsImpact}</div>
      <div style={{ fontSize: 11.5, color: t.muted, lineHeight: 1.8 }}>{verdict.meaning}</div>
    </div>
  )
}

// اسپارک‌لاین نرخ فروش — جدیدترین سمت چپ (هماهنگ با RTL)، با tooltip تاریخ+نرخ روی hover
export function Sparkline({ values, periods, color, w, h, t }: {
  values: (number | null)[]; periods: string[]; color: string; w: number; h: number; t: Theme
}) {
  const [hover, setHover] = useState<number | null>(null)
  const nums = values.filter((v): v is number => v !== null && v > 0)
  if (nums.length < 2) return null
  const min = Math.min(...nums), max = Math.max(...nums)
  const range = max - min || 1
  const n = values.length
  const x = (i: number) => (i / (n - 1)) * w   // قدیمی چپ، جدید راست
  const y = (v: number) => h - ((v - min) / range) * (h - 5) - 2.5
  // یک خط پیوسته از همه نقاط موجود — از روی ماه‌های خالی پل می‌زند (قطع نمی‌شود)
  const pres = values.map((v, i) => ({ v, i })).filter(p => p.v !== null && p.v > 0) as { v: number; i: number }[]
  const line = pres.map(p => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const fillPts = `${x(pres[0].i).toFixed(1)},${h} ${line} ${x(pres[pres.length - 1].i).toFixed(1)},${h}`
  const newest = pres[pres.length - 1]   // جدیدترین = بزرگ‌ترین اندیس در سمت راست
  const gid = `spk-${Math.random().toString(36).slice(2, 8)}`
  const hv = hover !== null ? values[hover] : null
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fillPts} fill={`url(#${gid})`} stroke="none" />
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        {hover !== null && hv !== null && (
          <line x1={x(hover)} y1={0} x2={x(hover)} y2={h} stroke={color} strokeWidth={0.8} strokeOpacity={0.4} strokeDasharray="2 2" />
        )}
        <circle cx={x(newest.i)} cy={y(newest.v)} r={2.8} fill={color} stroke={color} strokeWidth={3} strokeOpacity={0.25} />
        {hover !== null && hv !== null && <circle cx={x(hover)} cy={y(hv)} r={3.4} fill={color} stroke={t.panel} strokeWidth={1.5} />}
        {/* نواحی hover — کل ارتفاع هر ماه */}
        {pres.map(p => (
          <rect key={p.i} x={x(p.i) - w / (2 * (n - 1))} y={0} width={w / (n - 1)} height={h}
            fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHover(p.i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && hv !== null && (
        <div style={{
          position: 'absolute', left: x(hover), top: -6, transform: 'translate(-50%, -100%)',
          background: t.isDark ? 'rgba(2,6,14,0.96)' : 'rgba(255,255,255,0.98)',
          border: `0.5px solid ${color}66`, borderRadius: 8, padding: '5px 9px', whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 5, boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        }}>
          <div style={{ fontSize: 9.5, color: t.muted, marginBottom: 2 }}>{monthLabel(periods[hover])}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color }}>{rateFmt(hv)}</div>
        </div>
      )}
    </div>
  )
}

// ═══ پرتفوی شرکت سرمایه‌گذاری/هلدینگ — ترکیب دارایی، ارزش بازار (NAV)، خرید و فروش ماه ═══
const PIE_COLORS = ['#FACC15', '#38BDF8', '#A78BFA', '#34D399', '#F472B6', '#FB923C', '#60A5FA', '#F87171', '#94A3B8']

export function PortfolioSection({ months, t, isMobile }: { months: RMonth[]; t: Theme; isMobile: boolean }) {
  const last = months[months.length - 1]
  const prev = months.length > 1 ? months[months.length - 2] : null
  const navChg = growth(last.totalMv, prev?.totalMv ?? null)
  const gainPct = last.totalCost ? ((last.gain ?? 0) / last.totalCost) * 100 : null
  const maxNav = Math.max(...months.map(m => m.totalMv ?? 0), 1)

  const hs = (last.holdings ?? []).filter(h => (h.mv1 ?? 0) > 0).sort((a, b) => (b.mv1 ?? 0) - (a.mv1 ?? 0))
  const total = hs.reduce((s, h) => s + (h.mv1 ?? 0), 0) || 1
  const TOP = 8
  const slices = hs.length > TOP
    ? [...hs.slice(0, TOP).map(h => ({ name: h.name, v: h.mv1 ?? 0 })),
       { name: 'سایر دارایی‌ها', v: hs.slice(TOP).reduce((s, h) => s + (h.mv1 ?? 0), 0) }]
    : hs.map(h => ({ name: h.name, v: h.mv1 ?? 0 }))

  // خرید و فروش طی ماه — تغییرات تعداد سهام
  const all = last.holdings ?? []
  const buys = all.filter(h => (h.dq ?? 0) > 0).sort((a, b) => (b.dc ?? 0) - (a.dc ?? 0)).slice(0, 5)
  const sells = all.filter(h => (h.dq ?? 0) < 0).sort((a, b) => (a.dc ?? 0) - (b.dc ?? 0)).slice(0, 5)

  // دونات
  const R = isMobile ? 62 : 78, SW = isMobile ? 22 : 28, C = R + SW / 2 + 2
  const circ = 2 * Math.PI * R
  let acc = 0

  return (
    <SectionCard title="پرتفوی سرمایه‌گذاری" badge={`${months.length.toLocaleString('fa-IR')} ماه`} accent={M_ACCENT} t={t}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <Chip t={t} label={`ارزش بازار پرتفوی ${monthLabel(last.period)}`} value={mrial(last.totalMv)} color={M_ACCENT} />
        <Chip t={t} label="نسبت به ماه قبل" value={gPct(navChg)} color={navChg === null ? undefined : navChg >= 0 ? GREEN : RED} />
        <Chip t={t} label="بهای تمام‌شده" value={mrial(last.totalCost)} />
        <Chip t={t} label="سود تحقق‌نیافته" value={mrial(last.gain)} color={(last.gain ?? 0) >= 0 ? GREEN : RED} />
        <Chip t={t} label="بازده پرتفوی" value={gainPct === null ? '—' : `${gainPct.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`} color={(gainPct ?? 0) >= 0 ? GREEN : RED} />
      </div>

      {/* روند ارزش بازار پرتفوی */}
      <div style={{ fontSize: 11, color: t.muted, marginBottom: 10 }}>روند ارزش بازار پرتفوی (میلیارد تومان)</div>
      <div style={{ display: 'flex', direction: 'ltr', alignItems: 'flex-end', gap: isMobile ? 3 : 6, height: 110, minWidth: 0, marginBottom: 6 }}>
        {months.map((m, i) => {
          const h = Math.max(((m.totalMv ?? 0) / maxNav) * 100, 2)
          const isLast = i === months.length - 1
          return (
            <div key={m.period} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              <div title={`${monthLabel(m.period)}: ${mrial(m.totalMv)}`} style={{
                width: '100%', maxWidth: 34, height: `${h}%`, borderRadius: '4px 4px 2px 2px',
                background: isLast ? M_ACCENT : `${M_ACCENT}55`,
              }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25 }}>
                <div style={{ fontSize: isMobile ? 7.5 : 9, color: isLast ? t.text : t.muted, whiteSpace: 'nowrap' }}>
                  {monthLabel(m.period).split(' ')[0].slice(0, isMobile ? 3 : 8)}
                </div>
                <div style={{ fontSize: isMobile ? 6.5 : 8, color: isLast ? M_ACCENT : t.muted, opacity: isLast ? 1 : 0.65 }}>
                  {(monthLabel(m.period).split(' ')[1] || '').slice(-2)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ترکیب پرتفوی */}
      {slices.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: t.muted, margin: '20px 0 12px' }}>ترکیب پرتفوی بورسی</div>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: isMobile ? 16 : 26 }}>
            <svg width={C * 2} height={C * 2} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
              {slices.map((s, i) => {
                const frac = s.v / total
                const dash = frac * circ
                const el = (
                  <circle key={s.name} cx={C} cy={C} r={R} fill="none"
                    stroke={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={SW}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-acc} />
                )
                acc += dash
                return el
              })}
            </svg>
            <div style={{ flex: 1, minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {slices.map((s, i) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: t.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span style={{ fontSize: 10.5, color: t.muted, flexShrink: 0 }}>{mrial(s.v)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0, minWidth: 40, textAlign: 'left' }}>
                    {((s.v / total) * 100).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* خرید و فروش طی ماه */}
      {(buys.length > 0 || sells.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginTop: 22 }}>
          {[['خرید طی ماه', buys, GREEN], ['فروش طی ماه', sells, RED]].map(([title, list, color]) => {
            const rows = list as RHolding[]
            if (!rows.length) return null
            return (
              <div key={title as string} style={{
                background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,46,0.03)',
                border: `0.5px solid ${t.line}`, borderRadius: 12, padding: '12px 14px', minWidth: 0,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: color as string, marginBottom: 9 }}>{title as string}</div>
                {rows.map(h => (
                  <div key={h.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: t.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                    <span style={{ fontSize: 10, color: t.muted, flexShrink: 0 }}>
                      {Math.abs(h.dq ?? 0).toLocaleString('fa-IR')} سهم
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: color as string, flexShrink: 0, minWidth: 66, textAlign: 'left' }}>
                      {mrial(Math.abs(h.dc ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

// ═══ گزارش فعالیت ماهانه — تولیدی (فروش محصولات)، بانک (درآمد + هزینه)، خدماتی (فقط درآمد) ═══
export function MonthlySection({ months, t, isMobile }: { months: RMonth[]; t: Theme; isMobile: boolean }) {
  const last = months[months.length - 1]
  const prev = months.length > 1 ? months[months.length - 2] : null
  const isBank = last.kind === 'bank'
  // فرم‌های بدون محصول (بانک/خدماتی) «درآمد» گزارش می‌کنند، نه «فروش»
  const isProduction = (last.kind ?? 'production') === 'production'
  const noun = isProduction ? 'فروش' : 'درآمد'
  const mom = growth(last.month, prev?.month ?? null)
  const yoy = monthlyYoY(months, last)
  const maxM = Math.max(...months.map(m => m.month ?? 0), 1)

  // بانک: سود واقعی در تراز است، نه در «فروش» — تراز ماه و کارایی (Cost/Income)
  const bankNet = isBank && last.month != null && last.expense_m != null ? last.month - last.expense_m : null
  const costIncome = isBank && last.expense_m != null && last.month ? (last.expense_m / last.month) * 100 : null

  const topProducts = (last.products ?? [])
    .filter(p => (p.amount_m ?? 0) > 0)
    .sort((a, b) => (b.amount_m ?? 0) - (a.amount_m ?? 0))
    .slice(0, 5)
  const maxP = Math.max(...topProducts.map(p => p.amount_m ?? 0), 1)

  // روند نرخ فروش ۳ محصول اصلی در طول ماه‌ها (بانک‌ها نرخ ندارند → خالی و مخفی)
  const rateNames = (last.products ?? [])
    .filter(p => (p.amount_m ?? 0) > 0 && (p.rate_m ?? 0) > 0)
    .sort((a, b) => (b.amount_m ?? 0) - (a.amount_m ?? 0))
    .slice(0, 3)
    .map(p => p.name)
  const rateSeries = rateNames.map(name => {
    const vals = months.map(m => {
      const pr = (m.products ?? []).find(x => x.name === name)
      return pr && pr.rate_m ? pr.rate_m : null
    })
    const nums = vals.filter((v): v is number => v !== null && v > 0)
    const first = nums[0] ?? null
    const lastV = nums[nums.length - 1] ?? null
    return { name, vals, periods: months.map(m => m.period), latest: lastV, chg: growth(lastV, first) }
  }).filter(s => s.vals.filter(v => v).length >= 2)

  return (
    <SectionCard title="گزارش فعالیت ماهانه" badge={`${months.length.toLocaleString('fa-IR')} ماه`} accent={M_ACCENT} t={t}>
      {last.verdict && <AiVerdictBox verdict={last.verdict} t={t} />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <Chip t={t} label={`${noun} ${monthLabel(last.period)}`} value={mrial(last.month)} color={M_ACCENT} />
        <Chip t={t} label="نسبت به ماه قبل" value={gPct(mom)} color={mom === null ? undefined : mom >= 0 ? GREEN : RED} />
        <Chip t={t} label={`${noun} تجمعی سال مالی`} value={mrial(last.cum)} />
        {/* فرم خدماتی ستون «تجمعی دوره مشابه سال قبل» ندارد → مقایسه با همان ماه سال قبل */}
        {yoy !== null && (
          <Chip
            t={t}
            label={yoy.basis === 'cum' ? 'رشد تجمعی نسبت به سال قبل' : 'رشد نسبت به ماه مشابه سال قبل'}
            value={gPct(yoy.pct)}
            color={yoy.pct >= 0 ? GREEN : RED}
          />
        )}
        {isBank && <>
          <Chip t={t} label="هزینه محقق‌شده ماه" value={mrial(last.expense_m)} color={RED} />
          {bankNet !== null && <Chip t={t} label="تراز درآمد منهای هزینه" value={mrial(bankNet)} color={bankNet >= 0 ? GREEN : RED} />}
          {costIncome !== null && <Chip t={t} label="نسبت هزینه به درآمد" value={`${costIncome.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`} color={costIncome <= 70 ? GREEN : costIncome > 90 ? RED : undefined} />}
        </>}
      </div>

      {/* روند فروش/درآمد ماهانه */}
      <div style={{ fontSize: 11, color: t.muted, marginBottom: 10 }}>روند {noun} ماهانه (میلیارد تومان)</div>
      <div style={{ display: 'flex', direction: 'ltr', alignItems: 'flex-end', gap: isMobile ? 3 : 6, height: 120, minWidth: 0 }}>
        {months.map((m, i) => {
          const h = Math.max(((m.month ?? 0) / maxM) * 100, 2)
          const isLast = i === months.length - 1
          return (
            <div key={m.period} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              {!isMobile && (
                <div style={{ fontSize: 8.5, color: t.muted, whiteSpace: 'nowrap' }}>
                  {Math.round((m.month ?? 0) / 1e4).toLocaleString('fa-IR')}
                </div>
              )}
              <div title={`${monthLabel(m.period)}: ${mrial(m.month)}`} style={{
                width: '100%', maxWidth: 34, height: `${h}%`, borderRadius: '4px 4px 2px 2px',
                background: isLast ? M_ACCENT : `${M_ACCENT}55`,
              }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25 }}>
                <div style={{ fontSize: isMobile ? 7.5 : 9, color: isLast ? t.text : t.muted, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>
                  {monthLabel(m.period).split(' ')[0].slice(0, isMobile ? 3 : 8)}
                </div>
                <div style={{ fontSize: isMobile ? 6.5 : 8, color: isLast ? M_ACCENT : t.muted, opacity: isLast ? 1 : 0.65, whiteSpace: 'nowrap' }}>
                  {(monthLabel(m.period).split(' ')[1] || '').slice(-2)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* محصولات برتر آخرین ماه */}
      {topProducts.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: t.muted, margin: '20px 0 10px' }}>
            {isProduction ? 'محصولات برتر' : 'اجزای درآمد'} {monthLabel(last.period)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topProducts.map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 11.5, color: t.text, flex: '0 0 auto', width: isMobile ? 120 : 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                <div style={{ flex: 1, height: 7, borderRadius: 4, background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,30,46,0.06)', overflow: 'hidden' }}>
                  <div style={{ width: `${((p.amount_m ?? 0) / maxP) * 100}%`, height: '100%', borderRadius: 4, background: M_ACCENT }} />
                </div>
                <span style={{ fontSize: 10.5, color: t.muted, flexShrink: 0, minWidth: 74, textAlign: 'left' }}>
                  {mrial(p.amount_m)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* روند نرخ فروش محصولات اصلی */}
      {rateSeries.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: t.muted, margin: '22px 0 12px' }}>
            روند نرخ فروش محصولات اصلی (میلیون تومان بر واحد)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {rateSeries.map(s => {
              const trend = s.chg === null ? t.muted : s.chg >= 0 ? GREEN : RED
              return (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, minWidth: 0 }}>
                  <div style={{ flex: '0 0 auto', width: isMobile ? 96 : 150, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ fontSize: 9.5, color: t.muted }}>نرخ فعلی: {rateFmt(s.latest)}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                    <Sparkline values={s.vals} periods={s.periods} color={trend} w={isMobile ? 130 : 320} h={34} t={t} />
                  </div>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    fontSize: 10.5, fontWeight: 700, flexShrink: 0, minWidth: 56, justifyContent: 'flex-start',
                    color: trend,
                  }}>
                    {s.chg !== null && <ToneIcon tone={s.chg >= 0 ? 'pos' : 'neg'} size={12} />}
                    {gPct(s.chg)}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </SectionCard>
  )
}

// ═══ گزارش‌های فصلی (صورت سود و زیان دوره‌ای) ═══
export function QuarterlyFinSection({ quarters, t, isMobile }: { quarters: RQuarter[]; t: Theme; isMobile: boolean }) {
  const last = quarters[quarters.length - 1]
  const revYoy = growth(last.revenue, last.revenue_ly)
  const netYoy = growth(last.net, last.net_ly)
  const grossMargin = last.revenue ? ((last.gross ?? 0) / last.revenue) * 100 : null
  const netMargin = last.revenue ? ((last.net ?? 0) / last.revenue) * 100 : null

  const maxRev = Math.max(...quarters.map(q => q.revenue ?? 0), 1)

  const durLabel = (q: RQuarter) => `${q.months.toLocaleString('fa-IR')} ماهه منتهی به ${q.period}`

  return (
    <SectionCard title="گزارش‌های فصلی" badge={`${quarters.length.toLocaleString('fa-IR')} دوره`} accent={Q_ACCENT} t={t}>
      <div style={{ fontSize: 11, color: t.muted, marginBottom: 12 }}>
        آخرین گزارش: {durLabel(last)} {last.audited ? '(حسابرسی شده)' : '(حسابرسی نشده)'}
      </div>
      {last.verdict && <AiVerdictBox verdict={last.verdict} t={t} />}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <Chip t={t} label="درآمد عملیاتی دوره" value={mrial(last.revenue)} color={Q_ACCENT} />
        <Chip t={t} label="رشد درآمد نسبت به دوره مشابه" value={gPct(revYoy)} color={revYoy === null ? undefined : revYoy >= 0 ? GREEN : RED} />
        <Chip t={t} label="سود خالص دوره" value={mrial(last.net)} color={(last.net ?? 0) >= 0 ? GREEN : RED} />
        <Chip t={t} label="رشد سود خالص" value={gPct(netYoy)} color={netYoy === null ? undefined : netYoy >= 0 ? GREEN : RED} />
        <Chip t={t} label="حاشیه سود ناخالص" value={grossMargin === null ? '—' : `${grossMargin.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`} />
        <Chip t={t} label="حاشیه سود خالص" value={netMargin === null ? '—' : `${netMargin.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`} />
        <Chip t={t} label="سود هر سهم (EPS)" value={last.eps === null ? '—' : `${last.eps.toLocaleString('fa-IR')} ریال`} />
      </div>

      {/* جدول دوره‌ها — در موبایل عرض جدول از صفحه بیشتر است؛ fade لبه چپ نشانه‌ی قابل‌کشیدن‌بودن (RTL: محتوای بریده سمت چپ) */}
      <div style={{ position: 'relative' }}>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? 11 : 12, whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ color: t.muted, fontSize: 10 }}>
              {['دوره', 'درآمد', 'رشد درآمد', 'سود ناخالص', 'سود خالص', 'رشد سود', 'حاشیه خالص'].map(h => (
                <th key={h} style={{ textAlign: 'right', padding: '9px 12px', fontWeight: 500, borderBottom: `1px solid ${t.line}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...quarters].reverse().map(q => {
              const rg = growth(q.revenue, q.revenue_ly)
              const ng = growth(q.net, q.net_ly)
              const nm = q.revenue ? ((q.net ?? 0) / q.revenue) * 100 : null
              return (
                <tr key={`${q.period}-${q.months}`}>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: t.text }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 42, height: 5, borderRadius: 3, flexShrink: 0,
                        background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.07)', overflow: 'hidden',
                      }}>
                        <div style={{ width: `${((q.revenue ?? 0) / maxRev) * 100}%`, height: '100%', background: Q_ACCENT, borderRadius: 3 }} />
                      </div>
                      {durLabel(q)}
                    </div>
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: t.text, fontWeight: 600 }}>{mrial(q.revenue)}</td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: rg === null ? t.muted : rg >= 0 ? GREEN : RED }}>{gPct(rg)}</td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: t.text }}>{mrial(q.gross)}</td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: (q.net ?? 0) >= 0 ? GREEN : RED, fontWeight: 600 }}>{mrial(q.net)}</td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: ng === null ? t.muted : ng >= 0 ? GREEN : RED }}>{gPct(ng)}</td>
                  <td style={{ padding: '9px 12px', borderBottom: `1px solid ${t.line}`, color: t.muted }}>
                    {nm === null ? '—' : `${nm.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        {isMobile && (
          <div aria-hidden style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: 28, pointerEvents: 'none',
            background: `linear-gradient(to left, transparent, ${t.isDark ? 'rgba(10,18,30,0.9)' : 'rgba(255,255,255,0.9)'})`,
          }} />
        )}
      </div>
    </SectionCard>
  )
}

type Holder = { name: string; percent: number; percentChange: number; status: 'in' | 'out' | 'hold' }
type ShareholdersPayload = { date: string; holders: Holder[] }

// سهامداران عمده — از /api/stock-shareholders (پرشده روزی یک‌بار بعد از بسته‌شدن بازار)
export function ShareholdersSection({ symbol, t, limit = 10, emptyMessage }: {
  symbol: string; t: Theme; limit?: number; emptyMessage?: string
}) {
  const [data, setData] = useState<ShareholdersPayload | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setData(null)
    setFailed(false)
    fetch(`/api/stock-shareholders/${encodeURIComponent(symbol.replace(/\s+/g, '-'))}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setFailed(true))
  }, [symbol])

  if (failed || (data && data.holders.length === 0)) {
    return emptyMessage ? (
      <div style={{ fontSize: 12.5, color: t.muted, padding: '30px 0', textAlign: 'center' }}>{emptyMessage}</div>
    ) : null
  }
  if (!data) return null

  const top = data.holders.slice(0, limit)
  const exits = data.holders.filter(h => h.status === 'out')

  return (
    <SectionCard title="سهامداران عمده" badge={data.date} accent={H_ACCENT} t={t}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {top.map((h, i) => (
          <div key={h.name} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
            background: i % 2 === 0 ? (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,46,0.02)') : 'transparent',
          }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: t.muted, width: 16, flexShrink: 0, fontFamily: 'system-ui, sans-serif' }}>{(i + 1).toLocaleString('fa-IR')}</span>
            <span style={{
              fontSize: 12, color: t.text, flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{h.name}</span>
            {h.status === 'in' && (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#22c55e', background: '#22c55e1c', borderRadius: 6, padding: '2px 6px', flexShrink: 0 }}>سهامدار تازه</span>
            )}
            <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text, flexShrink: 0, fontFamily: 'system-ui, sans-serif' }}>
              {h.percent.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪
            </span>
            {Math.abs(h.percentChange) >= 0.01 && (
              <span style={{
                fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: 'system-ui, sans-serif',
                color: h.percentChange > 0 ? GREEN : RED,
              }}>
                {h.percentChange > 0 ? '▲' : '▼'} {Math.abs(h.percentChange).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪
              </span>
            )}
          </div>
        ))}
        {exits.length > 0 && (
          <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
            امروز {exits.length.toLocaleString('fa-IR')} سهامدار عمده به‌طور کامل خارج شد: {exits.map(h => h.name).join('، ')}
          </div>
        )}
        <div style={{ fontSize: 10, color: t.muted, marginTop: 4 }}>
          مقایسه مالکیت سهامداران عمده در ابتدا و انتهای معاملات {data.date} — منبع: تابلوی معاملات تسهیم (تسه‌مک)
        </div>
      </div>
    </SectionCard>
  )
}
