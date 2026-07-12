import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../lib/supabase'
import fs from 'fs/promises'
import path from 'path'

// اسکرینر ارزش‌گذاری batch — همان مدل رشد گوردون app/valuation/page.tsx (P = D1/(r-g))
// روی همه نمادهای دارای EPS سالانه واقعی از گزارش‌های کدال اجرا می‌شود.
// فرضیات پیش‌فرض: بازده مورد انتظار ۳۰٪، نسبت تقسیم سود ۵۰٪، رشد از CAGR واقعی EPS
// (کاربر می‌تواند برای بررسی دقیق‌تر یک نماد، در app/valuation فرضیات را دستی تنظیم کند).

export const dynamic = 'force-dynamic'

type RQuarter = { period: string; months: number; audited: boolean; eps: number | null }
type Reports = { symbol: string; quarters: RQuarter[] }
type Sym = { l18: string; l30: string; pl: number | null; pe: number | null }

const DEFAULT_R = 0.30
const DEFAULT_PAYOUT = 0.50
const DEFAULT_G = 0.15

async function reportSymbols(): Promise<string[]> {
  try {
    const { data, error } = await sb.from('stock_reports').select('symbol')
    if (!error && data?.length) return data.map((r: any) => r.symbol as string)
  } catch { /* fallback below */ }
  try {
    const dir = path.join(process.cwd(), 'public', 'reports')
    const files = await fs.readdir(dir)
    return files.filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '').replace(/-/g, ' '))
  } catch { return [] }
}

async function loadReport(symbol: string): Promise<Reports | null> {
  try {
    const file = path.join(process.cwd(), 'public', 'reports', `${symbol.replace(/\s+/g, '-')}.json`)
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch { return null }
}

async function loadPrices(): Promise<Map<string, Sym>> {
  const map = new Map<string, Sym>()
  let industries: { symbols: Sym[] }[] = []
  try {
    const { data, error } = await sb.from('stock_industries').select('data').eq('id', 1).maybeSingle()
    if (!error && data?.data?.industries) industries = data.data.industries
  } catch { /* fallback below */ }
  if (industries.length === 0) {
    try {
      const file = path.join(process.cwd(), 'public', 'stocks', 'industries.json')
      const json = JSON.parse(await fs.readFile(file, 'utf8'))
      industries = json.industries ?? []
    } catch { /* leave empty */ }
  }
  for (const ind of industries) for (const s of ind.symbols ?? []) map.set(s.l18, s)
  return map
}

export async function GET() {
  const [symbols, priceMap] = await Promise.all([reportSymbols(), loadPrices()])

  const rows = await Promise.all(symbols.map(async (symbol) => {
    const rep = await loadReport(symbol)
    if (!rep) return null
    const annual = (rep.quarters ?? [])
      .filter(q => q.months === 12 && typeof q.eps === 'number' && q.eps! > 0)
      .sort((a, b) => a.period.localeCompare(b.period))
    if (annual.length === 0) return null

    const latest = annual[annual.length - 1]
    const eps = Math.round(latest.eps!)

    let g = DEFAULT_G
    if (annual.length >= 2) {
      const first = annual[0]
      const yrs = annual.length - 1
      const cagr = Math.pow(latest.eps! / first.eps!, 1 / yrs) - 1
      if (isFinite(cagr) && cagr > -0.5 && cagr < 2) g = cagr
    }

    const price = priceMap.get(symbol)
    if (!price?.pl) return null

    const D0 = eps * DEFAULT_PAYOUT
    const D1 = D0 * (1 + g)
    if (DEFAULT_R <= g) return null // مدل گوردون فقط وقتی r > g معتبر است
    const intrinsic = D1 / (DEFAULT_R - g)
    const ratio = intrinsic / price.pl

    return {
      symbol,
      name: price.l30 || symbol,
      price: price.pl,
      pe: price.pe,
      eps,
      growthPct: Math.round(g * 1000) / 10,
      intrinsic: Math.round(intrinsic),
      ratio: Math.round(ratio * 1000) / 1000,
      verdict: ratio > 1.08 ? 'undervalued' : ratio < 0.92 ? 'overvalued' : 'fair',
    }
  }))

  const valid = rows.filter((r): r is NonNullable<typeof r> => r !== null)
  valid.sort((a, b) => b.ratio - a.ratio)

  return NextResponse.json({
    updated: new Date().toISOString(),
    assumptions: { expectedReturnPct: DEFAULT_R * 100, payoutPct: DEFAULT_PAYOUT * 100, defaultGrowthPct: DEFAULT_G * 100 },
    count: valid.length,
    rows: valid,
  }, { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } })
}
