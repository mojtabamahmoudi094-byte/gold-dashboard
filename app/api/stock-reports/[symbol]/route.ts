import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../../lib/supabase'
import fs from 'fs/promises'
import path from 'path'

// گزارش‌های کدال یک نماد — از جدول stock_reports در Supabase
// (سرور ایران با codal-watch.js هر بار که کدال گزارش تازه منتشر کند upsert می‌کند)
// اگر نماد در Supabase نبود، fallback به فایل استاتیک public/reports/<نماد>.json

export const dynamic = 'force-dynamic'

// s-maxage کوتاه است تا گزارش تازه حداکثر یک دقیقه بعد روی سایت بیاید
const CACHE = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const name = decodeURIComponent(symbol).replace(/-/g, ' ').trim()

  try {
    const { data, error } = await sb
      .from('stock_reports')
      .select('data')
      .eq('symbol', name)
      .maybeSingle()
    if (!error && data?.data) return NextResponse.json(data.data, { headers: CACHE })
  } catch { /* fallback به فایل استاتیک */ }

  try {
    const file = path.join(process.cwd(), 'public', 'reports', `${name.replace(/\s+/g, '-')}.json`)
    const json = JSON.parse(await fs.readFile(file, 'utf8'))
    return NextResponse.json(json, { headers: CACHE })
  } catch {
    return NextResponse.json({ error: 'گزارشی برای این نماد موجود نیست' }, { status: 404 })
  }
}
