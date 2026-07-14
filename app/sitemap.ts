import type { MetadataRoute } from 'next'
import { SITE_URL } from '../lib/site'
import { supabase } from '../lib/supabase'

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
]

async function fundSlugs(): Promise<string[]> {
  const { data } = await supabase.from('assets').select('slug')
  return (data ?? []).map((r) => r.slug as string).filter(Boolean)
}

async function stockSymbols(): Promise<string[]> {
  const { data } = await supabase
    .from('stock_industries')
    .select('data')
    .eq('id', 1)
    .maybeSingle()
  const industries = (data?.data?.industries ?? []) as { symbols?: { l18: string }[] }[]
  const symbols = industries.flatMap((ind) => (ind.symbols ?? []).map((s) => s.l18))
  return Array.from(new Set(symbols)).filter(Boolean)
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date()

  const staticEntries = STATIC_ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: 'hourly' as const,
    priority,
  }))

  const [slugs, symbols] = await Promise.all([fundSlugs(), stockSymbols()])

  const fundEntries = slugs.map((slug) => ({
    url: `${SITE_URL}/fund/${encodeURIComponent(slug)}`,
    lastModified,
    changeFrequency: 'hourly' as const,
    priority: 0.5,
  }))

  const stockEntries = symbols.map((symbol) => ({
    url: `${SITE_URL}/stock/${encodeURIComponent(symbol)}`,
    lastModified,
    changeFrequency: 'hourly' as const,
    priority: 0.5,
  }))

  const technicalEntries = symbols.map((symbol) => ({
    url: `${SITE_URL}/technical/${encodeURIComponent(symbol)}`,
    lastModified,
    changeFrequency: 'daily' as const,
    priority: 0.4,
  }))

  return [...staticEntries, ...fundEntries, ...stockEntries, ...technicalEntries]
}
