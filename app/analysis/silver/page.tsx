'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { SILVER_FUND_WEIGHTS } from '../../../lib/goldBubbles'

const GRAMS_PER_OZ = 31.103431

const fmt = (n: number | null) =>
  n == null ? '—' : Math.round(n).toLocaleString('fa-IR')

const fmtUsd = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtPct = (n: number | null) =>
  n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}٪`

interface SilverFund {
  asset_id: number
  name: string
  slug: string
  price_close: number
  price_change_pct: number
  trade_value: number
  market_value: number
  buy_i_volume: number
  sell_i_volume: number
  nav: number | null
  bubbleAsmi: number | null
}

export default function SilverAnalysisPage() {
  const [api, setApi] = useState<any>(null)
  const [funds, setFunds] = useState<SilverFund[]>([])
  const [lastDate, setLastDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [apiRes, navRes] = await Promise.all([
        fetch('/api/gold-analysis', { cache: 'no-store' }),
        fetch('/api/gold-nav'),
      ])
      const apiData = apiRes.ok ? await apiRes.json() : null
      const navs: Record<string, number> = navRes.ok ? (await navRes.json())?.navs ?? {} : {}
      setApi(apiData)

      const { data: assets } = await supabase
        .from('assets').select('id, name, category, slug').eq('category', 'نقره')
      if (assets?.length) {
        const ids = assets.map(a => a.id)
        const { data: latest } = await supabase
          .from('gold_funds')
          .select('trade_date_shamsi')
          .in('asset_id', ids)
          .not('price_close', 'is', null)
          .order('trade_date_shamsi', { ascending: false })
          .limit(1)
        const date = latest?.[0]?.trade_date_shamsi
        setLastDate(date ?? null)
        if (date) {
          const { data: recs } = await supabase
            .from('gold_funds')
            .select('asset_id, price_close, price_change_pct, trade_value, market_value, buy_i_volume, sell_i_volume')
            .eq('trade_date_shamsi', date)
            .in('asset_id', ids)
          const byId: Record<number, any> = {}
          assets.forEach(a => { byId[a.id] = a })
          const merged: SilverFund[] = (recs ?? []).map((r: any) => {
            const a = byId[r.asset_id]
            const nav = navs[a?.name] ?? null
            const bubbleAsmi = nav && r.price_close ? ((r.price_close - nav) / nav) * 100 : null
            return { ...r, name: a?.name, slug: a?.slug, nav, bubbleAsmi }
          }).filter(f => f.name)
          merged.sort((a, b) => (b.market_value || 0) - (a.market_value || 0))
          setFunds(merged)
        }
      }
      setLastFetch(new Date())
    } catch (e) {
      console.error('[silver-analysis] load failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [load])

  const bg     = '#060B14'
  const border = 'rgba(192,200,216,0.14)'
  const accent = '#C0C8D8'
  const green  = '#00E5A0'
  const red    = '#FF4D6A'
  const muted  = '#5A7088'
  const text   = '#E8F4FF'

  const silverUsd = api?.inputs?.silverUsd ?? null
  const goldUsd   = api?.inputs?.goldUsd ?? null
  const dollarT   = api?.inputs?.dollarT ?? null
  const dirhamT   = api?.inputs?.dirhamT ?? null
  const dollarViaDirham = dirhamT != null ? dirhamT * 3.6732 : null

  // قیمت واقعی هر گرم نقره ۹۹۹ (تومان)
  const fairGramMarket = silverUsd && dollarT ? (silverUsd * dollarT) / GRAMS_PER_OZ : null
  const fairGramDirham = silverUsd && dollarViaDirham ? (silverUsd * dollarViaDirham) / GRAMS_PER_OZ : null
  const goldSilverRatio = goldUsd && silverUsd ? goldUsd / silverUsd : null

  // بورس کالا: قیمت تابلو نقدی شمش نقره (تومان هر گرم) + حباب نسبت به قیمت واقعی
  const silverBarT = api?.ime?.silverBarT ?? null
  const fairSilverGram = api?.ime?.fairSilverGram ?? fairGramDirham
  const silverBubble = silverBarT != null && fairSilverGram
    ? ((silverBarT - fairSilverGram) / fairSilverGram) * 100 : null

  // حباب ذاتی صندوق = وزن گواهی نقره × حباب شمش نقره
  const bubbleZati = (f: SilverFund): number | null => {
    const w = SILVER_FUND_WEIGHTS[f.name]
    if (!w || silverBubble == null) return null
    return (w.silver / 100) * silverBubble
  }
  // حباب واقعی = حباب اسمی + حباب ذاتی
  const bubbleVaqei = (f: SilverFund): number | null => {
    const zati = bubbleZati(f)
    return f.bubbleAsmi != null && zati != null ? f.bubbleAsmi + zati : null
  }

  const bubbles = funds.map(f => f.bubbleAsmi).filter((b): b is number => b != null)
  const avgBubble = bubbles.length ? bubbles.reduce((s, b) => s + b, 0) / bubbles.length : null
  const vaqeis = funds.map(bubbleVaqei).filter((b): b is number => b != null)
  const avgVaqei = vaqeis.length ? vaqeis.reduce((s, b) => s + b, 0) / vaqeis.length : null
  const zatis = funds.map(bubbleZati).filter((b): b is number => b != null)
  const avgZati = zatis.length ? zatis.reduce((s, b) => s + b, 0) / zatis.length : null
  const totalMarketBT = funds.reduce((s, f) => s + (f.market_value || 0), 0) / 10_000_000_000
  const totalNetFlow = funds.reduce((s, f) => s + ((f.buy_i_volume || 0) - (f.sell_i_volume || 0)), 0)

  return (
    <main style={{
      minHeight: '100vh', color: text,
      background: `
        radial-gradient(ellipse 60% 40% at 85% -5%, rgba(192,200,216,0.07), transparent 60%),
        radial-gradient(ellipse 55% 35% at 10% 0%, rgba(0,200,255,0.05), transparent 60%),
        ${bg}`,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <style>{`
        .ssec { transition: border-color .2s ease, box-shadow .2s ease; }
        .ssec:hover { border-color: rgba(192,200,216,.32) !important; box-shadow: 0 12px 40px rgba(0,0,0,.4); }
        .scard { transition: transform .2s ease, border-color .2s ease, background .2s ease; }
        .scard:hover { border-color: rgba(192,200,216,.4) !important; background: rgba(192,200,216,.07) !important; transform: translateY(-2px); }
        tr.srow { transition: background .15s ease; }
        tr.srow:hover { background: rgba(192,200,216,.05); }
        tbody tr.srow:nth-child(even) { background: rgba(255,255,255,.017); }
        tbody tr.srow:nth-child(even):hover { background: rgba(192,200,216,.05); }
        @media (prefers-reduced-motion: reduce) {
          .ssec, .scard, tr.srow { transition: none !important; }
          .scard:hover { transform: none !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${border}`, background: 'rgba(6,11,20,0.75)',
        backdropFilter: 'blur(12px)', padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 30,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/analysis" style={{ color: muted, textDecoration: 'none', fontSize: 12 }}>تحلیل</a>
          <span style={{ color: muted, fontSize: 10 }}>›</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 34, height: 34, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(192,200,216,0.2), rgba(192,200,216,0.05))',
              border: '0.5px solid rgba(192,200,216,0.4)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C0C8D8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 15h12l2 5H4l2-5Z" />
                <path d="M8 9h8l2 5H6l2-5Z" />
                <path d="M10 3h4l2 5H8l2-5Z" />
              </svg>
            </span>
            <div>
              <div style={{
                fontSize: 16, fontWeight: 800,
                background: 'linear-gradient(90deg, #C0C8D8, #E8F4FF 70%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>تحلیل نقره</div>
              <div style={{ fontSize: 10, color: muted }}>
                {lastDate ? `آخرین روز بازار: ${lastDate}` : 'در حال بارگذاری...'}
              </div>
            </div>
          </div>
        </div>
        {lastFetch && (
          <span style={{ fontSize: 10, color: muted }}>
            بروز: {lastFetch.toLocaleTimeString('fa-IR')}
          </span>
        )}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Row 1: ورودی‌های زنده */}
        <Section title="ورودی‌های روزانه" subtitle="داده زنده از API" border={border} text={text} muted={muted}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <StatCard label="انس نقره" value={fmtUsd(silverUsd)} unit="دلار" accent={accent} border={border} muted={muted} />
            <StatCard label="انس طلا" value={fmtUsd(goldUsd)} unit="دلار" accent="#FFC94A" border={border} muted={muted} />
            <StatCard label="ارز بازار" value={fmt(dollarT)} unit="تومان" accent={green} border={border} muted={muted} />
            <StatCard label="نسبت طلا به نقره" value={goldSilverRatio != null ? goldSilverRatio.toLocaleString('fa-IR', { maximumFractionDigits: 1 }) : '—'}
              unit="Gold/Silver Ratio" accent={accent} border={border} muted={muted}
              note={goldSilverRatio != null ? (goldSilverRatio > 80 ? 'نقره نسبتاً ارزان' : goldSilverRatio < 55 ? 'نقره نسبتاً گران' : 'محدوده تاریخی') : undefined} />
          </div>
        </Section>

        {/* Row 2: قیمت واقعی گرم نقره + بورس کالا */}
        <Section title="قیمت واقعی نقره و بورس کالا" subtitle="هر گرم نقره خالص ۹۹۹ — انس جهانی vs تابلو نقدی شمش نقره (BrsAPI — بورس کالا)" border={border} text={text} muted={muted}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <StatCard label="قیمت واقعی گرم نقره" value={fmt(fairSilverGram)} unit="تومان"
              note="انس ÷ انس‌گرم × (درهم × ۳.۶۷۳۲)" accent={accent} border={border} muted={muted} />
            <StatCard label="قیمت تابلو نقدی شمش نقره" value={fmt(silverBarT)} unit="تومان هر گرم"
              note="قیمت پایانی SilverBar — بورس کالا" accent={accent} border={border} muted={muted} />
            <StatCard label="حباب شمش نقره"
              value={silverBubble != null ? fmtPct(silverBubble) : '—'} unit="تابلو نسبت به واقعی"
              note="(تابلو − واقعی) ÷ واقعی × ۱۰۰"
              accent={silverBubble == null ? muted : silverBubble > 0 ? red : green}
              border={border} muted={muted} />
            <StatCard label="گرم نقره با دلار بازار" value={fmt(fairGramMarket)} unit="تومان"
              note={`انس ÷ ${GRAMS_PER_OZ} × دلار بازار`} accent={accent} border={border} muted={muted} />
            <StatCard label="ارزش کل صندوق‌های نقره" value={fmt(totalMarketBT)} unit="میلیارد تومان"
              note={`${funds.length.toLocaleString('fa-IR')} صندوق فعال`} accent={green} border={border} muted={muted} />
          </div>
        </Section>

        {/* Row 3: ماتریس صندوق‌های نقره */}
        <div className="ssec" style={{
          background: 'linear-gradient(180deg, rgba(16,22,34,0.75), rgba(10,14,24,0.6))',
          border: `0.5px solid ${border}`, borderRadius: 16, overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 18px', borderBottom: `0.5px solid ${border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden="true" style={{ width: 3, height: 14, borderRadius: 2, background: 'linear-gradient(180deg, #C0C8D8, #00C8FF)' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: text }}>ماتریس صندوق‌های نقره</span>
              </div>
              <span style={{ fontSize: 10, color: loading ? muted : accent }}>
                {loading ? 'در حال بارگذاری...' : `${funds.length.toLocaleString('fa-IR')} صندوق با داده`}
              </span>
            </div>
            <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>حباب اسمی (قیمت vs NAV) + حباب ذاتی (وزن گواهی نقره × حباب شمش) = حباب واقعی</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['نام صندوق', 'ارزش بازار', 'قیمت پایانی', 'NAV ابطال', 'حباب اسمی', 'حباب ذاتی', 'حباب واقعی', 'وزن گواهی نقره', 'تغییر روزانه', 'جریان پول حقیقی', 'ارزش معاملات'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', color: muted, fontWeight: 500, textAlign: 'right',
                      borderBottom: `0.5px solid ${border}`, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {funds.map(f => {
                  const net = (f.buy_i_volume || 0) - (f.sell_i_volume || 0)
                  const netM = Math.round(net / 1e6)
                  const mvBT = f.market_value != null ? f.market_value / 10_000_000_000 : null
                  const tvBT = f.trade_value != null ? f.trade_value / 10_000_000_000 : null
                  const bc = f.bubbleAsmi == null ? muted : f.bubbleAsmi > 2 ? red : f.bubbleAsmi < 0 ? green : '#F59E0B'
                  const bz = bubbleZati(f)
                  const bzc = bz == null ? muted : bz > 0 ? red : green
                  const bv = bubbleVaqei(f)
                  const bvc = bv == null ? muted : bv > 0 ? red : green
                  const w = SILVER_FUND_WEIGHTS[f.name]
                  return (
                    <tr key={f.asset_id} className="srow" style={{ borderBottom: `0.5px solid ${border}` }}>
                      <td style={{ padding: '10px 16px', color: text, fontWeight: 600, whiteSpace: 'nowrap' }}>{f.name}</td>
                      <td style={{ padding: '10px 16px', color: text, fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>
                        {mvBT != null ? `${fmt(mvBT)} م.ت` : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', color: accent, fontFamily: 'system-ui', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {fmt(f.price_close / 10)} <span style={{ fontSize: 9, color: muted }}>تومان</span>
                      </td>
                      <td style={{ padding: '10px 16px', color: muted, fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>
                        {f.nav != null ? fmt(f.nav / 10) : '—'} {f.nav != null && <span style={{ fontSize: 9 }}>تومان</span>}
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        {f.bubbleAsmi != null ? (
                          <span style={{
                            display: 'inline-block', fontSize: 11, fontWeight: 700, color: bc,
                            background: `${bc}18`, border: `0.5px solid ${bc}30`,
                            borderRadius: 6, padding: '2px 10px', fontFamily: 'system-ui',
                          }}>{fmtPct(f.bubbleAsmi)}</span>
                        ) : <span style={{ color: muted }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}
                        title={bz != null ? `گواهی نقره ${w!.silver}٪ × حباب شمش نقره ${silverBubble!.toFixed(1)}٪` : undefined}>
                        {bz != null ? (
                          <span style={{ color: bzc, fontWeight: 600, fontFamily: 'system-ui', fontSize: 11, cursor: 'help' }}>
                            {fmtPct(bz)}
                          </span>
                        ) : <span style={{ color: muted }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}
                        title={bv != null ? `حباب اسمی ${f.bubbleAsmi!.toFixed(1)}٪ + حباب ذاتی ${bz!.toFixed(1)}٪` : undefined}>
                        {bv != null ? (
                          <span style={{
                            display: 'inline-block', fontSize: 11, fontWeight: 700, color: bvc,
                            background: `${bvc}18`, border: `0.5px solid ${bvc}30`,
                            borderRadius: 6, padding: '2px 10px', fontFamily: 'system-ui', cursor: 'help',
                          }}>{fmtPct(bv)}</span>
                        ) : <span style={{ color: muted }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 16px', color: muted, fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>
                        {w ? `${w.silver.toLocaleString('fa-IR')}٪` : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', fontFamily: 'system-ui', whiteSpace: 'nowrap',
                        color: (f.price_change_pct ?? 0) >= 0 ? green : red, fontWeight: 600 }}>
                        {f.price_change_pct != null ? `${f.price_change_pct >= 0 ? '+' : ''}${f.price_change_pct.toFixed(2)}٪` : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', fontFamily: 'system-ui', whiteSpace: 'nowrap',
                        color: net >= 0 ? green : red, fontWeight: 600 }}>
                        {netM >= 0 ? '+' : ''}{netM.toLocaleString('fa-IR')}M
                      </td>
                      <td style={{ padding: '10px 16px', color: muted, fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>
                        {tvBT != null ? `${fmt(tvBT)} م.ت` : '—'}
                      </td>
                    </tr>
                  )
                })}
                {!loading && funds.length === 0 && (
                  <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: muted, fontSize: 12 }}>
                    داده صندوق نقره موجود نیست
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div style={{ borderTop: `0.5px solid ${border}`, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: muted, marginBottom: 10 }}>خلاصه بازار نقره</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {[
                {
                  label: 'میانگین حباب اسمی صندوق‌ها',
                  value: avgBubble != null ? fmtPct(avgBubble) : '—',
                  color: avgBubble == null ? muted : avgBubble > 0 ? red : green,
                },
                {
                  label: 'میانگین حباب ذاتی صندوق‌ها',
                  value: avgZati != null ? fmtPct(avgZati) : '—',
                  color: avgZati == null ? muted : avgZati > 0 ? red : green,
                },
                {
                  label: 'میانگین حباب واقعی صندوق‌ها',
                  value: avgVaqei != null ? fmtPct(avgVaqei) : '—',
                  color: avgVaqei == null ? muted : avgVaqei > 0 ? red : green,
                },
                {
                  label: 'مجموع ارزش بازار',
                  value: `${fmt(totalMarketBT)} م.ت`,
                  color: accent,
                },
                {
                  label: 'جریان پول حقیقی (خالص)',
                  value: `${totalNetFlow >= 0 ? '+' : ''}${Math.round(totalNetFlow / 1e6).toLocaleString('fa-IR')}M`,
                  color: totalNetFlow >= 0 ? green : red,
                },
              ].map(item => (
                <div key={item.label} className="scard" style={{
                  background: 'rgba(192,200,216,0.03)', border: `0.5px solid ${border}`,
                  borderRadius: 10, padding: '14px 16px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: item.color, fontFamily: 'system-ui', marginBottom: 6, textShadow: item.value === '—' ? 'none' : `0 0 16px ${item.color}33` }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: 10, color: muted }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 10.5, color: muted, textAlign: 'center', padding: '4px 0 8px' }}>
          داده‌های این صفحه جنبه اطلاع‌رسانی دارند و توصیه سرمایه‌گذاری نیستند
        </div>
      </div>
    </main>
  )
}

function Section({ title, subtitle, border, text, muted, children }: any) {
  return (
    <div className="ssec" style={{
      background: 'linear-gradient(180deg, rgba(16,22,34,0.75), rgba(10,14,24,0.6))',
      border: `0.5px solid ${border}`, borderRadius: 16, overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 18px', borderBottom: `0.5px solid ${border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden="true" style={{ width: 3, height: 14, borderRadius: 2, background: 'linear-gradient(180deg, #C0C8D8, #00C8FF)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: text }}>{title}</span>
        </div>
        {subtitle && <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  )
}

function StatCard({ label, value, unit, note, accent, border, muted }: any) {
  return (
    <div className="scard" style={{
      background: 'rgba(192,200,216,0.03)', border: `0.5px solid ${border}`,
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: muted, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent, fontFamily: 'system-ui', lineHeight: 1.2, textShadow: `0 0 14px ${accent}33` }}>
        {value}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: muted }}>{unit}</span>
        {note && <span style={{ fontSize: 10, color: muted }}>{note}</span>}
      </div>
    </div>
  )
}
