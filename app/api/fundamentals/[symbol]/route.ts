import { NextResponse } from 'next/server'
import { getFundamentals } from '../../../../lib/fundamentalsData'

// نسبت‌های مالی یک نماد — از جدول stock_fundamentals در Supabase
// (سرور ایران با fundamentals-compute.js بعد از هر اجرای codal-watch.js upsert می‌کند)

export const dynamic = 'force-dynamic'

const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' }

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const data = await getFundamentals(symbol)
  if (!data) return NextResponse.json({ error: 'نسبت مالی برای این نماد موجود نیست' }, { status: 404 })
  return NextResponse.json(data, { headers: CACHE })
}
