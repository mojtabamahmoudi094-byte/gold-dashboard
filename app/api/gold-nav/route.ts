import { NextResponse } from 'next/server'
import { supabase as sb } from '../../../lib/supabase'

export const dynamic = 'force-dynamic'

const BRSAPI_KEY = process.env.BRSAPI_KEY ?? 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'

function n(v: unknown): number | null {
  const x = parseFloat(String(v ?? '').replace(/,/g, ''))
  return isNaN(x) || x === 0 ? null : x
}

async function fetchNav(symbol: string): Promise<number | null> {
  try {
    const url = `https://Api.BrsApi.ir/Tsetmc/Nav.php?key=${BRSAPI_KEY}&l18=${encodeURIComponent(symbol)}`
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6_000) })
    if (!res.ok) return null
    const data = await res.json()
    return n(data?.predtran) // NAV ابطال
  } catch {
    return null
  }
}

export async function GET() {
  // Get gold fund names
  const { data: assets } = await sb
    .from('assets')
    .select('name')
    .eq('category', 'gold')
    .neq('slug', 'gold')
    .order('id', { ascending: true })

  const fundNames: string[] = (assets ?? []).map((a: any) => a.name)

  // Try BrsAPI (Iranian IP only — will fail on Render)
  let navs: Record<string, number | null> = {}
  let gotLive = false

  try {
    const results = await Promise.all(
      fundNames.map(async name => ({ name, nav: await fetchNav(name) }))
    )
    const anySuccess = results.some(r => r.nav !== null)
    if (anySuccess) {
      for (const { name, nav } of results) navs[name] = nav
      gotLive = true

      await sb.from('signals').insert([{
        signal_type: '_nav_cache',
        note: JSON.stringify({ navs }),
        signal_date_shamsi: new Date().toISOString().slice(0, 10),
      }])
    }
  } catch {
    // Expected on Render — fall through to Supabase cache
  }

  if (gotLive) {
    return NextResponse.json({ navs, _stale: false })
  }

  // Fall back to Supabase cache
  const { data: cached } = await sb
    .from('signals')
    .select('note')
    .eq('signal_type', '_nav_cache')
    .order('id', { ascending: false })
    .limit(1)

  if (cached?.[0]?.note) {
    try {
      const parsed = JSON.parse(cached[0].note)
      return NextResponse.json({ navs: parsed.navs ?? {}, _stale: true })
    } catch {
      // corrupt cache — fall through
    }
  }

  return NextResponse.json({ navs: {}, _stale: true })
}
