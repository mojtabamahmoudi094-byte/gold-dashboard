import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const assetsRes = await sb
    .from('assets')
    .select('id, name, slug, category')
    .neq('slug', 'gold')
    .order('id', { ascending: true })
  const assets = assetsRes.data ?? []

  // رکوردهای اخیر به ترتیب تاریخ (نه id — backfill تاریخی id بزرگ‌تری دارد)
  // صفحه‌بندی چون Supabase هر درخواست را به ۱۰۰۰ ردیف محدود می‌کند؛
  // تا ۸ تاریخ متمایز کافی است (آخرین + ۶ روز تاریخچه برای تشخیص ناهنجاری)
  const recent: any[] = []
  const seenDates = new Set<string>()
  for (let from = 0; from < 5000; from += 1000) {
    const { data: page } = await sb
      .from('gold_funds')
      .select('*')
      .order('trade_date_shamsi', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + 999)
    if (!page || page.length === 0) break
    for (const r of page) seenDates.add(r.trade_date_shamsi)
    recent.push(...page)
    if (page.length < 1000 || seenDates.size >= 8) break
  }

  if (recent.length === 0) {
    return NextResponse.json({ assets, records: [], histRows: [], latestDate: null })
  }

  // آخرین رکورد هر دارایی — تاریخ صندوق‌های بورسی با کالایی یکی نیست،
  // پس «آخرین تاریخ سراسری» همه را نمی‌پوشاند
  const seen = new Set<number>()
  const records: typeof recent = []
  const histRows: typeof recent = []
  for (const r of recent) {
    if (seen.has(r.asset_id)) {
      histRows.push(r)
    } else {
      seen.add(r.asset_id)
      records.push(r)
    }
  }

  const latestDate = records.reduce(
    (max, r) => (r.trade_date_shamsi > max ? r.trade_date_shamsi : max),
    records[0].trade_date_shamsi
  )

  return NextResponse.json({ assets, records, histRows, latestDate })
}
