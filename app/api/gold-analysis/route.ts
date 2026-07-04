import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const BRSAPI_KEY    = process.env.BRSAPI_KEY ?? 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const PRO_URL       = `https://Api.BrsApi.ir/Market/Gold_Currency_Pro.php?key=${BRSAPI_KEY}&section=gold,currency,cryptocurrency`
const COMMODITY_URL = `https://api.brsapi.ir/Market/Commodity.php?key=${BRSAPI_KEY}`
const CACHE_TTL     = 60_000

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
): Promise<{ data: any; stale: boolean }> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL) return { data: cache.data, stale: false }
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) })
    if (!res.ok) throw new Error(`brsapi ${res.status}`)
    const json = await res.json()
    setCache({ data: json, at: now })
    return { data: json, stale: false }
  } catch (e) {
    if (cache) {
      console.warn(`[gold-analysis] ${label} failed, serving stale:`, e)
      return { data: cache.data, stale: true }
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

function extractPrices(proData: any, commodityData: any) {
  const goldOunce = proData?.gold?.ounce    ?? []
  const goldTypes = proData?.gold?.type     ?? []
  const goldCoins = proData?.gold?.coin     ?? []
  const freeCurr  = proData?.currency?.free ?? []
  const cryptos   = proData?.cryptocurrency ?? []
  const metals    = commodityData?.metal_precious ?? []
  return {
    goldUsd:     n(goldOunce[0]?.price),
    silverUsd:   n(bySymbol(metals, 'XAGUSD')?.price),
    dollarT:     rialToToman(bySymbol(freeCurr, 'USD')?.price),
    dirhamT:     rialToToman(bySymbol(freeCurr, 'AED')?.price),
    usdtT:       n(bySymbol(cryptos, 'USDT')?.price_toman),
    gram24:      n(bySymbol(goldTypes, 'IR_GOLD_24K')?.price),
    gram18:      n(bySymbol(goldTypes, 'IR_GOLD_18K')?.price),
    mesghal:     n(bySymbol(goldTypes, 'IR_GOLD_MELTED')?.price),
    fullCoin:    n(bySymbol(goldCoins, 'IR_COIN_BAHAR')?.price),
    halfCoin:    n(bySymbol(goldCoins, 'IR_COIN_HALF')?.price),
    quarterCoin: n(bySymbol(goldCoins, 'IR_COIN_QUARTER')?.price),
  }
}

function pctChange(today: number | null, yesterday: number | null): number | null {
  if (today == null || yesterday == null || yesterday === 0) return null
  return ((today - yesterday) / yesterday) * 100
}

function buildResponse(
  proData: any,
  commodityData: any,
  stale: boolean,
  changes: Record<string, number | null> | null,
  lastMarketDate: string | null,
  imeData: { goldBarRial: number | null; goldCoinRial: number | null },
) {
  const goldOunce = proData?.gold?.ounce    ?? []
  const goldTypes = proData?.gold?.type     ?? []
  const goldCoins = proData?.gold?.coin     ?? []
  const freeCurr  = proData?.currency?.free ?? []
  const cryptos   = proData?.cryptocurrency ?? []
  const metals    = commodityData?.metal_precious ?? []

  const ounceEntry  = goldOunce[0]
  const dollarEntry = bySymbol(freeCurr, 'USD')
  const dirhamEntry = bySymbol(freeCurr, 'AED')
  const usdtEntry   = bySymbol(cryptos, 'USDT')
  const silverEntry = bySymbol(metals, 'XAGUSD')

  const goldUsd   = n(ounceEntry?.price)
  const silverUsd = n(silverEntry?.price)
  const dollarT   = rialToToman(dollarEntry?.price)
  const dirhamT   = rialToToman(dirhamEntry?.price)
  const usdtT     = n(usdtEntry?.price_toman)

  const marketGram24  = n(bySymbol(goldTypes, 'IR_GOLD_24K')?.price)
  const marketGram18  = n(bySymbol(goldTypes, 'IR_GOLD_18K')?.price)
  const marketMesghal = n(bySymbol(goldTypes, 'IR_GOLD_MELTED')?.price)
  const marketFull    = n(bySymbol(goldCoins, 'IR_COIN_BAHAR')?.price)
  const marketHalf    = n(bySymbol(goldCoins, 'IR_COIN_HALF')?.price)
  const marketQuarter = n(bySymbol(goldCoins, 'IR_COIN_QUARTER')?.price)

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

  const bullionW       = 1000
  const bullionPurity  = 995 / 999.9
  const fairBullion    = goldUsd && dollarViaDirham
    ? (bullionW / gramsPerOz) * bullionPurity * goldUsd * dollarViaDirham : null
  const fairCoinCert   = goldUsd && dollarViaDirham
    ? (fullCoinW / gramsPerOz) * (22 / 24) * goldUsd * dollarViaDirham : null

  const bub = (m: number | null, f: number | null) => m && f ? (m - f) / f : null
  const imp = (mT: number | null, oz: number | null, frac: number) =>
    mT && oz ? (mT / frac) / oz : null

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    lastMarketDate,
    _stale: stale,
    inputs: { goldUsd, silverUsd, dollarT, dirhamT, usdtT },
    changes: changes ?? {},
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
      changePct: changes?.mesghal ?? null,
    },
    coins: {
      full: {
        fair: fairFull, market: marketFull, bubble: bub(marketFull, fairFull),
        weight: fullCoinW, marketIsEstimate: false, changePct: changes?.fullCoin ?? null,
      },
      half: {
        fair: fairHalf, market: marketHalf, bubble: bub(marketHalf, fairHalf),
        weight: halfCoinW,
        impliedDollar: imp(marketHalf, goldUsd, halfCoinW * (22 / 24) / gramsPerOz),
        changePct: changes?.halfCoin ?? null,
      },
      quarter: {
        fair: fairQuarter, market: marketQuarter, bubble: bub(marketQuarter, fairFull),
        weight: quarterCoinW,
        impliedDollar: imp(marketQuarter, goldUsd, quarterCoinW * (22 / 24) / gramsPerOz),
        changePct: changes?.quarterCoin ?? null,
      },
    },
    constants: {
      gramsPerOz, AED_PER_USD, coinPurity: 22, bullionPurity: 24,
      fullCoinWeight: fullCoinW, halfCoinWeight: halfCoinW, quarterCoinWeight: quarterCoinW,
      mintCost,
    },
    ime: {
      goldBarT:    imeData.goldBarRial  != null ? imeData.goldBarRial  / 10 : null,
      goldCoinT:   imeData.goldCoinRial != null ? imeData.goldCoinRial / 10 : null,
      fairBullion,
      fairCoinCert,
    },
  })
}

