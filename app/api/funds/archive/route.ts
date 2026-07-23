import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../../lib/supabase'

export const dynamic = 'force-dynamic'

// آرشیو روزانه صندوق‌ها — نامحدود (همه تاریخ‌های ثبت‌شده)؛ با ?days=N قابل محدودکردن
// برای نمودارهای ورود/خروج پول و سرانه خرید/فروش روزهای گذشته
export async function GET(req: Request) {
  const url = new URL(req.url)
  const daysParam = parseInt(url.searchParams.get('days') || '0', 10)
  const days = daysParam > 0 ? daysParam : Infinity

  const assetsRes = await sb
    .from('assets')
    .select('id, name, slug, category')
    .neq('slug', 'gold')
    .order('id', { ascending: true })
  const assets = assetsRes.data ?? []

  // صفحه‌بندی — Supabase هر درخواست را به ۱۰۰۰ ردیف محدود می‌کند
  const rows: any[] = []
  const seenDates = new Set<string>()
  for (let from = 0; from < 200000; from += 1000) {
    const { data: page } = await sb
      .from('gold_funds')
      .select('asset_id, trade_date_shamsi, price_close, buy_i_volume, sell_i_volume, buy_count_i, sell_count_i')
      .order('trade_date_shamsi', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + 999)
    if (!page || page.length === 0) break
    for (const r of page) seenDates.add(r.trade_date_shamsi)
    rows.push(...page)
    if (page.length < 1000 || seenDates.size > days) break
  }

  // فقط N تاریخ متمایز اخیر + یک ردیف per (دارایی، تاریخ) — id بزرگ‌تر جلوتر است
  const keepDates = [...seenDates].sort().reverse().slice(0, days)
  const keep = new Set(keepDates)
  const seenPair = new Set<string>()
  const filtered = rows.filter(r => {
    if (!keep.has(r.trade_date_shamsi)) return false
    const k = `${r.asset_id}|${r.trade_date_shamsi}`
    if (seenPair.has(k)) return false
    seenPair.add(k)
    return true
  })

  return NextResponse.json({ assets, rows: filtered, dates: keepDates })
}
