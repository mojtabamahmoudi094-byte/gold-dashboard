import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rateLimit'
import { GEMINI_BASE } from '../../../lib/upstreams'

// Gemini با ورودی تصویری (چارت کندلی) — تفسیر فنی فارسی می‌نویسد
// الگوی AI-Kline: LLM مستقیم عکس چارت را می‌بیند، نه فقط اعداد خام
// همان قرارداد generationConfig که در signal-narrative جواب داده (thinkingBudget:0 لازم است
// وگرنه پاسخ gemini-2.5-flash بریده می‌شود)

export const dynamic = 'force-dynamic'

const SYSTEM = `تو دستیار «بورس سنج» هستی. یک عکس نمودار کندلی روزانه یک سهم به همراه چند آمار عددی (که از قبل محاسبه شده‌اند) به تو داده می‌شود.
خروجی تو باید یک JSON با دقیقاً دو فیلد باشد: "headline" و "text".
قوانین:
- فقط بر اساس الگوی قیمتی/حجمی که در خود عکس می‌بینی نظر بده (روند، نوسان، فشردگی، واگرایی حجم) — عددی که در آمار داده‌شده نیامده اختراع نکن.
- توصیه خرید/فروش مستقیم نده («بخرید»/«بفروشید» ممنوع) — فقط توصیف الگو.
- "headline": حداکثر ۸ کلمه، خلاصه‌ی یک‌خطی از آنچه در چارت دیده می‌شود.
- "text": پاراگراف فارسی روان (۳ تا ۵ جمله) که الگوی چارت را توصیف می‌کند و همیشه با «این تحلیل صرفاً اطلاع‌رسانی است و توصیه مالی نیست.» تمام می‌شود.
- فقط همان JSON را برگردان، بدون Markdown fence یا توضیح اضافه.`

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  if (!rateLimit(`chart-narrative:${ip}`, 10, 60_000)) {
    return NextResponse.json({ ok: false, error: 'تعداد درخواست‌ها زیاد است' }, { status: 429 })
  }

  const KEY = process.env.GEMINI_API_KEY
  if (!KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY تنظیم نشده' }, { status: 500 })
  }

  let body: { symbol?: string; imageBase64?: string; mimeType?: string; stats?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { symbol, imageBase64, mimeType, stats } = body
  if (!imageBase64) {
    return NextResponse.json({ ok: false, error: 'imageBase64 الزامی است' }, { status: 400 })
  }

  const userPrompt = [
    symbol ? `نماد: ${symbol}` : null,
    stats ? `آمار محاسبه‌شده (فقط برای راهنمایی، عدد جدید اختراع نکن):\n${JSON.stringify(stats)}` : null,
  ].filter(Boolean).join('\n')

  const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const url = `${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent?key=${KEY}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: userPrompt || 'این عکس چارت را تحلیل کن.' },
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
          ],
        }],
        systemInstruction: { parts: [{ text: SYSTEM }] },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 500,
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
      signal: AbortSignal.timeout(45_000),
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
      symbol: symbol ?? null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }, { status: 502 })
  }
}
