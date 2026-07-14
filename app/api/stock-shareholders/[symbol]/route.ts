import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../../lib/supabase'

// سهامداران عمده یک نماد — از جدول stock_shareholders در Supabase
// (سرور ایران روزی یک‌بار بعد از بسته‌شدن بازار با stock-shareholders.js upsert می‌کند)

export const dynamic = 'force-dynamic'

const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800' }

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const name = decodeURIComponent(symbol).replace(/-/g, ' ').trim()

  const { data, error } = await sb
    .from('stock_shareholders')
    .select('data')
    .eq('symbol', name)
    .maybeSingle()

  if (error || !data?.data) {
    return NextResponse.json({ error: 'داده سهامداران این نماد موجود نیست' }, { status: 404 })
  }
  return NextResponse.json(data.data, { headers: CACHE })
}
