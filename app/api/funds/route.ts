import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const [assetsRes, recentRes] = await Promise.all([
    sb.from('assets').select('id, name, slug, category').neq('slug', 'gold').order('id', { ascending: true }),
    sb.from('gold_funds').select('*').order('id', { ascending: false }).limit(1500),
  ])

  const assets = assetsRes.data ?? []
  const recent = recentRes.data ?? []

  if (recent.length === 0) {
    return NextResponse.json({ assets, records: [], histRows: [], latestDate: null })
  }

  // آخرین رکورد هر دارایی — تاریخ صندوق‌های بورسی (NAV) با کالایی یکی نیست،
  // پس «آخرین تاریخ سراسری» همه را نمی‌پوشاند
  const seen = new Set<number>()
  const records: typeof recent = []
  const histRows: typeof recent = []
  for (const r of recent) {
    if (seen.has(r.asset_id)) {
      histRows.push(r)
    } else {
      seen.add(r.asset_id)
      records.push(r)
    }
  }

  const latestDate = records.reduce(
    (max, r) => (r.trade_date_shamsi > max ? r.trade_date_shamsi : max),
    records[0].trade_date_shamsi
  )

  return NextResponse.json({ assets, records, histRows, latestDate })
}
