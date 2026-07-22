import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '../../../lib/supabaseAdmin'
import { safe } from '../../../lib/format'
import { SILVER_FUND_WEIGHTS } from '../../../lib/goldBubbles'

export const dynamic = 'force-dynamic'

// همان محاسبه app/signals/page.tsx (getOutcome) — نتیجه N روزه سیگنال بر اساس سری قیمت مرجع دسته
function getOutcome(
  signalDate: string,
  signalType: string,
  dates: string[],
  priceMap: Record<string, number>,
  N: number,
): number | null {
  const idx = dates.findIndex(d => d >= signalDate)
  if (idx < 0 || idx + N >= dates.length) return null
  const entry = priceMap[dates[idx]]
  const exit_ = priceMap[dates[idx + N]]
  if (!entry || !exit_) return null
  const ret = (exit_ - entry) / entry * 100
  return signalType === 'فروش' ? -ret : ret
}

type PriceSeries = { dates: string[]; priceMap: Record<string, number> }
const EMPTY_SERIES: PriceSeries = { dates: [], priceMap: {} }

const BOURSE_CATS = [
  { key: 'leveraged', label: 'اهرمی' },
  { key: 'sector', label: 'بخشی' },
  { key: 'equity', label: 'سهامی' },
]
const CATEGORY_LABELS: Record<string, string> = {
  gold: 'طلا', silver: 'نقره', leveraged: 'اهرمی', sector: 'بخشی', equity: 'سهامی', stock: 'سهام',
}

