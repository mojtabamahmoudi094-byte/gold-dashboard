import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BRSAPI_KEY = process.env.BRSAPI_KEY ?? 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const BRSAPI_URL = `https://api.brsapi.ir/Market/Gold_Currency.php?key=${BRSAPI_KEY}`

// 60s server-side cache → max ~1440 req/day, under 1500 limit
const CACHE_TTL = 60_000

let rawCache: { data: unknown; at: number } | null = null

async function getOrFetch(): Promise<{ data: any; stale: boolean; age: number }> {
  const now = Date.now()
  if (rawCache && now - rawCache.at < CACHE_TTL) {
    return { data: rawCache.data, stale: false, age: Math.round((now - rawCache.at) / 1000) }
  }
  try {
    const res = await fetch(BRSAPI_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`brsapi ${res.status}`)
    const json = await res.json()
    rawCache = { data: json, at: now }
    return { data: json, stale: false, age: 0 }
  } catch (e) {
    if (rawCache) {
      console.warn('[gold-analysis] brsapi failed, serving stale cache:', e)
      return { data: rawCache.data, stale: true, age: Math.round((now - rawCache.at) / 1000) }
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

export async function GET() {
  try {
    const { data: raw, stale, age } = await getOrFetch()

    const golds      = raw?.gold ?? []
    const currencies = raw?.currency ?? []

    const goldEntry   = bySymbol(golds, 'XAUUSD')
    const dollarEntry = bySymbol(currencies, 'USD')
    const dirhamEntry = bySymbol(currencies, 'AED')
    const usdtEntry   = bySymbol(currencies, 'USDT_IRT')

    const goldUsd = n(goldEntry?.price)
    const dollarT = n(dollarEntry?.price)
    const dirhamT = n(dirhamEntry?.price)
    const usdtT   = n(usdtEntry?.price)

    const marketGram24  = n(bySymbol(golds, 'IR_GOLD_24K')?.price)
    const marketGram18  = n(bySymbol(golds, 'IR_GOLD_18K')?.price)
    const marketMesghal = n(bySymbol(golds, 'IR_GOLD_MELTED')?.price)
    const marketFull    = n(bySymbol(golds, 'IR_COIN_BAHAR')?.price)
    const marketHalf    = n(bySymbol(golds, 'IR_COIN_HALF')?.price)
    const marketQuarter = n(bySymbol(golds, 'IR_COIN_QUARTER')?.price)

    // brsapi change_percent is already % (e.g. -0.74); page expects decimal fraction
    const goldUsdChange = goldEntry?.change_percent != null ? goldEntry.change_percent / 100 : null
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
    // IR_GOLD_MELTED = آبشده نقدی, per مثقال, treated as 18K equivalent
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
      _cacheAge: age,
      inputs: {
        goldUsd,
        silverUsd: null,
        dollarT,
        dirhamT,
        usdtT,
        goldUsdChange,
        dollarChange,
      },
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
          fair: fairQuarter, market: marketQuarter, bubble: bub(marketQuarter, fairQuarter),
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
  } catch (e) {
    console.error('[gold-analysis] CRASH:', e)
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
