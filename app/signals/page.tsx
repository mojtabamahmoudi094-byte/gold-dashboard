'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { darkTheme, lightTheme } from '../../lib/theme'

const safe = (v: any) => Number(v || 0)
const pct = (v: number | null, d = 1) =>
  v == null ? null : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}٪`
const fmt = (v: number) => v.toLocaleString('fa-IR', { maximumFractionDigits: 0 })

// ── Auto-signal engine ─────────────────────────────────────────────────────
function computeAutoSignal(api: any) {
  if (!api) return null

  const bubble     = api.coins?.full?.bubble    // حباب سکه بهار
  const bubble24   = api.gram?.bubble24          // حباب گرم ۲۴ عیار
  const goldChg    = api.inputs?.goldUsdChange   // دهدهی (0.007 = 0.7٪)
  const dollarChg  = api.inputs?.dollarChange
  const bubbleUsdt = api.derived?.bubbleUsdt
  const bubbleDollar = api.derived?.bubbleDollar

  const b = bubble ?? bubble24   // اولویت سکه، fallback گرم
  let score = 0
  const reasons: { text: string; dir: 'pos' | 'neg' | 'neu' }[] = []

  // ── حباب سکه — مهم‌ترین فاکتور ──
  if (b != null) {
    if (b > 0.08) {
      score -= 3.5
      reasons.push({ text: `حباب سکه ${(b*100).toFixed(1)}٪ بالای ارزش ذاتی`, dir: 'neg' })
    } else if (b > 0.05) {
      score -= 2
      reasons.push({ text: `حباب متوسط سکه ${(b*100).toFixed(1)}٪`, dir: 'neg' })
    } else if (b > 0.02) {
      score -= 0.8
      reasons.push({ text: `حباب خفیف سکه ${(b*100).toFixed(1)}٪`, dir: 'neg' })
    } else if (b < -0.04) {
      score += 3
      reasons.push({ text: `سکه ${Math.abs(b*100).toFixed(1)}٪ زیر ارزش ذاتی — فرصت خرید`, dir: 'pos' })
    } else if (b < -0.02) {
      score += 1.5
      reasons.push({ text: `سکه کمی زیر ارزش ذاتی (${(b*100).toFixed(1)}٪)`, dir: 'pos' })
    } else if (b < 0.01) {
      score += 0.5
      reasons.push({ text: `قیمت سکه منطقی (حباب ${(b*100).toFixed(1)}٪)`, dir: 'neu' })
    }
  }

  // ── انس طلا جهانی ──
  if (goldChg != null) {
    if (goldChg > 0.015) {
      score += 1.5
      reasons.push({ text: `انس طلا امروز ${pct(goldChg, 2)} رشد کرد`, dir: 'pos' })
    } else if (goldChg > 0.005) {
      score += 0.7
      reasons.push({ text: `انس طلا امروز ${pct(goldChg, 2)}`, dir: 'pos' })
    } else if (goldChg < -0.015) {
      score -= 1.5
      reasons.push({ text: `انس طلا امروز ${pct(goldChg, 2)} افت کرد`, dir: 'neg' })
    } else if (goldChg < -0.005) {
      score -= 0.7
      reasons.push({ text: `انس طلا امروز ${pct(goldChg, 2)}`, dir: 'neg' })
    }
  }

  // ── نرخ دلار ──
  if (dollarChg != null) {
    if (dollarChg > 0.01) {
      score += 1
      reasons.push({ text: `دلار ${pct(dollarChg, 2)} رشد — فشار خرید طلا`, dir: 'pos' })
    } else if (dollarChg > 0.004) {
      score += 0.4
      reasons.push({ text: `دلار کمی رو به رشد (${pct(dollarChg, 2)})`, dir: 'pos' })
    } else if (dollarChg < -0.01) {
      score -= 0.8
      reasons.push({ text: `دلار ${pct(dollarChg, 2)} افت — کاهش جذابیت طلا`, dir: 'neg' })
    }
  }

  // ── USDT پرمیوم (شاخص فشار ارزی) ──
  if (bubbleUsdt != null) {
    if (bubbleUsdt > 0.05) {
      score += 0.8
      reasons.push({ text: `USDT ${(bubbleUsdt*100).toFixed(1)}٪ پرمیوم — فشار ارزی بالا`, dir: 'pos' })
    } else if (bubbleUsdt > 0.02) {
      score += 0.3
      reasons.push({ text: `USDT کمی پرمیوم (${(bubbleUsdt*100).toFixed(1)}٪)`, dir: 'neu' })
    } else if (bubbleUsdt < -0.02) {
      score -= 0.4
      reasons.push({ text: `USDT دیسکانت — کاهش تقاضای ارزی`, dir: 'neg' })
    }
  }

  // ── اختلاف دلار صرافی با درهم ──
  if (bubbleDollar != null) {
    if (bubbleDollar > 0.04) {
      score += 0.5
      reasons.push({ text: `دلار صرافی ${(bubbleDollar*100).toFixed(1)}٪ بالاتر از درهم`, dir: 'pos' })
    }
  }

  // ── تفسیر نهایی ──
  let type: string
  let color: string
  let confidence: number

  if (score >= 2.5) {
    type = 'خرید'
    color = '#10B981'
    confidence = Math.min(90, Math.round(50 + score * 8))
  } else if (score <= -2.5) {
    type = 'فروش'
    color = '#EF4444'
    confidence = Math.min(90, Math.round(50 + Math.abs(score) * 8))
  } else if (score >= 1) {
    type = 'تمایل خرید'
    color = '#3BB07A'
    confidence = Math.round(40 + score * 6)
  } else if (score <= -1) {
    type = 'احتیاط'
    color = '#F59E0B'
    confidence = Math.round(40 + Math.abs(score) * 6)
  } else {
    type = 'نگه‌داری'
    color = '#00C8FF'
    confidence = Math.round(45 + Math.abs(score) * 4)
  }

  return { type, color, confidence, score, reasons }
}

// ── outcome: price_close change of عیار (asset_id=2) ──────────────────────
function getOutcome(
  signalDate: string,
  signalType: string,
  dates: string[],
  priceMap: Record<string, number>,
  N: number
): number | null {
  const idx = dates.findIndex(d => d >= signalDate)
  if (idx < 0 || idx + N >= dates.length) return null
  const entry = priceMap[dates[idx]]
  const exit_ = priceMap[dates[idx + N]]
  if (!entry || !exit_) return null
  const ret = (exit_ - entry) / entry * 100
  // فروش موفق = ریزش قیمت
  return signalType === 'فروش' ? -ret : ret
}

export default function SignalsPage() {
  const [signals, setSignals]     = useState<any[]>([])
  const [dates, setDates]         = useState<string[]>([])
  const [priceMap, setPriceMap]   = useState<Record<string, number>>({})
  const [flowMap, setFlowMap]     = useState<Record<string, number>>({}) // net individual flow
  const [apiData, setApiData]     = useState<any>(null)
  const [isDark, setIsDark]       = useState(true)
  const [loading, setLoading]     = useState(true)
  const [isMobile, setIsMobile]   = useState(false)
  const [showDays, setShowDays]   = useState<5 | 10 | 20>(10)

  const t: any = isDark ? darkTheme : lightTheme

  // sync theme
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
    const load = async () => {
      // ۱. سیگنال‌ها
      const { data: sigs } = await supabase
        .from('signals')
        .select('*')
        .order('id', { ascending: false })
      if (sigs) setSignals(sigs)

      // ۲. تاریخچه قیمت عیار (بزرگ‌ترین ETF طلا، asset_id=2)
      const { data: prices } = await supabase
        .from('gold_funds')
        .select('trade_date_shamsi, price_close, buy_i_volume, sell_i_volume')
        .eq('asset_id', 2)
        .order('trade_date_shamsi', { ascending: true })
      if (prices && prices.length > 0) {
        const ds = prices.map((p: any) => p.trade_date_shamsi as string)
        const pm: Record<string, number> = {}
        const fm: Record<string, number> = {}
        prices.forEach((p: any) => {
          pm[p.trade_date_shamsi] = safe(p.price_close)
          // net = خرید حقیقی - فروش حقیقی (مثبت = ورود پول)
          fm[p.trade_date_shamsi] = safe(p.buy_i_volume) - safe(p.sell_i_volume)
        })
        setDates(ds)
        setPriceMap(pm)
        setFlowMap(fm)
      }

      // ۳. API تحلیل طلا برای سیگنال لحظه‌ای
      try {
        const res = await fetch('/api/gold-analysis')
        if (res.ok) setApiData(await res.json())
      } catch { /* ignore */ }

      setLoading(false)
    }
    load()
  }, [])

  const autoSignal = computeAutoSignal(apiData)

  // stats
  const buys  = signals.filter(s => s.signal_type === 'خرید')
  const sells  = signals.filter(s => s.signal_type === 'فروش')
  const holds  = signals.filter(s => s.signal_type === 'نگه‌داری')
  const trading = signals.filter(s => s.signal_type !== 'نگه‌داری')

  const outcomes10 = trading.map(s => getOutcome(s.signal_date_shamsi, s.signal_type, dates, priceMap, 10))
  const evaluated  = trading.filter((_, i) => outcomes10[i] !== null)
  const evOuts     = outcomes10.filter(o => o !== null) as number[]
  const won        = evOuts.filter(o => o > 0)
  const winRate    = evOuts.length > 0 ? Math.round(won.length / evOuts.length * 100) : null
  const avgReturn  = evOuts.length > 0 ? evOuts.reduce((a, b) => a + b, 0) / evOuts.length : null

  // colors
  const BG     = t.bg
  const PANEL  = t.panel
  const BORDER = t.border
  const TEXT   = t.text
  const MUTED  = t.muted
  const FAINT  = t.faint
  const GOLD   = t.gold
  const GOLD_BG = isDark ? 'rgba(212,168,71,0.08)' : 'rgba(212,168,71,0.1)'

  const GREEN = t.green
  const RED   = t.red

  return (
    <main style={{
      minHeight: '100vh', background: BG, color: TEXT,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      transition: 'background 0.3s, color 0.3s',
    }}>
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Header row ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: isDark ? '#FFFFFF' : t.textBright }}>
              سیگنال‌های بازار
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>
              بر پایه حباب سکه، انس طلا، نرخ دلار و جریان پول حقیقی
            </p>
          </div>
          {apiData?.updatedAt && (
            <span style={{ fontSize: 10.5, color: FAINT }}>
              آخرین بروزرسانی: {new Date(apiData.updatedAt).toLocaleTimeString('fa-IR')}
            </span>
          )}
        </div>

        {/* ── Live auto signal card ── */}
        {loading ? (
          <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />
        ) : autoSignal ? (
          <div style={{
            background: isDark ? `rgba(7,20,40,0.92)` : `rgba(255,252,244,0.95)`,
            border: `1px solid ${autoSignal.color}28`,
            borderRadius: 14,
            padding: isMobile ? '20px 18px' : '22px 28px',
            boxShadow: `0 4px 32px rgba(0,0,0,0.35), 0 0 0 1px ${autoSignal.color}14`,
            position: 'relative', overflow: 'hidden',
          }}>
            {/* top accent line */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: `linear-gradient(90deg, ${autoSignal.color}, transparent)`,
            }} />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 16 : 28, alignItems: 'flex-start' }}>
              {/* signal badge */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140 }}>
                <span style={{ fontSize: 10, color: MUTED, letterSpacing: '0.06em' }}>سیگنال لحظه‌ای</span>
                <span style={{
                  fontSize: isMobile ? 26 : 30, fontWeight: 700,
                  color: autoSignal.color,
                  textShadow: `0 0 20px ${autoSignal.color}40`,
                }}>
                  {autoSignal.type}
                </span>
                {/* confidence bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 3, background: BORDER, overflow: 'hidden', maxWidth: 100 }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${autoSignal.confidence}٪`,
                      background: `linear-gradient(90deg, ${autoSignal.color}99, ${autoSignal.color})`,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: autoSignal.color }}>
                    {autoSignal.confidence}٪
                  </span>
                </div>
              </div>

              {/* reasons */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
                <span style={{ fontSize: 10, color: MUTED, letterSpacing: '0.06em', marginBottom: 2 }}>دلایل</span>
                {autoSignal.reasons.map((r: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 9,
                      color: r.dir === 'pos' ? GREEN : r.dir === 'neg' ? RED : MUTED,
                    }}>
                      {r.dir === 'pos' ? '▲' : r.dir === 'neg' ? '▼' : '●'}
                    </span>
                    <span style={{ fontSize: 12, color: r.dir === 'pos' ? GREEN : r.dir === 'neg' ? RED : MUTED }}>
                      {r.text}
                    </span>
                  </div>
                ))}
              </div>

              {/* live snapshot */}
              {apiData && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  padding: '12px 16px',
                  background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10, minWidth: 160,
                }}>
                  <span style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>بازار فعلی</span>
                  {[
                    { label: 'انس طلا', val: `$${fmt(apiData.inputs?.goldUsd)}`, chg: apiData.inputs?.goldUsdChange },
                    { label: 'دلار', val: `${fmt(apiData.inputs?.dollarT)} ت`, chg: apiData.inputs?.dollarChange },
                    { label: 'حباب سکه', val: apiData.coins?.full?.bubble != null ? `${(apiData.coins.full.bubble*100).toFixed(1)}٪` : '—', chg: null },
                    { label: 'USDT', val: `${fmt(apiData.inputs?.usdtT)} ت`, chg: null },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: MUTED }}>{row.label}</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {row.chg != null && (
                          <span style={{
                            fontSize: 9,
                            color: row.chg >= 0 ? GREEN : RED,
                          }}>
                            {pct(row.chg, 2)}
                          </span>
                        )}
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: TEXT, fontFamily: 'system-ui, sans-serif' }}>
                          {row.val}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* ── Summary cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          {[
            { label: 'سیگنال خرید',     count: buys.length,       color: GREEN, suffix: '' },
            { label: 'سیگنال فروش',     count: sells.length,      color: RED,   suffix: '' },
            { label: 'نگه‌داری',        count: holds.length,      color: t.accent, suffix: '' },
            ...(winRate !== null ? [{ label: 'نرخ موفقیت ۱۰ روزه', count: winRate, suffix: '٪',
              color: winRate >= 60 ? GREEN : winRate >= 40 ? '#F59E0B' : RED }] : []),
            ...(avgReturn !== null ? [{ label: 'میانگین بازده', count: Math.abs(avgReturn), suffix: `٪ ${avgReturn >= 0 ? '↑' : '↓'}`,
              color: avgReturn >= 0 ? GREEN : RED }] : []),
          ].map((card: any) => (
            <div key={card.label} style={{
              background: PANEL, border: `0.5px solid ${BORDER}`,
              borderRadius: 12, padding: '14px 16px',
              backdropFilter: 'blur(12px)',
            }}>
              <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 8 }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: card.color, fontFamily: 'system-ui, sans-serif' }}>
                {card.count.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}
                {card.suffix && <span style={{ fontSize: 13, marginRight: 2 }}>{card.suffix}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* ── Signals table ── */}
        <div style={{
          background: PANEL,
          border: `0.5px solid ${BORDER}`,
          borderRadius: 14, padding: '16px 20px',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>تاریخچه سیگنال‌ها</span>
              <span style={{ fontSize: 11, color: MUTED, marginRight: 8 }}>بر اساس قیمت پایانی عیار</span>
            </div>
            {/* بازه بررسی */}
            <div style={{ display: 'flex', gap: 6 }}>
              {([5, 10, 20] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setShowDays(d)}
                  style={{
                    fontSize: 11, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: showDays === d ? GOLD_BG : 'transparent',
                    border: `1px solid ${showDays === d ? (isDark ? 'rgba(212,168,71,0.35)' : 'rgba(180,140,40,0.3)') : BORDER}`,
                    color: showDays === d ? GOLD : MUTED,
                    transition: 'all 0.18s',
                  }}
                >
                  {d} روزه
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: MUTED, fontSize: 13 }}>در حال بارگذاری...</div>
          ) : signals.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: MUTED, fontSize: 13 }}>
              هنوز سیگنالی ثبت نشده است
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {[
                      'تاریخ', 'نوع', 'اعتماد', `نتیجه ${showDays} روزه`,
                      'جریان پول', 'دلیل'
                    ].map(h => (
                      <th key={h} style={{
                        color: MUTED, fontWeight: 500, textAlign: 'right',
                        padding: '8px 10px',
                        borderBottom: `1px solid ${BORDER}`,
                        whiteSpace: 'nowrap', fontSize: 11,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s) => {
                    const sigColor = s.signal_type === 'خرید' ? GREEN : s.signal_type === 'فروش' ? RED : t.accent
                    const conf = typeof s.confidence === 'number' ? s.confidence : null
                    const confColor = conf === null ? FAINT : conf >= 70 ? GREEN : conf >= 40 ? '#F59E0B' : RED
                    const outcome = s.signal_type !== 'نگه‌داری'
                      ? getOutcome(s.signal_date_shamsi, s.signal_type, dates, priceMap, showDays)
                      : null
                    const ocColor = outcome === null ? FAINT : outcome > 2 ? GREEN : outcome < -2 ? RED : '#F59E0B'
                    const netFlow = flowMap[s.signal_date_shamsi]
                    const flowM = netFlow != null ? Math.round(netFlow / 1e6) : null // میلیون واحد

                    return (
                      <tr key={s.id} style={{
                        borderBottom: `0.5px solid ${BORDER}`,
                        transition: 'background 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <td style={{ padding: '11px 10px', color: TEXT, whiteSpace: 'nowrap', fontSize: 12 }}>
                          {s.signal_date_shamsi}
                        </td>
                        <td style={{ padding: '11px 10px' }}>
                          <span style={{
                            display: 'inline-block',
                            background: `${sigColor}18`,
                            color: sigColor,
                            border: `1px solid ${sigColor}30`,
                            borderRadius: 6, padding: '3px 12px',
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {s.signal_type}
                          </span>
                        </td>
                        <td style={{ padding: '11px 10px', minWidth: 90 }}>
                          {conf !== null ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: confColor, fontFamily: 'system-ui' }}>{conf}٪</span>
                              <div style={{ height: 3, borderRadius: 2, background: BORDER, overflow: 'hidden', width: 60 }}>
                                <div style={{ height: '100%', width: `${conf}%`, background: confColor, borderRadius: 2 }} />
                              </div>
                            </div>
                          ) : <span style={{ color: FAINT, fontSize: 10 }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 10px', whiteSpace: 'nowrap' }}>
                          {outcome !== null ? (
                            <span style={{
                              display: 'inline-block',
                              fontFamily: 'system-ui', fontSize: 11.5, fontWeight: 800,
                              color: ocColor,
                              background: `${ocColor}18`,
                              border: `1px solid ${ocColor}30`,
                              borderRadius: 6, padding: '3px 10px',
                            }}>
                              {outcome > 0 ? '+' : ''}{outcome.toFixed(1)}٪
                            </span>
                          ) : (
                            <span style={{
                              fontSize: 10, color: FAINT,
                              fontStyle: 'italic',
                            }}>در انتظار</span>
                          )}
                        </td>
                        <td style={{ padding: '11px 10px', whiteSpace: 'nowrap' }}>
                          {flowM != null ? (
                            <span style={{
                              fontSize: 11, fontWeight: 600,
                              color: flowM >= 0 ? GREEN : RED,
                              fontFamily: 'system-ui',
                            }}>
                              {flowM >= 0 ? '+' : ''}{flowM.toLocaleString('fa-IR')}M
                            </span>
                          ) : <span style={{ color: FAINT, fontSize: 10 }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 10px', color: MUTED, fontSize: 11, maxWidth: 240, lineHeight: 1.5 }}>
                          {s.reason || s.note || <span style={{ color: FAINT, fontSize: 10 }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div style={{
            display: 'flex', gap: 20, marginTop: 14, paddingTop: 12,
            borderTop: `0.5px solid ${BORDER}`,
            flexWrap: 'wrap',
          }}>
            {[
              { color: GREEN, label: 'نتیجه مثبت (>+2٪)' },
              { color: '#F59E0B', label: 'نتیجه خنثی (±2٪)' },
              { color: RED, label: 'نتیجه منفی (<−2٪)' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
                <span style={{ fontSize: 10, color: FAINT }}>{l.label}</span>
              </div>
            ))}
            <span style={{ fontSize: 10, color: FAINT, marginRight: 'auto' }}>
              قیمت مبنا: صندوق عیار (بزرگ‌ترین ETF طلا)
            </span>
          </div>
        </div>

        {/* ── Disclaimer ── */}
        <div style={{
          fontSize: 10.5, color: FAINT, textAlign: 'center',
          padding: '8px 0 4px',
        }}>
          سیگنال‌های این صفحه صرفاً جنبه اطلاع‌رسانی دارند و توصیه سرمایه‌گذاری نیستند
        </div>

      </div>
    </main>
  )
}
