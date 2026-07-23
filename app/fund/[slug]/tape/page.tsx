'use client'

// تابلوخوانی صندوق — همهٔ نمودارهای معاملاتی با آرشیو نامحدود
// جزئیات حقیقی، ورود/خروج پول، سرانه، ارزش/حجم معاملات، قدرت خریدار،
// تعداد کدها، ارزش/حجم خرید و فروش حقیقی و حقوقی

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabase'
import { darkTheme, lightTheme, shouldUseDark } from '../../../../lib/theme'
import { safe } from '../../../../lib/format'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { downloadCSV } from '../../../../lib/csvExport'
import {
  BarChartPanel, LineChartPanel, StatRow, ChartKeyframes, SubPageHeader,
  fetchFundFullHistory, cream,
} from '../fundShared'

type Range = 10 | 30 | 90 | 'all'

export default function FundTapePage() {
  const params = useParams()
  const slug = decodeURIComponent((params?.slug as string) || '')
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [asset, setAsset] = useState<any>(null)
  const [all, setAll] = useState<any[] | null>(null)
  const [range, setRange] = useState<Range>(30)

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    if (!slug) return
    fetchFundFullHistory(supabase, slug).then(({ asset, rows }) => { setAsset(asset); setAll(rows) })
  }, [slug])

  const t: any = isDark ? darkTheme : lightTheme
  const cr = cream(t)

  const rows = all == null ? [] : (range === 'all' ? all : all.slice(-range))
  const latest = rows.length ? rows[rows.length - 1] : null

  // سرانهٔ آخرین روز (میلیون تومان) برای جزئیات حقیقی
  const rialDiv = latest && safe(latest.trade_value) > 1e6
  const avgDiv = rialDiv ? 1e7 : 1e6
  const buyAvgMT = latest && safe(latest.buy_count_i) > 0
    ? Math.round(safe(latest.buy_i_volume) * safe(latest.price_close) / safe(latest.buy_count_i) / avgDiv) : 0
  const sellAvgMT = latest && safe(latest.sell_count_i) > 0
    ? Math.round(safe(latest.sell_i_volume) * safe(latest.price_close) / safe(latest.sell_count_i) / avgDiv) : 0

  const panelStyle: React.CSSProperties = {
    background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12,
    padding: '16px 18px', backdropFilter: 'blur(12px)',
  }

  const csv = () => {
    downloadCSV(`${slug}-tape-archive.csv`, rows.map((r: any) => {
      const isR = safe(r.trade_value) > 1e6
      return {
        تاریخ: r.trade_date_shamsi,
        قیمت_پایانی: isR ? Math.round(safe(r.price_close) / 10) : safe(r.price_close),
        حجم: r.volume,
        ارزش_معاملات_ریال: r.trade_value,
        تعداد_خریدار_حقیقی: r.buy_count_i,
        تعداد_فروشنده_حقیقی: r.sell_count_i,
        حجم_خرید_حقیقی: r.buy_i_volume,
        حجم_فروش_حقیقی: r.sell_i_volume,
      }
    }))
  }

  return (
    <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SubPageHeader t={t} slug={slug} assetName={asset?.name ?? slug} crumb="تابلوخوانی" />

        {/* کنترل بازهٔ آرشیو */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: t.muted }}>بازهٔ آرشیو:</span>
          {([10, 30, 90, 'all'] as Range[]).map(r => (
            <button key={String(r)} onClick={() => setRange(r)} style={{
              fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              background: range === r ? t.accent : 'transparent',
              color: range === r ? '#0a0e14' : t.muted,
              border: `0.5px solid ${range === r ? t.accent : t.border}`,
            }}>{r === 'all' ? `همه (${(all?.length ?? 0).toLocaleString('fa-IR')})` : `${r.toLocaleString('fa-IR')} روز`}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button onClick={csv} style={{
            fontSize: 11, color: t.muted, cursor: 'pointer', padding: '5px 12px', borderRadius: 8,
            background: 'transparent', border: `0.5px solid ${t.border}`, fontFamily: 'inherit',
          }}>دانلود CSV</button>
        </div>

        {all == null && <div style={{ color: t.muted, fontSize: 13, padding: 40, textAlign: 'center' }}>در حال دریافت آرشیو…</div>}
        {all != null && rows.length === 0 && <div style={{ color: t.muted, fontSize: 13, padding: 40, textAlign: 'center' }}>داده‌ای ثبت نشده</div>}

        {rows.length > 0 && (
          <>
            {/* جزئیات معاملات حقیقی — آخرین روز */}
            <div style={panelStyle}>
              <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em', marginBottom: 12 }}>
                جزئیات معاملات حقیقی · {latest?.trade_date_shamsi}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                <div style={{ background: 'rgba(0,229,160,0.04)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00E5A0', marginBottom: 10 }}>خریداران حقیقی</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <StatRow label="تعداد" value={safe(latest?.buy_count_i).toLocaleString('fa-IR')} color="#00E5A0" />
                    <StatRow label="حجم خرید" value={safe(latest?.buy_i_volume).toLocaleString('fa-IR')} color="#00E5A0" />
                    <StatRow label="سرانه" value={`${buyAvgMT.toLocaleString('fa-IR')} م.ت`} color="#00E5A0" />
                  </div>
                </div>
                <div style={{ background: 'rgba(255,77,106,0.04)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#FF4D6A', marginBottom: 10 }}>فروشندگان حقیقی</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <StatRow label="تعداد" value={safe(latest?.sell_count_i).toLocaleString('fa-IR')} color="#FF4D6A" />
                    <StatRow label="حجم فروش" value={safe(latest?.sell_i_volume).toLocaleString('fa-IR')} color="#FF4D6A" />
                    <StatRow label="سرانه" value={`${sellAvgMT.toLocaleString('fa-IR')} م.ت`} color="#FF4D6A" />
                  </div>
                </div>
              </div>
            </div>

            {/* ورود/خروج پول حقیقی روزانه */}
            <MoneyFlowChart t={t} rows={rows} cr={cr} />

            {/* سرانهٔ خرید و فروش حقیقی روزانه */}
            <PerCapitaChart t={t} rows={rows} cr={cr} />

            {/* شبکهٔ نمودارهای تحلیلی */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <BarChartPanel t={t} title="ارزش معاملات" subtitle="م.ت"
                rows={rows} colorA={t.accent} labelA="ارزش"
                getA={r => { const tv = safe(r.trade_value); return tv > 1e6 ? Math.round(tv / 1e9) : tv }} />

              <BarChartPanel t={t} title="حجم معاملات" subtitle="میلیون سهم"
                rows={rows} colorA="#A78BFA" labelA="حجم"
                getA={r => safe(r.volume) / 1_000_000} />

              <LineChartPanel t={t} title="قدرت خریدار حقیقی" subtitle="برابر · بالای ۱ = خریدار قوی‌تر"
                rows={rows}
                getValue={r => {
                  const bc = safe(r.buy_count_i), sc = safe(r.sell_count_i)
                  const bA = bc > 0 ? safe(r.buy_i_volume) / bc : 0
                  const sA = sc > 0 ? safe(r.sell_i_volume) / sc : 0
                  return sA > 0 ? Math.round(bA / sA * 100) / 100 : 0
                }}
                colorAbove="#00E5A0" colorBelow="#FF4D6A" threshold={1} />

              <BarChartPanel t={t} title="تعداد کدهای معاملاتی حقیقی" subtitle="نفر"
                rows={rows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خریدار" labelB="فروشنده"
                getA={r => safe(r.buy_count_i)} getB={r => safe(r.sell_count_i)} />

              <BarChartPanel t={t} title="ارزش خرید و فروش حقیقی" subtitle="میلیارد تومان"
                rows={rows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
                getA={r => { const d = safe(r.trade_value) > 1e6 ? 1e10 : 1e9; return Math.round(safe(r.buy_i_volume) * safe(r.price_close) / d * 10) / 10 }}
                getB={r => { const d = safe(r.trade_value) > 1e6 ? 1e10 : 1e9; return Math.round(safe(r.sell_i_volume) * safe(r.price_close) / d * 10) / 10 }} />

              <BarChartPanel t={t} title="ارزش خرید و فروش حقوقی" subtitle="میلیارد تومان"
                rows={rows} colorA="#60A5FA" colorB="#F59E0B" labelA="خرید" labelB="فروش"
                getA={r => { const d = safe(r.trade_value) > 1e6 ? 1e10 : 1e9; return Math.round(Math.max(safe(r.volume) - safe(r.buy_i_volume), 0) * safe(r.price_close) / d * 10) / 10 }}
                getB={r => { const d = safe(r.trade_value) > 1e6 ? 1e10 : 1e9; return Math.round(Math.max(safe(r.volume) - safe(r.sell_i_volume), 0) * safe(r.price_close) / d * 10) / 10 }} />

              <BarChartPanel t={t} title="حجم خرید و فروش حقیقی" subtitle="میلیون سهم"
                rows={rows} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
                getA={r => safe(r.buy_i_volume) / 1_000_000}
                getB={r => safe(r.sell_i_volume) / 1_000_000} />

              <BarChartPanel t={t} title="حجم خرید و فروش حقوقی" subtitle="میلیون سهم"
                rows={rows} colorA="#60A5FA" colorB="#F59E0B" labelA="خرید" labelB="فروش"
                getA={r => Math.max(safe(r.volume) - safe(r.buy_i_volume), 0) / 1_000_000}
                getB={r => Math.max(safe(r.volume) - safe(r.sell_i_volume), 0) / 1_000_000} />
            </div>
          </>
        )}

        <div style={{ marginTop: 6 }}>
          <Link href={`/fund/${encodeURIComponent(slug)}`} style={{ color: t.accent, fontSize: 13, textDecoration: 'none' }}>← بازگشت به صفحهٔ صندوق</Link>
        </div>
      </div>
      <ChartKeyframes />
    </main>
  )
}

// ── ورود/خروج پول حقیقی روزانه (میله بالا/پایین صفر، سبز ورود، قرمز خروج) ──
function MoneyFlowChart({ t, rows, cr }: { t: any; rows: any[]; cr: string }) {
  const flows = rows.map(r => {
    const buyVal = safe(r.buy_i_volume) * safe(r.price_close)
    const sellVal = safe(r.sell_i_volume) * safe(r.price_close)
    const isRial = safe(r.trade_value) > 1e6
    const net = Math.round((buyVal - sellVal) / (isRial ? 1e10 : 1e9) * 10) / 10
    return { date: r.trade_date_shamsi || '', net }
  })
  const maxAbs = Math.max(...flows.map(f => Math.abs(f.net)), 1)
  const barMaxH = 100
  return (
    <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
      <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em', marginBottom: 16 }}>
        ورود و خروج پول حقیقی روزانه
        <span style={{ fontSize: 10, color: cr, marginRight: 8 }}>میلیارد تومان</span>
      </div>
      <div style={{ overflowX: 'auto', direction: 'ltr' }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: flows.length * 50, height: barMaxH * 2 + 50, position: 'relative', direction: 'ltr', paddingTop: 25 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: barMaxH + 35, height: 1, background: `${t.muted}33` }} />
          {flows.map((f, i) => {
            const isPos = f.net >= 0
            const h = Math.max((Math.abs(f.net) / maxAbs) * barMaxH, 3)
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', height: '100%' }}>
                <div style={{ position: 'absolute', top: isPos ? barMaxH + 35 - h - 20 : barMaxH + 35 + h + 4, fontSize: 9, fontWeight: 800, color: isPos ? '#00E5A0' : '#FF4D6A', whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,0.6)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  {isPos ? '+' : ''}{f.net}
                </div>
                <div style={{ position: 'absolute', top: isPos ? barMaxH + 35 - h : barMaxH + 36, width: '60%', maxWidth: 30, height: h, borderRadius: isPos ? '3px 3px 0 0' : '0 0 3px 3px', background: isPos ? 'linear-gradient(0deg, rgba(0,229,160,0.4), rgba(0,229,160,0.8))' : 'linear-gradient(180deg, rgba(255,77,106,0.4), rgba(255,77,106,0.8))' }} title={`${f.date}: ${isPos ? '+' : ''}${f.net} میلیارد تومان`} />
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', minWidth: flows.length * 50, marginTop: 4 }}>
          {flows.map((f, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: t.muted }}>{f.date.slice(5)}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── سرانهٔ خرید و فروش حقیقی روزانه (میلیون تومان) ──
function PerCapitaChart({ t, rows, cr }: { t: any; rows: any[]; cr: string }) {
  const caps = rows.map(r => {
    const bCnt = safe(r.buy_count_i), sCnt = safe(r.sell_count_i)
    const isRial = safe(r.trade_value) > 1e6
    const div = isRial ? 1e7 : 1e6
    const bAvg = bCnt > 0 ? Math.round((safe(r.buy_i_volume) * safe(r.price_close)) / bCnt / div) : 0
    const sAvg = sCnt > 0 ? Math.round((safe(r.sell_i_volume) * safe(r.price_close)) / sCnt / div) : 0
    return { date: r.trade_date_shamsi || '', bAvg, sAvg }
  })
  const maxVal = Math.max(...caps.map(f => Math.max(f.bAvg, f.sAvg)), 1)
  const barMaxH = 100
  return (
    <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: t.muted }}>سرانهٔ خرید و فروش حقیقی روزانه <span style={{ fontSize: 10, color: cr }}>میلیون تومان</span></div>
        <div style={{ display: 'flex', gap: 14, fontSize: 10 }}>
          <span style={{ color: '#00E5A0' }}>■ خرید</span>
          <span style={{ color: '#FF4D6A' }}>■ فروش</span>
        </div>
      </div>
      <div style={{ overflowX: 'auto', direction: 'ltr' }}>
        <div style={{ display: 'flex', minWidth: caps.length * 50, height: barMaxH + 40, alignItems: 'flex-end', paddingBottom: 25 }}>
          {caps.map((f, i) => {
            const buyH = Math.max((f.bAvg / maxVal) * barMaxH, 2)
            const sellH = Math.max((f.sAvg / maxVal) * barMaxH, 2)
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: 7, fontWeight: 800, color: '#00E5A0', marginBottom: 2, fontFamily: 'system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{f.bAvg}</div>
                    <div title={`سرانه خرید: ${f.bAvg} م.ت`} style={{ width: 12, height: buyH, borderRadius: '3px 3px 0 0', background: 'linear-gradient(0deg, rgba(0,229,160,0.4), rgba(0,229,160,0.8))' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: 7, fontWeight: 800, color: '#FF4D6A', marginBottom: 2, fontFamily: 'system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{f.sAvg}</div>
                    <div title={`سرانه فروش: ${f.sAvg} م.ت`} style={{ width: 12, height: sellH, borderRadius: '3px 3px 0 0', background: 'linear-gradient(0deg, rgba(255,77,106,0.4), rgba(255,77,106,0.8))' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', minWidth: caps.length * 50, direction: 'ltr' }}>
          {caps.map((f, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: t.muted }}>{f.date.slice(5)}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
