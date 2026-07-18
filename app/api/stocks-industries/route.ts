import { NextResponse } from 'next/server'
import { getStocksIndustries } from '../../../lib/stocksIndustriesData'

// قیمت لحظه‌ای سهام به تفکیک صنعت — از جدول stock_industries در Supabase
// (سرور ایران هر ۵ دقیقه در ساعت بازار upsert می‌کند)
// اگر Supabase در دسترس نبود، fallback به فایل استاتیک public/stocks/industries.json

export const dynamic = 'force-dynamic'

export async function GET() {
  const payload = await getStocksIndustries()
  return NextResponse.json(payload, {
    status: payload.industries.length ? 200 : 503,
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
  })
}
