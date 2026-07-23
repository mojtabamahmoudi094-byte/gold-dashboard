import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../lib/supabase'

// تاریخچه روزانه کارت‌های صفحه صندوق — از جدول gold_funds (که برخلاف اسمش همه انواع صندوق را دارد)
// تبدیل واحد ریال/تومان به‌عهده کلاینت است (دو دوره داده متفاوت — همان منطق fund/[slug]/page.tsx)

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug')?.trim()
  if (!slug) {
    return NextResponse.json({ rows: [] }, { status: 400 })
  }

  const { data: asset, error: assetErr } = await sb
    .from('assets')
    .select('id')
    .or(`slug.eq.${slug},name.eq.${slug}`)
    .limit(1)
    .maybeSingle()
  if (assetErr || !asset) {
    return NextResponse.json({ rows: [] }, { status: 404 })
  }

  const { data, error } = await sb
    .from('gold_funds')
    .select('trade_date_shamsi,price_close,price_last,trade_value,market_value,market_value_usd,volume')
    .eq('asset_id', asset.id)
    .order('trade_date_shamsi', { ascending: true })
    .order('id', { ascending: true })
    .limit(400)

  if (error) {
    return NextResponse.json({ rows: [] }, { status: 503 })
  }

  return NextResponse.json({ rows: data ?? [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