export async function GET() {
  // ── 1. Fetch last 2 Supabase cache records (today + yesterday) ──────────────
  let sbRows: Array<{ raw_pro: any; raw_commodity: any; date: string }> = []
  try {
    const { data: rows } = await sbClient
      .from('signals')
      .select('note, signal_date_shamsi')
      .eq('signal_type', '_gold_cache')
      .order('signal_date_shamsi', { ascending: false })
      .limit(2)

    sbRows = (rows ?? [])
      .filter(r => r.note)
      .map(r => {
        const p = JSON.parse(r.note)
        return { raw_pro: p.raw_pro, raw_commodity: p.raw_commodity, date: r.signal_date_shamsi }
      })
  } catch (e) {
    console.error('[gold-analysis] Supabase fetch failed:', e)
  }

  const lastMarketDate = sbRows[0]?.date ?? null

  // ── 1b. Read latest IME cache (GoldBar + GoldCoin pf in Rial) ───────────────
  let imeGoldBarRial:  number | null = null
  let imeGoldCoinRial: number | null = null
  try {
    const { data: imeRows } = await sbClient
      .from('signals')
      .select('note')
      .eq('signal_type', '_ime_cache')
      .order('signal_date_shamsi', { ascending: false })
      .limit(1)
    if (imeRows?.[0]?.note) {
      const arr: any[] = JSON.parse(imeRows[0].note)?.raw?.data ?? []
      const goldBar  = arr.find((x: any) => x.contract_code === 'GoldBar')
      const goldCoin = arr.find((x: any) => x.contract_code === 'GoldCoin')
      imeGoldBarRial  = goldBar?.pf  != null ? Number(goldBar.pf)  : null
      imeGoldCoinRial = goldCoin?.pf != null ? Number(goldCoin.pf) : null
    }
  } catch (e) {
    console.warn('[gold-analysis] IME cache read failed:', e)
  }

  // ── 2. Try live BrsAPI (Iranian IP required — expected to fail on Render) ───
  let liveProData: any      = null
  let liveCommodityData: any = null
  let stale = true

  try {
    const [pro, commodity] = await Promise.all([
      fetchWithCache(PRO_URL,       proCache,       c => { proCache       = c }, 'Gold_Currency_Pro'),
      fetchWithCache(COMMODITY_URL, commodityCache, c => { commodityCache = c }, 'Commodity'),
    ])
    liveProData      = pro.data
    liveCommodityData = commodity.data
    stale            = pro.stale || commodity.stale
  } catch {
    // Expected on Render — fall through to Supabase cache
  }

  // ── 3. Resolve today's data source ──────────────────────────────────────────
  const todayProData       = liveProData       ?? sbRows[0]?.raw_pro
  const todayCommodityData = liveCommodityData ?? sbRows[0]?.raw_commodity

  if (!todayProData) {
    return NextResponse.json({ error: 'no data available' }, { status: 503 })
  }

  // ── 4. Compute daily change percentages ─────────────────────────────────────
  const todayP = extractPrices(todayProData, todayCommodityData)
  const yestP  = sbRows[1]
    ? extractPrices(sbRows[1].raw_pro, sbRows[1].raw_commodity)
    : null

  const changes = yestP ? {
    goldUsd:     pctChange(todayP.goldUsd,     yestP.goldUsd),
    silverUsd:   pctChange(todayP.silverUsd,   yestP.silverUsd),
    dollarT:     pctChange(todayP.dollarT,     yestP.dollarT),
    dirhamT:     pctChange(todayP.dirhamT,     yestP.dirhamT),
    usdtT:       pctChange(todayP.usdtT,       yestP.usdtT),
    gram24:      pctChange(todayP.gram24,      yestP.gram24),
    gram18:      pctChange(todayP.gram18,      yestP.gram18),
    mesghal:     pctChange(todayP.mesghal,     yestP.mesghal),
    fullCoin:    pctChange(todayP.fullCoin,    yestP.fullCoin),
    halfCoin:    pctChange(todayP.halfCoin,    yestP.halfCoin),
    quarterCoin: pctChange(todayP.quarterCoin, yestP.quarterCoin),
  } : null

  return buildResponse(todayProData, todayCommodityData, stale, changes, lastMarketDate, {
    goldBarRial:  imeGoldBarRial,
    goldCoinRial: imeGoldCoinRial,
  })
}
