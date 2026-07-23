import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../../lib/supabase'

// تاریخچه تابلوخوانی روزانه یک نماد — ادغام ۴ جدول روزانه بر اساس trade_date:
// stock_tape_daily (خام حقیقی/حقوقی — از تاریخ راه‌اندازی به بعد پر می‌شود)
// stock_moneyflow_daily (ورود/خروج پول حقیقی، تومان) + stock_per_capita_daily (سرانه، تومان)
// stock_snapshot_daily (ارزش/حجم معاملات + تاریخ شمسی)

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol).trim()
  const url = new URL(req.url)
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 10, 1), 120)

  const [tape, flow, cap, snap] = await Promise.all([
    sb.from('stock_tape_daily')
      .select('trade_date,trade_date_shamsi,pc,tval,tvol,buy_i_volume,sell_i_volume,buy_n_volume,sell_n_volume,buy_count_i,sell_count_i,buy_count_n,sell_count_n')
      .eq('symbol', symbol).order('trade_date', { ascending: false }).limit(days),
    sb.from('stock_moneyflow_daily')
      .select('trade_date,money_in')
      .eq('symbol', symbol).order('trade_date', { ascending: false }).limit(days),
    sb.from('stock_per_capita_daily')
      .select('trade_date,per_capita_buy,per_capita_sell')
      .eq('symbol', symbol).order('trade_date', { ascending: false }).limit(days),
    sb.from('stock_snapshot_daily')
      .select('trade_date,trade_date_shamsi,tval,tvol,pc')
      .eq('symbol', symbol).order('trade_date', { ascending: false }).limit(days),
  ])

  type Row = Record<string, unknown> & { trade_date: string }
  const byDate = new Map<string, Row>()
  const merge = (rows: Row[] | null | undefined) => {
    for (const r of rows ?? []) {
      const prev = byDate.get(r.trade_date) ?? { trade_date: r.trade_date }
      for (const [k, v] of Object.entries(r)) if (v != null) prev[k] = v
      byDate.set(r.trade_date, prev)
    }
  }
  // ترتیب ادغام: snapshot پایه (شمسی+ارزش/حجم)، بعد جریان/سرانه، در آخر tape (خام دقیق‌تر غالب شود)
  merge(snap.data as Row[] | null)
  merge(flow.data as Row[] | null)
  merge(cap.data as Row[] | null)
  merge(tape.data as Row[] | null)

  const rows = [...byDate.values()]
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .slice(-days)

  return NextResponse.json({ rows }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
