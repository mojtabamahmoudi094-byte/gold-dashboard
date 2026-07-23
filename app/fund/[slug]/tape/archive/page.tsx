'use client'

// آرشیو نامحدود یک نمودار تابلوخوانی صندوق — /fund/[slug]/tape/archive?m=<metric>

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../../lib/supabase'
import { darkTheme, lightTheme, shouldUseDark } from '../../../../../lib/theme'
import { safe } from '../../../../../lib/format'
import { downloadCSV } from '../../../../../lib/csvExport'
import { TapeChartStyles } from '../../../../components/TapeChartPanels'
import { SubPageHeader } from '../../fundShared'
import { FUND_TAPE_METRICS, FundTapeChart, type FundMetricKey } from '../../fundTapeCharts'

type Range = 30 | 90 | 180 | 'all'

function ArchiveInner() {
  const params = useParams()
  const sp = useSearchParams()
  const slug = decodeURIComponent((params?.slug as string) || '')
  const m = (sp.get('m') || 'flow') as FundMetricKey
  const meta = FUND_TAPE_METRICS.find(x => x.key === m) ?? FUND_TAPE_METRICS[0]

  const [isDark, setIsDark] = useState(true)
  const [asset, setAsset] = useState<any>(null)
  const [all, setAll] = useState<any[] | null>(null)
  const [range, setRange] = useState<Range>(90)

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    if (!slug) return
    supabase.from('assets').select('*').or(`slug.eq.${slug},name.eq.${slug}`).limit(1).maybeSingle().then(({ data: a }) => {
      setAsset(a ?? null)
      if (!a) { setAll([]); return }
      supabase.from('gold_funds').select('*').eq('asset_id', a.id)
        .order('trade_date_shamsi', { ascending: true }).order('id', { ascending: true }).limit(3000)
        .then(({ data }) => setAll(data ?? []))
    })
  }, [slug])

  const t: any = isDark ? darkTheme : lightTheme
  const rows = all == null ? [] : (range === 'all' ? all : all.slice(-range))
  const enc = encodeURIComponent(slug)

  return (
    <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SubPageHeader t={t} slug={slug} assetName={asset?.name ?? slug} crumb={`آرشیو — ${meta.title}`} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: t.muted }}>بازه:</span>
          {([30, 90, 180, 'all'] as Range[]).map(r => (
            <button key={String(r)} onClick={() => setRange(r)} style={{
              fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              background: range === r ? t.accent : 'transparent', color: range === r ? '#0a0e14' : t.muted,
              border: `0.5px solid ${range === r ? t.accent : t.border}`,
            }}>{r === 'all' ? `همه (${(all?.length ?? 0).toLocaleString('fa-IR')})` : `${r.toLocaleString('fa-IR')} روز`}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button onClick={() => downloadCSV(`${slug}-${m}-archive.csv`, rows.map((r: any) => ({
            تاریخ: r.trade_date_shamsi, قیمت_پایانی: r.price_close, حجم: r.volume, ارزش_معاملات: r.trade_value,
            خریدار_حقیقی: r.buy_count_i, فروشنده_حقیقی: r.sell_count_i, حجم_خرید_حقیقی: r.buy_i_volume, حجم_فروش_حقیقی: r.sell_i_volume,
          })))} style={{
            fontSize: 11, color: t.muted, cursor: 'pointer', padding: '5px 12px', borderRadius: 8,
            background: 'transparent', border: `0.5px solid ${t.border}`, fontFamily: 'inherit',
          }}>دانلود CSV</button>
        </div>

        {all == null && <div style={{ color: t.muted, fontSize: 13, padding: 40, textAlign: 'center' }}>در حال دریافت آرشیو…</div>}
        {all != null && rows.length === 0 && <div style={{ color: t.muted, fontSize: 13, padding: 40, textAlign: 'center' }}>داده‌ای ثبت نشده</div>}

        {rows.length > 0 && (
          <>
            <TapeChartStyles />
            <FundTapeChart m={m} rows={rows} t={t} />
          </>
        )}

        <div style={{ marginTop: 6 }}>
          <Link href={`/fund/${enc}/tape`} style={{ color: t.accent, fontSize: 13, textDecoration: 'none' }}>← بازگشت به تابلوخوانی</Link>
        </div>
      </div>
    </main>
  )
}

export default function FundTapeArchivePage() {
  return (
    <Suspense fallback={null}>
      <ArchiveInner />
    </Suspense>
  )
}
