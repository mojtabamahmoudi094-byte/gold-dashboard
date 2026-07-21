import { supabase as sb } from './supabase'
import fs from 'fs/promises'
import path from 'path'

export type SnapshotRow = {
  trade_date_shamsi: string
  pc: number | null; pcp: number | null; pl: number | null; plp: number | null
  tval: number | null; tvol: number | null; mv: number | null; mv_usd: number | null; pe: number | null
}
export type Sym = {
  l18: string; l30: string
  pl: number | null; plp: number | null
  pc: number | null; pcp: number | null
  tval: number | null; tvol: number | null
  mv: number | null; mv_usd?: number | null; pe: number | null
}
export type Industry = {
  id: number | null; name: string; count: number
  tval: number; mv: number; mv_usd?: number; up: number; down: number
  symbols: Sym[]
}
export type ExtraGroup = {
  id: number; name: string; kind: 'fund' | 'right' | 'commodity'; count: number
  tval: number; mv: number; up: number; down: number
  symbols: Sym[]
}
export type StocksIndustriesPayload = { updated: string; industries: Industry[]; extraGroups?: ExtraGroup[]; usdRate?: number | null }

// منبع مشترک برای app/api/stocks-industries/route.ts (کلاینت) و صفحات SSR — تا داده لحظه‌ای سهام هم به API هم به HTML اولیه صفحه نماد برسد
export async function getStocksIndustries(): Promise<StocksIndustriesPayload> {
  try {
    const { data, error } = await sb
      .from('stock_industries')
      .select('data')
      .eq('id', 1)
      .maybeSingle()
    if (!error && data?.data) return data.data as StocksIndustriesPayload
  } catch { /* fallback به فایل استاتیک */ }

  try {
    const file = path.join(process.cwd(), 'public', 'stocks', 'industries.json')
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return { updated: '', industries: [] }
  }
}
