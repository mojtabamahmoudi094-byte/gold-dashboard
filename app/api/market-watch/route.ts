import { NextRequest, NextResponse } from 'next/server'
import { supabase as sb } from '../../../lib/supabase'

// سری زمانی سنجه‌های «رصد لحظه‌ای بازار» — ردیف‌های آخرین روز معاملاتی موجود
// ?cat=stocks (پیش‌فرض) — خروجی: { cat, date, rows: [{ ts, ...d }] }

export const dynamic = 'force-dynamic'

const tehranDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })

export async function GET(req: NextRequest) {
  const cat = req.nextUrl.searchParams.get('cat') ?? 'stocks'

  // ۵ دقیقه‌ای × (۹:۰۰–۱۲:۳۵) ≈ ۴۴ ردیف در روز — ۱۲۰ ردیف آخر روز کامل را پوشش می‌دهد
  const { data, error } = await sb
    .from('market_watch')
    .select('ts, d')
    .eq('cat', cat)
    .order('ts', { ascending: false })
    .limit(120)

  if (error || !data || data.length === 0) {
    return NextResponse.json({ cat, date: null, rows: [] })
  }

  const date = tehranDay(data[0].ts)
  const rows = data
    .filter(r => tehranDay(r.ts) === date)
    .reverse()
    .map(r => ({ ts: r.ts, ...(r.d as Record<string, unknown>) }))

  return NextResponse.json(
    { cat, date, rows },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
  )
}
