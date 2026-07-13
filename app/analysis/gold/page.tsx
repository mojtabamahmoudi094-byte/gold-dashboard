'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { FUND_WEIGHTS } from '../../../lib/goldBubbles'
import { Skeleton } from '../../components/ui/Skeleton'

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
  if (n == null) return '#ddd5bd'
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
  const muted  = '#ddd5bd'
  const text   = '#E8F4FF'

  return (
    <main style={{
      minHeight: '100vh', color: text,
      background: `
        radial-gradient(ellipse 60% 40% at 85% -5%, rgba(255,201,74,0.06), transparent 60%),
        radial-gradient(ellipse 55% 35% at 10% 0%, rgba(0,200,255,0.07), transparent 60%),
        ${bg}`,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <style>{`
        @keyframes popIn { from { opacity: 0; transform: translateY(16px) scale(.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .pop-col > * { opacity: 0; animation: popIn .6s cubic-bezier(.16,1,.3,1) forwards; }
        .pop-col > *:nth-child(1) { animation-delay: .02s }
        .pop-col > *:nth-child(2) { animation-delay: .08s }
        .pop-col > *:nth-child(3) { animation-delay: .14s }
        .pop-col > *:nth-child(4) { animation-delay: .20s }
        .pop-col > *:nth-child(5) { animation-delay: .26s }
        .pop-col > *:nth-child(6) { animation-delay: .32s }
        .pop-col > *:nth-child(n+7) { animation-delay: .38s }
        .pop-grid > * { opacity: 0; animation: popIn .5s cubic-bezier(.16,1,.3,1) forwards; }
        .pop-grid > *:nth-child(1) { animation-delay: .05s }
        .pop-grid > *:nth-child(2) { animation-delay: .10s }
        .pop-grid > *:nth-child(3) { animation-delay: .15s }
        .pop-grid > *:nth-child(4) { animation-delay: .20s }
        .pop-grid > *:nth-child(5) { animation-delay: .25s }
        .pop-grid > *:nth-child(6) { animation-delay: .30s }
        .pop-grid > *:nth-child(n+7) { animation-delay: .35s }
        .gsec { transition: border-color .2s ease, box-shadow .2s ease; }
        .gsec:hover { border-color: rgba(0,200,255,.28) !important; box-shadow: 0 12px 40px rgba(0,0,0,.4); }
        .gcard { transition: transform .2s ease, border-color .2s ease, background .2s ease, box-shadow .2s ease; }
        .gcard:hover { border-color: rgba(0,200,255,.4) !important; background: rgba(0,200,255,.08) !important; transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,.35); }
        .gbadge { transition: transform .15s ease; }
        .gbadge:hover { transform: scale(1.06); }
        .gbtn { transition: background .2s ease, box-shadow .2s ease; }
        .gbtn:hover:not(:disabled) { background: rgba(0,200,255,.2) !important; box-shadow: 0 0 16px rgba(0,200,255,.25); }
        .gbtn:focus-visible { outline: 2px solid #00C8FF; outline-offset: 2px; }
        tr.grow { transition: background .15s ease; animation: popIn .4s ease forwards; opacity: 0; }
        tr.grow:hover { background: rgba(0,200,255,.05); }
        tbody tr.grow:nth-child(even) { background: rgba(255,255,255,.017); }
        tbody tr.grow:nth-child(even):hover { background: rgba(0,200,255,.05); }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .gsec, .gcard, .gbtn, .gbadge, tr.grow, .pop-col > *, .pop-grid > * { transition: none !important; animation: none !important; opacity: 1 !important; }
          .gcard:hover { transform: none !important; }
          .gbtn svg { animation: none !important; }
        }
      `}</style>

      {/* Page header */}
      <div style={{
        borderBottom: `1px solid ${border}`,
        background: 'rgba(6,11,20,0.75)',
        backdropFilter: 'blur(12px)',
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 30,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/analysis" style={{ color: muted, textDecoration: 'none', fontSize: 12 }}>تحلیل</a>
          <span style={{ color: muted, fontSize: 10 }}>›</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 34, height: 34, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(255,201,74,0.18), rgba(255,201,74,0.05))',
              border: '0.5px solid rgba(255,201,74,0.35)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFC94A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 15h12l2 5H4l2-5Z" />
                <path d="M8 9h8l2 5H6l2-5Z" />
                <path d="M10 3h4l2 5H8l2-5Z" />
              </svg>
            </span>
            <div>
              <div style={{
                fontSize: 16, fontWeight: 800,
                background: 'linear-gradient(90deg, #FFC94A, #E8F4FF 70%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>تحلیل طلا</div>
              <div style={{ fontSize: 10, color: muted }}>
                {data?.lastMarketDate ? `آخرین روز بازار: ${data.lastMarketDate}` : <Skeleton width={110} height={10} radius={5} />}
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
            className="gbtn"
            onClick={load} disabled={loading}
            style={{
              fontSize: 11, padding: '7px 16px', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
              background: 'rgba(0,200,255,0.08)', border: `0.5px solid ${accent}44`,
              color: accent, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              style={loading ? { animation: 'spin 1s linear infinite' } : undefined}>
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            {loading ? 'در حال بروزرسانی' : 'بروزرسانی'}
          </button>
        </div>
      </div>

      <div className="pop-col" style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Row 1: Live Inputs ── */}
        <Section title="ورودی‌های روزانه" subtitle="داده زنده از API" badge="LIVE" badgeColor={green}>
          <div className="pop-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <InputCard icon="🪙" label="انس طلا"    unit="دلار"  value={fmtUsd(data?.inputs?.goldUsd)}  change={ch.goldUsd   ?? null} accent="#FFC94A" />
            <InputCard icon="🥈" label="انس نقره"   unit="دلار"  value={fmtUsd(data?.inputs?.silverUsd)} change={ch.silverUsd ?? null} accent="#C0C8D8" />
            <InputCard icon="💵" label="ارز بازار"  unit="تومان" value={fmt(data?.inputs?.dollarT)}      change={ch.dollarT   ?? null} accent={green} />
            <InputCard icon="🇦🇪" label="قیمت درهم" unit="تومان" value={fmt(data?.inputs?.dirhamT)}      change={ch.dirhamT   ?? null} accent="#F59E0B" />
            <InputCard icon="₮"  label="تتر (USDT)" unit="تومان" value={fmt(data?.inputs?.usdtT)}        change={ch.usdtT     ?? null} note="≈ ارز بازار" accent="#8B5CF6" />
          </div>
        </Section>

        {/* ── Row 2: Dollar Analysis ── */}
        <Section title="تحلیل نرخ ارز" subtitle="مقایسه روش‌های قیمت‌گذاری دلار">
          <div className="pop-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
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

        {/* ── Row 6: بورس کالا ── */}
        <Section title="بورس کالا" subtitle="قیمت‌های نقدی بازار فیزیکی (BrsAPI — بورس کالا)">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `0.5px solid ${border}` }}>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: muted, fontWeight: 500 }}>شاخص</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: muted, fontWeight: 500, fontFamily: 'system-ui' }}>قیمت</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: muted, fontWeight: 500, fontSize: 10 }}>توضیح</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const fairBullionK = data?.ime?.fairBullion != null ? data.ime.fairBullion / 1000 : null
                  const tabloBullionK = data?.ime?.goldBarT != null ? data.ime.goldBarT * 10 : null
                  const fairCoinK = data?.ime?.fairCoinCert != null ? data.ime.fairCoinCert / 1000 : null
                  const tabloCoinK = data?.ime?.goldCoinT != null ? data.ime.goldCoinT / 1000 : null
                  const bubbleBullion = fairBullionK != null && tabloBullionK != null
                    ? ((tabloBullionK - fairBullionK) / fairBullionK) * 100 : null
                  const bubbleCoin = fairCoinK != null && tabloCoinK != null
                    ? ((tabloCoinK - fairCoinK) / fairCoinK) * 100 : null
                  const goldUsd = data?.inputs?.goldUsd ?? null
                  const c = constants
                  const dollarBullion = tabloBullionK != null && goldUsd
                    ? (tabloBullionK * 1000) / ((1000 / c.gramsPerOz) * (995 / 999.9) * goldUsd) : null
                  const dollarCoin = data?.ime?.goldCoinT != null && goldUsd
                    ? data.ime.goldCoinT / ((c.fullCoinW / c.gramsPerOz) * (c.coinPurity / 24) * goldUsd) : null
                  const rows: { label: string; value: number | null; note: string; isBubble?: boolean; isToman?: boolean }[] = [
                    { label: 'قیمت واقعی شمش طلا', value: fairBullionK, note: 'انس × دلار درهم × ۱۰۰۰گرم × عیار ۹۹۵' },
                    { label: 'قیمت تابلو نقدی شمش طلا', value: tabloBullionK, note: 'قیمت پایانی GoldBar — بورس کالا' },
                    { label: 'حباب شمش طلا', value: bubbleBullion, note: '(تابلو − واقعی) ÷ واقعی × ۱۰۰', isBubble: true },
                    { label: 'قیمت واقعی گواهی سکه', value: fairCoinK, note: 'انس × دلار درهم × ۸.۱۳گرم × عیار ۲۲' },
                    { label: 'قیمت تابلو نقدی گواهی سکه', value: tabloCoinK, note: 'قیمت پایانی GoldCoin — بورس کالا' },
                    { label: 'حباب گواهی سکه', value: bubbleCoin, note: '(تابلو − واقعی) ÷ واقعی × ۱۰۰', isBubble: true },
                    { label: 'قیمت واقعی دلار گواهی شمش طلا', value: dollarBullion, note: 'تابلو ÷ (۱۰۰۰گرم ÷ انس‌گرم × عیار ۹۹۵ × انس دلاری)', isToman: true },
                    { label: 'قیمت واقعی دلار گواهی سکه', value: dollarCoin, note: 'تابلو ÷ (۸.۱۳گرم ÷ انس‌گرم × عیار ۲۲÷۲۴ × انس دلاری)', isToman: true },
                  ]
                  return rows.map((row, i, arr) => (
                    <tr key={row.label} className="grow" style={{ borderBottom: i < arr.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                      <td style={{ padding: '10px 12px', color: row.isToman ? '#FFC94A' : text, fontWeight: row.isBubble || row.isToman ? 600 : 400 }}>{row.label}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'system-ui', textAlign: 'left' }}>
                        {row.value != null ? (
                          row.isBubble ? (
                            <span className="gbadge" style={{
                              display: 'inline-block', fontWeight: 700, fontSize: 12,
                              color: row.value > 0 ? '#FF4D6A' : '#00E5A0',
                              background: row.value > 0 ? 'rgba(255,77,106,0.1)' : 'rgba(0,229,160,0.1)',
                              border: `0.5px solid ${row.value > 0 ? 'rgba(255,77,106,0.3)' : 'rgba(0,229,160,0.3)'}`,
                              boxShadow: `0 0 10px ${row.value > 0 ? 'rgba(255,77,106,0.3)' : 'rgba(0,229,160,0.3)'}`,
                              borderRadius: 6, padding: '2px 10px',
                            }}>
                              {row.value.toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}٪
                            </span>
                          ) : (
                            <span>
                              <span style={{ color: row.isToman ? '#FFC94A' : accent, fontWeight: 700 }}>
                                {Math.round(row.value).toLocaleString('fa-IR')}
                              </span>
                              <span style={{ color: muted, fontSize: 10, marginRight: 6 }}>{row.isToman ? 'تومان' : 'هزار تومان'}</span>
                            </span>
                          )
                        ) : (
                          <span style={{ color: muted }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', color: muted, fontSize: 10 }}>{row.note}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Row 7: Constants — Admin only ── */}
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
  if (pct == null) return <span style={{ color: '#ddd5bd', fontSize: 11 }}>—</span>
  if (Math.abs(pct) < 0.005) {
    return <span style={{ color: '#ddd5bd', fontSize: 11, fontFamily: 'system-ui' }}>۰.۰۰٪</span>
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
    <div className="gsec" style={{
      background: 'linear-gradient(180deg, rgba(13,22,38,0.75), rgba(8,14,24,0.6))',
      border: `0.5px solid ${border}`, borderRadius: 16, overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 18px', borderBottom: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" style={{
              width: 3, height: 14, borderRadius: 2,
              background: 'linear-gradient(180deg, #FFC94A, #00C8FF)',
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#E8F4FF' }}>{title}</span>
            {badge && (
              <span style={{
                fontSize: 9, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                background: `${badgeColor}22`, border: `0.5px solid ${badgeColor}66`,
                color: badgeColor, fontFamily: 'system-ui',
              }}>{badge}</span>
            )}
          </div>
          {subtitle && <div style={{ fontSize: 10, color: '#ddd5bd', marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  )
}

function InputCard({ icon, label, unit, value, change, note, accent }: any) {
  const changeColor = change == null ? '#ddd5bd' : change > 0 ? '#00E5A0' : change < 0 ? '#FF4D6A' : '#ddd5bd'
  return (
    <div className="gcard" style={{
      background: `linear-gradient(160deg, ${accent}14, transparent 55%), rgba(0,200,255,0.03)`,
      border: `0.5px solid ${accent}2e`, borderTop: `2px solid ${accent}55`,
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 11, color: '#ddd5bd' }}>{label}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent, fontFamily: 'system-ui', lineHeight: 1.2, textShadow: `0 0 18px ${accent}55` }}>
        {value}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: '#ddd5bd' }}>{unit}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {note && <span style={{ fontSize: 10, color: '#ddd5bd' }}>{note}</span>}
          {change != null && Math.abs(change) >= 0.005 && (
            <span style={{ fontSize: 11, color: changeColor, fontFamily: 'system-ui', fontWeight: 600 }}>
              {change > 0 ? '▲' : '▼'} {change > 0 ? '+' : ''}{change.toFixed(2)}٪
            </span>
          )}
          {change != null && Math.abs(change) < 0.005 && (
            <span style={{ fontSize: 11, color: '#ddd5bd', fontFamily: 'system-ui' }}>۰.۰۰٪</span>
          )}
        </div>
      </div>
    </div>
  )
}

function DollarCard({ label, formula, value, unit, color, desc, accent }: any) {
  const c = color ?? accent ?? '#00C8FF'
  return (
    <div className="gcard" style={{
      background: `linear-gradient(160deg, ${c}14, transparent 55%), rgba(0,200,255,0.03)`,
      border: `0.5px solid ${c}2e`, borderTop: `2px solid ${c}55`, borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: '#ddd5bd', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: c, fontFamily: 'system-ui', marginBottom: 4, textShadow: `0 0 18px ${c}55` }}>
        {value}
        {unit && <span style={{ fontSize: 11, color: '#ddd5bd', marginRight: 4 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 10, color: '#ddd5bd' }}>{formula}</div>
      {desc && <div style={{ fontSize: 10, color: c, marginTop: 4, fontWeight: 600 }}>{desc}</div>}
    </div>
  )
}

function GoldRow({ label, fair, market, bubble, impliedDollar, dailyChange, border, muted, text }: any) {
  const bc = bubbleColor(bubble)
  return (
    <tr className="grow" style={{ borderBottom: `0.5px solid ${border}` }}>
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
        <span className="gbadge" style={{
          display: 'inline-block', fontSize: 11, fontWeight: 700, color: bc,
          background: `${bc}18`, boxShadow: `0 0 10px ${bc}30`, borderRadius: 4, padding: '2px 8px', fontFamily: 'system-ui',
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
    <tr className="grow" style={{ borderBottom: `0.5px solid ${border}` }}>
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
          <span className="gbadge" style={{
            display: 'inline-block', fontSize: 11, fontWeight: 700, color: bc,
            background: `${bc}18`, boxShadow: `0 0 10px ${bc}30`, borderRadius: 4, padding: '2px 8px', fontFamily: 'system-ui',
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

function GoldFundsMatrix({ border, muted, text, accent, bg }: any) {
  const [fundsData, setFundsData] = useState<Record<string, number | null>>({})
  const [dollarRate, setDollarRate] = useState<number | null>(null)
  const [navData, setNavData] = useState<Record<string, number | null>>({})
  const [priceCloseMap, setPriceCloseMap] = useState<Record<string, { price: number; isRial: boolean }>>({})
  const [marketBubbles, setMarketBubbles] = useState<{ bullion: number | null; coin: number | null }>({ bullion: null, coin: null })
  const [marketDollars, setMarketDollars] = useState<{ bullion: number | null; coin: number | null }>({ bullion: null, coin: null })
  const [fundsLoading, setFundsLoading] = useState(true)
  // وزن سکه/شمش: پیش‌فرض هاردکد FUND_WEIGHTS، در صورت وجود public/fund-weights/gold.json
  // (ماهانه از کدال، scripts/sync-fund-weights.js) override می‌شود
  const [weights, setWeights] = useState<typeof FUND_WEIGHTS>(FUND_WEIGHTS)

  useEffect(() => {
    fetch('/fund-weights/gold.json').then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.weights) setWeights(w => ({ ...w, ...j.weights })) })
      .catch(() => {})
  }, [])

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
      const ime = gd?.ime
      const fairBullionK = ime?.fairBullion != null ? ime.fairBullion / 1000 : null
      const tabloBullionK = ime?.goldBarT != null ? ime.goldBarT * 10 : null
      setMarketBubbles({
        bullion: fairBullionK != null && tabloBullionK != null
          ? ((tabloBullionK - fairBullionK) / fairBullionK) * 100 : null,
        coin: ime?.fairCoinCert != null && ime?.goldCoinT != null
          ? ((ime.goldCoinT - ime.fairCoinCert) / ime.fairCoinCert) * 100 : null,
      })
      const goldUsd = gd?.inputs?.goldUsd ?? null
      const c = DEFAULT_CONSTANTS
      setMarketDollars({
        bullion: tabloBullionK != null && goldUsd
          ? (tabloBullionK * 1000) / ((1000 / c.gramsPerOz) * (995 / 999.9) * goldUsd) : null,
        coin: ime?.goldCoinT != null && goldUsd
          ? ime.goldCoinT / ((c.fullCoinW / c.gramsPerOz) * (c.coinPurity / 24) * goldUsd) : null,
      })
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

  const getBubbleAsmiValue = (name: string): number | null => {
    const nav = navData[name]
    const pc = priceCloseMap[name]
    if (!nav || !pc || !pc.price) return null
    return (pc.price - nav) / nav * 100
  }

  const getBubbleAsmi = (name: string): { display: string; full: string } => {
    if (fundsLoading) return { display: '...', full: '' }
    const nav = navData[name]
    const pc = priceCloseMap[name]
    const bubble = getBubbleAsmiValue(name)
    if (bubble == null || !nav || !pc) return { display: '—', full: '' }
    const priceRial = pc.price
    const sign = bubble >= 0 ? '+' : ''
    const display = sign + bubble.toFixed(1) + '٪'
    const full = `NAV ابطال: ${Math.round(nav / 10).toLocaleString('fa-IR')} تومان | قیمت پایانی: ${Math.round(priceRial / 10).toLocaleString('fa-IR')} تومان`
    return { display, full }
  }

  const getBubbleZatiValue = (name: string): number | null => {
    const w = weights[name]
    if (!w || marketBubbles.bullion == null || marketBubbles.coin == null) return null
    return (w.coin / 100) * marketBubbles.coin + (w.bar / 100) * marketBubbles.bullion
  }

  const getBubbleZati = (name: string): { display: string; full: string } => {
    if (fundsLoading) return { display: '...', full: '' }
    const bubble = getBubbleZatiValue(name)
    if (bubble == null) return { display: '—', full: '' }
    const w = weights[name]!
    const sign = bubble >= 0 ? '+' : ''
    const display = sign + bubble.toFixed(1) + '٪'
    const full = `سکه ${w.coin.toFixed(1)}٪ × حباب سکه ${marketBubbles.coin!.toFixed(2)}٪ + شمش ${w.bar.toFixed(1)}٪ × حباب شمش ${marketBubbles.bullion!.toFixed(2)}٪`
    return { display, full }
  }

  const getBubbleVaqeiValue = (name: string): number | null => {
    const asmi = getBubbleAsmiValue(name)
    const zati = getBubbleZatiValue(name)
    if (asmi == null || zati == null) return null
    return asmi + zati
  }

  const getBubbleVaqei = (name: string): { display: string; full: string } => {
    if (fundsLoading) return { display: '...', full: '' }
    const bubble = getBubbleVaqeiValue(name)
    if (bubble == null) return { display: '—', full: '' }
    const sign = bubble >= 0 ? '+' : ''
    const display = sign + bubble.toFixed(1) + '٪'
    const full = `حباب اسمی ${getBubbleAsmiValue(name)!.toFixed(1)}٪ + حباب ذاتی ${getBubbleZatiValue(name)!.toFixed(1)}٪`
    return { display, full }
  }

  const getDollarRate = (name: string): { display: string; full: string } => {
    if (fundsLoading) return { display: '...', full: '' }
    const w = weights[name]
    if (!w || marketDollars.bullion == null || marketDollars.coin == null) return { display: '—', full: '' }
    const rate = (w.bar / 100) * marketDollars.bullion + (w.coin / 100) * marketDollars.coin
    const display = Math.round(rate).toLocaleString('fa-IR')
    const full = `شمش ${w.bar.toFixed(1)}٪ × ${Math.round(marketDollars.bullion).toLocaleString('fa-IR')} + سکه ${w.coin.toFixed(1)}٪ × ${Math.round(marketDollars.coin).toLocaleString('fa-IR')} تومان`
    return { display, full }
  }

  const getCellValue = (colKey: string, name: string): { display: string; full: string } => {
    if (colKey === 'marketToman') return getMv(name)
    if (colKey === 'marketUsd') return getUsd(name)
    if (colKey === 'bubbleAsmi') return getBubbleAsmi(name)
    if (colKey === 'bubbleZati') return getBubbleZati(name)
    if (colKey === 'bubbleVaqei') return getBubbleVaqei(name)
    if (colKey === 'dollarRate') return getDollarRate(name)
    const w = weights[name]
    if (colKey === 'coinWeight')    return w ? { display: w.coin.toFixed(1) + '٪', full: '' } : { display: '—', full: '' }
    if (colKey === 'goldBarWeight') return w ? { display: w.bar.toFixed(1)  + '٪', full: '' } : { display: '—', full: '' }
    if (colKey === 'liquidity')     return w ? { display: w.liq.toFixed(1)  + '٪', full: '' } : { display: '—', full: '' }
    return { display: '—', full: '' }
  }

  const tabBorder = 'rgba(0,200,255,0.12)'
  const tabBg     = 'rgba(10,18,30,0.6)'

  return (
    <div className="gsec" style={{ background: 'linear-gradient(180deg, rgba(13,22,38,0.75), rgba(8,14,24,0.6))', border: `0.5px solid ${tabBorder}`, borderRadius: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: `0.5px solid ${tabBorder}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" style={{ width: 3, height: 14, borderRadius: 2, background: 'linear-gradient(180deg, #FFC94A, #00C8FF)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: text }}>ماتریس صندوق‌های طلا</span>
          </div>
          <div style={{ fontSize: 10, color: fundsLoading ? muted : accent }}>
            {fundsLoading ? <Skeleton width={100} height={10} radius={5} /> : `${Object.values(fundsData).filter(v => v != null).length} صندوق با داده`}
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
                  const hasValue = v.display !== '—' && v.display !== '...'
                  if (col.key === 'bubbleAsmi' || col.key === 'bubbleVaqei') {
                    const raw = col.key === 'bubbleAsmi' ? getBubbleAsmiValue(name) : getBubbleVaqeiValue(name)
                    const c = raw == null ? muted : col.key === 'bubbleAsmi'
                      ? (raw > 2 ? '#FF4D6A' : raw < 0 ? '#00E5A0' : '#F59E0B')
                      : (raw > 0 ? '#FF4D6A' : '#00E5A0')
                    return (
                      <td key={col.key} title={v.full || undefined} style={{ padding: '9px 16px', whiteSpace: 'nowrap', cursor: v.full ? 'help' : 'default' }}>
                        {hasValue ? (
                          <span style={{
                            display: 'inline-block', fontSize: 11, fontWeight: 700, color: c,
                            background: `${c}18`, border: `0.5px solid ${c}30`, boxShadow: `0 0 10px ${c}30`,
                            borderRadius: 6, padding: '2px 10px', fontFamily: 'system-ui',
                          }}>{v.display}</span>
                        ) : <span style={{ color: muted }}>{v.display}</span>}
                      </td>
                    )
                  }
                  if (col.key === 'bubbleZati') {
                    const raw = getBubbleZatiValue(name)
                    const c = raw == null ? muted : raw > 0 ? '#FF4D6A' : '#00E5A0'
                    return (
                      <td key={col.key} title={v.full || undefined} style={{ padding: '9px 16px', whiteSpace: 'nowrap', cursor: v.full ? 'help' : 'default' }}>
                        <span style={{ color: hasValue ? c : muted, fontWeight: 600, fontFamily: 'system-ui', fontSize: 11 }}>{v.display}</span>
                      </td>
                    )
                  }
                  return (
                    <td
                      key={col.key}
                      title={v.full || undefined}
                      style={{
                        padding: '9px 16px',
                        color: col.key === 'marketToman' && hasValue ? text : muted,
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
        <div className="pop-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            {
              label: 'میانگین حباب ذاتی صندوق‌ها',
              value: (() => {
                const vals = GOLD_FUNDS.map(getBubbleZatiValue).filter((v): v is number => v != null)
                if (!vals.length) return '—'
                const avg = vals.reduce((s, v) => s + v, 0) / vals.length
                return (avg >= 0 ? '+' : '') + avg.toFixed(1) + '٪'
              })(),
            },
            {
              label: 'میانگین حباب اسمی صندوق‌ها',
              value: (() => {
                const vals = GOLD_FUNDS.map(getBubbleAsmiValue).filter((v): v is number => v != null)
                if (!vals.length) return '—'
                const avg = vals.reduce((s, v) => s + v, 0) / vals.length
                return (avg >= 0 ? '+' : '') + avg.toFixed(1) + '٪'
              })(),
            },
            {
              label: 'میانگین حباب واقعی صندوق‌ها',
              value: (() => {
                const vals = GOLD_FUNDS.map(getBubbleVaqeiValue).filter((v): v is number => v != null)
                if (!vals.length) return '—'
                const avg = vals.reduce((s, v) => s + v, 0) / vals.length
                return (avg >= 0 ? '+' : '') + avg.toFixed(1) + '٪'
              })(),
            },
          ].map(item => {
            const vColor = item.value === '—' ? muted : item.value.startsWith('+') ? '#FF4D6A' : '#00E5A0'
            return (
              <div key={item.label} className="gcard" style={{
                background: `linear-gradient(160deg, ${vColor}14, transparent 60%), rgba(0,200,255,0.03)`,
                border: `0.5px solid ${vColor}33`,
                borderRadius: 10,
                padding: '14px 16px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: vColor, fontFamily: 'system-ui', marginBottom: 6, textShadow: item.value === '—' ? 'none' : `0 0 18px ${vColor}55` }}>
                  {item.value}
                </div>
                <div style={{ fontSize: 10, color: muted }}>{item.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
