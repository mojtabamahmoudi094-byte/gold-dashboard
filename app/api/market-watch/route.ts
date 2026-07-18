import { NextRequest, NextResponse } from 'next/server'
import { supabase as sb } from '../../../lib/supabase'

// سری زمانی سنجه‌های «رصد لحظه‌ای بازار» — ردیف‌های آخرین روز معاملاتی موجود
// ?cat=stocks (پیش‌فرض) — خروجی: { cat, date, rows: [{ ts, ...d }] }

export const dynamic = 'force-dynamic'

const tehranDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })

// ساعت واقعی هر بازار (تهران) — رصد لحظه‌ای نباید ردیف بیرون این بازه را نشان دهد
// (سهام ۹:۰۰–۱۲:۳۰، صندوق‌های کالایی طلا/نقره/زعفران ۱۲:۳۰–۱۸:۰۰ — مطابق scripts/stocks-industries.js)
const CAT_HOURS: Record<string, [number, number]> = {
  stocks:  [9 * 60, 12 * 60 + 30],
  gold:    [12 * 60 + 30, 18 * 60],
  silver:  [12 * 60 + 30, 18 * 60],
  saffron: [12 * 60 + 30, 18 * 60],
}
const tehranMinutes = (iso: string) => {
  const t = new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Tehran', hour12: false })
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

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
  const hours = CAT_HOURS[cat]
  const rows = data
    .filter(r => tehranDay(r.ts) === date)
    .filter(r => !hours || (tehranMinutes(r.ts) >= hours[0] && tehranMinutes(r.ts) <= hours[1]))
    .reverse()
    .map(r => ({ ts: r.ts, ...(r.d as Record<string, unknown>) }))

  return NextResponse.json(
    { cat, date, rows },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
  )
}
