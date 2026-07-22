import { NextRequest, NextResponse } from 'next/server'
import { callNarrate } from '@/lib/llmNarrate'
import { rateLimit } from '../../../lib/rateLimit'
import { clientIp } from '../../../lib/clientIp'

export const dynamic = 'force-dynamic'

// خلاصه‌ساز ۳خطی گزارش کدال (فعالیت ماهانه/صورت مالی فصلی) — فرمت ثابت:
// خط ۱) مثبت/منفی/خنثی بودن گزارش، خط ۲) تأثیر روی EPS، خط ۳) یعنی‌چی برای سهام‌دار.
// فقط از اعداد از‌قبل‌محاسبه‌شده (facts) استفاده می‌کند، هیچ عدد جدیدی اختراع نمی‌کند.
const SYSTEM = `تو دستیار تحلیل‌نویس «بورس سنج» هستی (نه «بورسنج» — همیشه همین املا).
یک گزارش کدال (فعالیت ماهانه یا صورت مالی فصلی) یک نماد بورسی، به‌صورت اعداد و درصدهای
از‌قبل‌محاسبه‌شده (facts) به تو داده می‌شود. باید دقیقاً یک خلاصهٔ ۳خطی فارسی بسازی.

قوانین سخت‌گیرانه:
- هیچ عدد یا ادعایی که در facts نیامده اختراع نکن. اگر داده‌ای برای تأثیر EPS نبود، صریح
  بنویس «تأثیر مستقیمی روی EPS از این گزارش قابل استخراج نیست» — هرگز حدس نزن.
- توصیه خرید/فروش مستقیم نده («بخرید»/«بفروشید» ممنوع).
- خروجی JSON با دقیقاً سه فیلد:
  "verdict": یک عبارت کوتاه (حداکثر ۶ کلمه) که می‌گوید گزارش مثبت/منفی/خنثی است و چرا (یک دلیل کوتاه از facts).
  "epsImpact": یک جملهٔ کوتاه دربارهٔ تأثیر تخمینی این گزارش روی EPS (فقط بر پایهٔ facts؛ اگر نبود همان جملهٔ «قابل استخراج نیست» را بنویس).
  "meaning": یک جملهٔ کوتاه «یعنی چی برای سهام‌دار» — توضیح ساده بدون توصیه مستقیم خرید/فروش، و همیشه با
  «این خلاصه صرفاً اطلاع‌رسانی است و توصیهٔ مالی نیست.» تمام شود.
- همهٔ اعداد با ارقام فارسی (۰-۹).
- فقط همان JSON را برگردان، بدون Markdown fence یا توضیح اضافه.`

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING' },
    epsImpact: { type: 'STRING' },
    meaning: { type: 'STRING' },
  },
  required: ['verdict', 'epsImpact', 'meaning'],
}
const OPENROUTER_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    epsImpact: { type: 'string' },
    meaning: { type: 'string' },
  },
  required: ['verdict', 'epsImpact', 'meaning'],
  additionalProperties: false,
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  if (!rateLimit(`codal-verdict:${ip}`, 10, 60_000)) {
    return NextResponse.json({ ok: false, error: 'تعداد درخواست‌ها زیاد است' }, { status: 429 })
  }

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!OPENROUTER_KEY && !GEMINI_KEY) {
    return NextResponse.json({ ok: false, error: 'OPENROUTER_API_KEY/GEMINI_API_KEY تنظیم نشده' }, { status: 500 })
  }

  let body: { symbol?: string; kind?: 'monthly' | 'quarterly'; periodLabel?: string; facts?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { symbol, kind, periodLabel, facts } = body
  if (!symbol || !facts) {
    return NextResponse.json({ ok: false, error: 'symbol و facts الزامی‌اند' }, { status: 400 })
  }

  const userPrompt = [
    `نماد: ${symbol}`,
    `نوع گزارش: ${kind === 'quarterly' ? 'صورت مالی فصلی/سالانه' : 'فعالیت ماهانه'}`,
    periodLabel ? `دوره: ${periodLabel}` : null,
    `facts (اعداد و درصدهای از‌قبل‌محاسبه‌شده، جدا شده با خط جدید):`,
    facts,
  ].filter(Boolean).join('\n')

  try {
    const raw = await callNarrate(GEMINI_KEY, OPENROUTER_KEY, SYSTEM, userPrompt, GEMINI_SCHEMA, OPENROUTER_SCHEMA, 'codal_verdict', 300)
    if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: 502 })

    let parsed: { verdict?: string; epsImpact?: string; meaning?: string }
    try {
      parsed = JSON.parse(raw.text)
    } catch {
      return NextResponse.json({ ok: false, error: 'خروجی غیرقابل‌پردازش از مدل' }, { status: 502 })
    }
    if (!parsed.verdict || !parsed.epsImpact || !parsed.meaning) {
      return NextResponse.json({ ok: false, error: 'پاسخ ناقص از مدل' }, { status: 502 })
    }
    return NextResponse.json({
      ok: true,
      verdict: parsed.verdict.trim(),
      epsImpact: parsed.epsImpact.trim(),
      meaning: parsed.meaning.trim(),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }, { status: 502 })
  }
}
