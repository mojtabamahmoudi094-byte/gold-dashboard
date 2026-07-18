import { supabase as sb } from './supabase'
import fs from 'fs/promises'
import path from 'path'

// منبع مشترک برای app/api/stock-reports/[symbol]/route.ts (کلاینت) و صفحات SSR
export async function getStockReport(symbol: string): Promise<unknown | null> {
  const name = decodeURIComponent(symbol).replace(/-/g, ' ').trim()

  try {
    const { data, error } = await sb
      .from('stock_reports')
      .select('data')
      .eq('symbol', name)
      .maybeSingle()
    if (!error && data?.data) return data.data
  } catch { /* fallback به فایل استاتیک */ }

  try {
    const file = path.join(process.cwd(), 'public', 'reports', `${name.replace(/\s+/g, '-')}.json`)
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}
