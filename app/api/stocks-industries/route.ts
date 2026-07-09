import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../lib/supabase'
import fs from 'fs/promises'
import path from 'path'

// قیمت لحظه‌ای سهام به تفکیک صنعت — از جدول stock_industries در Supabase
// (سرور ایران هر ۵ دقیقه در ساعت بازار upsert می‌کند)
// اگر Supabase در دسترس نبود، fallback به فایل استاتیک public/stocks/industries.json

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data, error } = await sb
      .from('stock_industries')
      .select('data')
      .eq('id', 1)
      .maybeSingle()
    if (!error && data?.data) {
      return NextResponse.json(data.data, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      })
    }
  } catch { /* fallback به فایل استاتیک */ }

  try {
    const file = path.join(process.cwd(), 'public', 'stocks', 'industries.json')
    const json = JSON.parse(await fs.readFile(file, 'utf8'))
    return NextResponse.json(json, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  } catch {
    return NextResponse.json({ updated: null, industries: [] }, { status: 503 })
  }
}
