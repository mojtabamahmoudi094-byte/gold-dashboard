import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rateLimit'
import { clientIp } from '../../../lib/clientIp'

export const dynamic = 'force-dynamic'

// پروکسی سرور برای BrsApi. هدف: کلید BRSAPI_KEY هرگز به باندل مرورگر نرود.
// قبلاً کامپوننت‌های 'use client' مستقیم BrsApi را با کلید هاردکد/NEXT_PUBLIC صدا
// می‌زدند و کلید در view-source قابل استخراج بود (خطر سوختن سهمیه — 429).
// فقط endpointهای allowlist و فقط پارامترهای مجاز پاس داده می‌شوند (ضد SSRF/سوءاستفاده).
const KEY = process.env.BRSAPI_KEY || ''

const ALLOW: Record<string, { url: string; params: string[] }> = {
  index:              { url: 'https://Api.BrsApi.ir/Tsetmc/Index.php',            params: ['type'] },
  'codal-announcement': { url: 'https://Api.BrsApi.ir/Codal/Announcement.php',    params: ['l18', 'date_start'] },
  'ime-fund':         { url: 'https://api.brsapi.ir/IME/Fund.php',                params: [] },
  'gold-currency':    { url: 'https://Api.BrsApi.ir/Market/Gold_Currency_Pro.php', params: ['section'] },
  commodity:          { url: 'https://api.brsapi.ir/Market/Commodity.php',        params: [] },
}

export async function GET(req: NextRequest) {
  if (!rateLimit(`brs-proxy:${clientIp(req)}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 })
  }

  if (!KEY) {
    return NextResponse.json({ error: 'BRSAPI_KEY تنظیم نشده است' }, { status: 500 })
  }

  const endpoint = req.nextUrl.searchParams.get('endpoint') || ''
  const spec = ALLOW[endpoint]
  if (!spec) {
    return NextResponse.json({ error: 'endpoint نامعتبر' }, { status: 400 })
  }

  const url = new URL(spec.url)
  url.searchParams.set('key', KEY)
  for (const p of spec.params) {
    const v = req.nextUrl.searchParams.get(p)
    if (v) url.searchParams.set(p, v)
  }

  try {
    const res = await fetch(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(40_000) })
    if (!res.ok) {
      return NextResponse.json({ error: `upstream ${res.status}` }, { status: 502 })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'upstream failed' }, { status: 502 })
  }
}
