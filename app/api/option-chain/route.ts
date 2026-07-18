import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../lib/supabase'

// قراردادهای اختیار معامله (آپشن) — از جدول option_chain در Supabase
// (سرور ایران هر ۱۵ دقیقه در ساعت بازار upsert می‌کند)

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await sb
    .from('option_chain')
    .select('data')
    .eq('id', 1)
    .maybeSingle()

  if (!error && data?.data) {
    return NextResponse.json(data.data, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  }
  return NextResponse.json({ updated: null, group: null }, { status: 503 })
}
