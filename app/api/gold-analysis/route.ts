import { NextResponse } from 'next/server'

// ── nerkh.io — full coin market price (SEKE_BAHAR) ──
// Prices returned in تومان. Token expires monthly — update NERKH_TOKEN env var.
async function fetchNerkhGold() {
  const token = process.env.NERKH_TOKEN
  if (!token) return null
  try {
    const res = await fetch('https://api.nerkh.io/v1/prices/json/gold', {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const json = await res.json()
    const prices = json?.data?.prices
    if (!prices) return null
    return {
      sekkeBahar: parseFloat(prices.SEKE_BAHAR?.current) || null,   // تمام سکه بهار آزادی — تومان
      sekkeEmami: parseFloat(prices.SEKE_EMAMI?.current) || null,   // سکه امامی — تومان
      updatedAt: prices.SEKE_BAHAR?.update ?? null,
    }
  } catch {
    return null
  }
}

// TGJU indicator slugs → what they represent
const INDICATORS = {
  ons: 'ons',          // Gold USD/oz
  silver: 'silver',   // Silver USD/oz
  dollar: 'price_dollar_rl',
  dirham: 'price_aed',
  mesghal: 'mesghal', // مثقال طلا ریال
  geram24: 'geram24', // گرم ۲۴ عیار ریال
  geram18: 'geram18', // گرم ۱۸ عیار ریال
  nim: 'nim',         // نیم سکه ریال
  rob: 'rob',         // ربع سکه ریال
}

function parseNum(s: string): number {
  return parseFloat(String(s).replace(/,/g, ''))
}

function parsePct(s: string): number {
  const isLow = s.includes('low')
  const val = parseFloat(s.replace(/<[^>]+>/g, '').replace('%', '').trim())
  return isLow ? -val : val
}

async function fetchIndicator(slug: string) {
  const res = await fetch(
    `https://api.tgju.org/v1/market/indicator/summary-table-data/${slug}`,
    { next: { revalidate: 300 } }
  )
  if (!res.ok) return null
  const json = await res.json()
  const row = json?.data?.[0]
  if (!row) return null
  return {
    open: parseNum(row[0]),
    low: parseNum(row[1]),
    high: parseNum(row[2]),
    close: parseNum(row[3]),
    change: parseNum(row[4]),
    changePct: parsePct(row[5]),
    date: row[6] as string,
    shamsiDate: row[7] as string,
  }
}

export async function GET() {
  try {
    const [[ons, silver, dollar, dirham, mesghal, geram24, geram18, nim, rob], nerkh] =
      await Promise.all([
        Promise.all(Object.values(INDICATORS).map(fetchIndicator)),
        fetchNerkhGold(),
      ])

    // IRR → Toman: divide by 10
    const t = (v: number | null | undefined) =>
      v != null ? v / 10 : null

    const goldUsd = ons?.close ?? null
    const silverUsd = silver?.close ?? null
    const dollarT = t(dollar?.close) // تومان per USD
    const dirhamT = t(dirham?.close) // تومان per AED

    // Derived
    const AED_PER_USD = 3.6732
    const dollarViaDirham = dirhamT != null ? dirhamT * AED_PER_USD : null
    const usdtT = dollarT // USDT ≈ USD
    const bubbleDollar =
      dollarViaDirham && dollarT
        ? (dollarT - dollarViaDirham) / dollarViaDirham
        : null
    const bubbleUsdt =
      dollarViaDirham && usdtT
        ? (usdtT - dollarViaDirham) / dollarViaDirham
        : null

    // Gold per gram theoretically (24k, تومان)
    const gramsPerOz = 31.103431
    const fairGram24 =
      goldUsd && dollarT ? (goldUsd * dollarT) / gramsPerOz : null
    const fairGram18 = fairGram24 ? fairGram24 * (18 / 24) : null
    const fairGram22 = fairGram24 ? fairGram24 * (22 / 24) : null

    const mithqalW = 4.6055
    const fullCoinW = 8.13
    const halfCoinW = 4.066
    const quarterCoinW = 2.033
    const mintCost = 5000

    const fairMesghal = fairGram18 ? fairGram18 * mithqalW : null
    const fairFull = fairGram22 ? fairGram22 * fullCoinW + mintCost : null
    const fairHalf = fairGram22 ? fairGram22 * halfCoinW + mintCost : null
    const fairQuarter = fairGram22 ? fairGram22 * quarterCoinW + mintCost : null

    const marketMesghal = t(mesghal?.close)
    const marketGram24 = t(geram24?.close)
    const marketGram18 = t(geram18?.close)
    const marketHalf = t(nim?.close)
    const marketQuarter = t(rob?.close)

    const bubble = (market: number | null, fair: number | null) =>
      market && fair ? (market - fair) / fair : null

    // Implied USD rate from each gold product
    const impliedDollar = (marketToman: number | null, goldOz: number | null, ozFraction: number) =>
      marketToman && goldOz ? (marketToman / ozFraction) / goldOz : null

    // تمام سکه: nerkh.io SEKE_BAHAR (already in تومان), fallback to نیم × 2
    const marketFull: number | null =
      nerkh?.sekkeBahar != null
        ? nerkh.sekkeBahar
        : marketHalf != null ? marketHalf * 2 : null
    const fullMarketIsEstimate = nerkh?.sekkeBahar == null

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      lastMarketDate: dollar?.shamsiDate ?? null,
      inputs: {
        goldUsd,
        silverUsd,
        dollarT,
        dirhamT,
        usdtT,
        goldUsdChange: ons?.changePct ?? null,
        dollarChange: dollar?.changePct ?? null,
      },
      derived: {
        dollarViaDirham,
        bubbleDollar,
        bubbleUsdt,
        AED_PER_USD,
      },
      gram: {
        fair24: fairGram24,
        market24: marketGram24,
        bubble24: bubble(marketGram24, fairGram24),
        impliedDollar24: impliedDollar(marketGram24, goldUsd, 1 / gramsPerOz),
        fair18: fairGram18,
        market18: marketGram18,
        bubble18: bubble(marketGram18, fairGram18),
        impliedDollar18: impliedDollar(marketGram18, goldUsd, (18 / 24) / gramsPerOz),
      },
      mesghal: {
        fair: fairMesghal,
        market: marketMesghal,
        bubble: bubble(marketMesghal, fairMesghal),
        impliedDollar: impliedDollar(marketMesghal, goldUsd, mithqalW * (18 / 24) / gramsPerOz),
        changeT: t(mesghal?.change),
        changePct: mesghal?.changePct ?? null,
      },
      coins: {
        full: {
          fair: fairFull,
          market: marketFull,
          bubble: bubble(marketFull, fairFull),
          weight: fullCoinW,
          marketIsEstimate: fullMarketIsEstimate,
          marketSource: fullMarketIsEstimate ? 'نیم × ۲' : 'nerkh.io',
        },
        half: {
          fair: fairHalf,
          market: marketHalf,
          bubble: bubble(marketHalf, fairHalf),
          weight: halfCoinW,
          impliedDollar: impliedDollar(marketHalf, goldUsd, halfCoinW * (22 / 24) / gramsPerOz),
          changePct: nim?.changePct ?? null,
        },
        quarter: {
          fair: fairQuarter,
          market: marketQuarter,
          bubble: bubble(marketQuarter, fairQuarter),
          weight: quarterCoinW,
          impliedDollar: impliedDollar(marketQuarter, goldUsd, quarterCoinW * (22 / 24) / gramsPerOz),
          changePct: rob?.changePct ?? null,
        },
      },
      constants: {
        gramsPerOz,
        AED_PER_USD,
        coinPurity: 22,
        bullionPurity: 24,
        fullCoinWeight: fullCoinW,
        halfCoinWeight: halfCoinW,
        quarterCoinWeight: quarterCoinW,
        mintCost,
        akhzaRate: 0.023,
        bankRate: 0.026,
        financeRate: 0.043,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
