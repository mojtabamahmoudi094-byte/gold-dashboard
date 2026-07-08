import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

/**
 * لیست نمادهایی که گزارش کدال (public/reports/<symbol>.json) برایشان موجود است —
 * برای موتور سیگنال سهام در app/signals از این لیست استفاده می‌شود تا فقط
 * نمادهای دارای گزارش بررسی شوند (نه هر ۶۷۱ نماد بازار).
 */
let cache: { at: number; symbols: string[] } | null = null
const TTL = 10 * 60 * 1000

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json({ symbols: cache.symbols })
  }
  const dir = path.join(process.cwd(), 'public', 'reports')
  let symbols: string[] = []
  try {
    symbols = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, '').replace(/-/g, ' '))
  } catch { /* پوشه گزارش‌ها هنوز ساخته نشده */ }
  cache = { at: Date.now(), symbols }
  return NextResponse.json({ symbols })
}
