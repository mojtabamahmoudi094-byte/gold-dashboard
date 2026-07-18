import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SYSTEM = `تو دستیار «بورس سنج» هستی. یک سیگنال معاملاتی قانون‌محور (نه تولیدشده توسط تو) به همراه دلایل عددی‌اش
به تو داده می‌شود. خروجی تو باید یک JSON با دقیقاً دو فیلد باشد: "headline" و "text".
قوانین:
- هیچ عدد یا ادعای جدیدی که در دلایل داده‌شده نیامده اختراع نکن — نوع سیگنال و درصد اطمینان از قبل مشخص‌اند، فقط همان‌ها را روایت کن.
- توصیه خرید/فروش مستقیم نده («بخرید»/«بفروشید» ممنوع) — فقط دلایل را روایت کن.
- "headline": حداکثر ۸ کلمه، خلاصه‌ی یک‌خطی نتیجه‌گیری بر پایه‌ی همان نوع سیگنال داده‌شده (بدون عدد جدید).
- "text": پاراگراف فارسی روان و طبیعی (۳ تا ۵ جمله) که دلایل را روایت می‌کند و همیشه با «این تحلیل صرفاً اطلاع‌رسانی است و توصیه مالی نیست.» تمام می‌شود.
- فقط همان JSON را برگردان، بدون Markdown fence یا توضیح اضافه.`

export async function POST(req: NextRequest) {
  const KEY = process.env.GEMINI_API_KEY
  if (!KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY تنظیم نشده' }, { status: 500 })
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

  const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM }] },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 400,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              headline: { type: 'STRING' },
              text: { type: 'STRING' },
            },
            required: ['headline', 'text'],
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: data?.error?.message || `HTTP ${res.status}` }, { status: 502 })
    }
    const raw: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) {
      return NextResponse.json({ ok: false, error: 'پاسخ خالی از Gemini' }, { status: 502 })
    }
    let parsed: { headline?: string; text?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ ok: false, error: 'خروجی غیرقابل‌پردازش از Gemini' }, { status: 502 })
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
