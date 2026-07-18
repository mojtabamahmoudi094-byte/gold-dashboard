'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { darkTheme, lightTheme, shouldUseDark } from '../../../lib/theme'
import { Skeleton, SkeletonBlock, SkeletonRows } from '../../components/ui/Skeleton'
import { useIsMobile } from '../../../lib/useIsMobile'
import { safe, fmtNum as fmtVal } from '../../../lib/format'
import CodalAnnouncements from '../../components/CodalAnnouncements'
import ChartModal, { type ChartModalPoint } from '../../../components/ChartModal'
import { downloadCSV } from '../../../lib/csvExport'

type FundSnapshotRow = {
  trade_date_shamsi: string
  price_close: number | null; price_last: number | null; trade_value: number | null
  market_value: number | null; market_value_usd: number | null; volume: number | null
}
// یک ردیف ممکن است دوره ریال یا تومان باشد (دو دوره داده متفاوت gold_funds) — تشخیص per-row مثل FundPriceChart
const fundMetricSeries = (rows: FundSnapshotRow[], key: keyof FundSnapshotRow): ChartModalPoint[] =>
  rows.map(r => {
    const rowIsRial = safe(r.trade_value) > 1e6
    let v = r[key] as number | null
    if (v != null) {
      if (key === 'price_close' || key === 'price_last') v = rowIsRial ? Math.round(v / 10) : v
      else if (key === 'trade_value') v = Math.round(v / 1e9) // مطابق فرمول کارت «ارزش معاملات» بالای صفحه
      else if (key === 'market_value') v = Math.round(v / 1e12)
      else if (key === 'volume') v = Math.round((v / 1e6) * 100) / 100
    }
    return { t: r.trade_date_shamsi, v }
  })


// ارزش بازار دلاری — روزی یک‌بار ساعت ۱۳ تهران توسط sync-usd-market-value.js محاسبه می‌شود
const usdFmt = (v: number) =>
  v >= 1e9
    ? `$${(v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })}B`
    : `$${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`

