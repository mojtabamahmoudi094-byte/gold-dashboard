'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { darkTheme, lightTheme } from '../../../lib/theme'

const safe = (v: any) => Number(v || 0)
const fmtVal = (v: any) => safe(v).toLocaleString('fa-IR', { maximumFractionDigits: 1 })

export default function FundDetailPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [isDark, setIsDark] = useState(true)
  const [asset, setAsset] = useState<any>(null)
  const [record, setRecord] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const historyPerPage = 10

  const t: any = isDark ? darkTheme : lightTheme

  // خواندن قالب از حافظه
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
    if (!slug) return
    const load = async () => {
      // گرفتن اطلاعات دارایی
      const { data: assetData } = await supabase
        .from('assets')
        .select('*')
        .eq('slug', slug)
        .single()
      if (!assetData) { setLoading(false); return }
      setAsset(assetData)

      // گرفتن تاریخچه‌ی داده‌ها
      const { data: records } = await supabase
        .from('gold_funds')
        .select('*')
        .eq('asset_id', assetData.id)
        .order('id', { ascending: false })
        .limit(30)
      if (records && records.length > 0) {
        setRecord(records[0]) // آخرین رکورد
        setHistory(records.reverse())
      }
      setLoading(false)
    }
    load()
  }, [slug])

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: t.muted }}>در حال بارگذاری...</div>
      </main>
    )
  }

  if (!asset || !record) {
    return (
      <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ color: t.muted, fontSize: 14 }}>صندوق پیدا نشد</div>
        <Link href="/funds" style={{ color: t.accent, fontSize: 13, textDecoration: 'none' }}>بازگشت به صندوق‌ها</Link>
      </main>
    )
  }

  const changePct = safe(record.price_change_pct)
  const isPositive = changePct > 0
  const isNegative = changePct < 0

  // محاسبه‌ی ورود/خروج پول حقیقی
  const buyValue = safe(record.buy_i_volume) * safe(record.price_close)
  const sellValue = safe(record.sell_i_volume) * safe(record.price_close)
  const netFlow = buyValue - sellValue
  const netFlowBillion = Math.round((netFlow / 1000000000) * 10) / 10

  // سرانه‌ی خرید و فروش حقیقی
  const buyAvg = safe(record.buy_count_i) > 0
    ? Math.round(safe(record.buy_i_volume) / safe(record.buy_count_i))
    : 0
  const sellAvg = safe(record.sell_count_i) > 0
    ? Math.round(safe(record.sell_i_volume) / safe(record.sell_count_i))
    : 0

  // قدرت خریدار
  const buyPower = sellAvg > 0 ? (buyAvg / sellAvg).toFixed(2) : '—'

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      transition: 'background 0.3s',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* بردکرامب */}
        <div style={{ fontSize: 12, color: t.muted, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link href="/funds" style={{ color: t.accent, textDecoration: 'none' }}>صندوق‌ها</Link>
          <span>›</span>
          <span style={{ color: t.text }}>{asset.name}</span>
        </div>

        {/* هدر صندوق */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: t.textBright }}>{asset.name}</span>
              {(() => {
                // محاسبه امتیاز
                let score = 0
                const cp = changePct
                score += Math.min(Math.max((cp + 3) / 6 * 20, 0), 20)
                score += netFlowBillion > 0 ? Math.min(15 + netFlowBillion / 10, 25) : Math.max(12.5 + netFlowBillion / 10, 0)
                const pw = Number(buyPower) || 1
                score += Math.min(Math.max(pw / 2 * 20, 0), 20)
                score += 10 // ارزش معاملات نسبی - بدون مقایسه فقط نرمال
                const total = safe(record.buy_count_i) + safe(record.sell_count_i)
                const buyR = total > 0 ? safe(record.buy_count_i) / total : 0.5
                score += buyR * 20
                const s = Math.round(score)
                return (
                  <span title="امتیاز هوشمند بورسنج: تغییر قیمت (۲۰٪) + جریان پول (۲۵٪) + قدرت خریدار (۲۰٪) + ارزش معاملات (۱۵٪) + نسبت خریدار/فروشنده (۲۰٪)" style={{
                    padding: '4px 12px', borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: 'help',
                    fontFamily: 'system-ui, sans-serif',
                    background: s >= 60 ? 'rgba(0,229,160,0.15)' : s >= 40 ? 'rgba(245,158,11,0.15)' : 'rgba(255,77,106,0.15)',
                    color: s >= 60 ? '#00E5A0' : s >= 40 ? '#F59E0B' : '#FF4D6A',
                  }}>
                    {s}
                  </span>
                )
              })()}
            </div>
            <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
              {slug} · {record.trade_date_shamsi}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              fontSize: 22, fontWeight: 700,
              color: isPositive ? '#00E5A0' : isNegative ? '#FF4D6A' : t.textBright,
            }}>
              {isPositive ? '+' : ''}{changePct.toFixed(2)}٪
            </span>
          </div>
        </div>

        {/* کارت‌های اصلی */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12 }}>
          <MetricCard t={t} label="قیمت پایانی" value={`${safe(record.price_close).toLocaleString('fa-IR')} تومان`} />
          <MetricCard t={t} label="آخرین قیمت" value={`${safe(record.price_last).toLocaleString('fa-IR')} تومان`} />
          <MetricCard t={t} label="ارزش معاملات" value={`${fmtVal(record.trade_value)} میلیارد تومان`} />
          <MetricCard t={t} label="ارزش بازار" value={`${fmtVal(record.market_value)} میلیارد تومان`} />
        </div>

        {/* ردیف دوم کارت‌ها */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12 }}>
          <MetricCard t={t} label="حجم معاملات" value={safe(record.volume).toLocaleString('fa-IR')} />
          <MetricCard t={t} label="جریان پول حقیقی"
            value={`${netFlowBillion >= 0 ? '+' : ''}${netFlowBillion.toLocaleString('fa-IR')} میلیارد`}
            color={netFlowBillion >= 0 ? '#00E5A0' : '#FF4D6A'}
            tooltip="تفاوت ارزش خرید و فروش حقیقی‌ها" />
          <MetricCard t={t} label="سرانه خریدار" value={buyAvg.toLocaleString('fa-IR')}
            tooltip="میانگین حجم خرید هر خریدار حقیقی" />
          <MetricCard t={t} label="قدرت خریدار" value={buyPower}
            color={Number(buyPower) > 1 ? '#00E5A0' : Number(buyPower) < 1 ? '#FF4D6A' : t.textBright}
            tooltip="نسبت سرانه خریدار به سرانه فروشنده. بالای ۱ یعنی خریداران قوی‌ترند" />
        </div>

        {/* جدول معاملات حقیقی */}
        <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
          <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em', marginBottom: 12 }}>
            جزئیات معاملات حقیقی
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            {/* خریداران */}
            <div style={{ background: 'rgba(0,229,160,0.04)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#00E5A0', marginBottom: 10 }}>خریداران حقیقی</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <StatRow label="تعداد" value={safe(record.buy_count_i).toLocaleString('fa-IR')} color="#00E5A0" />
                <StatRow label="حجم خرید" value={safe(record.buy_i_volume).toLocaleString('fa-IR')} color="#00E5A0" />
                <StatRow label="سرانه" value={buyAvg.toLocaleString('fa-IR')} color="#00E5A0" />
              </div>
            </div>
            {/* فروشندگان */}
            <div style={{ background: 'rgba(255,77,106,0.04)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#FF4D6A', marginBottom: 10 }}>فروشندگان حقیقی</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <StatRow label="تعداد" value={safe(record.sell_count_i).toLocaleString('fa-IR')} color="#FF4D6A" />
                <StatRow label="حجم فروش" value={safe(record.sell_i_volume).toLocaleString('fa-IR')} color="#FF4D6A" />
                <StatRow label="سرانه" value={sellAvg.toLocaleString('fa-IR')} color="#FF4D6A" />
              </div>
            </div>
          </div>
        </div>

        {/* نمودار ورود/خروج پول روزانه */}
        {history.length > 0 && (
          <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
            <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em', marginBottom: 16 }}>
              ورود و خروج پول حقیقی روزانه
              <span style={{ fontSize: 10, color: t.faint, marginRight: 8 }}>میلیارد تومان</span>
            </div>
            {(() => {
              const flows = [...history].map(r => {
                const buyVal = safe(r.buy_i_volume) * safe(r.price_close)
                const sellVal = safe(r.sell_i_volume) * safe(r.price_close)
                const net = Math.round((buyVal - sellVal) / 1000000000 * 10) / 10
                return { date: r.trade_date_shamsi || '', net }
              })

              const maxAbs = Math.max(...flows.map(f => Math.abs(f.net)), 1)
              const barMaxH = 100

              return (
                <div style={{ overflowX: 'auto', direction: 'ltr' }}>
                  <div style={{ display: 'flex', alignItems: 'center', minWidth: flows.length * 50, height: barMaxH * 2 + 50, position: 'relative', direction: 'ltr', paddingTop: 25 }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: barMaxH + 35, height: 1, background: `${t.muted}33` }} />

                    {flows.map((f, i) => {
                      const isPos = f.net >= 0
                      const h = Math.max((Math.abs(f.net) / maxAbs) * barMaxH, 3)
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', height: '100%' }}>
                          <div style={{
                            position: 'absolute',
                            top: isPos ? barMaxH + 35 - h - 20 : barMaxH + 35 + h + 4,
                            fontSize: 9, fontWeight: 800,
                            color: isPos ? '#00E5A0' : '#FF4D6A',
                            whiteSpace: 'nowrap',
                            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                          }}>
                            {isPos ? '+' : ''}{f.net}
                          </div>
                          <div style={{
                            position: 'absolute',
                            top: isPos ? barMaxH + 35 - h : barMaxH + 36,
                            width: '60%', maxWidth: 30,
                            height: h,
                            borderRadius: isPos ? '3px 3px 0 0' : '0 0 3px 3px',
                            background: isPos
                              ? 'linear-gradient(0deg, rgba(0,229,160,0.4), rgba(0,229,160,0.8))'
                              : 'linear-gradient(180deg, rgba(255,77,106,0.4), rgba(255,77,106,0.8))',
                          }}
                            title={`${f.date}: ${isPos ? '+' : ''}${f.net} میلیارد تومان`}
                          />
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', minWidth: flows.length * 50, marginTop: 4 }}>
                    {flows.map((f, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: t.muted }}>
                        {f.date.slice(5)}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* نمودار سرانه‌ی خرید و فروش روزانه */}
        {history.length > 0 && (
          <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 11, color: t.muted }}>سرانه‌ی خرید و فروش حقیقی روزانه <span style={{ fontSize: 10, color: t.faint }}>میلیون تومان</span></div>
              <div style={{ display: 'flex', gap: 14, fontSize: 10 }}>
                <span style={{ color: '#00E5A0' }}>■ خرید</span>
                <span style={{ color: '#FF4D6A' }}>■ فروش</span>
              </div>
            </div>
            {(() => {
              const caps = [...history].map(r => {
                const bCnt = safe(r.buy_count_i)
                const sCnt = safe(r.sell_count_i)
                const bAvg = bCnt > 0 ? Math.round((safe(r.buy_i_volume) * safe(r.price_close)) / bCnt / 1000000) : 0
                const sAvg = sCnt > 0 ? Math.round((safe(r.sell_i_volume) * safe(r.price_close)) / sCnt / 1000000) : 0
                const power = sAvg > 0 ? Math.round((bAvg / sAvg) * 100) / 100 : 0
                return { date: r.trade_date_shamsi || '', bAvg, sAvg, power }
              })

              const maxVal = Math.max(...caps.map(f => Math.max(f.bAvg, f.sAvg)), 1)
              const barMaxH = 100

              return (
                <div style={{ overflowX: 'auto', direction: 'ltr' }}>
                  <div style={{ display: 'flex', minWidth: caps.length * 50, height: barMaxH + 40, alignItems: 'flex-end', paddingBottom: 25 }}>
                    {caps.map((f, i) => {
                      const buyH = Math.max((f.bAvg / maxVal) * barMaxH, 2)
                      const sellH = Math.max((f.sAvg / maxVal) * barMaxH, 2)
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ fontSize: 7, fontWeight: 800, color: '#00E5A0', marginBottom: 2, fontFamily: 'system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                                {f.bAvg}
                              </div>
                              <div title={`سرانه خرید: ${f.bAvg} م.ت`} style={{ width: 12, height: buyH, borderRadius: '3px 3px 0 0', background: 'linear-gradient(0deg, rgba(0,229,160,0.4), rgba(0,229,160,0.8))' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ fontSize: 7, fontWeight: 800, color: '#FF4D6A', marginBottom: 2, fontFamily: 'system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                                {f.sAvg}
                              </div>
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
              )
            })()}
          </div>
        )}

        {/* ۸ نمودار تحلیلی */}
        {history.length > 0 && (() => {
          const h10 = history.slice(-10)
          return (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>

              <BarChartPanel t={t} title="ارزش معاملات ۱۰ روز" subtitle="میلیارد تومان"
                rows={h10} colorA={t.accent} labelA="ارزش"
                getA={r => safe(r.trade_value)} />

              <BarChartPanel t={t} title="حجم معاملات ۱۰ روز" subtitle="واحد"
                rows={h10} colorA="#A78BFA" labelA="حجم"
                getA={r => safe(r.volume)} />

              <BarChartPanel t={t} title="قدرت خریدار حقیقی ۱۰ روز" subtitle="نسبت سرانه خرید / فروش"
                rows={h10} colorA="#00E5A0" labelA="قدرت"
                getA={r => {
                  const bc = safe(r.buy_count_i), sc = safe(r.sell_count_i)
                  const bA = bc > 0 ? safe(r.buy_i_volume) / bc : 0
                  const sA = sc > 0 ? safe(r.sell_i_volume) / sc : 0
                  return sA > 0 ? Math.round(bA / sA * 100) / 100 : 0
                }}
                getColorA={r => {
                  const bc = safe(r.buy_count_i), sc = safe(r.sell_count_i)
                  const bA = bc > 0 ? safe(r.buy_i_volume) / bc : 0
                  const sA = sc > 0 ? safe(r.sell_i_volume) / sc : 0
                  return sA > 0 && bA / sA >= 1 ? '#00E5A0' : '#FF4D6A'
                }} />

              <BarChartPanel t={t} title="تعداد کدهای معاملاتی حقیقی" subtitle="خریدار و فروشنده"
                rows={h10} colorA="#00E5A0" colorB="#FF4D6A" labelA="خریدار" labelB="فروشنده"
                getA={r => safe(r.buy_count_i)}
                getB={r => safe(r.sell_count_i)} />

              <BarChartPanel t={t} title="ارزش خرید و فروش حقیقی" subtitle="میلیارد تومان"
                rows={h10} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
                getA={r => Math.round(safe(r.buy_i_volume) * safe(r.price_close) / 1_000_000_000 * 10) / 10}
                getB={r => Math.round(safe(r.sell_i_volume) * safe(r.price_close) / 1_000_000_000 * 10) / 10} />

              <BarChartPanel t={t} title="ارزش خرید و فروش حقوقی" subtitle="میلیارد تومان"
                rows={h10} colorA="#60A5FA" colorB="#F59E0B" labelA="خرید" labelB="فروش"
                getA={r => Math.round(Math.max(safe(r.volume) - safe(r.buy_i_volume), 0) * safe(r.price_close) / 1_000_000_000 * 10) / 10}
                getB={r => Math.round(Math.max(safe(r.volume) - safe(r.sell_i_volume), 0) * safe(r.price_close) / 1_000_000_000 * 10) / 10} />

              <BarChartPanel t={t} title="حجم خرید و فروش حقیقی" subtitle="واحد"
                rows={h10} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
                getA={r => safe(r.buy_i_volume)}
                getB={r => safe(r.sell_i_volume)} />

              <BarChartPanel t={t} title="حجم خرید و فروش حقوقی" subtitle="واحد"
                rows={h10} colorA="#60A5FA" colorB="#F59E0B" labelA="خرید" labelB="فروش"
                getA={r => Math.max(safe(r.volume) - safe(r.buy_i_volume), 0)}
                getB={r => Math.max(safe(r.volume) - safe(r.sell_i_volume), 0)} />

            </div>
          )
        })()}

        {/* تاریخچه */}
        {history.length > 1 && (
          <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
            <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em', marginBottom: 12 }}>
              تاریخچه‌ی معاملات · {history.length} روز
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['تاریخ', 'قیمت پایانی', 'تغییر', 'ارزش معاملات', 'حجم'].map(h => (
                      <th key={h} style={{ color: t.muted, fontWeight: 600, textAlign: 'right', padding: '8px', borderBottom: `0.5px solid ${t.border}`, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().slice((historyPage - 1) * historyPerPage, historyPage * historyPerPage).map((r, i) => {
                    const chg = safe(r.price_change_pct)
                    return (
                      <tr key={i} style={{ borderBottom: `0.5px solid ${t.border}` }}>
                        <td style={{ padding: '8px', color: t.text }}>{r.trade_date_shamsi}</td>
                        <td style={{ padding: '8px', color: t.text }}>{safe(r.price_close).toLocaleString('fa-IR')}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{
                            color: chg > 0 ? '#00E5A0' : chg < 0 ? '#FF4D6A' : t.muted,
                            fontWeight: 700,
                          }}>
                            {chg > 0 ? '+' : ''}{chg.toFixed(2)}٪
                          </span>
                        </td>
                        <td style={{ padding: '8px', color: t.text }}>{fmtVal(r.trade_value)} م.ت</td>
                        <td style={{ padding: '8px', color: t.text }}>{safe(r.volume).toLocaleString('fa-IR')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* صفحه‌بندی */}
            {history.length > historyPerPage && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14 }}>
                <button
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                  disabled={historyPage === 1}
                  style={{
                    fontSize: 12, padding: '6px 16px', borderRadius: 8, fontFamily: 'inherit',
                    background: historyPage === 1 ? 'transparent' : `${t.accent}1A`,
                    border: `0.5px solid ${historyPage === 1 ? t.border : `${t.accent}59`}`,
                    color: historyPage === 1 ? t.faint : t.accent,
                    cursor: historyPage === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  قبلی
                </button>
                <span style={{ fontSize: 12, color: t.muted }}>
                  صفحه {historyPage.toLocaleString('fa-IR')} از {Math.ceil(history.length / historyPerPage).toLocaleString('fa-IR')}
                </span>
                <button
                  onClick={() => setHistoryPage(p => Math.min(Math.ceil(history.length / historyPerPage), p + 1))}
                  disabled={historyPage >= Math.ceil(history.length / historyPerPage)}
                  style={{
                    fontSize: 12, padding: '6px 16px', borderRadius: 8, fontFamily: 'inherit',
                    background: historyPage >= Math.ceil(history.length / historyPerPage) ? 'transparent' : `${t.accent}1A`,
                    border: `0.5px solid ${historyPage >= Math.ceil(history.length / historyPerPage) ? t.border : `${t.accent}59`}`,
                    color: historyPage >= Math.ceil(history.length / historyPerPage) ? t.faint : t.accent,
                    cursor: historyPage >= Math.ceil(history.length / historyPerPage) ? 'not-allowed' : 'pointer',
                  }}
                >
                  بعدی
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
      `}</style>
    </main>
  )
}

function MetricCard({ t, label, value, color, tooltip }: any) {
  return (
    <div title={tooltip || ''} style={{
      background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12,
      padding: '14px 16px', backdropFilter: 'blur(12px)', cursor: tooltip ? 'help' : 'default',
    }}>
      <div style={{ fontSize: 10, color: t.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || t.textBright }}>{value}</div>
    </div>
  )
}

function StatRow({ label, value, color }: any) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
      <span style={{ color: '#A0B4C8' }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function BarChartPanel({ t, title, subtitle, rows, getA, getB, labelA, labelB, colorA, colorB, getColorA }: {
  t: any, title: string, subtitle?: string, rows: any[],
  getA: (r: any) => number, getB?: (r: any) => number,
  labelA: string, labelB?: string,
  colorA: string, colorB?: string,
  getColorA?: (r: any) => string,
}) {
  if (!rows || rows.length === 0) return null

  const fmt = (v: number) => {
    if (!isFinite(v) || isNaN(v)) return '۰'
    if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}م`
    if (v >= 1_000) return `${(v / 1_000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}ه`
    return v.toLocaleString('fa-IR', { maximumFractionDigits: 2 })
  }

  const allVals = rows.flatMap(r => getB ? [getA(r), getB(r)] : [getA(r)]).filter(v => isFinite(v) && !isNaN(v))
  const maxVal = Math.max(...allVals, 0.001)
  const barMaxH = 80
  const barW = getB ? 11 : 20

  return (
    <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '14px 16px', backdropFilter: 'blur(12px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <div>
          <span style={{ fontSize: 11, color: t.muted }}>{title}</span>
          {subtitle && <span style={{ fontSize: 10, color: t.faint, marginRight: 6 }}>{subtitle}</span>}
        </div>
        {getB && (
          <div style={{ display: 'flex', gap: 10, fontSize: 10 }}>
            <span style={{ color: colorA }}>■ {labelA}</span>
            <span style={{ color: colorB }}>■ {labelB}</span>
          </div>
        )}
      </div>
      <div style={{ overflowX: 'auto', direction: 'ltr' }}>
        <div style={{ display: 'flex', minWidth: rows.length * 46, height: barMaxH + 30, alignItems: 'flex-end', paddingBottom: 18 }}>
          {rows.map((r, i) => {
            const vA = getA(r)
            const vB = getB ? getB(r) : null
            const hA = Math.max((vA / maxVal) * barMaxH, 2)
            const hB = vB !== null ? Math.max((vB / maxVal) * barMaxH, 2) : 0
            const barColorA = getColorA ? getColorA(r) : colorA
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: 7, fontWeight: 800, color: barColorA, marginBottom: 2, fontFamily: 'system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>{fmt(vA)}</div>
                    <div title={`${labelA}: ${fmt(vA)}`} style={{ width: barW, height: hA, borderRadius: '3px 3px 0 0', background: `linear-gradient(0deg, ${barColorA}55, ${barColorA}cc)` }} />
                  </div>
                  {getB && vB !== null && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ fontSize: 7, fontWeight: 800, color: colorB, marginBottom: 2, fontFamily: 'system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>{fmt(vB)}</div>
                      <div title={`${labelB}: ${fmt(vB)}`} style={{ width: barW, height: hB, borderRadius: '3px 3px 0 0', background: `linear-gradient(0deg, ${colorB}55, ${colorB}cc)` }} />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', minWidth: rows.length * 46 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: t.faint }}>{r.trade_date_shamsi?.slice(5)}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
