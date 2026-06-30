import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const BRSAPI_KEY    = process.env.BRSAPI_KEY ?? 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const PRO_URL       = `https://Api.BrsApi.ir/Market/Gold_Currency_Pro.php?key=${BRSAPI_KEY}&section=gold,currency,cryptocurrency`
const COMMODITY_URL = `https://api.brsapi.ir/Market/Commodity.php?key=${BRSAPI_KEY}`

const CACHE_TTL = 60_000

let proCache:       { data: unknown; at: number } | null = null
let commodityCache: { data: unknown; at: number } | null = null

const sbClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function fetchWithCache(
  url: string,
  cache: { data: unknown; at: number } | null,
  setCache: (c: { data: unknown; at: number }) => void,
  label: string
): Promise<{ data: any; stale: boolean; age: number }> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL) {
    return { data: cache.data, stale: false, age: Math.round((now - cache.at) / 1000) }
  }
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) })
    if (!res.ok) throw new Error(`brsapi ${res.status}`)
    const json = await res.json()
    setCache({ data: json, at: now })
    return { data: json, stale: false, age: 0 }
  } catch (e) {
    if (cache) {
      console.warn(`[gold-analysis] ${label} failed, serving stale:`, e)
      return { data: cache.data, stale: true, age: Math.round((now - cache.at) / 1000) }
    }
    throw e
  }
}

function bySymbol(arr: any[], sym: string): any | null {
  return arr?.find((x: any) => x.symbol === sym) ?? null
}

function n(v: unknown): number | null {
  const x = parseFloat(String(v ?? '').replace(/,/g, ''))
  return isNaN(x) || x === 0 ? null : x
}

function rialToToman(v: unknown): number | null {
  const x = n(v)
  return x ? x / 10 : null
}

