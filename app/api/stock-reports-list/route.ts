import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../lib/supabase'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

/**
 * لیست نمادهایی که گزارش کدال برایشان موجود است —
 * برای موتور سیگنال سهام در app/signals از این لیست استفاده می‌شود تا فقط
 * نمادهای دارای گزارش بررسی شوند (نه هر ۶۷۵ نماد بازار).
 *
 * منبع اصلی: جدول stock_reports در Supabase (سرور ایران آن را زنده نگه می‌دارد).
 * fallback: پوشه استاتیک public/reports/.
 */
let cache: { at: number; symbols: string[] } | null = null
const TTL = 10 * 60 * 1000

async function fromSupabase(): Promise<string[] | null> {
  try {
    const { data, error } = await sb.from('stock_reports').select('symbol')
    if (error || !data?.length) return null
    return data.map(r => r.symbol as string)
  } catch { return null }
}

function fromDisk(): string[] {
  const dir = path.join(process.cwd(), 'public', 'reports')
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, '').replace(/-/g, ' '))
  } catch { return [] } // پوشه گزارش‌ها هنوز ساخته نشده
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json({ symbols: cache.symbols })
  }
  const symbols = (await fromSupabase()) ?? fromDisk()
  cache = { at: Date.now(), symbols }
  return NextResponse.json({ symbols })
}
