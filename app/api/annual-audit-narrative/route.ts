import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// این مسیر فقط برای صورت‌های مالی سالانهٔ حسابرسی‌شده صدا زده می‌شود (کم‌تعداد، ~۱بار/سال/نماد)
// و پستی جدا از کارت خلاصهٔ فعلی می‌سازد. ورودی فقط فیلدهای از قبل استخراج‌شده و گراندد است —
// متن خام نامهٔ حسابرس هرگز به Gemini داده نمی‌شود تا از توهم/برداشت آزاد جلوگیری شود.
const SYSTEM = `تو دستیار تحلیل‌نویس «بورس سنج» هستی (نه «بورسنج» — همیشه همین املا).
یک صورت مالی سالانهٔ حسابرسی‌شدهٔ یک نماد بورسی به‌صورت فیلدهای ساختاریافته (نه متن خام نامهٔ
حسابرس) به تو داده می‌شود. باید یک تحلیل فارسی برای پست تلگرامی بنویسی.

قوانین سخت‌گیرانه:
- هیچ عدد یا ادعایی که در فیلدهای داده‌شده نیست اختراع نکن. اگر فیلدی null یا خالی است، آن
  بخش را صریحاً «داده‌ای در دسترس نیست» بنویس یا کامل حذفش کن — هرگز حدس نزن یا برداشت آزاد
  از فیلدهای دیگر نکن.
- توصیه خرید/فروش مستقیم نده.
- لحن فارسی طبیعی و روان مالی، نه ترجمه‌ای از انگلیسی.
- همهٔ اعداد با ارقام فارسی (۰-۹) نوشته شوند، نه لاتین.
- فرمت خروجی HTML مجاز تلگرام است: فقط تگ‌های <b> <i> <u> <s> <code> مجازند؛ برای خط جدید
  از \\n استفاده کن، هرگز از <br> یا تگ دیگری استفاده نکن.
- ساختار: عنوان کوتاه (نماد + دوره)، نوع اظهار نظر حسابرس، روند درآمد/سود سال‌به‌سال، روند
  جریان نقدی، نسبت‌های کلیدی (حاشیه ناخالص/خالص، نسبت جاری، نسبت بدهی، ROE)، نکات قابل توجه/
  پرچم قرمز (در صورت وجود داده)، و در پایان همیشه دقیقاً همین جمله به‌عنوان سطر مجزا:
  «این تحلیل صرفاً جنبهٔ اطلاع‌رسانی دارد و توصیهٔ خرید/فروش نیست.»
- خروجی را فقط به‌صورت JSON با فیلد "html" برگردان، بدون Markdown fence یا توضیح اضافه.`

type Ratios = { gross_margin: number | null; net_margin: number | null; current_ratio: number | null; debt_ratio: number | null; roe: number | null }
type CashFlow = { operating: number | null; investing: number | null; financing: number | null }
type RedFlags = { basisForQualified: string | null; notableClauses: string | null; legalComplianceNotes: string | null }

interface Body {
  symbol?: string
  period?: string
  opinionType?: string | null
  ratios?: Ratios | null
  revenueYoY?: number | null
  netProfitYoY?: number | null
  cashFlow?: CashFlow | null
  redFlagSnippets?: RedFlags | null
}

export async function POST(req: NextRequest) {
  const KEY = process.env.GEMINI_API_KEY
  if (!KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY تنظیم نشده' }, { status: 500 })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { symbol, period } = body
  if (!symbol || !period) {
    return NextResponse.json({ ok: false, error: 'symbol و period الزامی‌اند' }, { status: 400 })
  }

  const userPrompt = JSON.stringify({
    symbol,
    period,
    opinionType: body.opinionType ?? null,
    ratios: body.ratios ?? null,
    revenueYoY: body.revenueYoY ?? null,
    netProfitYoY: body.netProfitYoY ?? null,
    cashFlow: body.cashFlow ?? null,
    redFlagSnippets: body.redFlagSnippets ?? null,
  })

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
          maxOutputTokens: 2000,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: { html: { type: 'STRING' } },
            required: ['html'],
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
    let parsed: { html?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ ok: false, error: 'خروجی غیرقابل‌پردازش از Gemini' }, { status: 502 })
    }
    if (!parsed.html) {
      return NextResponse.json({ ok: false, error: 'پاسخ ناقص از Gemini' }, { status: 502 })
    }

    // محدودیت sendMessage تلگرام: ۴۰۹۶ کاراکتر — برش سر آخرین خط کامل قبل از حد،
    // بعد disclaimer را دوباره append کن اگر افتاده بود (بند اجباری طبق قوانین محتوا)
    const DISCLAIMER = 'این تحلیل صرفاً جنبهٔ اطلاع‌رسانی دارد و توصیهٔ خرید/فروش نیست.'
    let html = parsed.html.trim()
    const LIMIT = 4096
    if (html.length > LIMIT) {
      const cut = html.slice(0, LIMIT - DISCLAIMER.length - 2)
      const lastBreak = cut.lastIndexOf('\n')
      html = (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).trim()
    }
    if (!html.includes(DISCLAIMER)) html = `${html}\n\n${DISCLAIMER}`

    return NextResponse.json({ ok: true, html })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }, { status: 502 })
  }
}
