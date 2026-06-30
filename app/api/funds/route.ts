import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const [assetsRes, latestRes] = await Promise.all([
    sb.from('assets').select('id, name, slug, category').neq('slug', 'gold').order('id', { ascending: true }),
    sb.from('gold_funds').select('trade_date_shamsi').order('id', { ascending: false }).limit(1),
  ])

  const assets = assetsRes.data ?? []
  const latestDate = latestRes.data?.[0]?.trade_date_shamsi ?? null

  if (!latestDate) {
    return NextResponse.json({ assets, records: [], histRows: [], latestDate: null })
  }

  const [recordsRes, histRes] = await Promise.all([
    sb.from('gold_funds').select('*').eq('trade_date_shamsi', latestDate),
    sb.from('gold_funds')
      .select('trade_date_shamsi, asset_id, buy_i_volume, sell_i_volume, price_close')
      .neq('trade_date_shamsi', latestDate)
      .order('id', { ascending: false })
      .limit(300),
  ])

  return NextResponse.json({
    assets,
    records: recordsRes.data ?? [],
    histRows:  histRes.data  ?? [],
    latestDate,
  })
}