export async function GET() {
  // ۱. سیگنال‌های معتبر موتور جدید ([v2])
  const { data: sigs } = await sb
    .from('signals')
    .select('*')
    .not('confidence', 'is', null)
    .order('id', { ascending: false })
  const signals = (sigs ?? []).filter((s: any) => typeof s.note === 'string' && s.note.startsWith('[v2]'))
  const trading = signals.filter((s: any) => s.signal_type !== 'نگه‌داری')

  // ۲. سری قیمت طلا (asset_id=2)
  const { data: goldPrices } = await sb
    .from('gold_funds')
    .select('trade_date_shamsi, price_close')
    .eq('asset_id', 2)
    .not('price_close', 'is', null)
    .order('trade_date_shamsi', { ascending: true })
  const goldSeries: PriceSeries = { dates: [], priceMap: {} }
  ;(goldPrices ?? []).forEach((p: any) => {
    goldSeries.dates.push(p.trade_date_shamsi)
    goldSeries.priceMap[p.trade_date_shamsi] = safe(p.price_close)
  })

  // ۳. سری مرجع نقره + شاخص ترکیبی صندوق‌های بورسی — نیازمند لیست دارایی‌ها
  const { data: assets } = await sb.from('assets').select('id, name, category')
  const assetMap: Record<number, any> = {}
  ;(assets ?? []).forEach((a: any) => { assetMap[a.id] = a })

  let silverSeries: PriceSeries = EMPTY_SERIES
  const silverAssets = (assets ?? []).filter((a: any) => a.category === 'نقره')
  const silverBenchmark = silverAssets.find((a: any) => (SILVER_FUND_WEIGHTS[a.name]?.silver ?? 0) >= 99) ?? silverAssets[0]
  if (silverBenchmark) {
    const { data: sp } = await sb.from('gold_funds')
      .select('trade_date_shamsi, price_close')
      .eq('asset_id', silverBenchmark.id)
      .not('price_close', 'is', null)
      .order('trade_date_shamsi', { ascending: true })
    if (sp?.length) {
      const spm: Record<string, number> = {}
      sp.forEach((p: any) => { spm[p.trade_date_shamsi] = safe(p.price_close) })
      silverSeries = { dates: sp.map((p: any) => p.trade_date_shamsi as string), priceMap: spm }
    }
  }

  const bourseSeries: Record<string, PriceSeries> = {}
  const bourseCatSet = new Set(BOURSE_CATS.map(c => c.label))
  const catByKey: Record<string, string> = Object.fromEntries(BOURSE_CATS.map(c => [c.label, c.key]))
  const bourseIds = (assets ?? []).filter((a: any) => bourseCatSet.has(a.category)).map((a: any) => a.id)
  if (bourseIds.length) {
    const { data: fullHist } = await sb.from('gold_funds')
      .select('asset_id, trade_date_shamsi, price_change_pct')
      .in('asset_id', bourseIds)
      .not('price_change_pct', 'is', null)
      .order('trade_date_shamsi', { ascending: true })
    if (fullHist?.length) {
      const byCatDate: Record<string, Record<string, { sum: number; cnt: number }>> = {}
      fullHist.forEach((r: any) => {
        const cat = assetMap[r.asset_id]?.category
        const key = cat ? catByKey[cat] : null
        if (!key) return
        byCatDate[key] ??= {}
        byCatDate[key][r.trade_date_shamsi] ??= { sum: 0, cnt: 0 }
        byCatDate[key][r.trade_date_shamsi].sum += r.price_change_pct ?? 0
        byCatDate[key][r.trade_date_shamsi].cnt++
      })
      Object.entries(byCatDate).forEach(([key, days]) => {
        const ds = Object.keys(days).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        const pm: Record<string, number> = {}
        let idx = 100
        ds.forEach(d => {
          const avgChg = days[d].sum / days[d].cnt
          idx *= (1 + avgChg / 100)
          pm[d] = idx
        })
        bourseSeries[key] = { dates: ds, priceMap: pm }
      })
    }
  }

  // ۴. سری قیمت نمادهای سهام (ثبت‌شده هنگام صدور سیگنال)
  const stockSeries: Record<string, PriceSeries> = {}
  try {
    const { data: sp } = await sb.from('stock_signal_prices')
      .select('symbol, snap_date, price')
      .order('snap_date', { ascending: true })
    ;(sp ?? []).forEach((r: any) => {
      stockSeries[r.symbol] ??= { dates: [], priceMap: {} }
      stockSeries[r.symbol].dates.push(r.snap_date)
      stockSeries[r.symbol].priceMap[r.snap_date] = safe(r.price)
    })
  } catch { /* جدول ممکن است هنوز ساخته نشده باشد */ }

  const seriesFor = (category: string | undefined, symbol?: string | null): PriceSeries => {
    const cat = category || 'gold'
    if (cat === 'gold') return goldSeries
    if (cat === 'silver') return silverSeries
    if (cat === 'stock') return (symbol && stockSeries[symbol]) || EMPTY_SERIES
    return bourseSeries[cat] || EMPTY_SERIES
  }

  // ۵. نتیجه ۱۰ روزه هر سیگنال معاملاتی
  const N = 10
  const recent = trading.map((s: any) => {
    const ser = seriesFor(s.category, s.symbol)
    const outcome = getOutcome(s.signal_date_shamsi, s.signal_type, ser.dates, ser.priceMap, N)
    return {
      date: s.signal_date_shamsi,
      type: s.signal_type,
      category: s.category || 'gold',
      categoryLabel: CATEGORY_LABELS[s.category || 'gold'] ?? (s.category || 'gold'),
      symbol: s.symbol ?? null,
      confidence: s.confidence,
      reason: s.reason ?? null,
      outcomePct: outcome === null ? null : Math.round(outcome * 100) / 100,
    }
  })

  const settled = recent.filter(r => r.outcomePct !== null)
  const won = settled.filter(r => (r.outcomePct as number) > 0)
  const overall = {
    n: settled.length,
    pending: recent.length - settled.length,
    winRate: settled.length > 0 ? Math.round(won.length / settled.length * 100) : null,
    avgReturn: settled.length > 0
      ? Math.round(settled.reduce((a, r) => a + (r.outcomePct as number), 0) / settled.length * 100) / 100
      : null,
  }

  const byCategory: Record<string, { n: number; winRate: number | null; avgReturn: number | null }> = {}
  for (const key of Object.keys(CATEGORY_LABELS)) {
    const rows = settled.filter(r => r.category === key)
    if (rows.length === 0) continue
    const w = rows.filter(r => (r.outcomePct as number) > 0)
    byCategory[key] = {
      n: rows.length,
      winRate: Math.round(w.length / rows.length * 100),
      avgReturn: Math.round(rows.reduce((a, r) => a + (r.outcomePct as number), 0) / rows.length * 100) / 100,
    }
  }

  // کالیبراسیون اعتماد: آیا سیگنال‌های «اعتماد ۸۰» واقعاً بیشتر از «اعتماد ۶۰» می‌برند؟
  // اگر نرخ برد سطل‌ها هم‌ترتیبِ اعتماد نباشد، عدد confidence نمایشی است نه اطلاعاتی —
  // خودِ این شفافیت برای کاربر ارزش است.
  const CONF_BUCKETS = [
    { key: 'low', label: 'اعتماد زیر ۶۰', min: -Infinity, max: 60 },
    { key: 'mid', label: 'اعتماد ۶۰ تا ۷۵', min: 60, max: 75 },
    { key: 'high', label: 'اعتماد بالای ۷۵', min: 75, max: Infinity },
  ]
  const byConfidence = CONF_BUCKETS.map(b => {
    const rows = settled.filter(r => typeof r.confidence === 'number' && r.confidence >= b.min && r.confidence < b.max)
    if (rows.length === 0) return { key: b.key, label: b.label, n: 0, winRate: null, avgReturn: null }
    const w = rows.filter(r => (r.outcomePct as number) > 0)
    return {
      key: b.key,
      label: b.label,
      n: rows.length,
      winRate: Math.round(w.length / rows.length * 100),
      avgReturn: Math.round(rows.reduce((a, r) => a + (r.outcomePct as number), 0) / rows.length * 100) / 100,
    }
  })

  return NextResponse.json({
    updated: new Date().toISOString(),
    horizonDays: N,
    overall,
    byCategory,
    byConfidence,
    categoryLabels: CATEGORY_LABELS,
    recent: recent.slice(0, 200),
  })
}
