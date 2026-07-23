import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// وزن ترکیب دارایی صندوق‌های کالایی (طلا/نقره/زعفران)
//
// چرا API و نه فایل استاتیک در public؟ کرون ماهانهٔ scripts/sync-fund-weights.js روی
// سرور اجرا می‌شود، ولی دایرکتوری سایت با `rsync --delete` در هر دیپلوی بازنویسی
// می‌شود — پس هر فایلی که کرون داخل app/public بنویسد با دیپلوی بعدی پاک می‌شد.
// راه‌حل: کرون در FUND_WEIGHTS_DIR (بیرونِ app/) می‌نویسد و این روت از آن‌جا می‌خواند؛
// اگر آن مسیر نبود (لوکال/دیپلوی تازه) به نسخهٔ همراه ریپو در public برمی‌گردد.

export const dynamic = 'force-dynamic'

const KINDS = ['gold', 'silver', 'saffron'] as const
const EXTERNAL_DIR = process.env.FUND_WEIGHTS_DIR || '/opt/bourssanj-site/data/fund-weights'

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get('kind')?.trim() ?? ''
  if (!(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ weights: {} }, { status: 400 })
  }

  for (const file of [
    path.join(EXTERNAL_DIR, `${kind}.json`),
    path.join(process.cwd(), 'public', 'fund-weights', `${kind}.json`),
  ]) {
    try {
      const raw = fs.readFileSync(file, 'utf8')
      const json = JSON.parse(raw)
      if (json?.weights) {
        return NextResponse.json(json, {
          headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
        })
      }
    } catch { /* فایل نبود یا خراب بود — سراغ منبع بعدی */ }
  }

  return NextResponse.json({ weights: {} })
}
