'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'

const fmt = (n: number | null, decimals = 0) =>
  n == null ? '—' : Math.round(n).toLocaleString('fa-IR', { maximumFractionDigits: decimals })

const fmtUsd = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtPct = (n: number | null) => {
  if (n == null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(2)}٪`
}

const bubbleColor = (n: number | null) => {
  if (n == null) return '#5A7088'
  if (n > 0.05) return '#FF4D6A'
  if (n > 0.01) return '#F59E0B'
  if (n < -0.01) return '#00E5A0'
  return '#A0B4C8'
}

const bubbleLabel = (n: number | null) => {
  if (n == null) return '—'
  if (n > 0.1) return 'حباب شدید'
  if (n > 0.05) return 'حباب زیاد'
  if (n > 0.01) return 'حباب ملایم'
  if (n < -0.05) return 'تخفیف زیاد'
  if (n < -0.01) return 'تخفیف ملایم'
  return 'منصفانه'
}

const changeColor = (n: number | null) => {
  if (n == null) return '#5A7088'
  return n > 0 ? '#00E5A0' : n < 0 ? '#FF4D6A' : '#5A7088'
}

const DEFAULT_CONSTANTS = {
  gramsPerOz: 31.103431,
  AED_PER_USD: 3.6732,
  coinPurity: 22,
  mithqalW: 4.6055,
  fullCoinW: 8.13,
  halfCoinW: 4.066,
  quarterCoinW: 2.033,
  mintCost: 5000,
}

export default function GoldAnalysisPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [constants, setConstants] = useState(DEFAULT_CONSTANTS)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/gold-analysis')
      const json = await res.json()
      setData(json)
      setLastFetch(new Date())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: d }) => setIsAdmin(d.user != null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setIsAdmin(s?.user != null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Client-side recalculation — runs when constants change or data refreshes
  const derived = useMemo(() => {
    if (!data?.inputs) return null
    const { goldUsd, dollarT, dirhamT } = data.inputs
    const mkt = {
      gram24: data.gram?.market24 ?? null,
      gram18: data.gram?.market18 ?? null,
      mesghal: data.mesghal?.market ?? null,
      half: data.coins?.half?.market ?? null,
      quarter: data.coins?.quarter?.market ?? null,
      full: data.coins?.full?.market ?? null,
    }
    const c = constants

    const dollarViaDirham = dirhamT != null ? dirhamT * c.AED_PER_USD : null
    const bubbleDollar = dollarT && dollarViaDirham ? (dollarT - dollarViaDirham) / dollarViaDirham : null

    const fairGram24 = goldUsd && dollarT ? (goldUsd * dollarT) / c.gramsPerOz : null
    const fairGram18 = fairGram24 ? fairGram24 * (18 / 24) : null
    const fairGram22 = fairGram24 ? fairGram24 * (c.coinPurity / 24) : null
    const fairMesghal = fairGram18 ? fairGram18 * c.mithqalW : null
    const fairFull = fairGram22 ? fairGram22 * c.fullCoinW + c.mintCost : null
    const fairHalf = fairGram22 ? fairGram22 * c.halfCoinW + c.mintCost : null
    const fairQuarter = fairGram22 ? fairGram22 * c.quarterCoinW + c.mintCost : null

    const bub = (m: number | null, f: number | null) => m != null && f != null ? (m - f) / f : null
    const imp = (mT: number | null, oz: number | null, ozFraction: number) =>
      mT && oz ? (mT / ozFraction) / oz : null

    return {
      derived: { dollarViaDirham, bubbleDollar, bubbleUsdt: bubbleDollar, AED_PER_USD: c.AED_PER_USD },
      gram: {
        fair24: fairGram24, market24: mkt.gram24, bubble24: bub(mkt.gram24, fairGram24),
        impliedDollar24: imp(mkt.gram24, goldUsd, 1 / c.gramsPerOz),
        fair18: fairGram18, market18: mkt.gram18, bubble18: bub(mkt.gram18, fairGram18),
        impliedDollar18: imp(mkt.gram18, goldUsd, (18 / 24) / c.gramsPerOz),
      },
      mesghal: {
        fair: fairMesghal, market: mkt.mesghal, bubble: bub(mkt.mesghal, fairMesghal),
        impliedDollar: imp(mkt.mesghal, goldUsd, c.mithqalW * (18 / 24) / c.gramsPerOz),
        changePct: data.mesghal?.changePct ?? null,
      },
      coins: {
        full: { fair: fairFull, market: mkt.full, bubble: bub(mkt.full, fairFull), weight: c.fullCoinW },
        half: {
          fair: fairHalf, market: mkt.half, bubble: bub(mkt.half, fairHalf), weight: c.halfCoinW,
          impliedDollar: imp(mkt.half, goldUsd, c.halfCoinW * (c.coinPurity / 24) / c.gramsPerOz),
          changePct: data.coins?.half?.changePct ?? null,
        },
        quarter: {
          fair: fairQuarter, market: mkt.quarter, bubble: bub(mkt.quarter, fairQuarter), weight: c.quarterCoinW,
          impliedDollar: imp(mkt.quarter, goldUsd, c.quarterCoinW * (c.coinPurity / 24) / c.gramsPerOz),
          changePct: data.coins?.quarter?.changePct ?? null,
        },
      },
    }
  }, [data, constants])

  const bg = '#060B14'
  const panel = 'rgba(10,18,30,0.88)'
  const border = 'rgba(0,200,255,0.12)'
  const accent = '#00C8FF'
  const green = '#00E5A0'
  const red = '#FF4D6A'
  const muted = '#5A7088'
  const text = '#E8F4FF'

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>

      {/* Page header */}
      <div style={{
        borderBottom: `1px solid ${border}`,
        background: 'rgba(10,18,30,0.6)',
        backdropFilter: 'blur(12px)',
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/analysis" style={{ color: muted, textDecoration: 'none', fontSize: 12 }}>
            تحلیل
          </a>
          <span style={{ color: muted, fontSize: 10 }}>›</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🥇</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: text }}>تحلیل طلا</div>
              <div style={{ fontSize: 10, color: muted }}>
                {data?.lastMarketDate
                  ? `آخرین روز بازار: ${data.lastMarketDate}`
                  : 'در حال بارگذاری...'}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastFetch && (
            <span style={{ fontSize: 10, color: muted }}>
              بروز: {lastFetch.toLocaleTimeString('fa-IR')}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
              background: `rgba(0,200,255,0.08)`, border: `0.5px solid ${accent}44`,
              color: accent, fontFamily: 'inherit',
            }}
          >
            {loading ? '...' : '↻ بروزرسانی'}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Row 1: Live Inputs ── */}
        <Section title="ورودی‌های روزانه" subtitle="داده زنده از API" badge="LIVE" badgeColor={green}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <InputCard
              icon="🪙" label="انس طلا" unit="دلار"
              value={fmtUsd(data?.inputs?.goldUsd)}
              change={data?.inputs?.goldUsdChange}
              accent={accent}
            />
            <InputCard
              icon="🥈" label="انس نقره" unit="دلار"
              value={fmtUsd(data?.inputs?.silverUsd)}
              accent="#C0C0D0"
            />
            <InputCard
              icon="💵" label="ارز بازار" unit="تومان"
              value={fmt(data?.inputs?.dollarT)}
              change={data?.inputs?.dollarChange}
              accent={green}
            />
            <InputCard
              icon="🇦🇪" label="قیمت درهم" unit="تومان"
              value={fmt(data?.inputs?.dirhamT)}
              accent="#F59E0B"
            />
            <InputCard
              icon="₮" label="تتر (USDT)" unit="تومان"
              value={fmt(data?.inputs?.usdtT)}
              note="≈ ارز بازار"
              accent={accent}
            />
          </div>
        </Section>

        {/* ── Row 2: Dollar Analysis ── */}
        <Section title="تحلیل نرخ ارز" subtitle="مقایسه روش‌های قیمت‌گذاری دلار">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <DollarCard
              label="دلار با درهم"
              formula={`درهم × ${constants.AED_PER_USD}`}
              value={fmt(derived?.derived?.dollarViaDirham ?? null)}
              unit="تومان"
              accent={accent}
            />
            <DollarCard
              label="حباب دلار بازار"
              formula="دلار بازار ÷ دلار درهم"
              value={fmtPct(derived?.derived?.bubbleDollar ?? null)}
              color={bubbleColor(derived?.derived?.bubbleDollar ?? null)}
              desc={bubbleLabel(derived?.derived?.bubbleDollar ?? null)}
              accent={accent}
            />
            <DollarCard
              label="حباب تتر"
              formula="تتر ÷ دلار درهم"
              value={fmtPct(derived?.derived?.bubbleUsdt ?? null)}
              color={bubbleColor(derived?.derived?.bubbleUsdt ?? null)}
              desc={bubbleLabel(derived?.derived?.bubbleUsdt ?? null)}
              accent={accent}
            />
          </div>
        </Section>

        {/* ── Row 3: Gold Table ── */}
        <Section title="گرم و مثقال طلا" subtitle="قیمت واقعی بر اساس انس جهانی vs قیمت بازار ایران">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['نوع', 'قیمت واقعی (تومان)', 'قیمت بازار (تومان)', 'حباب', 'ارزیابی', 'نرخ دلار ضمنی'].map(h => (
                    <th key={h} style={{
                      color: muted, fontWeight: 500, textAlign: 'right',
                      padding: '10px 12px', borderBottom: `0.5px solid ${border}`, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <GoldRow
                  label="هر گرم ۲۴ عیار"
                  fair={derived?.gram?.fair24}
                  market={derived?.gram?.market24}
                  bubble={derived?.gram?.bubble24}
                  impliedDollar={derived?.gram?.impliedDollar24}
                  border={border} muted={muted} text={text}
                />
                <GoldRow
                  label="هر گرم ۱۸ عیار"
                  fair={derived?.gram?.fair18}
                  market={derived?.gram?.market18}
                  bubble={derived?.gram?.bubble18}
                  impliedDollar={derived?.gram?.impliedDollar18}
                  border={border} muted={muted} text={text}
                />
                <GoldRow
                  label="مثقال طلا (۱۸ عیار)"
                  fair={derived?.mesghal?.fair}
                  market={derived?.mesghal?.market}
                  bubble={derived?.mesghal?.bubble}
                  impliedDollar={derived?.mesghal?.impliedDollar}
                  marketChange={derived?.mesghal?.changePct}
                  border={border} muted={muted} text={text}
                />
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Row 4: Coins Table ── */}
        <Section title="سکه‌های طلا" subtitle="وزن عیار ۲۲ + هزینه ضرب">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['سکه', 'وزن (گرم)', 'قیمت واقعی (تومان)', 'قیمت بازار (تومان)', 'حباب', 'ارزیابی'].map(h => (
                    <th key={h} style={{
                      color: muted, fontWeight: 500, textAlign: 'right',
                      padding: '10px 12px', borderBottom: `0.5px solid ${border}`, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CoinRow
                  label="تمام سکه" weight={derived?.coins?.full?.weight ?? 8.13}
                  fair={derived?.coins?.full?.fair}
                  market={derived?.coins?.full?.market}
                  bubble={derived?.coins?.full?.bubble}
                  marketNote="≈ نیم × ۲"
                  border={border} muted={muted} text={text}
                />
                <CoinRow
                  label="نیم سکه" weight={derived?.coins?.half?.weight ?? 4.066}
                  fair={derived?.coins?.half?.fair}
                  market={derived?.coins?.half?.market}
                  bubble={derived?.coins?.half?.bubble}
                  marketChange={derived?.coins?.half?.changePct}
                  border={border} muted={muted} text={text}
                />
                <CoinRow
                  label="ربع سکه" weight={derived?.coins?.quarter?.weight ?? 2.033}
                  fair={derived?.coins?.quarter?.fair}
                  market={derived?.coins?.quarter?.market}
                  bubble={derived?.coins?.quarter?.bubble}
                  marketChange={derived?.coins?.quarter?.changePct}
                  border={border} muted={muted} text={text}
                />
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Row 5: Constants — Admin only ── */}
        {isAdmin && (
          <AdminConstants
            constants={constants}
            onChange={setConstants}
            border={border}
            muted={muted}
            text={text}
            accent={accent}
          />
        )}

        <div style={{ textAlign: 'center', fontSize: 10, color: muted, paddingBottom: 24 }}>
          داده از TGJU · بروزرسانی خودکار هر ۵ دقیقه · تمام قیمت‌ها به تومان
          {isAdmin && <span style={{ marginRight: 8, color: accent }}>· حالت ادمین فعال</span>}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
        input[type=number] { -moz-appearance: textfield; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </main>
  )
}

// ──────────────── Sub-components ────────────────

function Section({ title, subtitle, badge, badgeColor, children }: any) {
  const border = 'rgba(0,200,255,0.12)'
  return (
    <div style={{
      background: 'rgba(10,18,30,0.6)', border: `0.5px solid ${border}`,
      borderRadius: 16, overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: `0.5px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#E8F4FF' }}>{title}</span>
            {badge && (
              <span style={{
                fontSize: 9, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                background: `${badgeColor}22`, border: `0.5px solid ${badgeColor}66`,
                color: badgeColor, fontFamily: 'system-ui',
              }}>{badge}</span>
            )}
          </div>
          {subtitle && <div style={{ fontSize: 10, color: '#5A7088', marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  )
}

function InputCard({ icon, label, unit, value, change, note, accent }: any) {
  return (
    <div style={{
      background: 'rgba(0,200,255,0.03)', border: '0.5px solid rgba(0,200,255,0.1)',
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 11, color: '#5A7088' }}>{label}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent, fontFamily: 'system-ui', lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: '#5A7088' }}>{unit}</span>
        {change != null && (
          <span style={{ fontSize: 10, color: changeColor(change), fontFamily: 'system-ui' }}>
            {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}٪
          </span>
        )}
        {note && <span style={{ fontSize: 10, color: '#5A7088' }}>{note}</span>}
      </div>
    </div>
  )
}

