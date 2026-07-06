import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BRSAPI_KEY = process.env.BRSAPI_KEY ?? 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'

/**
 * قیمت لحظه‌ای طلا، سکه و نقره فیزیکی از BrsApi برای صفحه پورتفو.
 * خروجی: { prices: { [symbol]: rial }, updated } — قیمت‌ها به «ریال».
 * BrsApi فقط با IP ایران جواب می‌دهد؛ در صورت خطا prices خالی برمی‌گردد
 * و کلاینت به قیمت دستی کاربر برمی‌گردد.
 */

// نگاشت نماد داخلی پورتفو → نماد BrsApi
const SYMBOL_MAP: Record<string, string> = {
  'gold-18k':     'IR_GOLD_18K',
  'gold-24k':     'IR_GOLD_24K',
  'gold-melted':  'IR_GOLD_MELTED',
  'coin-emami':   'IR_COIN_EMAMI',
  'coin-bahar':   'IR_COIN_BAHAR',
  'coin-half':    'IR_COIN_HALF',
  'coin-quarter': 'IR_COIN_QUARTER',
  'coin-gram':    'IR_COIN_1G',
  'silver':       'IR_SILVER',
  'silver-999':   'XAGIRR',
}

let cache: { at: number; body: any } | null = null
const TTL = 5 * 60 * 1000

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.body)

  const prices: Record<string, number> = {}
  let updated: string | null = null

  try {
    const url = `https://BrsApi.ir/Api/Market/Gold_Currency.php?key=${BRSAPI_KEY}`
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) })
    if (res.ok) {
      const data = await res.json()
      const items: any[] = [
        ...(Array.isArray(data?.gold) ? data.gold : []),
        ...(Array.isArray(data?.currency) ? data.currency : []),
      ]
      const bySymbol = new Map<string, any>()
      for (const it of items) bySymbol.set(String(it.symbol ?? ''), it)

      for (const [ours, theirs] of Object.entries(SYMBOL_MAP)) {
        const it = bySymbol.get(theirs)
        if (!it) continue
        const p = parseFloat(String(it.price ?? '').replace(/,/g, ''))
        if (isNaN(p) || p <= 0) continue
        // BrsApi قیمت طلا/سکه را به تومان می‌دهد — تبدیل به ریال
        const isToman = String(it.unit ?? 'تومان').includes('تومان')
        prices[ours] = isToman ? p * 10 : p
        if (!updated && it.date) updated = `${it.date} ${it.time ?? ''}`.trim()
      }
    }
  } catch { /* خارج از ایران یا قطعی — کلاینت fallback دارد */ }

  const body = { prices, updated }
  if (Object.keys(prices).length > 0) cache = { at: Date.now(), body }
  return NextResponse.json(body)
}
