import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// این مسیر برای صورت‌های مالی میاندوره‌ای (۳/۶/۹ ماهه، حسابرسی‌شده یا نشده) صدا زده می‌شود —
// پستی جدا از کارت خلاصهٔ فعلی می‌سازد. ورودی فقط فیلدهای از قبل استخراج/محاسبه‌شده و گراندد
// است — هرگز متن خام اکسل به Gemini داده نمی‌شود.
const SYSTEM = `تو دستیار تحلیل‌نویس «بورس سنج» هستی (نه «بورسنج» — همیشه همین املا).
یک صورت مالی میاندوره‌ای (۳/۶/۹ ماهه) یک نماد بورسی به‌صورت فیلدهای ساختاریافته به تو داده
می‌شود. باید یک تحلیل فارسی برای پست تلگرامی بنویسی.

قوانین سخت‌گیرانه:
- هیچ عدد یا ادعایی که در فیلدهای داده‌شده نیست اختراع نکن. اگر فیلدی null یا خالی است، آن
  بخش را صریحاً حذف کن — هرگز حدس نزن یا برداشت آزاد از فیلدهای دیگر نکن.
- توصیه خرید/فروش مستقیم نده.
- لحن فارسی طبیعی و روان مالی، نه ترجمه‌ای از انگلیسی.
- همهٔ اعداد با ارقام فارسی (۰-۹) نوشته شوند، نه لاتین. مبالغ ورودی همه به میلیون ریال‌اند —
  در متن یا به همون واحد (میلیون ریال) اشاره کن یا با تقسیم دقیق بر ۱۰٬۰۰۰ به «میلیارد تومان»
  تبدیل کن؛ هرگز عدد خام میلیون‌ریالی را بدون تبدیل «میلیارد تومان» یا «همت» نخوان (خطای واحد).
- فیلدهای receivablesChange/inventoryChange نسبت به «پایان سال مالی قبل» است، نه دورهٔ مشابه
  سال قبل — دقیقاً همین را در متن مشخص کن، با YoY درآمد/سود قاطی نکن.
- فرمت خروجی HTML مجاز تلگرام است: فقط تگ‌های <b> <i> <u> <s> <code> مجازند؛ برای خط جدید
  از \\n استفاده کن، هرگز از <br> یا تگ دیگری استفاده نکن.
- ساختار: عنوان کوتاه (نماد + دورهٔ N ماهه)، روند درآمد/سود ناخالص/عملیاتی/خالص نسبت به دورهٔ
  مشابه سال قبل، حاشیه‌های سود (ناخالص/خالص)، جریان نقد عملیاتی (در صورت وجود داده)، نسبت جاری
  و نسبت بدهی، روند سرمایه در گردش (مطالبات/موجودی نسبت به پایان سال مالی قبل)، و در پایان
  همیشه دقیقاً همین جمله به‌عنوان سطر مجزا:
  «این تحلیل صرفاً جنبهٔ اطلاع‌رسانی دارد و توصیهٔ خرید/فروش نیست.»
- خروجی را فقط به‌صورت JSON با فیلد "html" برگردان، بدون Markdown fence یا توضیح اضافه.`

type Ratios = { gross_margin: number | null; net_margin: number | null; current_ratio: number | null; debt_ratio: number | null; roe: number | null }
type CashFlow = { operating: number | null; investing: number | null; financing: number | null }
type WorkingCapital = { receivablesChange: number | null; inventoryChange: number | null }

interface Body {
  symbol?: string
  period?: string
  months?: number
  audited?: boolean
  revenue?: number | null
  revenueYoY?: number | null
  gross?: number | null
  grossYoY?: number | null
  op?: number | null
  opYoY?: number | null
  net?: number | null
  netYoY?: number | null
  eps?: number | null
  finCost?: number | null
  finCostYoY?: number | null
  ratios?: Ratios | null
  cashFlow?: CashFlow | null
  workingCapital?: WorkingCapital | null
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

  const { symbol, period, months } = body
  if (!symbol || !period || !months) {
    return NextResponse.json({ ok: false, error: 'symbol، period و months الزامی‌اند' }, { status: 400 })
  }

  const userPrompt = JSON.stringify({
    symbol,
    period,
    months,
    audited: body.audited ?? false,
    revenue: body.revenue ?? null,
    revenueYoY: body.revenueYoY ?? null,
    gross: body.gross ?? null,
    grossYoY: body.grossYoY ?? null,
    op: body.op ?? null,
    opYoY: body.opYoY ?? null,
    net: body.net ?? null,
    netYoY: body.netYoY ?? null,
    eps: body.eps ?? null,
    finCost: body.finCost ?? null,
    finCostYoY: body.finCostYoY ?? null,
    ratios: body.ratios ?? null,
    cashFlow: body.cashFlow ?? null,
    workingCapital: body.workingCapital ?? null,
  })

  const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
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

    // محدودیت sendMessage تلگرام: ۴۰۹۶ کاراکتر
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
