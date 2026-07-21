import { NextRequest, NextResponse } from 'next/server'
import { callNarrate } from '@/lib/llmNarrate'
import { rateLimit } from '../../../lib/rateLimit'

export const dynamic = 'force-dynamic'

// روایت روزانه بازار — Gemini فقط اعداد قاعده‌محورِ Regime Engine و حباب طلا/نقره را که
// از قبل محاسبه شده روایت می‌کند؛ هیچ عدد/ادعای جدیدی اختراع نمی‌کند.
const SYSTEM = `تو دستیار «بورس سنج» هستی. خلاصه‌ی عددیِ روز بازار سهام (و طلا/نقره) که از یک
موتور قاعده‌محور محاسبه شده به تو داده می‌شود. باید یک روایت کوتاه فارسی از «چرا بازار امروز
این‌طور بود» بسازی.
قوانین:
- هیچ عدد یا ادعای جدیدی که در داده‌های داده‌شده نیامده اختراع نکن.
- توصیه خرید/فروش مستقیم نده («بخرید»/«بفروشید» ممنوع) — فقط دلایل را روایت کن.
- خروجی JSON با دقیقاً دو فیلد: "headline" (حداکثر ۱۰ کلمه، خلاصه‌ی یک‌خطی روز) و
  "body" (۴ تا ۶ جمله فارسی روان، روایت‌کننده‌ی وضعیت بازار امروز بر پایه‌ی همان اعداد داده‌شده،
  که همیشه با «این تحلیل صرفاً اطلاع‌رسانی است و توصیه مالی نیست.» تمام می‌شود).
- فقط همان JSON را برگردان، بدون Markdown fence یا توضیح اضافه.`

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    body: { type: 'STRING' },
  },
  required: ['headline', 'body'],
}
const OPENROUTER_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['headline', 'body'],
  additionalProperties: false,
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  if (!rateLimit(`market-story-narrative:${ip}`, 10, 60_000)) {
    return NextResponse.json({ ok: false, error: 'تعداد درخواست‌ها زیاد است' }, { status: 429 })
  }

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!OPENROUTER_KEY && !GEMINI_KEY) {
    return NextResponse.json({ ok: false, error: 'OPENROUTER_API_KEY/GEMINI_API_KEY تنظیم نشده' }, { status: 500 })
  }

  let body: { facts?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.facts?.trim()) return NextResponse.json({ ok: false, error: 'facts الزامی است' }, { status: 400 })

  try {
    const raw = await callNarrate(GEMINI_KEY, OPENROUTER_KEY, SYSTEM, body.facts, GEMINI_SCHEMA, OPENROUTER_SCHEMA, 'market_story', 500)
    if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: 502 })
    let parsed: { headline?: string; body?: string }
    try {
      parsed = JSON.parse(raw.text)
    } catch {
      return NextResponse.json({ ok: false, error: 'خروجی غیرقابل‌پردازش از مدل' }, { status: 502 })
    }
    if (!parsed.headline || !parsed.body) {
      return NextResponse.json({ ok: false, error: 'پاسخ ناقص از مدل' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, headline: parsed.headline.trim(), body: parsed.body.trim() })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }, { status: 502 })
  }
}
