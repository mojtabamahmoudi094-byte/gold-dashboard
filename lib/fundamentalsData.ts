import { supabase as sb } from './supabase'

export type Fundamentals = {
  symbol: string
  period: string
  pe: number | null; pb: number | null
  roe: number | null; roa: number | null
  netMargin: number | null; opMargin: number | null
  assetTurnover: number | null; equityMultiplier: number | null
  debtToEquity: number | null; bookValuePerShare: number | null
  marketCap: number | null; enterpriseValue: number | null; evToEbit: number | null
  updated: string
}

// منبع مشترک برای app/api/fundamentals/[symbol]/route.ts و SSR صفحه نسبت‌های مالی
export async function getFundamentals(symbol: string): Promise<Fundamentals | null> {
  const name = decodeURIComponent(symbol).replace(/-/g, ' ').trim()
  const { data, error } = await sb
    .from('stock_fundamentals')
    .select('data, updated')
    .eq('symbol', name)
    .maybeSingle()

  if (error || !data?.data) return null
  return { symbol: name, ...data.data, updated: data.updated }
}
