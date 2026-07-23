'use client'

// تابلوخوانی صندوق — ۱۰ روز اخیر؛ برای روزهای بیشتر دکمهٔ «آرشیو» گوشهٔ هر نمودار

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabase'
import { darkTheme, lightTheme, shouldUseDark } from '../../../../lib/theme'
import { safe } from '../../../../lib/format'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { TapeChartStyles } from '../../../components/TapeChartPanels'
import { SubPageHeader, StatRow, fetchFundFullHistory } from '../fundShared'
import { FUND_TAPE_METRICS, FundTapeChart } from '../fundTapeCharts'

export default function FundTapePage() {
  const params = useParams()
  const slug = decodeURIComponent((params?.slug as string) || '')
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [asset, setAsset] = useState<any>(null)
  const [all, setAll] = useState<any[] | null>(null)

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
  const rows = all == null ? [] : all.slice(-10)
  const latest = rows.length ? rows[rows.length - 1] : null
  const enc = encodeURIComponent(slug)

  const rialDiv = latest && safe(latest.trade_value) > 1e6
  const avgDiv = rialDiv ? 1e7 : 1e6
  const buyAvgMT = latest && safe(latest.buy_count_i) > 0
    ? Math.round(safe(latest.buy_i_volume) * safe(latest.price_close) / safe(latest.buy_count_i) / avgDiv) : 0
  const sellAvgMT = latest && safe(latest.sell_count_i) > 0
    ? Math.round(safe(latest.sell_i_volume) * safe(latest.price_close) / safe(latest.sell_count_i) / avgDiv) : 0

  return (
    <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SubPageHeader t={t} slug={slug} assetName={asset?.name ?? slug} crumb="تابلوخوانی" />
        <div style={{ fontSize: 11.5, color: t.muted, lineHeight: 1.9 }}>
          ۱۰ روز معاملاتی اخیر — برای روزهای بیشتر، دکمهٔ «آرشیو» گوشهٔ هر نمودار (آرشیو نامحدود)
        </div>

        {all == null && <div style={{ color: t.muted, fontSize: 13, padding: 40, textAlign: 'center' }}>در حال دریافت…</div>}
        {all != null && rows.length === 0 && <div style={{ color: t.muted, fontSize: 13, padding: 40, textAlign: 'center' }}>داده‌ای ثبت نشده</div>}

        {rows.length > 0 && (
          <>
            <TapeChartStyles />

            {/* جزئیات معاملات حقیقی — آخرین روز */}
            <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
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

            {/* دو نمودار عریض */}
            <FundTapeChart m="flow" rows={rows} t={t} archiveHref={`/fund/${enc}/tape/archive?m=flow`} />
            <FundTapeChart m="percap" rows={rows} t={t} archiveHref={`/fund/${enc}/tape/archive?m=percap`} />

            {/* شبکهٔ نمودارها */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              {FUND_TAPE_METRICS.filter(x => x.key !== 'flow' && x.key !== 'percap').map(x => (
                <FundTapeChart key={x.key} m={x.key} rows={rows} t={t} archiveHref={`/fund/${enc}/tape/archive?m=${x.key}`} />
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: 6 }}>
          <Link href={`/fund/${enc}`} style={{ color: t.accent, fontSize: 13, textDecoration: 'none' }}>← بازگشت به صفحهٔ صندوق</Link>
        </div>
      </div>
    </main>
  )
}