export default function FundDetailPage({ slug, initialAsset, initialRecord }: {
  slug: string
  initialAsset: any | null
  initialRecord: any | null
}) {
  const [isDark, setIsDark] = useState(true)
  const [asset, setAsset] = useState<any>(initialAsset)
  const [record, setRecord] = useState<any>(initialRecord)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(!initialAsset)
  const isMobile = useIsMobile()
  const [historyPage, setHistoryPage] = useState(1)
  const historyPerPage = 10
  const [user, setUser] = useState<any>(null)

  // تاریخچه روزانه کارت‌ها — برای مودال نمودار، فقط با کلیک کاربر فچ می‌شود
  const [snapshotRows, setSnapshotRows] = useState<FundSnapshotRow[] | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [modalMetric, setModalMetric] = useState<{ key: keyof FundSnapshotRow; label: string; color: string; unit?: string } | null>(null)

  const openFundMetric = (key: keyof FundSnapshotRow, label: string, color: string, unit?: string) => {
    setModalMetric({ key, label, color, unit })
    if (snapshotRows === null && !snapshotLoading) {
      setSnapshotLoading(true)
      fetch(`/api/fund-snapshot?slug=${encodeURIComponent(slug)}`)
        .then(r => r.json())
        .then(j => setSnapshotRows(j.rows ?? []))
        .catch(() => setSnapshotRows([]))
        .finally(() => setSnapshotLoading(false))
    }
  }

  const t: any = isDark ? darkTheme : lightTheme
  const cream = isDark ? '#ddd5bd' : '#6B5A3A'

  // خواندن قالب از حافظه
  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)

    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      window.removeEventListener('themechange', handler)
      subscription.unsubscribe()
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
      // مرتب‌سازی بر اساس تاریخ نه id — رکوردهای backfill تاریخی id بزرگ‌تری دارند
      const { data: records } = await supabase
        .from('gold_funds')
        .select('*')
        .eq('asset_id', assetData.id)
        .order('trade_date_shamsi', { ascending: false })
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
      <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton width={180} height={12} />
          <Skeleton width={260} height={30} radius={10} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} height={88} />)}
          </div>
          <SkeletonBlock height={280} />
          <SkeletonRows rows={6} height={44} />
        </div>
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

  // دوره ریال: trade_value > 1e6 (raw ریال). کار می‌کند برای همه صندوق‌ها از جمله نقره/زعفران
  const priceIsRial = safe(record.trade_value) > 1e6
  const priceToman = (v: number) => priceIsRial ? Math.round(v / 10) : v

  // محاسبه‌ی ورود/خروج پول حقیقی (میلیارد تومان)
  const buyValue = safe(record.buy_i_volume) * safe(record.price_close)
  const sellValue = safe(record.sell_i_volume) * safe(record.price_close)
  const netFlow = buyValue - sellValue
  // ریال: ÷10^10 = میلیارد تومان؛ تومان: ÷10^9 = میلیارد تومان
  const netFlowBillion = Math.round((netFlow / (priceIsRial ? 1e10 : 1e9)) * 10) / 10

  // سرانه‌ی خرید و فروش حقیقی (میلیون تومان)
  // ریال: vol×ریال / count / 10^7 = م.ت؛ تومان: vol×تومان / count / 10^6 = م.ت
  const avgDivisor = priceIsRial ? 1e7 : 1e6
  const buyAvgMT = safe(record.buy_count_i) > 0
    ? Math.round(safe(record.buy_i_volume) * safe(record.price_close) / safe(record.buy_count_i) / avgDivisor)
    : 0
  const sellAvgMT = safe(record.sell_count_i) > 0
    ? Math.round(safe(record.sell_i_volume) * safe(record.price_close) / safe(record.sell_count_i) / avgDivisor)
    : 0

  // سرانه‌ی بر اساس تعداد سهم (برای قدرت خریدار، واحد یکسان است)
  const buyAvg = safe(record.buy_count_i) > 0
    ? safe(record.buy_i_volume) / safe(record.buy_count_i)
    : 0
  const sellAvg = safe(record.sell_count_i) > 0
    ? safe(record.sell_i_volume) / safe(record.sell_count_i)
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
                  <span title="امتیاز هوشمند بورس سنج: تغییر قیمت (۲۰٪) + جریان پول (۲۵٪) + قدرت خریدار (۲۰٪) + ارزش معاملات (۱۵٪) + نسبت خریدار/فروشنده (۲۰٪)" style={{
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 12 }}>
          <MetricCard t={t} label="قیمت پایانی"
            value={`${priceToman(safe(record.price_close)).toLocaleString('fa-IR')} تومان`}
            tooltip={`قیمت دقیق: ${safe(record.price_close).toLocaleString('fa-IR')} ${priceIsRial ? 'ریال' : 'تومان'}`}
            onClick={() => openFundMetric('price_close', 'قیمت پایانی', '#3b82f6', 'ت')} />
          <MetricCard t={t} label="آخرین قیمت"
            value={`${priceToman(safe(record.price_last)).toLocaleString('fa-IR')} تومان`}
            tooltip={`قیمت دقیق: ${safe(record.price_last).toLocaleString('fa-IR')} ${priceIsRial ? 'ریال' : 'تومان'}`}
            onClick={() => openFundMetric('price_last', 'آخرین قیمت', '#3b82f6', 'ت')} />
          <MetricCard t={t} label="ارزش معاملات"
            value={`${Math.round(safe(record.trade_value) / 1e9).toLocaleString('fa-IR')} م.ت`}
            tooltip={`ارزش دقیق: ${safe(record.trade_value).toLocaleString('fa-IR')} ریال`}
            onClick={() => openFundMetric('trade_value', 'ارزش معاملات', '#8b5cf6', 'م.ت')} />
          <MetricCard t={t} label="ارزش بازار"
            value={`${Math.round(safe(record.market_value) / 1e12).toLocaleString('fa-IR')} ه.م.ت`}
            tooltip={`ارزش دقیق: ${safe(record.market_value).toLocaleString('fa-IR')} ریال`}
            onClick={() => openFundMetric('market_value', 'ارزش بازار', '#f59e0b', 'ه.م.ت')} />
          <MetricCard t={t} label="ارزش بازار (دلار)"
            value={record.market_value_usd != null ? usdFmt(record.market_value_usd) : '—'}
            tooltip="ارزش بازار دلاری — نرخ دلار بازار آزاد، sync-usd-market-value.js"
            onClick={() => openFundMetric('market_value_usd', 'ارزش بازار (دلار)', '#22c55e', '$')} />
        </div>

        {/* ردیف دوم کارت‌ها */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12 }}>
          <MetricCard t={t} label="حجم معاملات"
            value={`${(safe(record.volume) / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} م.سهم`}
            tooltip={`حجم دقیق: ${safe(record.volume).toLocaleString('fa-IR')} سهم`}
            onClick={() => openFundMetric('volume', 'حجم معاملات', '#3b82f6', 'م.سهم')} />
          <MetricCard t={t} label="جریان پول حقیقی"
            value={`${netFlowBillion >= 0 ? '+' : ''}${netFlowBillion.toLocaleString('fa-IR')} میلیارد`}
            color={netFlowBillion >= 0 ? '#00E5A0' : '#FF4D6A'}
            tooltip="تفاوت ارزش خرید و فروش حقیقی‌ها" />
          <MetricCard t={t} label="سرانه خریدار" value={`${buyAvgMT.toLocaleString('fa-IR')} م.ت`}
            tooltip="میانگین ارزش خرید هر خریدار حقیقی — میلیون تومان" />
          <MetricCard t={t} label="قدرت خریدار" value={buyPower}
            color={Number(buyPower) > 1 ? '#00E5A0' : Number(buyPower) < 1 ? '#FF4D6A' : t.textBright}
            tooltip="نسبت سرانه خریدار به سرانه فروشنده. بالای ۱ یعنی خریداران قوی‌ترند" />
        </div>

        <ChartModal
          open={!!modalMetric}
          onClose={() => setModalMetric(null)}
          title={modalMetric?.label ?? ''}
          unit={modalMetric?.unit}
          color={modalMetric?.color ?? '#3b82f6'}
          data={modalMetric && snapshotRows ? fundMetricSeries(snapshotRows, modalMetric.key) : []}
          loading={snapshotLoading}
        />

        {/* پورتفوی کدال + گزارش فصلی (در صورت وجود JSON در public/portfolio) */}
        <CodalSections t={t} slug={slug} isMobile={isMobile} />

        {/* اطلاعیه‌های کدال — دریافت زنده کلاینت‌ساید */}
        <CodalAnnouncements symbol={slug} isDark={isDark} isMobile={isMobile} />

        {/* ─── بخش گیت‌شده: فقط برای اعضا ─── */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* نمودار قیمت */}
        {history.length >= 3 && (
          <FundPriceChart t={t} history={history} />
        )}

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
                <StatRow label="سرانه" value={`${buyAvgMT.toLocaleString('fa-IR')} م.ت`} color="#00E5A0" />
              </div>
            </div>
            {/* فروشندگان */}
            <div style={{ background: 'rgba(255,77,106,0.04)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#FF4D6A', marginBottom: 10 }}>فروشندگان حقیقی</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <StatRow label="تعداد" value={safe(record.sell_count_i).toLocaleString('fa-IR')} color="#FF4D6A" />
                <StatRow label="حجم فروش" value={safe(record.sell_i_volume).toLocaleString('fa-IR')} color="#FF4D6A" />
                <StatRow label="سرانه" value={`${sellAvgMT.toLocaleString('fa-IR')} م.ت`} color="#FF4D6A" />
              </div>
            </div>
          </div>
        </div>

        {/* نمودار ورود/خروج پول روزانه */}
        {history.length > 0 && (
          <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
            <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em', marginBottom: 16 }}>
              ورود و خروج پول حقیقی روزانه
              <span style={{ fontSize: 10, color: cream, marginRight: 8 }}>میلیارد تومان</span>
            </div>
            {(() => {
              const flows = [...history].map(r => {
                const buyVal = safe(r.buy_i_volume) * safe(r.price_close)
                const sellVal = safe(r.sell_i_volume) * safe(r.price_close)
                const isRial = safe(r.trade_value) > 1e6
                const net = Math.round((buyVal - sellVal) / (isRial ? 1e10 : 1e9) * 10) / 10
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
              <div style={{ fontSize: 11, color: t.muted }}>سرانه‌ی خرید و فروش حقیقی روزانه <span style={{ fontSize: 10, color: cream }}>میلیون تومان</span></div>
              <div style={{ display: 'flex', gap: 14, fontSize: 10 }}>
                <span style={{ color: '#00E5A0' }}>■ خرید</span>
                <span style={{ color: '#FF4D6A' }}>■ فروش</span>
              </div>
            </div>
            {(() => {
              const caps = [...history].map(r => {
                const bCnt = safe(r.buy_count_i)
                const sCnt = safe(r.sell_count_i)
                const isRial = safe(r.trade_value) > 1e6
                const div = isRial ? 1e7 : 1e6  // میلیون تومان
                const bAvg = bCnt > 0 ? Math.round((safe(r.buy_i_volume) * safe(r.price_close)) / bCnt / div) : 0
                const sAvg = sCnt > 0 ? Math.round((safe(r.sell_i_volume) * safe(r.price_close)) / sCnt / div) : 0
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

              <BarChartPanel t={t} title="ارزش معاملات ۱۰ روز" subtitle="م.ت"
                rows={h10} colorA={t.accent} labelA="ارزش"
                getA={r => { const tv = safe(r.trade_value); return tv > 1e6 ? Math.round(tv / 1e9) : tv }} />

              <BarChartPanel t={t} title="حجم معاملات ۱۰ روز" subtitle="میلیون سهم"
                rows={h10} colorA="#A78BFA" labelA="حجم"
                getA={r => safe(r.volume) / 1_000_000} />

              <LineChartPanel t={t} title="قدرت خریدار حقیقی ۱۰ روز" subtitle="برابر · بالای ۱ = خریدار قوی‌تر"
                rows={h10}
                getValue={r => {
                  const bc = safe(r.buy_count_i), sc = safe(r.sell_count_i)
                  const bA = bc > 0 ? safe(r.buy_i_volume) / bc : 0
                  const sA = sc > 0 ? safe(r.sell_i_volume) / sc : 0
                  return sA > 0 ? Math.round(bA / sA * 100) / 100 : 0
                }}
                colorAbove="#00E5A0" colorBelow="#FF4D6A" threshold={1} />

              <BarChartPanel t={t} title="تعداد کدهای معاملاتی حقیقی" subtitle="نفر"
                rows={h10} colorA="#00E5A0" colorB="#FF4D6A" labelA="خریدار" labelB="فروشنده"
                getA={r => safe(r.buy_count_i)}
                getB={r => safe(r.sell_count_i)} />

              <BarChartPanel t={t} title="ارزش خرید و فروش حقیقی" subtitle="میلیارد تومان"
                rows={h10} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
                getA={r => { const d = safe(r.trade_value) > 1e6 ? 1e10 : 1e9; return Math.round(safe(r.buy_i_volume) * safe(r.price_close) / d * 10) / 10 }}
                getB={r => { const d = safe(r.trade_value) > 1e6 ? 1e10 : 1e9; return Math.round(safe(r.sell_i_volume) * safe(r.price_close) / d * 10) / 10 }} />

              <BarChartPanel t={t} title="ارزش خرید و فروش حقوقی" subtitle="میلیارد تومان"
                rows={h10} colorA="#60A5FA" colorB="#F59E0B" labelA="خرید" labelB="فروش"
                getA={r => { const d = safe(r.trade_value) > 1e6 ? 1e10 : 1e9; return Math.round(Math.max(safe(r.volume) - safe(r.buy_i_volume), 0) * safe(r.price_close) / d * 10) / 10 }}
                getB={r => { const d = safe(r.trade_value) > 1e6 ? 1e10 : 1e9; return Math.round(Math.max(safe(r.volume) - safe(r.sell_i_volume), 0) * safe(r.price_close) / d * 10) / 10 }} />

              <BarChartPanel t={t} title="حجم خرید و فروش حقیقی" subtitle="میلیون سهم"
                rows={h10} colorA="#00E5A0" colorB="#FF4D6A" labelA="خرید" labelB="فروش"
                getA={r => safe(r.buy_i_volume) / 1_000_000}
                getB={r => safe(r.sell_i_volume) / 1_000_000} />

              <BarChartPanel t={t} title="حجم خرید و فروش حقوقی" subtitle="میلیون سهم"
                rows={h10} colorA="#60A5FA" colorB="#F59E0B" labelA="خرید" labelB="فروش"
                getA={r => Math.max(safe(r.volume) - safe(r.buy_i_volume), 0) / 1_000_000}
                getB={r => Math.max(safe(r.volume) - safe(r.sell_i_volume), 0) / 1_000_000} />

            </div>
          )
        })()}

        {/* تاریخچه */}
        {history.length > 1 && (
          <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
            <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span>تاریخچه‌ی معاملات · {history.length} روز</span>
              <button
                onClick={() => downloadCSV(`${asset?.slug || slug}-history.csv`, history.map((r: any) => ({
                  تاریخ: r.trade_date_shamsi,
                  قیمت_پایانی: safe(r.trade_value) > 1e6 ? Math.round(safe(r.price_close) / 10) : safe(r.price_close),
                  تغییر_درصد: safe(r.price_change_pct),
                  ارزش_معاملات: r.trade_value,
                  حجم: r.volume,
                })))}
                style={{
                  fontSize: 11, color: t.muted, cursor: 'pointer',
                  padding: '5px 10px', borderRadius: 7,
                  background: 'transparent', border: `0.5px solid ${t.border}`,
                }}
              >
                دانلود CSV
              </button>
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
                        <td style={{ padding: '8px', color: t.text }}>{(safe(r.trade_value) > 1e6 ? Math.round(safe(r.price_close) / 10) : safe(r.price_close)).toLocaleString('fa-IR')}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{
                            color: chg > 0 ? '#00E5A0' : chg < 0 ? '#FF4D6A' : t.muted,
                            fontWeight: 700,
                          }}>
                            {chg > 0 ? '+' : ''}{chg.toFixed(2)}٪
                          </span>
                        </td>
                        <td style={{ padding: '8px', color: t.text }}>{(() => { const tv = safe(r.trade_value); return (tv > 1e6 ? Math.round(tv / 1e9) : tv).toLocaleString('fa-IR') })()}</td>
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
                    color: historyPage === 1 ? t.muted : t.accent,
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
                    color: historyPage >= Math.ceil(history.length / historyPerPage) ? t.muted : t.accent,
                    cursor: historyPage >= Math.ceil(history.length / historyPerPage) ? 'not-allowed' : 'pointer',
                  }}
                >
                  بعدی
                </button>
              </div>
            )}
          </div>
        )}

          {/* blur gate — فقط وقتی کاربر لاگین نیست */}
          {!user && history.length > 0 && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 20,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              background: 'rgba(6,11,20,0.5)',
              borderRadius: 14,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              minHeight: 280,
            }}>
              <div style={{
                background: 'rgba(10,18,30,0.94)',
                border: '0.5px solid rgba(0,200,255,0.22)',
                borderRadius: 18,
                padding: '32px 40px',
                textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                backdropFilter: 'blur(24px)',
                boxShadow: '0 0 60px rgba(0,200,255,0.06), 0 16px 48px rgba(0,0,0,0.6)',
                maxWidth: 360, margin: '0 auto',
              }}>
                <div style={{ fontSize: 32, lineHeight: 1 }}>🔒</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#E8F4FF' }}>
                  نمودارها قفل است
                </div>
                <div style={{ fontSize: 12, color: '#ddd5bd', lineHeight: 1.9 }}>
                  تحلیل کامل صندوق فقط برای اعضای بورس سنج<br />
                  در دسترس است. ثبت‌نام رایگان است.
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <a href="/auth" style={{
                    display: 'inline-block', padding: '11px 28px', borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(0,229,160,0.18), rgba(0,229,160,0.28))',
                    border: '0.5px solid rgba(0,229,160,0.55)',
                    color: '#00E5A0', fontSize: 13, fontWeight: 700,
                    textDecoration: 'none',
                  }}>
                    ثبت‌نام رایگان
                  </a>
                  <a href="/auth" style={{
                    display: 'inline-block', padding: '11px 24px', borderRadius: 10,
                    background: 'rgba(0,200,255,0.08)',
                    border: '0.5px solid rgba(0,200,255,0.3)',
                    color: '#00C8FF', fontSize: 13, fontWeight: 600,
                    textDecoration: 'none',
                  }}>
                    ورود
                  </a>
                </div>
              </div>
            </div>
          )}

        </div>
        {/* ─── پایان بخش گیت‌شده ─── */}

      </div>

      <style>{`
        @keyframes barGrow {
          from { transform: scaleY(0); opacity: 0; }
          to   { transform: scaleY(1); opacity: 1; }
        }
        .chart-bar {
          transform-origin: bottom;
          animation: barGrow 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes lineFade {
          from { opacity: 0; transform: scaleY(0.85); }
          to   { opacity: 1; transform: scaleY(1); }
        }
        .chart-line-path, .chart-line-area {
          transform-origin: bottom;
          animation: lineFade 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>
    </main>
  )
}

// ── پورتفوی ماهانه کدال: نمودار دایره‌ای + تغییرات مهم ماه ──────────────────
// داده از public/portfolio/<slug>.json (خروجی scripts/codal-portfolio.js)
const PIE_COLORS = [
  'oklch(0.72 0.19 25)', 'oklch(0.76 0.14 210)', 'oklch(0.78 0.13 300)',
  'oklch(0.82 0.15 70)', 'oklch(0.75 0.17 150)', 'oklch(0.84 0.03 240)',
  'oklch(0.74 0.19 40)', 'oklch(0.7 0.12 190)', 'oklch(0.8 0.1 330)',
]

// یک fetch مشترک برای هر دو بخش ماهانه و فصلی
function CodalSections({ t, slug, isMobile }: { t: any, slug: string, isMobile: boolean }) {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    if (!slug) return
    fetch(`/portfolio/${encodeURIComponent(slug)}.json`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
  }, [slug])

  if (!data?.months?.length) return null
  return (
    <>
      <PortfolioSection t={t} data={data} isMobile={isMobile} />
      <QuarterlySection t={t} data={data} isMobile={isMobile} />
    </>
  )
}

function PortfolioSection({ t, data, isMobile }: { t: any, data: any, isMobile: boolean }) {
  const cream = t === darkTheme ? '#ddd5bd' : '#6B5A3A'
  const [hi, setHi] = useState<number | null>(null)   // ایندکس قاچ hover شده

  if (!data?.months?.length) return null

  const cur = data.months[data.months.length - 1]
  const prev = data.months.length > 1 ? data.months[data.months.length - 2] : null

  // ── سهم‌های بزرگ برای نمودار دایره‌ای — بقیه در «سایر دارایی‌ها» ──
  const totalNav = cur.holdings.reduce((s: number, h: any) => s + (h.n1 || 0), 0)
  if (totalNav <= 0) return null
  const sorted = [...cur.holdings].filter((h: any) => h.n1 > 0).sort((a: any, b: any) => b.n1 - a.n1)
  const TOP_N = 8
  const top = sorted.slice(0, TOP_N)
  const otherNav = sorted.slice(TOP_N).reduce((s: any, h: any) => s + h.n1, 0)
  const slices = [
    ...top.map((h: any, i: number) => ({ name: h.name, value: h.n1, color: PIE_COLORS[i % PIE_COLORS.length] })),
    ...(otherNav > 0 ? [{ name: 'سایر دارایی‌ها', value: otherNav, color: t.muted }] : []),
  ]

  // ── مسیرهای SVG دونات ──
  const R = 80, r = 48, CX = 100, CY = 100
  let angle = -Math.PI / 2
  const paths = slices.map(s => {
    const frac = s.value / totalNav
    const a0 = angle
    const a1 = angle + frac * Math.PI * 2
    angle = a1
    const large = a1 - a0 > Math.PI ? 1 : 0
    const mid = (a0 + a1) / 2
    const p = (a: number, rad: number) => `${(CX + rad * Math.cos(a)).toFixed(2)},${(CY + rad * Math.sin(a)).toFixed(2)}`
    return {
      ...s, frac, mid,
      d: `M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large} 0 ${p(a0, r)} Z`,
    }
  })
  const hovered = hi !== null ? paths[hi] : null

  // ── تغییرات مهم ماه (از ستون‌های خرید/فروش طی دوره) ──
  const bt = (v: number) => Math.round(v / 1e10).toLocaleString('fa-IR')   // ریال → میلیارد تومان
  const buys  = [...cur.holdings].filter((h: any) => h.bc > 0).sort((a: any, b: any) => b.bc - a.bc).slice(0, 5)
  const sells = [...cur.holdings].filter((h: any) => h.sa > 0).sort((a: any, b: any) => b.sa - a.sa).slice(0, 5)
  const fresh = cur.holdings.filter((h: any) => h.q0 === 0 && h.q1 > 0 && h.bc > 0)
    .sort((a: any, b: any) => b.n1 - a.n1).slice(0, 5)
  const exited = cur.holdings.filter((h: any) => h.q0 > 0 && h.q1 === 0)
    .sort((a: any, b: any) => b.sa - a.sa).slice(0, 5)

  const monthName = (d: string) => {
    const m = Number((d || '').split('/')[1])
    return ['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'][m] || d
  }

  const maxFrac = Math.max(...paths.map(s => s.frac), 0.0001)
  const pctFa = (f: number) => (f * 100).toLocaleString('fa-IR', { maximumFractionDigits: 1 })

  return (
    <div style={{
      background: t.panel, border: `0.5px solid ${t.border}`,
      borderTop: `2px solid ${t.accent}55`, borderRadius: 14,
      padding: '16px 18px', backdropFilter: 'blur(12px)', minWidth: 0,
      boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright }}>ترکیب پورتفوی سهام</div>
          <div style={{ fontSize: 10, color: cream, marginTop: 3 }}>گزارش ماهانه کدال · {cur.date}</div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: t.accent,
          background: `${t.accent}14`, border: `0.5px solid ${t.accent}40`,
          borderRadius: 8, padding: '5px 10px', fontFamily: 'system-ui, sans-serif',
        }}>
          {bt(totalNav)} میلیارد تومان
        </span>
      </div>

      {/* دونات + راهنما */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: isMobile ? 14 : 28 }}>
        <svg viewBox="0 0 200 200" style={{ width: isMobile ? 210 : 240, flexShrink: 0, overflow: 'visible' }}
          onMouseLeave={() => setHi(null)}>
          {paths.map((s, i) => {
            const active = hi === i
            const dx = active ? Math.cos(s.mid) * 4 : 0
            const dy = active ? Math.sin(s.mid) * 4 : 0
            return (
              <path key={i} d={s.d} fill={s.color}
                opacity={hi === null ? 0.9 : active ? 1 : 0.35}
                stroke={t.bg} strokeWidth={1.5}
                transform={`translate(${dx} ${dy})`}
                style={{ transition: 'opacity 0.2s, transform 0.2s', cursor: 'pointer' }}
                onMouseEnter={() => setHi(i)}>
                <title>{`${s.name}: ${pctFa(s.frac)}٪`}</title>
              </path>
            )
          })}
          {/* درصد روی قاچ‌های بزرگ */}
          {paths.map((s, i) => s.frac >= 0.055 ? (
            <text key={`l${i}`}
              x={CX + Math.cos(s.mid) * (R + r) / 2} y={CY + Math.sin(s.mid) * (R + r) / 2 + 3}
              textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff"
              style={{ pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
              fontFamily="system-ui, sans-serif">
              {pctFa(s.frac)}٪
            </text>
          ) : null)}
          {/* مرکز دونات: پیش‌فرض تعداد سهم‌ها، هنگام hover نام و درصد قاچ */}
          {hovered ? (
            <>
              <text x={CX} y={CY - 6} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={t.textBright} fontFamily="Vazirmatn, Arial, sans-serif">
                {hovered.name.length > 14 ? hovered.name.slice(0, 13) + '…' : hovered.name}
              </text>
              <text x={CX} y={CY + 12} textAnchor="middle" fontSize="13" fontWeight="800" fill={hovered.color} fontFamily="system-ui, sans-serif">
                {pctFa(hovered.frac)}٪
              </text>
            </>
          ) : (
            <>
              <text x={CX} y={CY - 4} textAnchor="middle" fontSize="14" fontWeight="800" fill={t.textBright} fontFamily="Vazirmatn, Arial, sans-serif">
                {sorted.length.toLocaleString('fa-IR')}
              </text>
              <text x={CX} y={CY + 13} textAnchor="middle" fontSize="8" fill={t.muted} fontFamily="Vazirmatn, Arial, sans-serif">
                سهم در پورتفوی
              </text>
            </>
          )}
        </svg>

        <div style={{ flex: 1, minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {paths.map((s, i) => (
            <div key={i}
              onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                padding: '5px 8px', borderRadius: 8, cursor: 'pointer',
                background: hi === i ? `${String(s.color).startsWith('oklch') ? s.color.replace(')', ' / 0.1)') : 'rgba(255,255,255,0.05)'}` : 'transparent',
                transition: 'background 0.2s',
              }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{s.name}</span>
              {/* نوار نسبی سهم از پورتفوی */}
              <span style={{ flex: 1, minWidth: 24, height: 4, borderRadius: 2, background: `${t.muted}22`, overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${(s.frac / maxFrac) * 100}%`, height: '100%', borderRadius: 2, background: s.color, opacity: 0.75, transition: 'width 0.4s' }} />
              </span>
              <span style={{ color: t.textBright, fontWeight: 700, fontFamily: 'system-ui, sans-serif', minWidth: 44, textAlign: 'left' }}>
                {pctFa(s.frac)}٪
              </span>
              <span style={{ color: cream, fontSize: 10, minWidth: 60, textAlign: 'left', fontFamily: 'system-ui, sans-serif' }}>{bt(s.value)} م.ت</span>
            </div>
          ))}
        </div>
      </div>

      {/* تغییرات مهم نسبت به ماه قبل */}
      <div style={{ marginTop: 18, borderTop: `0.5px solid ${t.border}`, paddingTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright, marginBottom: 10 }}>
          تغییرات مهم {monthName(cur.date)}{prev ? ` نسبت به ${monthName(prev.date)}` : ''}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          {[
            {
              title: 'خریدهای مهم ماه', color: '#00E5A0', rows: buys, val: (h: any) => `${bt(h.bc)}+`,
              badge: (h: any) => fresh.some((f: any) => f.name === h.name) ? 'موقعیت جدید' : null,
              empty: 'خرید قابل‌توجهی ثبت نشده',
              icon: <path d="M12 19V5M5 12l7-7 7 7" />,
            },
            {
              title: 'فروش‌های مهم ماه', color: '#FF4D6A', rows: sells, val: (h: any) => `${bt(h.sa)}-`,
              badge: (h: any) => exited.some((x: any) => x.name === h.name) ? 'خروج کامل' : null,
              empty: 'فروش قابل‌توجهی ثبت نشده',
              icon: <path d="M12 5v14M5 12l7 7 7-7" />,
            },
          ].map((sec, si) => (
            <div key={si} style={{
              background: `${sec.color}08`, border: `0.5px solid ${sec.color}26`,
              borderRadius: 10, padding: 12, minWidth: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={sec.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  {sec.icon}
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: sec.color }}>{sec.title}</span>
              </div>
              {sec.rows.length === 0 && <div style={{ fontSize: 11, color: cream }}>{sec.empty}</div>}
              {sec.rows.map((h: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6, minWidth: 0 }}>
                  <span style={{ color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{h.name}</span>
                  {sec.badge(h) && (
                    <span style={{
                      fontSize: 8.5, fontWeight: 700, color: sec.color, flexShrink: 0,
                      background: `${sec.color}1a`, border: `0.5px solid ${sec.color}40`,
                      borderRadius: 20, padding: '1.5px 7px',
                    }}>{sec.badge(h)}</span>
                  )}
                  <span style={{ flex: 1 }} />
                  <span style={{ color: sec.color, fontWeight: 700, fontFamily: 'system-ui, sans-serif', flexShrink: 0 }}>
                    {sec.val(h)} م.ت
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── گزارش فصلی: تجمیع گزارش‌های ماهانه یک فصل (بهار/تابستان/پاییز/زمستان) ────
const SEASON_NAMES = ['', 'بهار', 'تابستان', 'پاییز', 'زمستان']
const Q_ACCENT = '#A78BFA'

function QuarterlySection({ t, data, isMobile }: { t: any, data: any, isMobile: boolean }) {
  const cream = t === darkTheme ? '#ddd5bd' : '#6B5A3A'
  if (!data?.months?.length) return null

  // ماه‌های فصلِ آخرین گزارش
  const lastDate = data.months[data.months.length - 1].date as string
  const [yr, lastM] = lastDate.split('/').map(Number)
  const seasonIdx = Math.ceil(lastM / 3)
  const sm = data.months.filter((m: any) => {
    const [y, mo] = m.date.split('/').map(Number)
    return y === yr && Math.ceil(mo / 3) === seasonIdx
  })
  if (sm.length < 2) return null   // با یک ماه، گزارش فصلی معنا ندارد

  const bt = (v: number) => Math.round(v / 1e10).toLocaleString('fa-IR')
  const monthName = (d: string) => ['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'][Number(d.split('/')[1])] || d

  // ارزش پایان هر ماه + تجمیع خرید/فروش هر سهم در کل فصل
  const monthTotals = sm.map((m: any) => ({
    date: m.date,
    total: m.holdings.reduce((s: number, h: any) => s + (h.n1 || 0), 0),
  }))
  const first = sm[0], last = sm[sm.length - 1]
  const firstTot = monthTotals[0].total, lastTot = monthTotals[monthTotals.length - 1].total
  const seasonChange = firstTot > 0 ? ((lastTot - firstTot) / firstTot) * 100 : 0

  // نام واحد برای تطبیق بین ماه‌ها — بعضی گزارش‌ها همان سهم را با «*» یا فاصله متفاوت می‌نویسند
  const cleanName = (n: string) => String(n || '').replace(/[*٭]/g, '').replace(/\s+/g, ' ').trim()

  const agg = new Map<string, any>()
  for (const m of sm) {
    for (const h of m.holdings) {
      const k = cleanName(h.name)
      const e = agg.get(k) || { name: k, bc: 0, sa: 0 }
      e.bc += h.bc || 0
      e.sa += h.sa || 0
      agg.set(k, e)
    }
  }
  const totBuy  = [...agg.values()].reduce((s, e) => s + e.bc, 0)
  const totSell = [...agg.values()].reduce((s, e) => s + e.sa, 0)

  // خالص خرید/فروش فصل به تفکیک سهم
  const nets = [...agg.values()].map(e => ({ ...e, net: e.bc - e.sa }))
  const topBuys  = nets.filter(e => e.net > 0).sort((a, b) => b.net - a.net).slice(0, 5)
  const topSells = nets.filter(e => e.net < 0).sort((a, b) => a.net - b.net).slice(0, 5)
  const maxNet = Math.max(...topBuys.map(e => e.net), ...topSells.map(e => -e.net), 1)

  // تغییر وزن هر سهم از اول تا آخر فصل (بر اساس ارزش روز)
  const wFirst = new Map<string, number>()
  if (firstTot > 0) for (const h of first.holdings) {
    const k = cleanName(h.name)
    wFirst.set(k, (wFirst.get(k) || 0) + (h.n1 || 0) / firstTot * 100)
  }
  const wLast = new Map<string, number>()
  if (lastTot > 0) for (const h of last.holdings) {
    const k = cleanName(h.name)
    wLast.set(k, (wLast.get(k) || 0) + (h.n1 || 0) / lastTot * 100)
  }
  const weightChanges = [...new Set([...wFirst.keys(), ...wLast.keys()])]
    .map(n => ({ name: n, d: (wLast.get(n) || 0) - (wFirst.get(n) || 0), w: wLast.get(n) || 0 }))
    .filter(x => Math.abs(x.d) >= 0.15)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 6)

  // موقعیت‌های جدید و خروج کامل در طول فصل
  const inFirst = new Set(first.holdings.filter((h: any) => (h.n1 || 0) > 0).map((h: any) => cleanName(h.name)))
  const inLast  = new Set(last.holdings.filter((h: any) => (h.n1 || 0) > 0).map((h: any) => cleanName(h.name)))
  const entered = [...inLast].filter(n => !inFirst.has(n)).length
  const exited  = [...inFirst].filter(n => !inLast.has(n)).length

  const maxTot = Math.max(...monthTotals.map((m: any) => m.total), 1)
  const chips = [
    { label: 'ارزش پایان فصل', value: `${bt(lastTot)} م.ت`, color: Q_ACCENT },
    { label: 'تغییر ارزش طی فصل', value: `${seasonChange >= 0 ? '+' : ''}${seasonChange.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`, color: seasonChange >= 0 ? '#00E5A0' : '#FF4D6A' },
    { label: 'جمع خرید فصل', value: `${bt(totBuy)} م.ت`, color: '#00E5A0' },
    { label: 'جمع فروش فصل', value: `${bt(totSell)} م.ت`, color: '#FF4D6A' },
  ]

  return (
    <div style={{
      background: t.panel, border: `0.5px solid ${t.border}`,
      borderTop: `2px solid ${Q_ACCENT}55`, borderRadius: 14,
      padding: '16px 18px', backdropFilter: 'blur(12px)', minWidth: 0,
      boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
    }}>
      {/* هدر */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textBright }}>
            گزارش فصلی — {SEASON_NAMES[seasonIdx]} {yr.toLocaleString('fa-IR', { useGrouping: false })}
          </div>
          <div style={{ fontSize: 10, color: cream, marginTop: 3 }}>
            تجمیع {sm.length.toLocaleString('fa-IR')} گزارش ماهانه کدال · {monthName(first.date)} تا {monthName(last.date)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#00E5A0', background: 'rgba(0,229,160,0.1)', border: '0.5px solid rgba(0,229,160,0.3)', borderRadius: 20, padding: '2.5px 9px' }}>
            {entered.toLocaleString('fa-IR')} ورود جدید
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#FF4D6A', background: 'rgba(255,77,106,0.1)', border: '0.5px solid rgba(255,77,106,0.3)', borderRadius: 20, padding: '2.5px 9px' }}>
            {exited.toLocaleString('fa-IR')} خروج کامل
          </span>
        </div>
      </div>

      {/* چیپ‌های آماری */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {chips.map((c, i) => (
          <div key={i} style={{ background: `${c.color}0d`, border: `0.5px solid ${c.color}30`, borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
            <div style={{ fontSize: 9.5, color: t.muted, marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: c.color, fontFamily: 'system-ui, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* روند ارزش پورتفوی ماه‌به‌ماه + تغییر وزن‌ها */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.4fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: t.cardInner ?? 'rgba(255,255,255,0.02)', border: `0.5px solid ${t.border}`, borderRadius: 10, padding: 12, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: t.muted, marginBottom: 10 }}>ارزش سهام پایان هر ماه <span style={{ color: cream, fontSize: 9 }}>میلیارد تومان</span></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 110, padding: '0 6px' }}>
            {monthTotals.map((m: any, i: number) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: t.textBright, fontFamily: 'system-ui, sans-serif' }}>{bt(m.total)}</span>
                <div style={{
                  width: '70%', maxWidth: 44,
                  height: Math.max((m.total / maxTot) * 72, 4),
                  borderRadius: '5px 5px 0 0',
                  background: `linear-gradient(0deg, ${Q_ACCENT}40, ${Q_ACCENT}cc)`,
                  boxShadow: `0 0 10px ${Q_ACCENT}30`,
                }} />
                <span style={{ fontSize: 9, color: t.muted }}>{monthName(m.date)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: t.cardInner ?? 'rgba(255,255,255,0.02)', border: `0.5px solid ${t.border}`, borderRadius: 10, padding: 12, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: t.muted, marginBottom: 10 }}>
            بیشترین تغییر وزن در پورتفوی <span style={{ color: cream, fontSize: 9 }}>واحد درصد، از اول تا پایان فصل</span>
          </div>
          {weightChanges.length === 0 && <div style={{ fontSize: 11, color: cream }}>تغییر وزن قابل‌توجهی ثبت نشده</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {weightChanges.map((x, i) => {
              const up = x.d >= 0
              const maxD = Math.abs(weightChanges[0]?.d || 1)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, minWidth: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={up ? '#00E5A0' : '#FF4D6A'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    {up ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
                  </svg>
                  <span style={{ color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '0 1 auto' }}>{x.name}</span>
                  <span style={{ flex: 1, minWidth: 16, height: 4, borderRadius: 2, background: `${t.muted}22`, overflow: 'hidden', direction: 'ltr' }}>
                    <span style={{ display: 'block', width: `${Math.min(Math.abs(x.d) / maxD * 100, 100)}%`, height: '100%', borderRadius: 2, background: up ? '#00E5A0' : '#FF4D6A', opacity: 0.7, marginRight: 'auto' }} />
                  </span>
                  <span style={{ color: up ? '#00E5A0' : '#FF4D6A', fontWeight: 800, flexShrink: 0, minWidth: 74, textAlign: 'left', fontSize: 10.5 }}>
                    {up ? '+' : '−'}{Math.abs(x.d).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} واحد درصد
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* خالص خرید و فروش فصل */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        {[
          { title: 'بیشترین خرید خالص فصل', color: '#00E5A0', rows: topBuys, val: (e: any) => `${bt(e.net)}+`, empty: 'خرید خالص قابل‌توجهی ثبت نشده' },
          { title: 'بیشترین فروش خالص فصل', color: '#FF4D6A', rows: topSells, val: (e: any) => `${bt(-e.net)}-`, empty: 'فروش خالص قابل‌توجهی ثبت نشده' },
        ].map((sec, si) => (
          <div key={si} style={{ background: `${sec.color}08`, border: `0.5px solid ${sec.color}26`, borderRadius: 10, padding: 12, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: sec.color, marginBottom: 10 }}>{sec.title}</div>
            {sec.rows.length === 0 && <div style={{ fontSize: 11, color: cream }}>{sec.empty}</div>}
            {sec.rows.map((e: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 6, minWidth: 0 }}>
                <span style={{ color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '0 1 auto' }}>{e.name}</span>
                <span style={{ flex: 1, minWidth: 16, height: 4, borderRadius: 2, background: `${t.muted}22`, overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: `${Math.abs(e.net) / maxNet * 100}%`, height: '100%', borderRadius: 2, background: sec.color, opacity: 0.7 }} />
                </span>
                <span style={{ color: sec.color, fontWeight: 700, fontFamily: 'system-ui, sans-serif', flexShrink: 0 }}>{sec.val(e)} م.ت</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCard({ t, label, value, color, tooltip, onClick }: any) {
  return (
    <div title={tooltip || ''} onClick={onClick} style={{
      background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12,
      padding: '14px 16px', backdropFilter: 'blur(12px)', cursor: onClick ? 'pointer' : (tooltip ? 'help' : 'default'),
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

function FundPriceChart({ t, history }: { t: any, history: any[] }) {
  const cream = t === darkTheme ? '#ddd5bd' : '#6B5A3A'
  if (!history || history.length < 3) return null

  const prices = history.map(r => { const pc = safe(r.price_close); return safe(r.trade_value) > 1e6 ? Math.round(pc / 10) : pc })
  const volumes = history.map(r => safe(r.volume))
  const n = prices.length

  const minP = Math.min(...prices) * 0.998
  const maxP = Math.max(...prices) * 1.002
  const maxV = Math.max(...volumes, 1)

  const W = 560, H = 130, PX = 52, PY = 18
  const VH = 28
  const chartH = H - PY - 6

  const xOf = (i: number) => PX + (i / (n - 1)) * (W - PX - 10)
  const yOf = (v: number) => PY + (1 - (v - minP) / (maxP - minP)) * chartH

  const linePath = prices.reduce((acc, p, i) => {
    const x = xOf(i), y = yOf(p)
    if (i === 0) return `M${x.toFixed(1)},${y.toFixed(1)}`
    const px2 = xOf(i - 1), py2 = yOf(prices[i - 1])
    const mx = ((x + px2) / 2).toFixed(1)
    return `${acc} C${mx},${py2.toFixed(1)} ${mx},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`
  }, '')

  const bottomY = PY + chartH
  const areaPath = `${linePath} L${xOf(n - 1)},${bottomY} L${xOf(0)},${bottomY} Z`

  const totalChange = ((prices[n - 1] - prices[0]) / prices[0]) * 100
  const lineColor = totalChange >= 0 ? '#00E5A0' : '#FF4D6A'

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    y: PY + f * chartH,
    val: (maxP - f * (maxP - minP)).toLocaleString('fa-IR', { maximumFractionDigits: 0 }),
  }))

  // X-axis date labels: first, last, and every ~5th
  const step = Math.max(1, Math.round(n / 5))

  return (
    <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderTop: `2px solid ${lineColor}55`, borderRadius: 14, padding: '14px 16px', backdropFilter: 'blur(12px)', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>
          نمودار قیمت پایانی
          <span style={{ fontSize: 10, color: cream, marginRight: 8 }}>· {n} روز</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, color: lineColor, fontFamily: 'system-ui, sans-serif' }}>
          {totalChange >= 0 ? '+' : ''}{totalChange.toFixed(2)}٪
        </span>
      </div>
      <div style={{ overflowX: 'auto', direction: 'ltr' }}>
        <svg viewBox={`0 0 ${W} ${H + VH + 22}`} style={{ width: '100%', minWidth: 300, display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="pgFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Y grid + labels */}
          {yTicks.map((tk, i) => (
            <g key={i}>
              <line x1={PX} y1={tk.y} x2={W - 10} y2={tk.y} stroke={t.border} strokeWidth={0.5} />
              <text x={PX - 4} y={tk.y + 4} textAnchor="end" fontSize={8}
                fill={cream} fontFamily="system-ui, sans-serif">{tk.val}</text>
            </g>
          ))}

          {/* Area fill */}
          <path d={areaPath} fill="url(#pgFill)" />

          {/* Price line */}
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.2" strokeLinecap="round" />

          {/* Dot on last price */}
          <circle cx={xOf(n - 1)} cy={yOf(prices[n - 1])} r={3.5} fill={lineColor} />
          <circle cx={xOf(n - 1)} cy={yOf(prices[n - 1])} r={7} fill={lineColor} fillOpacity={0.18} />

          {/* Last price label */}
          {(() => {
            const lx = xOf(n - 1), ly = yOf(prices[n - 1])
            const label = prices[n - 1].toLocaleString('fa-IR', { maximumFractionDigits: 0 })
            const lw = label.length * 5.8 + 10
            return (
              <g>
                <rect x={lx + 8} y={ly - 9} width={lw} height={14} rx={3} fill="rgba(0,0,0,0.82)" />
                <rect x={lx + 8} y={ly - 9} width={lw} height={14} rx={3} fill="none" stroke={lineColor} strokeWidth={0.5} opacity={0.7} />
                <text x={lx + 8 + lw / 2} y={ly + 1} textAnchor="middle"
                  fontSize={8} fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
                  {label}
                </text>
              </g>
            )
          })()}

          {/* Volume bars */}
          <line x1={PX} y1={H + VH} x2={W - 10} y2={H + VH} stroke={t.border} strokeWidth={0.5} />
          {history.map((r, i) => {
            const bh = Math.max((safe(r.volume) / maxV) * VH, 2)
            const bw = Math.max((W - PX - 10) / n - 1, 3)
            return (
              <rect key={i}
                x={xOf(i) - bw / 2} y={H + VH - bh} width={bw} height={bh}
                fill={lineColor} opacity={0.3} rx={1}>
                <title>{`حجم: ${safe(r.volume).toLocaleString('fa-IR')}`}</title>
              </rect>
            )
          })}
          <text x={PX - 4} y={H + VH - 4} textAnchor="end" fontSize={7.5} fill={cream} fontFamily="system-ui">حجم</text>

          {/* Date labels */}
          {history.map((r, i) => {
            const show = i === 0 || i === n - 1 || i % step === 0
            if (!show) return null
            return (
              <text key={i} x={xOf(i)} y={H + VH + 16}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fontSize={8.5} fill={cream} fontFamily="Vazirmatn, Arial, sans-serif">
                {r.trade_date_shamsi?.slice(5)}
              </text>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function LineChartPanel({ t, title, subtitle, rows, getValue, colorAbove, colorBelow, threshold }: {
  t: any, title: string, subtitle?: string,
  rows: any[], getValue: (r: any) => number,
  colorAbove?: string, colorBelow?: string, threshold?: number,
}) {
  const cream = t === darkTheme ? '#ddd5bd' : '#6B5A3A'
  if (!rows || rows.length < 2) return null

  const above = colorAbove ?? '#00E5A0'
  const below = colorBelow ?? '#FF4D6A'
  const th = threshold ?? 1

  const vals = rows.map(r => { const v = getValue(r); return isFinite(v) ? v : 0 })
  const minV = Math.min(...vals, th * 0.8)
  const maxV = Math.max(...vals, th * 1.2)
  const range = Math.max(maxV - minV, 0.01)

  const W = 420, H = 90, PX = 18, PY = 26
  const chartH = H - PY - 8

  const xOf = (i: number) => PX + (i / (vals.length - 1)) * (W - 2 * PX)
  const yOf = (v: number) => PY + (1 - (v - minV) / range) * chartH

  const pts = vals.map((v, i) => ({ x: xOf(i), y: yOf(v), v }))

  // Smooth cubic bezier through all points
  const linePath = pts.reduce((acc, pt, i) => {
    if (i === 0) return `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
    const prev = pts[i - 1]
    const mx = ((pt.x + prev.x) / 2).toFixed(1)
    return `${acc} C${mx},${prev.y.toFixed(1)} ${mx},${pt.y.toFixed(1)} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
  }, '')

  const bottomY = PY + chartH
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${bottomY} L${pts[0].x},${bottomY} Z`
  const thY = yOf(th)

  return (
    <div style={{
      background: t.panel, border: `0.5px solid ${t.border}`,
      borderTop: `2px solid ${above}55`, borderRadius: 14,
      padding: '14px 16px', backdropFilter: 'blur(12px)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
      minWidth: 0, // grid item — سرریز موبایل
    }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: t.muted }}>{title}</div>
        {subtitle && <div style={{ fontSize: 10, color: cream, marginTop: 3 }}>{subtitle}</div>}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} style={{ width: '100%', overflow: 'visible', display: 'block' }} direction="ltr">
        <defs>
          <linearGradient id="lgLine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={above} stopOpacity="0.28" />
            <stop offset="100%" stopColor={above} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Horizontal grid */}
        {[0, 0.33, 0.66, 1].map(f => {
          const gy = PY + f * chartH
          return <line key={f} x1={PX} y1={gy} x2={W - PX} y2={gy} stroke={t.border} strokeWidth={0.5} opacity={0.6} />
        })}
        {/* Threshold dashed line */}
        {thY >= PY && thY <= bottomY && (
          <>
            <line x1={PX} y1={thY} x2={W - PX} y2={thY}
              stroke={t.muted} strokeWidth={1} strokeDasharray="5 3" opacity={0.6} />
            <rect x={W - PX - 14} y={thY - 8} width={14} height={12} rx={2} fill={t.panel} />
            <text x={W - PX - 7} y={thY + 2} textAnchor="middle" fontSize={8}
              fill={cream} fontFamily="system-ui, sans-serif">۱</text>
          </>
        )}
        {/* Area fill */}
        <path d={areaPath} fill="url(#lgLine)" className="chart-line-area" />
        {/* Smooth line */}
        <path d={linePath} fill="none" stroke={above} strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" className="chart-line-path" />
        {/* Points with dark-box labels */}
        {pts.map((pt, i) => {
          const col = pt.v >= th ? above : below
          const label = pt.v.toLocaleString('fa-IR', { maximumFractionDigits: 2 })
          const lw = label.length * 5.6 + 10
          const lx = Math.min(Math.max(pt.x - lw / 2, PX), W - PX - lw)
          const ly = Math.max(pt.y - 20, 2)
          return (
            <g key={i}>
              <rect x={lx} y={ly} width={lw} height={14} rx={3} fill="rgba(0,0,0,0.84)" />
              <rect x={lx} y={ly} width={lw} height={14} rx={3}
                fill="none" stroke={col} strokeWidth={0.5} opacity={0.8} />
              <text x={lx + lw / 2} y={ly + 10} textAnchor="middle"
                fontSize={8} fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
                {label}
              </text>
              <circle cx={pt.x} cy={pt.y} r={4} fill={col} />
              <circle cx={pt.x} cy={pt.y} r={7} fill={col} fillOpacity="0.18" />
            </g>
          )
        })}
        {/* Date labels */}
        {rows.map((r, i) => (
          <text key={i} x={xOf(i)} y={H + 16} textAnchor="middle"
            fontSize={9} fill={cream} fontFamily="Vazirmatn, Arial, sans-serif">
            {r.trade_date_shamsi?.slice(5)}
          </text>
        ))}
      </svg>
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
  const cream = t === darkTheme ? '#ddd5bd' : '#6B5A3A'
  if (!rows || rows.length === 0) return null

  const fmt = (v: number) => {
    if (!isFinite(v) || isNaN(v)) return '۰'
    if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}م`
    if (v >= 1_000) return `${(v / 1_000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}ه`
    return v.toLocaleString('fa-IR', { maximumFractionDigits: 2 })
  }

  const isPaired = !!getB
  const allVals = rows.flatMap(r => isPaired ? [getA(r), getB!(r)] : [getA(r)]).filter(v => isFinite(v) && !isNaN(v))
  const maxVal = Math.max(...allVals, 0.001)
  const barMaxH = 80
  const barW = isPaired ? 14 : 22
  const colW = isPaired ? 58 : 40

  return (
    <div style={{
      background: t.panel,
      border: `0.5px solid ${t.border}`,
      borderTop: `2px solid ${colorA}55`,
      borderRadius: 14,
      padding: '14px 16px',
      backdropFilter: 'blur(12px)',
      boxShadow: `0 4px 24px rgba(0,0,0,0.14)`,
      minWidth: 0, // grid item — لیبل‌های nowrap نباید ستون 1fr را باز کنند (سرریز موبایل)
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.muted }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 10, color: cream, marginTop: 3, direction: 'rtl' }}>
              {subtitle}
            </div>
          )}
        </div>
        {isPaired && (
          <div style={{ display: 'flex', gap: 10, fontSize: 10, flexShrink: 0 }}>
            <span style={{ color: colorA }}>● {labelA}</span>
            <span style={{ color: colorB }}>● {labelB}</span>
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto', direction: 'ltr' }}>
        <div style={{ display: 'flex', minWidth: rows.length * colW, height: barMaxH + 52, alignItems: 'flex-end', paddingBottom: 20 }}>
          {rows.map((r, i) => {
            const vA = getA(r)
            const vB = isPaired ? getB!(r) : null
            const hA = Math.max((vA / maxVal) * barMaxH, 2)
            const hB = vB !== null ? Math.max((vB / maxVal) * barMaxH, 2) : 0
            const barColorA = getColorA ? getColorA(r) : colorA
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Dark-box labels: A at bottom, B at top of 22px zone → no clip, clear stagger */}
                <div style={{ display: 'flex', gap: 3, height: 22, width: '100%', justifyContent: 'center', alignItems: 'flex-end', marginBottom: 3 }}>
                  <div style={{
                    fontSize: 8, fontWeight: 800, color: '#fff',
                    background: 'rgba(0,0,0,0.82)',
                    border: `0.5px solid ${barColorA}70`,
                    borderRadius: 3, padding: '1px 4px',
                    fontFamily: 'system-ui, sans-serif',
                    whiteSpace: 'nowrap', lineHeight: 1.4,
                  }}>{fmt(vA)}</div>
                  {isPaired && vB !== null && (
                    <div style={{
                      fontSize: 8, fontWeight: 800, color: '#fff',
                      background: 'rgba(0,0,0,0.82)',
                      border: `0.5px solid ${colorB}70`,
                      borderRadius: 3, padding: '1px 4px',
                      fontFamily: 'system-ui, sans-serif',
                      whiteSpace: 'nowrap', lineHeight: 1.4,
                      alignSelf: 'flex-start',
                    }}>{fmt(vB)}</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                  <div
                    title={`${labelA}: ${fmt(vA)}`}
                    className="chart-bar"
                    style={{
                      width: barW, height: hA,
                      borderRadius: '4px 4px 0 0',
                      background: `linear-gradient(0deg, ${barColorA}40, ${barColorA}e0)`,
                      boxShadow: `0 0 8px ${barColorA}35`,
                      animationDelay: `${i * 0.045}s`,
                    }}
                  />
                  {isPaired && vB !== null && (
                    <div
                      title={`${labelB}: ${fmt(vB)}`}
                      className="chart-bar"
                      style={{
                        width: barW, height: hB,
                        borderRadius: '4px 4px 0 0',
                        background: `linear-gradient(0deg, ${colorB}40, ${colorB}e0)`,
                        boxShadow: `0 0 8px ${colorB}35`,
                        animationDelay: `${i * 0.045 + 0.022}s`,
                      }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', minWidth: rows.length * colW }}>
          {rows.map((r, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: cream }}>
              {r.trade_date_shamsi?.slice(5)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
