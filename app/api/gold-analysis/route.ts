import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const NERKH_TOKEN = process.env.NERKH_TOKEN

async function fetchNerkh(category: string) {
  if (!NERKH_TOKEN) return null
  try {
    const res = await fetch(`https://api.nerkh.io/v1/prices/json/${category}`, {
      headers: { Authorization: `Bearer ${NERKH_TOKEN}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json?.data?.prices ?? null
  } catch (e) {
    console.error(`nerkh ${category} error:`, e)
    return null
  }
}

// Parse nerkh price string/number → number or null
function n(v: unknown): number | null {
  const x = parseFloat(String(v ?? '').replace(/,/g, ''))
  return isNaN(x) || x === 0 ? null : x
}

// TGJU silver — not in nerkh.io, with timeout so it never blocks
async function fetchTgjuSilver() {
  try {
    const res = await fetch(
      'https://api.tgju.org/v1/market/indicator/summary-table-data/silver',
      { cache: 'no-store', signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const row = (await res.json())?.data?.[0]
    if (!row) return null
    const isLow = String(row[5]).includes('low')
    const pct = parseFloat(String(row[5]).replace(/<[^>]+>/g, '').replace('%', '').trim())
    return {
      close: parseFloat(String(row[3]).replace(/,/g, '')),
      changePct: isLow ? -pct : pct,
    }
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const [gold, currency, silver] = await Promise.all([
      fetchNerkh('gold'),
      fetchNerkh('currency'),
      fetchTgjuSilver(),
    ])

    // nerkh.io currency prices are already in تومان
    const goldUsd  = n(gold?.OUNCE?.current)
    const dollarT  = n(currency?.USD?.current)
    const dirhamT  = n(currency?.AED?.current)

    const r2t = (key: string) => n(gold?.[key]?.current)
    const marketGram24  = r2t('GOLD24K')
    const marketGram18  = r2t('GOLD18K')
    const marketFull    = r2t('SEKE_BAHAR')
    const marketHalf    = r2t('SEKE_NIM')
    const marketQuarter = r2t('SEKE_ROB')
    const marketMesghal = r2t('MAZANEH')

    const AED_PER_USD   = 3.6732
    const gramsPerOz    = 31.103431
    const mithqalW      = 4.6055
    const fullCoinW     = 8.13
    const halfCoinW     = 4.066
    const quarterCoinW  = 2.033
    const mintCost      = 5000

    const dollarViaDirham = dirhamT ? dirhamT * AED_PER_USD : null
    const bubbleDollar    = dollarViaDirham && dollarT ? (dollarT - dollarViaDirham) / dollarViaDirham : null

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

    console.log('[gold-analysis] goldUsd:', goldUsd, '| dollar:', dollarT, '| half:', marketHalf)

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      inputs: {
        goldUsd,
        silverUsd: silver?.close ?? null,
        dollarT,
        dirhamT,
        usdtT: dollarT,
        goldUsdChange: null,
        dollarChange: null,
      },
      derived: { dollarViaDirham, bubbleDollar, bubbleUsdt: bubbleDollar, AED_PER_USD },
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
          weight: fullCoinW, marketIsEstimate: false, marketSource: 'nerkh.io',
        },
        half: {
          fair: fairHalf, market: marketHalf, bubble: bub(marketHalf, fairHalf),
          weight: halfCoinW, impliedDollar: imp(marketHalf, goldUsd, halfCoinW * (22 / 24) / gramsPerOz),
          changePct: null,
        },
        quarter: {
          fair: fairQuarter, market: marketQuarter, bubble: bub(marketQuarter, fairQuarter),
          weight: quarterCoinW, impliedDollar: imp(marketQuarter, goldUsd, quarterCoinW * (22 / 24) / gramsPerOz),
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
