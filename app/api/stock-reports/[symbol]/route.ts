import { NextResponse } from 'next/server'
import { getStockReport } from '../../../../lib/stockReportsData'

// گزارش‌های کدال یک نماد — از جدول stock_reports در Supabase
// (سرور ایران با codal-watch.js هر بار که کدال گزارش تازه منتشر کند upsert می‌کند)
// اگر نماد در Supabase نبود، fallback به فایل استاتیک public/reports/<نماد>.json

export const dynamic = 'force-dynamic'

// s-maxage کوتاه است تا گزارش تازه حداکثر یک دقیقه بعد روی سایت بیاید
const CACHE = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const json = await getStockReport(symbol)
  if (json === null) return NextResponse.json({ error: 'گزارشی برای این نماد موجود نیست' }, { status: 404 })
  return NextResponse.json(json, { headers: CACHE })
}
