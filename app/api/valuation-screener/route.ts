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
// حداقل فاصلهٔ r-g؛ مدل گوردون وقتی g به r نزدیک می‌شود مخرج را منفجر می‌کند و
// ارزش ذاتی نجومی و کاذب می‌سازد. این کف، همان کلاس باگ را می‌بندد.
const MIN_SPREAD = 0.10

// ارزش ذاتی گوردون با تضمین فاصلهٔ حداقلی r-g (کلمپ g تا r-MIN_SPREAD)
function gordon(eps: number, payout: number, r: number, g: number): number {
  const gg = Math.min(g, r - MIN_SPREAD)
  const D1 = eps * payout * (1 + gg)
  return D1 / (r - gg)
}

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

    // سه سناریو: پایه، بدبینانه (r بالاتر، g پایین‌تر)، خوش‌بینانه (r پایین‌تر، g بالاتر).
    // هر سناریو با gordon() فاصلهٔ حداقلی r-g را تضمین می‌کند تا انفجار مخرج رخ ندهد.
    const base = gordon(eps, DEFAULT_PAYOUT, DEFAULT_R, g)
    const bear = gordon(eps, DEFAULT_PAYOUT, DEFAULT_R + 0.05, g - 0.05)
    const bull = gordon(eps, DEFAULT_PAYOUT, DEFAULT_R - 0.05, g + 0.05)

    const ratio = base / price.pl
    const bearRatio = bear / price.pl
    const bullRatio = bull / price.pl

    // verdict محافظه‌کارانه: «زیر ارزش» فقط وقتی حتی در سناریوی بدبینانه هم ارزنده باشد،
    // «بالای ارزش» فقط وقتی حتی در سناریوی خوش‌بینانه هم گران باشد. جلوی اطمینان کاذب را می‌گیرد.
    const verdict = bearRatio > 1.08 ? 'undervalued' : bullRatio < 0.92 ? 'overvalued' : 'fair'

    return {
      symbol,
      name: price.l30 || symbol,
      price: price.pl,
      pe: price.pe,
      eps,
      growthPct: Math.round(g * 1000) / 10,
      intrinsic: Math.round(base),
      intrinsicBear: Math.round(bear),
      intrinsicBull: Math.round(bull),
      ratio: Math.round(ratio * 1000) / 1000,
      ratioBear: Math.round(bearRatio * 1000) / 1000,
      ratioBull: Math.round(bullRatio * 1000) / 1000,
      verdict,
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
