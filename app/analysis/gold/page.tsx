'use client'

import { useEffect, useState, useCallback } from 'react'

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

export default function GoldAnalysisPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

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
    const timer = setInterval(load, 5 * 60 * 1000) // refresh every 5 min
    return () => clearInterval(timer)
  }, [load])

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
              formula={`درهم × ${data?.constants?.AED_PER_USD ?? '۳.۶۷۳'}`}
              value={fmt(data?.derived?.dollarViaDirham)}
              unit="تومان"
              accent={accent}
            />
            <DollarCard
              label="حباب دلار بازار"
              formula="دلار بازار ÷ دلار درهم"
              value={fmtPct(data?.derived?.bubbleDollar)}
              color={bubbleColor(data?.derived?.bubbleDollar)}
              desc={bubbleLabel(data?.derived?.bubbleDollar)}
              accent={accent}
            />
            <DollarCard
              label="حباب تتر"
              formula="تتر ÷ دلار درهم"
              value={fmtPct(data?.derived?.bubbleUsdt)}
              color={bubbleColor(data?.derived?.bubbleUsdt)}
              desc={bubbleLabel(data?.derived?.bubbleUsdt)}
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
                  fair={data?.gram?.fair24}
                  market={data?.gram?.market24}
                  bubble={data?.gram?.bubble24}
                  impliedDollar={data?.gram?.impliedDollar24}
                  border={border} muted={muted} text={text}
                />
                <GoldRow
                  label="هر گرم ۱۸ عیار"
                  fair={data?.gram?.fair18}
                  market={data?.gram?.market18}
                  bubble={data?.gram?.bubble18}
                  border={border} muted={muted} text={text}
                />
                <GoldRow
                  label="مثقال طلا (۱۸ عیار)"
                  fair={data?.mesghal?.fair}
                  market={data?.mesghal?.market}
                  bubble={data?.mesghal?.bubble}
                  impliedDollar={data?.mesghal?.impliedDollar}
                  marketChange={data?.mesghal?.changePct}
                  border={border} muted={muted} text={text}
                />
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Row 4: Coins Table ── */}
        <Section title="سکه‌های طلا" subtitle="وزن عیار ۲۲ + هزینه ضرب ۵۰۰۰ تومان">
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
                  label="تمام سکه" weight={8.13}
                  fair={data?.coins?.full?.fair}
                  market={data?.coins?.full?.market}
                  bubble={data?.coins?.full?.bubble}
                  marketNote="API ندارد"
                  border={border} muted={muted} text={text}
                />
                <CoinRow
                  label="نیم سکه" weight={4.066}
                  fair={data?.coins?.half?.fair}
                  market={data?.coins?.half?.market}
                  bubble={data?.coins?.half?.bubble}
                  marketChange={data?.coins?.half?.changePct}
                  border={border} muted={muted} text={text}
                />
                <CoinRow
                  label="ربع سکه" weight={2.033}
                  fair={data?.coins?.quarter?.fair}
                  market={data?.coins?.quarter?.market}
                  bubble={data?.coins?.quarter?.bubble}
                  marketChange={data?.coins?.quarter?.changePct}
                  border={border} muted={muted} text={text}
                />
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Row 5: Constants ── */}
        <Section title="ثوابت محاسباتی" subtitle="مقادیر فیزیکی و مالی ثابت">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {[
              { label: 'گرم در هر انس', value: '۳۱.۱۰۳ گرم' },
              { label: 'نرخ تبدیل درهم', value: '۱ دلار = ۳.۶۷۳۲ درهم' },
              { label: 'عیار سکه', value: '۲۲ عیار' },
              { label: 'عیار شمش', value: '۲۴ عیار' },
              { label: 'وزن تمام سکه', value: '۸.۱۳ گرم' },
              { label: 'وزن نیم سکه', value: '۴.۰۶۶ گرم' },
              { label: 'وزن ربع سکه', value: '۲.۰۳۳ گرم' },
              { label: 'هزینه ضرب سکه', value: '۵۰۰۰ تومان' },
              { label: 'نرخ اخزا', value: '۲.۳٪' },
              { label: 'نرخ سود بانکی', value: '۲.۶٪' },
              { label: 'نرخ تامین مالی', value: '۴.۳٪' },
            ].map(c => (
              <div key={c.label} style={{
                background: 'rgba(0,200,255,0.03)', border: `0.5px solid ${border}`,
                borderRadius: 8, padding: '10px 14px', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 11, color: muted }}>{c.label}</span>
                <span style={{ fontSize: 12, color: text, fontWeight: 600, fontFamily: 'system-ui' }}>{c.value}</span>
              </div>
            ))}
          </div>
        </Section>

        <div style={{ textAlign: 'center', fontSize: 10, color: muted, paddingBottom: 24 }}>
          داده از TGJU · بروزرسانی خودکار هر ۵ دقیقه · تمام قیمت‌ها به تومان
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
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
          <>
            <div style={{ color: text, fontFamily: 'system-ui' }}>{fmt(market)}</div>
            {marketChange != null && (
              <div style={{ fontSize: 10, color: changeColor(marketChange) }}>
                {marketChange > 0 ? '▲' : '▼'} {Math.abs(marketChange).toFixed(2)}٪
              </div>
            )}
          </>
        ) : (
          <span style={{ color: muted, fontSize: 11 }}>{marketNote ?? '—'}</span>
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
