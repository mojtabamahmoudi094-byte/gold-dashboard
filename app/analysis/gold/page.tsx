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
      const res = await fetch('/api/gold-analysis', { cache: 'no-store' })
      const json = await res.json()
      setData(json)
      setLastFetch(new Date())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 60 * 1000)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: d }) => setIsAdmin(d.user != null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setIsAdmin(s?.user != null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const derived = useMemo(() => {
    if (!data?.inputs) return null
    const { goldUsd, dollarT, dirhamT } = data.inputs
    const mkt = {
      gram24:   data.gram?.market24          ?? null,
      gram18:   data.gram?.market18          ?? null,
      mesghal:  data.mesghal?.market         ?? null,
      half:     data.coins?.half?.market     ?? null,
      quarter:  data.coins?.quarter?.market  ?? null,
      full:     data.coins?.full?.market     ?? null,
    }
    const c = constants

    const dollarViaDirham = dirhamT != null ? dirhamT * c.AED_PER_USD : null
    const bubbleDollar = dollarT && dollarViaDirham ? (dollarT - dollarViaDirham) / dollarViaDirham : null

    const fairGram24  = goldUsd && dollarT ? (goldUsd * dollarT) / c.gramsPerOz : null
    const fairGram18  = fairGram24 ? fairGram24 * (18 / 24) : null
    const fairGram22  = fairGram24 ? fairGram24 * (c.coinPurity / 24) : null
    const fairMesghal = fairGram18 ? fairGram18 * c.mithqalW : null
    const fairFull    = fairGram22 ? fairGram22 * c.fullCoinW + c.mintCost : null
    const fairHalf    = fairGram22 ? fairGram22 * c.halfCoinW + c.mintCost : null
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
      },
      coins: {
        full:    { fair: fairFull,    market: mkt.full,    bubble: bub(mkt.full,    fairFull),    weight: c.fullCoinW },
        half:    { fair: fairHalf,    market: mkt.half,    bubble: bub(mkt.half,    fairHalf),    weight: c.halfCoinW,
                   impliedDollar: imp(mkt.half, goldUsd, c.halfCoinW * (c.coinPurity / 24) / c.gramsPerOz) },
        quarter: { fair: fairQuarter, market: mkt.quarter, bubble: bub(mkt.quarter, fairQuarter), weight: c.quarterCoinW,
                   impliedDollar: imp(mkt.quarter, goldUsd, c.quarterCoinW * (c.coinPurity / 24) / c.gramsPerOz) },
      },
    }
  }, [data, constants])

  const ch = data?.changes ?? {}

  const bg     = '#060B14'
  const border = 'rgba(0,200,255,0.12)'
  const accent = '#00C8FF'
  const green  = '#00E5A0'
  const muted  = '#5A7088'
  const text   = '#E8F4FF'

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
          <a href="/analysis" style={{ color: muted, textDecoration: 'none', fontSize: 12 }}>تحلیل</a>
          <span style={{ color: muted, fontSize: 10 }}>›</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🥇</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: text }}>تحلیل طلا</div>
              <div style={{ fontSize: 10, color: muted }}>
                {data?.lastMarketDate ? `آخرین روز بازار: ${data.lastMarketDate}` : 'در حال بارگذاری...'}
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
            onClick={load} disabled={loading}
            style={{
              fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
              background: 'rgba(0,200,255,0.08)', border: `0.5px solid ${accent}44`,
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
            <InputCard icon="🪙" label="انس طلا"    unit="دلار"  value={fmtUsd(data?.inputs?.goldUsd)}  change={ch.goldUsd   ?? null} accent={accent} />
            <InputCard icon="🥈" label="انس نقره"   unit="دلار"  value={fmtUsd(data?.inputs?.silverUsd)} change={ch.silverUsd ?? null} accent="#C0C0D0" />
            <InputCard icon="💵" label="ارز بازار"  unit="تومان" value={fmt(data?.inputs?.dollarT)}      change={ch.dollarT   ?? null} accent={green} />
            <InputCard icon="🇦🇪" label="قیمت درهم" unit="تومان" value={fmt(data?.inputs?.dirhamT)}      change={ch.dirhamT   ?? null} accent="#F59E0B" />
            <InputCard icon="₮"  label="تتر (USDT)" unit="تومان" value={fmt(data?.inputs?.usdtT)}        change={ch.usdtT     ?? null} note="≈ ارز بازار" accent={accent} />
          </div>
        </Section>

        {/* ── Row 2: Dollar Analysis ── */}
        <Section title="تحلیل نرخ ارز" subtitle="مقایسه روش‌های قیمت‌گذاری دلار">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <DollarCard
              label="دلار با درهم" formula={`درهم × ${constants.AED_PER_USD}`}
              value={fmt(derived?.derived?.dollarViaDirham ?? null)} unit="تومان" accent={accent}
            />
            <DollarCard
              label="حباب دلار بازار" formula="دلار بازار ÷ دلار درهم"
              value={fmtPct(derived?.derived?.bubbleDollar ?? null)}
              color={bubbleColor(derived?.derived?.bubbleDollar ?? null)}
              desc={bubbleLabel(derived?.derived?.bubbleDollar ?? null)} accent={accent}
            />
            <DollarCard
              label="حباب تتر" formula="تتر ÷ دلار درهم"
              value={fmtPct(derived?.derived?.bubbleUsdt ?? null)}
              color={bubbleColor(derived?.derived?.bubbleUsdt ?? null)}
              desc={bubbleLabel(derived?.derived?.bubbleUsdt ?? null)} accent={accent}
            />
          </div>
        </Section>

        {/* ── Row 3: Gold Table ── */}
        <Section title="گرم و مثقال طلا" subtitle="قیمت واقعی بر اساس انس جهانی vs قیمت بازار ایران">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['نوع', 'قیمت واقعی (تومان)', 'قیمت بازار (تومان)', 'تغییر روزانه', 'حباب', 'ارزیابی', 'نرخ دلار ضمنی'].map(h => (
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
                  fair={derived?.gram?.fair24}   market={derived?.gram?.market24}
                  bubble={derived?.gram?.bubble24} impliedDollar={derived?.gram?.impliedDollar24}
                  dailyChange={ch.gram24 ?? null}
                  border={border} muted={muted} text={text}
                />
                <GoldRow
                  label="هر گرم ۱۸ عیار"
                  fair={derived?.gram?.fair18}   market={derived?.gram?.market18}
                  bubble={derived?.gram?.bubble18} impliedDollar={derived?.gram?.impliedDollar18}
                  dailyChange={ch.gram18 ?? null}
                  border={border} muted={muted} text={text}
                />
                <GoldRow
                  label="مثقال طلا (۱۸ عیار)"
                  fair={derived?.mesghal?.fair}  market={derived?.mesghal?.market}
                  bubble={derived?.mesghal?.bubble} impliedDollar={derived?.mesghal?.impliedDollar}
                  dailyChange={ch.mesghal ?? null}
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
                  {['سکه', 'وزن (گرم)', 'قیمت واقعی (تومان)', 'قیمت بازار (تومان)', 'تغییر روزانه', 'حباب', 'ارزیابی'].map(h => (
                    <th key={h} style={{
                      color: muted, fontWeight: 500, textAlign: 'right',
                      padding: '10px 12px', borderBottom: `0.5px solid ${border}`, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CoinRow
                  label="تمام سکه بهار"   weight={derived?.coins?.full?.weight    ?? 8.13}
                  fair={derived?.coins?.full?.fair}    market={derived?.coins?.full?.market}
                  bubble={derived?.coins?.full?.bubble}
                  marketNote={data?.coins?.full?.marketIsEstimate ? '≈ نیم × ۲' : null}
                  dailyChange={ch.fullCoin ?? null}
                  border={border} muted={muted} text={text}
                />
                <CoinRow
                  label="نیم سکه"         weight={derived?.coins?.half?.weight    ?? 4.066}
                  fair={derived?.coins?.half?.fair}    market={derived?.coins?.half?.market}
                  bubble={derived?.coins?.half?.bubble}
                  dailyChange={ch.halfCoin ?? null}
                  border={border} muted={muted} text={text}
                />
                <CoinRow
                  label="ربع سکه"         weight={derived?.coins?.quarter?.weight ?? 2.033}
                  fair={derived?.coins?.quarter?.fair} market={derived?.coins?.quarter?.market}
                  bubble={derived?.coins?.quarter?.bubble}
                  dailyChange={ch.quarterCoin ?? null}
                  border={border} muted={muted} text={text}
                />
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Row 5: Gold Funds Matrix ── */}
        <GoldFundsMatrix border={border} muted={muted} text={text} accent={accent} bg={bg} />

        {/* ── Row 6: Constants — Admin only ── */}
        {isAdmin && (
          <AdminConstants
            constants={constants} onChange={setConstants}
            border={border} muted={muted} text={text} accent={accent}
          />
        )}

        <div style={{ textAlign: 'center', fontSize: 10, color: muted, paddingBottom: 24 }}>
          داده از BrsAPI · بروزرسانی خودکار هر ۱ دقیقه · تمام قیمت‌ها به تومان
          {isAdmin && <span style={{ marginRight: 8, color: accent }}>· حالت ادمین فعال</span>}
        </div>
      </div>

      <style>{`
        input[type=number] { -moz-appearance: textfield; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </main>
  )
}

// ──────────────── Sub-components ────────────────

function DailyChangeBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: '#5A7088', fontSize: 11 }}>—</span>
  if (Math.abs(pct) < 0.005) {
    return <span style={{ color: '#5A7088', fontSize: 11, fontFamily: 'system-ui' }}>۰.۰۰٪</span>
  }
  const color = pct > 0 ? '#00E5A0' : '#FF4D6A'
  const arrow = pct > 0 ? '▲' : '▼'
  const sign  = pct > 0 ? '+' : ''
  return (
    <span style={{ color, fontSize: 11, fontFamily: 'system-ui', fontWeight: 600 }}>
      {arrow} {sign}{Math.abs(pct).toFixed(2)}٪
    </span>
  )
}

function Section({ title, subtitle, badge, badgeColor, children }: any) {
  const border = 'rgba(0,200,255,0.12)'
  return (
    <div style={{ background: 'rgba(10,18,30,0.6)', border: `0.5px solid ${border}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
  const changeColor = change == null ? '#5A7088' : change > 0 ? '#00E5A0' : change < 0 ? '#FF4D6A' : '#5A7088'
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: '#5A7088' }}>{unit}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {note && <span style={{ fontSize: 10, color: '#5A7088' }}>{note}</span>}
          {change != null && Math.abs(change) >= 0.005 && (
            <span style={{ fontSize: 11, color: changeColor, fontFamily: 'system-ui', fontWeight: 600 }}>
              {change > 0 ? '▲' : '▼'} {change > 0 ? '+' : ''}{change.toFixed(2)}٪
            </span>
          )}
          {change != null && Math.abs(change) < 0.005 && (
            <span style={{ fontSize: 11, color: '#5A7088', fontFamily: 'system-ui' }}>۰.۰۰٪</span>
          )}
        </div>
      </div>
    </div>
  )
}

function DollarCard({ label, formula, value, unit, color, desc, accent }: any) {
  const c = color ?? accent ?? '#00C8FF'
  return (
    <div style={{ background: 'rgba(0,200,255,0.03)', border: '0.5px solid rgba(0,200,255,0.1)', borderRadius: 12, padding: '14px 16px' }}>
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

function GoldRow({ label, fair, market, bubble, impliedDollar, dailyChange, border, muted, text }: any) {
  const bc = bubbleColor(bubble)
  return (
    <tr style={{ borderBottom: `0.5px solid ${border}` }}>
      <td style={{ padding: '10px 12px', color: text, fontWeight: 500 }}>{label}</td>
      <td style={{ padding: '10px 12px', color: '#A0B4C8', fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>
        {fmt(fair)}
      </td>
      <td style={{ padding: '10px 12px', color: text, fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>
        {fmt(market)}
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <DailyChangeBadge pct={dailyChange} />
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <span style={{
          display: 'inline-block', fontSize: 11, fontWeight: 700, color: bc,
          background: `${bc}18`, borderRadius: 4, padding: '2px 8px', fontFamily: 'system-ui',
        }}>
          {fmtPct(bubble)}
        </span>
      </td>
      <td style={{ padding: '10px 12px', color: bc, fontSize: 11, fontWeight: 600 }}>{bubbleLabel(bubble)}</td>
      <td style={{ padding: '10px 12px', color: muted, fontFamily: 'system-ui', fontSize: 11 }}>
        {impliedDollar ? Math.round(impliedDollar).toLocaleString('fa-IR') : '—'}
      </td>
    </tr>
  )
}

function CoinRow({ label, weight, fair, market, bubble, dailyChange, marketNote, border, muted, text }: any) {
  const bc = bubbleColor(bubble)
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
            {marketNote && <div style={{ fontSize: 9, color: muted }}>{marketNote}</div>}
          </div>
        ) : (
          <span style={{ color: muted, fontSize: 11 }}>—</span>
        )}
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <DailyChangeBadge pct={dailyChange} />
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
      <td style={{ padding: '10px 12px', color: bc, fontSize: 11, fontWeight: 600 }}>{bubbleLabel(bubble)}</td>
    </tr>
  )
}

const CONST_LABELS: Record<string, string> = {
  gramsPerOz:   'گرم در هر انس',
  AED_PER_USD:  'نرخ درهم در برابر دلار',
  coinPurity:   'عیار سکه',
  mithqalW:     'وزن مثقال (گرم)',
  fullCoinW:    'وزن تمام سکه (گرم)',
  halfCoinW:    'وزن نیم سکه (گرم)',
  quarterCoinW: 'وزن ربع سکه (گرم)',
  mintCost:     'هزینه ضرب (تومان)',
}

function AdminConstants({ constants, onChange, border, muted, text, accent }: any) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(constants)

  const handleApply = () => { onChange(local); setEditing(false) }
  const handleReset = () => { setLocal(DEFAULT_CONSTANTS); onChange(DEFAULT_CONSTANTS) }

  return (
    <div style={{ background: 'rgba(10,18,30,0.6)', border: `0.5px solid rgba(0,200,255,0.2)`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: text }}>ثوابت محاسباتی</span>
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: 'rgba(0,200,255,0.12)', border: `0.5px solid ${accent}44`, color: accent, fontFamily: 'system-ui' }}>ADMIN</span>
          </div>
          <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>تغییر ثوابت → محاسبه مجدد همه قیمت‌های واقعی</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button onClick={handleApply} style={{ fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: 'pointer', background: 'rgba(0,229,160,0.1)', border: `0.5px solid rgba(0,229,160,0.4)`, color: '#00E5A0', fontFamily: 'inherit' }}>اعمال</button>
              <button onClick={handleReset} style={{ fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,77,106,0.08)', border: `0.5px solid rgba(255,77,106,0.3)`, color: '#FF4D6A', fontFamily: 'inherit' }}>بازنشانی</button>
              <button onClick={() => { setEditing(false); setLocal(constants) }} style={{ fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${border}`, color: muted, fontFamily: 'inherit' }}>لغو</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={{ fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: 'pointer', background: `rgba(0,200,255,0.08)`, border: `0.5px solid ${accent}44`, color: accent, fontFamily: 'inherit' }}>ویرایش</button>
          )}
        </div>
      </div>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {Object.entries(editing ? local : constants).map(([key, value]) => (
            <div key={key} style={{ background: 'rgba(0,200,255,0.03)', border: `0.5px solid ${editing ? 'rgba(0,200,255,0.25)' : border}`, borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: muted, flexShrink: 0 }}>{CONST_LABELS[key] ?? key}</span>
              {editing ? (
                <input
                  type="number" value={local[key]}
                  onChange={e => setLocal((prev: any) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                  style={{ width: 100, background: 'rgba(0,200,255,0.06)', border: `0.5px solid ${accent}44`, borderRadius: 6, color: text, fontSize: 12, fontFamily: 'system-ui', padding: '4px 8px', textAlign: 'left', outline: 'none' }}
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

// ──────────────── Gold Funds Matrix ────────────────

const GOLD_FUNDS = [
  'عیار', 'طلا', 'مثقال', 'کهربا', 'جام طلا', 'گنج', 'ریتون', 'زمرد',
  'امرالد', 'گوهر', 'درخشان', 'جواهر', 'زر', 'آلتون', 'گلدا', 'زروان',
  'رز ترنج', 'آتش', 'زرفام', 'لیان', 'ناب', 'میراث', 'رزگلد', 'تابش',
  'زرگر', 'نفیس', 'نگین فارس', 'قیراط', 'درنا', 'گلدیس', 'همیان', 'دفینه',
]

const DATA_COLS = [
  { key: 'marketToman',     label: 'ارزش بازار (تومان)' },
  { key: 'marketUsd',       label: 'ارزش بازار (دلار)' },
  { key: 'bubbleZati',      label: 'حباب ذاتی' },
  { key: 'bubbleAsmi',      label: 'حباب اسمی' },
  { key: 'bubbleVaqei',     label: 'حباب واقعی' },
  { key: 'dollarRate',      label: 'نرخ دلار' },
  { key: 'coinWeight',      label: 'وزن سکه' },
  { key: 'goldBarWeight',   label: 'وزن شمش طلا' },
  { key: 'liquidity', label: 'نقدینگی' },
]

const FUND_WEIGHTS: Record<string, { coin: number; bar: number; liq: number }> = {
  'رز ترنج':   { coin: 9.5,  bar: 88.3,  liq: 2.2  },
  'آتش':       { coin: 0.0,  bar: 98.0,  liq: 2.0  },
  'درخشان':    { coin: 0.0,  bar: 96.9,  liq: 3.1  },
  'زرفام':     { coin: 0.0,  bar: 100.0, liq: 0.3  },
  'ناب':       { coin: 6.3,  bar: 92.6,  liq: 1.1  },
  'زمرد':      { coin: 2.2,  bar: 97.0,  liq: 0.9  },
  'آلتون':     { coin: 5.9,  bar: 94.0,  liq: 0.1  },
  'ریتون':     { coin: 0.8,  bar: 99.2,  liq: 0.0  },
  'گنج':       { coin: 0.0,  bar: 100.0, liq: 0.0  },
  'دفینه':     { coin: 0.0,  bar: 89.4,  liq: 10.6 },
  'کهربا':     { coin: 15.2, bar: 84.5,  liq: 0.4  },
  'گلدا':      { coin: 9.4,  bar: 87.6,  liq: 3.1  },
  'لیان':      { coin: 0.0,  bar: 98.8,  liq: 1.2  },
  'زرگر':      { coin: 0.6,  bar: 99.3,  liq: 0.1  },
  'زروان':     { coin: 4.9,  bar: 95.1,  liq: 0.0  },
  'مثقال':     { coin: 5.7,  bar: 93.1,  liq: 1.2  },
  'نگین فارس': { coin: 3.4,  bar: 96.5,  liq: 0.0  },
  'تابش':      { coin: 0.1,  bar: 99.4,  liq: 0.5  },
  'زر':        { coin: 17.9, bar: 82.1,  liq: 0.0  },
  'گلدیس':     { coin: 10.7, bar: 88.1,  liq: 1.2  },
  'امرالد':    { coin: 12.0, bar: 87.9,  liq: 0.1  },
  'عیار':      { coin: 12.7, bar: 87.3,  liq: 0.1  },
  'طلا':       { coin: 14.4, bar: 85.5,  liq: 0.0  },
  'همیان':     { coin: 0.0,  bar: 99.8,  liq: 0.2  },
  'گوهر':      { coin: 8.1,  bar: 91.1,  liq: 0.8  },
  'رزگلد':     { coin: 4.2,  bar: 95.5,  liq: 0.4  },
  'جواهر':     { coin: 0.0,  bar: 98.0,  liq: 2.1  },
  'نفیس':      { coin: 6.7,  bar: 93.3,  liq: 0.1  },
  'میراث':     { coin: 3.7,  bar: 96.1,  liq: 0.2  },
  'جام طلا':   { coin: 0.5,  bar: 99.1,  liq: 0.4  },
  'درنا':      { coin: 0.0,  bar: 100.0, liq: 0.0  },
  'قیراط':     { coin: 0.0,  bar: 97.0,  liq: 3.0  },
}

function GoldFundsMatrix({ border, muted, text, accent, bg }: any) {
  const [fundsData, setFundsData] = useState<Record<string, number | null>>({})
  const [dollarRate, setDollarRate] = useState<number | null>(null)
  const [navData, setNavData] = useState<Record<string, number | null>>({})
  const [priceCloseMap, setPriceCloseMap] = useState<Record<string, { price: number; isRial: boolean }>>({})
  const [fundsLoading, setFundsLoading] = useState(true)

  const loadData = () => {
    Promise.all([
      fetch('/api/funds').then(r => r.json()),
      fetch('/api/gold-analysis').then(r => r.json()),
      fetch('/api/gold-nav').then(r => r.json()),
    ]).then(([fd, gd, nd]) => {
      const assets: any[] = fd.assets ?? []
      const records: any[] = fd.records ?? []
      const recById: Record<number, any> = {}
      for (const rec of records) recById[rec.asset_id] = rec
      const map: Record<string, number | null> = {}
      const pcMap: Record<string, { price: number; isRial: boolean }> = {}
      for (const a of assets) {
        const rec = recById[a.id]
        map[a.name] = rec?.market_value ?? null
        if (rec) {
          pcMap[a.name] = {
            price: rec.price_close ?? 0,
            isRial: (rec.trade_value ?? 0) > 1e6,
          }
        }
      }
      setFundsData(map)
      setPriceCloseMap(pcMap)
      setDollarRate(gd?.inputs?.dollarT ?? null)
      setNavData(nd?.navs ?? {})
    }).catch(e => console.error('[GoldFundsMatrix] fetch failed:', e))
      .finally(() => setFundsLoading(false))
  }

  useEffect(() => {
    loadData()
    const t = setInterval(loadData, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const getMv = (name: string): { display: string; full: string } => {
    const mv = fundsData[name]
    if (fundsLoading) return { display: '...', full: '' }
    if (mv == null) return { display: '—', full: '' }
    const bt = mv / 10_000_000_000
    const full = bt.toLocaleString('fa-IR', { maximumFractionDigits: 1 }) + ' میلیارد تومان'
    const display = bt >= 1000
      ? Math.round(bt / 1000).toLocaleString('fa-IR') + ' ه.م.ت'
      : Math.round(bt).toLocaleString('fa-IR') + ' م.ت'
    return { display, full }
  }

  const getUsd = (name: string): { display: string; full: string } => {
    const mv = fundsData[name]
    if (fundsLoading) return { display: '...', full: '' }
    if (mv == null || dollarRate == null) return { display: '—', full: '' }
    const toman = mv / 10
    const dollars = toman / dollarRate
    const mil = dollars / 1_000_000
    const full = mil.toLocaleString('fa-IR', { maximumFractionDigits: 1 }) + ' میلیون دلار'
    const display = mil >= 1000
      ? Math.round(mil / 1000).toLocaleString('fa-IR') + ' م.م.د'
      : Math.round(mil).toLocaleString('fa-IR') + ' م.د'
    return { display, full }
  }

  const getBubbleAsmi = (name: string): { display: string; full: string } => {
    if (fundsLoading) return { display: '...', full: '' }
    const nav = navData[name]
    const pc = priceCloseMap[name]
    if (!nav || !pc || !pc.price) return { display: '—', full: '' }
    const priceRial = pc.price
    const bubble = (priceRial - nav) / nav * 100
    const sign = bubble >= 0 ? '+' : ''
    const display = sign + bubble.toFixed(1) + '٪'
    const full = `NAV ابطال: ${Math.round(nav / 10).toLocaleString('fa-IR')} تومان | قیمت پایانی: ${Math.round(priceRial / 10).toLocaleString('fa-IR')} تومان`
    return { display, full }
  }

  const getCellValue = (colKey: string, name: string): { display: string; full: string } => {
    if (colKey === 'marketToman') return getMv(name)
    if (colKey === 'marketUsd') return getUsd(name)
    if (colKey === 'bubbleAsmi') return getBubbleAsmi(name)
    const w = FUND_WEIGHTS[name]
    if (colKey === 'coinWeight')    return w ? { display: w.coin.toFixed(1) + '٪', full: '' } : { display: '—', full: '' }
    if (colKey === 'goldBarWeight') return w ? { display: w.bar.toFixed(1)  + '٪', full: '' } : { display: '—', full: '' }
    if (colKey === 'liquidity')     return w ? { display: w.liq.toFixed(1)  + '٪', full: '' } : { display: '—', full: '' }
    return { display: '—', full: '' }
  }

  const tabBorder = 'rgba(0,200,255,0.12)'
  const tabBg     = 'rgba(10,18,30,0.6)'

  return (
    <div style={{ background: tabBg, border: `0.5px solid ${tabBorder}`, borderRadius: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: `0.5px solid ${tabBorder}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: text }}>ماتریس صندوق‌های طلا</div>
          <div style={{ fontSize: 10, color: fundsLoading ? muted : accent }}>
            {fundsLoading ? 'در حال بارگذاری...' : `${Object.values(fundsData).filter(v => v != null).length} صندوق با داده`}
          </div>
        </div>
        <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>داده‌های صندوق‌های سرمایه‌گذاری طلا — هاور روی عدد برای جزئیات</div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 16px', color: muted, fontWeight: 500, textAlign: 'right', borderBottom: `0.5px solid ${tabBorder}`, whiteSpace: 'nowrap', position: 'sticky', right: 0, background: tabBg, zIndex: 1 }}>
                نام صندوق
              </th>
              {DATA_COLS.map(col => (
                <th key={col.key} style={{ padding: '10px 16px', color: muted, fontWeight: 500, textAlign: 'right', borderBottom: `0.5px solid ${tabBorder}`, whiteSpace: 'nowrap' }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GOLD_FUNDS.map(name => (
              <tr
                key={name}
                style={{ borderBottom: `0.5px solid ${tabBorder}` }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(0,200,255,0.03)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <td style={{ padding: '9px 16px', color: text, fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', right: 0, background: 'inherit' }}>
                  {name}
                </td>
                {DATA_COLS.map(col => {
                  const v = getCellValue(col.key, name)
                  return (
                    <td
                      key={col.key}
                      title={v.full || undefined}
                      style={{
                        padding: '9px 16px',
                        color: col.key === 'marketToman' && v.display !== '—' && v.display !== '...' ? text : muted,
                        fontFamily: 'system-ui',
                        whiteSpace: 'nowrap',
                        cursor: v.full ? 'help' : 'default',
                      }}
                    >
                      {v.display}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary averages */}
      <div style={{ borderTop: `0.5px solid ${tabBorder}`, padding: '16px 18px' }}>
        <div style={{ fontSize: 11, color: muted, marginBottom: 10 }}>میانگین شاخص‌های حبابی صندوق‌ها</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'میانگین حباب ذاتی صندوق‌ها', value: '—' },
            { label: 'میانگین حباب اسمی صندوق‌ها',  value: '—' },
            { label: 'میانگین حباب واقعی صندوق‌ها', value: '—' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'rgba(0,200,255,0.03)',
              border: `0.5px solid ${tabBorder}`,
              borderRadius: 10,
              padding: '14px 16px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: muted, fontFamily: 'system-ui', marginBottom: 6 }}>
                {item.value}
              </div>
              <div style={{ fontSize: 10, color: muted }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
