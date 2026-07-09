import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../../lib/supabase'

// ارزش کل معاملات بازار (سهام + صندوق‌های طلا/نقره/زعفران) — روزانه، از روی جدول market_watch
// نکته: cat='stocks' از قبل شامل صندوق‌های اهرمی/بخشی/سهامی است (بورس سنج آن‌ها را همراه سهام
// در «رصد لحظه‌ای» حساب می‌کند — scripts/stocks-industries.js) پس جمع stocks+gold+silver+saffron
// دوباره‌شماری ندارد.

export const dynamic = 'force-dynamic'

const CATS = ['stocks', 'gold', 'silver', 'saffron'] as const
const tehranDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })

let cache: { at: number; body: any } | null = null
const TTL = 5 * 60 * 1000

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.body)

  const perCatDay: Record<string, Record<string, number>> = {}
  for (const cat of CATS) {
    const { data } = await sb
      .from('market_watch')
      .select('ts, d')
      .eq('cat', cat)
      .order('ts', { ascending: true })
      .limit(5000)
    const byDay: Record<string, number> = {}
    for (const r of data ?? []) {
      const day = tehranDay(r.ts as string)
      const v = (r.d as any)?.tval_total
      if (typeof v === 'number') byDay[day] = v // آخرین مقدار همان روز جایگزین می‌شود (ts صعودی)
    }
    perCatDay[cat] = byDay
  }

  const allDays = new Set<string>()
  Object.values(perCatDay).forEach(byDay => Object.keys(byDay).forEach(d => allDays.add(d)))

  const series = [...allDays].sort().map(date => {
    const parts: Record<string, number> = {}
    let total = 0
    for (const cat of CATS) {
      const v = perCatDay[cat][date] ?? 0
      parts[cat] = v
      total += v
    }
    return { date, total, ...parts }
  })

  const today = series[series.length - 1] ?? null
  const body = { series, today }
  cache = { at: Date.now(), body }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } })
}
