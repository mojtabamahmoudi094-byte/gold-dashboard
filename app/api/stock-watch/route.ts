import { NextRequest, NextResponse } from 'next/server'
import { supabase as sb } from '../../../lib/supabase'

// سری زمانی سنجه‌های «رصد لحظه‌ای پورتفو» — یک یا چند نماد با هم
// ?symbols=فولاد,شپنا — خروجی: { date, bySymbol: { فولاد: { cat, rows: [{ ts, ...d }] } } }
// جدول stock_watch_5m فقط برای نمادهایی که در تراکنش‌های پورتفوی کاربران هستند پر می‌شود (scripts/stocks-industries.js)

export const dynamic = 'force-dynamic'

const tehranDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })

// ساعت واقعی هر بازار (تهران) — مطابق CAT_HOURS در app/api/market-watch/route.ts
const CAT_HOURS: Record<string, [number, number]> = {
  stocks:        [9 * 60, 12 * 60 + 30],
  'bourse-funds': [9 * 60, 12 * 60 + 30],
  gold:          [12 * 60, 18 * 60],
  silver:        [12 * 60, 18 * 60],
  saffron:       [12 * 60, 18 * 60],
}
const tehranMinutes = (iso: string) => {
  const t = new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Tehran', hour12: false })
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols') ?? ''
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean)
  if (symbols.length === 0) {
    return NextResponse.json({ date: null, bySymbol: {} })
  }

  const { data, error } = await sb
    .from('stock_watch_5m')
    .select('symbol, cat, ts, tval, buy_pc_i, sell_pc_i, buy_pc_n, sell_pc_n, money_in, big_buy, big_sell')
    .in('symbol', symbols)
    .order('ts', { ascending: false })
    .limit(120 * symbols.length)

  if (error || !data || data.length === 0) {
    return NextResponse.json({ date: null, bySymbol: {} })
  }

  const date = tehranDay(data[0].ts)
  const bySymbol: Record<string, { cat: string; rows: Record<string, unknown>[] }> = {}

  for (const sym of symbols) {
    const symRows = data.filter(r => r.symbol === sym && tehranDay(r.ts) === date)
    if (symRows.length === 0) continue
    const cat = symRows[0].cat
    const hours = CAT_HOURS[cat]
    const rows = symRows
      .filter(r => !hours || (tehranMinutes(r.ts) >= hours[0] && tehranMinutes(r.ts) <= hours[1]))
      .reverse()
      .map(({ symbol, cat, ...rest }) => rest)
    if (rows.length > 0) bySymbol[sym] = { cat, rows }
  }

  return NextResponse.json(
    { date, bySymbol },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
  )
}
