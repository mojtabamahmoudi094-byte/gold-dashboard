import { NextRequest, NextResponse } from 'next/server'
import { callNarrate } from '@/lib/llmNarrate'
import { rateLimit } from '../../../lib/rateLimit'

export const dynamic = 'force-dynamic'

const SYSTEM = `تو دستیار «بورس سنج» هستی. یک سیگنال معاملاتی قانون‌محور (نه تولیدشده توسط تو) به همراه دلایل عددی‌اش
به تو داده می‌شود. خروجی تو باید یک JSON با دقیقاً دو فیلد باشد: "headline" و "text".
قوانین:
- هیچ عدد یا ادعای جدیدی که در دلایل داده‌شده نیامده اختراع نکن — نوع سیگنال و درصد اطمینان از قبل مشخص‌اند، فقط همان‌ها را روایت کن.
- توصیه خرید/فروش مستقیم نده («بخرید»/«بفروشید» ممنوع) — فقط دلایل را روایت کن.
- "headline": حداکثر ۸ کلمه، خلاصه‌ی یک‌خطی نتیجه‌گیری بر پایه‌ی همان نوع سیگنال داده‌شده (بدون عدد جدید).
- "text": پاراگراف فارسی روان و طبیعی (۳ تا ۵ جمله) که دلایل را روایت می‌کند و همیشه با «این تحلیل صرفاً اطلاع‌رسانی است و توصیه مالی نیست.» تمام می‌شود.
- فقط همان JSON را برگردان، بدون Markdown fence یا توضیح اضافه.`

// Gemini مستقیم: type ها UPPERCASE — OpenRouter: JSON Schema استاندارد (lowercase)
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    text: { type: 'STRING' },
  },
  required: ['headline', 'text'],
}
const OPENROUTER_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    text: { type: 'string' },
  },
  required: ['headline', 'text'],
  additionalProperties: false,
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  if (!rateLimit(`signal-narrative:${ip}`, 10, 60_000)) {
    return NextResponse.json({ ok: false, error: 'تعداد درخواست‌ها زیاد است' }, { status: 429 })
  }

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!OPENROUTER_KEY && !GEMINI_KEY) {
    return NextResponse.json({ ok: false, error: 'OPENROUTER_API_KEY/GEMINI_API_KEY تنظیم نشده' }, { status: 500 })
  }

  let body: { type?: string; category?: string; symbol?: string | null; reason?: string; confidence?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, category, symbol, reason, confidence } = body
  if (!type || !reason) {
    return NextResponse.json({ ok: false, error: 'type و reason الزامی‌اند' }, { status: 400 })
  }

  const userPrompt = [
    `نوع سیگنال: ${type}`,
    category ? `دسته: ${category}` : null,
    symbol ? `نماد: ${symbol}` : null,
    confidence != null ? `درصد اطمینان موتور: ${confidence}٪` : null,
    `دلایل (از موتور قاعده‌محور، جدا شده با «·»):`,
    reason,
  ].filter(Boolean).join('\n')

  try {
    const raw = await callNarrate(GEMINI_KEY, OPENROUTER_KEY, SYSTEM, userPrompt, GEMINI_SCHEMA, OPENROUTER_SCHEMA, 'signal_narrative', 400)
    if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: 502 })

    let parsed: { headline?: string; text?: string }
    try {
      parsed = JSON.parse(raw.text)
    } catch {
      return NextResponse.json({ ok: false, error: 'خروجی غیرقابل‌پردازش از مدل' }, { status: 502 })
    }
    if (!parsed.text) {
      return NextResponse.json({ ok: false, error: 'پاسخ ناقص از Gemini' }, { status: 502 })
    }
    return NextResponse.json({
      ok: true,
      text: parsed.text.trim(),
      headline: parsed.headline?.trim() || null,
      signal: type,
      score: confidence ?? null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }, { status: 502 })
  }
}
