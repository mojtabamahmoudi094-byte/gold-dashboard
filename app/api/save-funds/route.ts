import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../lib/supabase'
import { requireAdmin } from '../../../lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await req.json()
    const { rows, date, goldCache } = body as {
      rows: Record<string, unknown>[]
      date: string
      goldCache?: { raw_pro: unknown; raw_commodity: unknown }
    }

    if (!rows?.length || !date) {
      return NextResponse.json({ error: 'rows or date missing' }, { status: 400 })
    }

    const { data: assets, error: assetErr } = await sb
      .from('assets').select('id, slug, name').neq('slug', 'gold')
    if (assetErr || !assets?.length) {
      return NextResponse.json({ error: `assets fetch failed: ${assetErr?.message ?? 'empty'}` }, { status: 500 })
    }

    const isinMap: Record<string, number> = {}
    assets.forEach((a: { id: number; slug: string }) => { isinMap[a.slug] = a.id })

    const assetIds = [...new Set(rows.map(r => r.asset_id as number))]
    const { error: delErr } = await sb.from('gold_funds')
      .delete().eq('trade_date_shamsi', date).in('asset_id', assetIds)
    if (delErr) console.warn('[save-funds] delete warning:', delErr.message)

    const BATCH = 20
    let inserted = 0
    const errors: string[] = []
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error: insErr } = await sb.from('gold_funds').insert(rows.slice(i, i + BATCH))
      if (insErr) errors.push(`batch ${Math.floor(i / BATCH) + 1}: ${insErr.message}`)
      else inserted += Math.min(BATCH, rows.length - i)
    }

    if (goldCache) {
      await sb.from('signals').delete()
        .eq('signal_type', '_gold_cache').eq('signal_date_shamsi', date)
      await sb.from('signals').insert({
        signal_type: '_gold_cache',
        signal_date_shamsi: date,
        market_value: 0,
        note: JSON.stringify(goldCache),
      })
    }

    return NextResponse.json({
      inserted,
      total: rows.length,
      date,
      errors,
      assetsCount: assets.length,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