function buildResponse(proData: any, commodityData: any, stale: boolean, cacheAge: number) {
  const goldOunce  = proData?.gold?.ounce     ?? []
  const goldTypes  = proData?.gold?.type       ?? []
  const goldCoins  = proData?.gold?.coin       ?? []
  const freeCurr   = proData?.currency?.free   ?? []
  const cryptos    = proData?.cryptocurrency   ?? []
  const metals     = commodityData?.metal_precious ?? []

  const ounceEntry  = goldOunce[0]
  const silverEntry = bySymbol(metals, 'XAGUSD')
  const dollarEntry = bySymbol(freeCurr, 'USD')
  const dirhamEntry = bySymbol(freeCurr, 'AED')
  const usdtEntry   = bySymbol(cryptos, 'USDT')

  const goldUsd   = n(ounceEntry?.price)
  const silverUsd = n(silverEntry?.price)

  const dollarT = rialToToman(dollarEntry?.price)
  const dirhamT = rialToToman(dirhamEntry?.price)
  const usdtT   = n(usdtEntry?.price_toman)

  const marketGram24  = n(bySymbol(goldTypes, 'IR_GOLD_24K')?.price)
  const marketGram18  = n(bySymbol(goldTypes, 'IR_GOLD_18K')?.price)
  const marketMesghal = n(bySymbol(goldTypes, 'IR_GOLD_MELTED')?.price)
  const marketFull    = n(bySymbol(goldCoins, 'IR_COIN_BAHAR')?.price)
  const marketHalf    = n(bySymbol(goldCoins, 'IR_COIN_HALF')?.price)
  const marketQuarter = n(bySymbol(goldCoins, 'IR_COIN_QUARTER')?.price)

  const goldUsdChange = ounceEntry?.change_percent  != null ? ounceEntry.change_percent  / 100 : null
  const dollarChange  = dollarEntry?.change_percent != null ? dollarEntry.change_percent / 100 : null

  const AED_PER_USD  = 3.6732
  const gramsPerOz   = 31.103431
  const mithqalW     = 4.6055
  const fullCoinW    = 8.13
  const halfCoinW    = 4.066
  const quarterCoinW = 2.033
  const mintCost     = 5000

  const dollarViaDirham = dirhamT ? dirhamT * AED_PER_USD : null
  const bubbleDollar    = dollarT && dollarViaDirham ? (dollarT - dollarViaDirham) / dollarViaDirham : null
  const bubbleUsdt      = usdtT && dollarViaDirham ? (usdtT - dollarViaDirham) / dollarViaDirham : null

  const fairGram24  = goldUsd && dollarT ? (goldUsd * dollarT) / gramsPerOz : null
  const fairGram18  = fairGram24 ? fairGram24 * (18 / 24) : null
  const fairGram22  = fairGram24 ? fairGram24 * (22 / 24) : null
  const fairMesghal = fairGram18 ? fairGram18 * mithqalW : null
  const fairFull    = fairGram22 ? fairGram22 * fullCoinW + mintCost : null
  const fairHalf    = fairGram22 ? fairGram22 * halfCoinW + mintCost : null
  const fairQuarter = fairGram22 ? fairGram22 * quarterCoinW + mintCost : null

  const bub = (m: number | null, f: number | null) => m && f ? (m - f) / f : null
  const imp = (mT: number | null, oz: number | null, frac: number) =>
    mT && oz ? (mT / frac) / oz : null

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    _stale: stale,
    _cacheAge: cacheAge,
    inputs: { goldUsd, silverUsd, dollarT, dirhamT, usdtT, goldUsdChange, dollarChange },
    derived: { dollarViaDirham, bubbleDollar, bubbleUsdt, AED_PER_USD },
    gram: {
      fair24: fairGram24, market24: marketGram24, bubble24: bub(marketGram24, fairGram24),
      impliedDollar24: imp(marketGram24, goldUsd, 1 / gramsPerOz),
      fair18: fairGram18, market18: marketGram18, bubble18: bub(marketGram18, fairGram18),
      impliedDollar18: imp(marketGram18, goldUsd, (18 / 24) / gramsPerOz),
    },
    mesghal: {
      fair: fairMesghal, market: marketMesghal, bubble: bub(marketMesghal, fairMesghal),
      impliedDollar: imp(marketMesghal, goldUsd, mithqalW * (18 / 24) / gramsPerOz),
      changePct: null,
    },
    coins: {
      full: {
        fair: fairFull, market: marketFull, bubble: bub(marketFull, fairFull),
        weight: fullCoinW, marketIsEstimate: false, marketSource: 'brsapi.ir',
      },
      half: {
        fair: fairHalf, market: marketHalf, bubble: bub(marketHalf, fairHalf),
        weight: halfCoinW,
        impliedDollar: imp(marketHalf, goldUsd, halfCoinW * (22 / 24) / gramsPerOz),
        changePct: null,
      },
      quarter: {
        fair: fairQuarter, market: marketQuarter, bubble: bub(marketQuarter, fairFull),
        weight: quarterCoinW,
        impliedDollar: imp(marketQuarter, goldUsd, quarterCoinW * (22 / 24) / gramsPerOz),
        changePct: null,
      },
    },
    constants: {
      gramsPerOz, AED_PER_USD, coinPurity: 22, bullionPurity: 24,
      fullCoinWeight: fullCoinW, halfCoinWeight: halfCoinW, quarterCoinWeight: quarterCoinW,
      mintCost, akhzaRate: 0.023, bankRate: 0.026, financeRate: 0.043,
    },
  })
}

export async function GET() {
  try {
    const [pro, commodity] = await Promise.all([
      fetchWithCache(PRO_URL,       proCache,       c => { proCache       = c }, 'Gold_Currency_Pro'),
      fetchWithCache(COMMODITY_URL, commodityCache, c => { commodityCache = c }, 'Commodity'),
    ])
    return buildResponse(pro.data, commodity.data, pro.stale || commodity.stale, Math.max(pro.age, commodity.age))
  } catch (e) {
    console.error('[gold-analysis] BrsAPI failed:', e)

    // Fallback: read from Supabase cache (saved by admin sync from Iranian IP)
    try {
      const { data: rows } = await sbClient
        .from('signals')
        .select('note')
        .eq('signal_type', '_gold_cache')
        .order('id', { ascending: false })
        .limit(1)

      if (rows?.[0]?.note) {
        const { raw_pro, raw_commodity } = JSON.parse(rows[0].note)
        // Populate module cache so next request doesn't hit Supabase again
        proCache       = { data: raw_pro,       at: Date.now() }
        commodityCache = { data: raw_commodity, at: Date.now() }
        console.log('[gold-analysis] serving from Supabase cache')
        return buildResponse(raw_pro, raw_commodity, true, 0)
      }
    } catch (sbErr) {
      console.error('[gold-analysis] Supabase fallback failed:', sbErr)
    }

    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
