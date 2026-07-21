import { NextRequest, NextResponse } from 'next/server'
import { callNarrate } from '@/lib/llmNarrate'
import { rateLimit } from '../../../lib/rateLimit'

export const dynamic = 'force-dynamic'

// Copilot محدود صندوق‌های کالایی — Gemini فقط از بین نام‌های دقیق صندوق‌های موجود (candidates)
// دو مورد را که کاربر می‌خواهد مقایسه کند تشخیص می‌دهد؛ خودِ مقایسه/امتیازدهی همان منطق
// قاعده‌محورِ موجود صفحه مقایسه است — این روت فقط انتخاب دو صندوق از روی جمله را انجام می‌دهد،
// هیچ عدد/آماری تولید یا اختراع نمی‌کند.
const SYSTEM = `تو دستیار «بورس سنج» هستی. کاربر می‌خواهد دو صندوق سرمایه‌گذاری کالایی (طلا/نقره/زعفران)
را با هم مقایسه کند. یک لیست از نام‌های دقیق صندوق‌های موجود (candidates) و جمله‌ی کاربر به تو داده می‌شود.
باید دقیقاً دو مورد از همان لیست candidates را که کاربر منظورش بوده انتخاب کنی (رشته باید عیناً از لیست باشد،
نه نام کوتاه/تقریبی).
قوانین:
- اگر نتوانستی با اطمینان دو مورد از لیست را تطبیق بدهی، هرکدام را که مطمئن نیستی null بگذار.
- اگر جمله کاربر اصلاً درباره مقایسه دو صندوق نبود، هر دو را null بگذار.
- فقط JSON با دو فیلد "fund1" و "fund2" (رشته دقیقاً از candidates یا null) برگردان، بدون توضیح اضافه.`

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    fund1: { type: 'STRING', nullable: true },
    fund2: { type: 'STRING', nullable: true },
  },
  required: [],
}
const OPENROUTER_SCHEMA = {
  type: 'object',
  properties: {
    fund1: { type: ['string', 'null'] },
    fund2: { type: ['string', 'null'] },
  },
  required: [],
  additionalProperties: false,
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  if (!rateLimit(`fund-copilot-nl:${ip}`, 10, 60_000)) {
    return NextResponse.json({ ok: false, error: 'تعداد درخواست‌ها زیاد است' }, { status: 429 })
  }

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!OPENROUTER_KEY && !GEMINI_KEY) {
    return NextResponse.json({ ok: false, error: 'OPENROUTER_API_KEY/GEMINI_API_KEY تنظیم نشده' }, { status: 500 })
  }

  let body: { query?: string; candidates?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.query?.trim()) return NextResponse.json({ ok: false, error: 'query الزامی است' }, { status: 400 })
  if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
    return NextResponse.json({ ok: false, error: 'candidates الزامی است' }, { status: 400 })
  }

  const userPrompt = `candidates:\n${body.candidates.join('\n')}\n\nجمله کاربر: ${body.query}`

  try {
    const raw = await callNarrate(GEMINI_KEY, OPENROUTER_KEY, SYSTEM, userPrompt, GEMINI_SCHEMA, OPENROUTER_SCHEMA, 'fund_copilot', 200)
    if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: 502 })
    let parsed: { fund1?: string | null; fund2?: string | null }
    try {
      parsed = JSON.parse(raw.text)
    } catch {
      return NextResponse.json({ ok: false, error: 'خروجی غیرقابل‌پردازش از مدل' }, { status: 502 })
    }
    // مدل باید عیناً از candidates انتخاب کند — هر خروجی خارج از لیست را برای امنیت نادیده می‌گیریم
    const set = new Set(body.candidates)
    const fund1 = parsed.fund1 && set.has(parsed.fund1) ? parsed.fund1 : null
    const fund2 = parsed.fund2 && set.has(parsed.fund2) ? parsed.fund2 : null
    return NextResponse.json({ ok: true, fund1, fund2 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }, { status: 502 })
  }
}
