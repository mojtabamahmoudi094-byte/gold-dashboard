import type { MetadataRoute } from 'next'
import { SITE_URL } from '../lib/site'
import { supabase } from '../lib/supabase'
import { getStocksIndustries } from '../lib/stocksIndustriesData'

// بدون این، fetch داخلی Supabase توسط Data Cache نکست کش می‌شود و lastmod چند روز کهنه می‌ماند
// (ناهماهنگ با /api/stocks-industries که force-dynamic است) — هر ۵ دقیقه کافیست چون دیتای زنده هم با همین کادنس آپدیت می‌شود
export const revalidate = 300

const STATIC_ROUTES: { path: string; priority: number }[] = [
  { path: '', priority: 1 },
  { path: '/stocks', priority: 0.7 },
  { path: '/funds', priority: 0.7 },
  { path: '/funds/bourse', priority: 0.6 },
  { path: '/funds/radar', priority: 0.6 },
  { path: '/monitor', priority: 0.7 },
  { path: '/monitor/stocks', priority: 0.6 },
  { path: '/monitor/bourse-funds', priority: 0.6 },
  { path: '/monitor/gold', priority: 0.6 },
  { path: '/monitor/silver', priority: 0.6 },
  { path: '/monitor/saffron', priority: 0.6 },
  { path: '/analysis', priority: 0.7 },
  { path: '/analysis/gold', priority: 0.6 },
  { path: '/analysis/silver', priority: 0.6 },
  { path: '/valuation', priority: 0.7 },
  { path: '/valuation/screener', priority: 0.6 },
  { path: '/technical', priority: 0.7 },
  { path: '/technical/screener', priority: 0.6 },
  { path: '/technical/backtest', priority: 0.6 },
  { path: '/trade-value', priority: 0.7 },
  { path: '/trade-value/bourse', priority: 0.6 },
  { path: '/trade-value/gold', priority: 0.6 },
  { path: '/trade-value/silver', priority: 0.6 },
  { path: '/trade-value/saffron', priority: 0.6 },
  { path: '/trade-value/leveraged', priority: 0.6 },
  { path: '/trade-value/sector', priority: 0.6 },
  { path: '/trade-value/equity', priority: 0.6 },
  { path: '/trade-value/tse', priority: 0.6 },
  { path: '/trade-value/ifb', priority: 0.6 },
  { path: '/compare', priority: 0.7 },
  { path: '/signals', priority: 0.7 },
  { path: '/track-record', priority: 0.6 },
  { path: '/vip/filters', priority: 0.6 },
  { path: '/market-map', priority: 0.7 },
  { path: '/alerts', priority: 0.5 },
  { path: '/best-bourse-tools', priority: 0.6 },
  { path: '/alternatives/rahavard365', priority: 0.6 },
]

async function fundEntriesData(): Promise<{ slug: string; updated: Date }[]> {
  const { data: assets } = await supabase.from('assets').select('id, slug')
  const rows = assets ?? []
  if (rows.length === 0) return []

  // آخرین به‌روزرسانی هر صندوق برای lastmod واقعی (نه تاریخ ثابت build) —
  // ۲۰۰ ردیف اخیر کل جدول برای ~۴۰ صندوق کافیست چون sync-funds همه صندوق‌ها را با هم آپدیت می‌کند
  const { data: recent } = await supabase
    .from('gold_funds')
    .select('asset_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const latestByAsset = new Map<number, Date>()
  for (const r of recent ?? []) {
    if (!latestByAsset.has(r.asset_id)) latestByAsset.set(r.asset_id, new Date(r.created_at))
  }

  return rows
    .filter((r) => r.slug)
    .map((r) => ({ slug: r.slug as string, updated: latestByAsset.get(r.id) ?? new Date() }))
}

async function stockSymbols(): Promise<{ symbols: string[]; updated: Date }> {
  const { industries, updated } = await getStocksIndustries()
  const symbols = industries.flatMap((ind) => (ind.symbols ?? []).map((s) => s.l18))
  return { symbols: Array.from(new Set(symbols)).filter(Boolean), updated: updated ? new Date(updated) : new Date() }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date()

  const staticEntries = STATIC_ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: 'hourly' as const,
    priority,
  }))

  const [funds, { symbols, updated }] = await Promise.all([fundEntriesData(), stockSymbols()])

  const fundEntries = funds.map(({ slug, updated: fundUpdated }) => ({
    url: `${SITE_URL}/fund/${encodeURIComponent(slug)}`,
    lastModified: fundUpdated,
    changeFrequency: 'hourly' as const,
    priority: 0.5,
  }))

  const stockEntries = symbols.map((symbol) => ({
    url: `${SITE_URL}/stock/${encodeURIComponent(symbol)}`,
    lastModified: updated,
    changeFrequency: 'hourly' as const,
    priority: 0.5,
  }))

  const technicalEntries = symbols.map((symbol) => ({
    url: `${SITE_URL}/technical/${encodeURIComponent(symbol)}`,
    lastModified: updated,
    changeFrequency: 'daily' as const,
    priority: 0.4,
  }))

  const fundamentalsEntries = symbols.map((symbol) => ({
    url: `${SITE_URL}/fundamentals/${encodeURIComponent(symbol)}`,
    lastModified: updated,
    changeFrequency: 'daily' as const,
    priority: 0.4,
  }))

  return [...staticEntries, ...fundEntries, ...stockEntries, ...technicalEntries, ...fundamentalsEntries]
}
