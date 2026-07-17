import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../lib/supabase'

// تاریخچه روزانه کارت‌های صفحه نماد یک سهم — از جدول stock_snapshot_daily
// (سرور ایران هر ۵ دقیقه در ساعت بازار upsert می‌کند، یک ردیف به‌ازای هر روز)

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get('symbol')?.trim()
  if (!symbol) {
    return NextResponse.json({ rows: [] }, { status: 400 })
  }

  const { data, error } = await sb
    .from('stock_snapshot_daily')
    .select('trade_date,trade_date_shamsi,pc,pcp,pl,plp,tval,tvol,mv,mv_usd,pe')
    .eq('symbol', symbol)
    .order('trade_date', { ascending: true })
    .limit(400)

  if (error) {
    return NextResponse.json({ rows: [] }, { status: 503 })
  }

  return NextResponse.json({ rows: data ?? [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