function DollarCard({ label, formula, value, unit, color, desc, accent }: any) {
  const c = color ?? accent ?? '#00C8FF'
  return (
    <div style={{
      background: 'rgba(0,200,255,0.03)', border: '0.5px solid rgba(0,200,255,0.1)',
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: '#5A7088', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: c, fontFamily: 'system-ui', marginBottom: 4 }}>
        {value}
        {unit && <span style={{ fontSize: 11, color: '#5A7088', marginRight: 4 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 10, color: '#3A5068' }}>{formula}</div>
      {desc && <div style={{ fontSize: 10, color: c, marginTop: 4, fontWeight: 600 }}>{desc}</div>}
    </div>
  )
}

function GoldRow({ label, fair, market, bubble, impliedDollar, marketChange, border, muted, text }: any) {
  const bc = bubbleColor(bubble)
  return (
    <tr style={{ borderBottom: `0.5px solid ${border}` }}>
      <td style={{ padding: '10px 12px', color: text, fontWeight: 500 }}>{label}</td>
      <td style={{ padding: '10px 12px', color: '#A0B4C8', fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>
        {fmt(fair)}
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <div style={{ color: text, fontFamily: 'system-ui' }}>{fmt(market)}</div>
        {marketChange != null && (
          <div style={{ fontSize: 10, color: changeColor(marketChange) }}>
            {marketChange > 0 ? '▲' : '▼'} {Math.abs(marketChange).toFixed(2)}٪
          </div>
        )}
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <span style={{
          display: 'inline-block', fontSize: 11, fontWeight: 700, color: bc,
          background: `${bc}18`, borderRadius: 4, padding: '2px 8px', fontFamily: 'system-ui',
        }}>
          {fmtPct(bubble)}
        </span>
      </td>
      <td style={{ padding: '10px 12px', color: bc, fontSize: 11, fontWeight: 600 }}>
        {bubbleLabel(bubble)}
      </td>
      <td style={{ padding: '10px 12px', color: muted, fontFamily: 'system-ui', fontSize: 11 }}>
        {impliedDollar ? Math.round(impliedDollar).toLocaleString('fa-IR') : '—'}
      </td>
    </tr>
  )
}

function CoinRow({ label, weight, fair, market, bubble, marketChange, marketNote, border, muted, text }: any) {
  const bc = bubbleColor(bubble)
  const hasEstimate = marketNote != null && market != null
  return (
    <tr style={{ borderBottom: `0.5px solid ${border}` }}>
      <td style={{ padding: '10px 12px', color: text, fontWeight: 500 }}>{label}</td>
      <td style={{ padding: '10px 12px', color: muted, fontFamily: 'system-ui' }}>
        {weight.toLocaleString('fa-IR', { maximumFractionDigits: 3 })}
      </td>
      <td style={{ padding: '10px 12px', color: '#A0B4C8', fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>
        {fmt(fair)}
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        {market != null ? (
          <div>
            <div style={{ color: text, fontFamily: 'system-ui' }}>{fmt(market)}</div>
            {hasEstimate && (
              <div style={{ fontSize: 9, color: muted }}>{marketNote}</div>
            )}
            {marketChange != null && (
              <div style={{ fontSize: 10, color: changeColor(marketChange) }}>
                {marketChange > 0 ? '▲' : '▼'} {Math.abs(marketChange).toFixed(2)}٪
              </div>
            )}
          </div>
        ) : (
          <span style={{ color: muted, fontSize: 11 }}>—</span>
        )}
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        {bubble != null ? (
          <span style={{
            display: 'inline-block', fontSize: 11, fontWeight: 700, color: bc,
            background: `${bc}18`, borderRadius: 4, padding: '2px 8px', fontFamily: 'system-ui',
          }}>
            {fmtPct(bubble)}
          </span>
        ) : <span style={{ color: muted }}>—</span>}
      </td>
      <td style={{ padding: '10px 12px', color: bc, fontSize: 11, fontWeight: 600 }}>
        {bubbleLabel(bubble)}
      </td>
    </tr>
  )
}

const CONST_LABELS: Record<string, string> = {
  gramsPerOz: 'گرم در هر انس',
  AED_PER_USD: 'نرخ درهم در برابر دلار',
  coinPurity: 'عیار سکه',
  mithqalW: 'وزن مثقال (گرم)',
  fullCoinW: 'وزن تمام سکه (گرم)',
  halfCoinW: 'وزن نیم سکه (گرم)',
  quarterCoinW: 'وزن ربع سکه (گرم)',
  mintCost: 'هزینه ضرب (تومان)',
}

function AdminConstants({ constants, onChange, border, muted, text, accent }: any) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(constants)

  const handleApply = () => {
    onChange(local)
    setEditing(false)
  }

  const handleReset = () => {
    setLocal(DEFAULT_CONSTANTS)
    onChange(DEFAULT_CONSTANTS)
  }

  return (
    <div style={{
      background: 'rgba(10,18,30,0.6)', border: `0.5px solid rgba(0,200,255,0.2)`,
      borderRadius: 16, overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: `0.5px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: text }}>ثوابت محاسباتی</span>
            <span style={{
              fontSize: 9, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
              background: 'rgba(0,200,255,0.12)', border: `0.5px solid ${accent}44`,
              color: accent, fontFamily: 'system-ui',
            }}>ADMIN</span>
          </div>
          <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
            تغییر ثوابت → محاسبه مجدد همه قیمت‌های واقعی
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button onClick={handleApply} style={{
                fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(0,229,160,0.1)', border: `0.5px solid rgba(0,229,160,0.4)`,
                color: '#00E5A0', fontFamily: 'inherit',
              }}>اعمال</button>
              <button onClick={handleReset} style={{
                fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,77,106,0.08)', border: `0.5px solid rgba(255,77,106,0.3)`,
                color: '#FF4D6A', fontFamily: 'inherit',
              }}>بازنشانی</button>
              <button onClick={() => { setEditing(false); setLocal(constants) }} style={{
                fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${border}`,
                color: muted, fontFamily: 'inherit',
              }}>لغو</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={{
              fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
              background: `rgba(0,200,255,0.08)`, border: `0.5px solid ${accent}44`,
              color: accent, fontFamily: 'inherit',
            }}>ویرایش</button>
          )}
        </div>
      </div>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {Object.entries(editing ? local : constants).map(([key, value]) => (
            <div key={key} style={{
              background: 'rgba(0,200,255,0.03)', border: `0.5px solid ${editing ? 'rgba(0,200,255,0.25)' : border}`,
              borderRadius: 8, padding: '10px 14px', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 11, color: muted, flexShrink: 0 }}>
                {CONST_LABELS[key] ?? key}
              </span>
              {editing ? (
                <input
                  type="number"
                  value={local[key]}
                  onChange={e => setLocal((prev: any) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                  style={{
                    width: 100, background: 'rgba(0,200,255,0.06)',
                    border: `0.5px solid ${accent}44`, borderRadius: 6,
                    color: text, fontSize: 12, fontFamily: 'system-ui',
                    padding: '4px 8px', textAlign: 'left', outline: 'none',
                  }}
                />
              ) : (
                <span style={{ fontSize: 12, color: text, fontWeight: 600, fontFamily: 'system-ui' }}>
                  {Number(value).toLocaleString('fa-IR', { maximumFractionDigits: 6 })}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
