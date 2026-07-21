import { NextRequest, NextResponse } from 'next/server'
import { callNarrate } from '@/lib/llmNarrate'
import { rateLimit } from '../../../lib/rateLimit'

export const dynamic = 'force-dynamic'

// دستیار زبان طبیعی برای فیلتر صندوق‌ها — Gemini فقط جمله کاربر را به یک فیلتر ساختاریافته
// ترجمه می‌کند؛ خودِ فیلترکردن روی داده واقعی در کلاینت انجام می‌شود، پس هیچ عددی از مدل
// مستقیماً به کاربر نمایش داده نمی‌شود (بدون ریسک اختراع عدد/آمار).
const SYSTEM = `تو دستیار «بورس سنج» هستی. جمله فارسی کاربر درباره فیلترکردن صندوق‌های
سرمایه‌گذاری را می‌خوانی و آن را به یک فیلتر ساختاریافته JSON تبدیل می‌کنی.

فیلدهای مجاز خروجی (فقط همین‌ها، هرکدام نامرتبط با درخواست کاربر را null بگذار):
- "category": یکی از "طلا"|"نقره"|"زعفران"|"سهامی"|"درآمد ثابت"|"بخشی"|"اهرمی"|null
- "sortBy": یکی از "score"|"changePct"|"weeklyReturn"|"tradeValue"|"netFlow"|"buyPower"|null
  توجه: "changePct" فقط بازدهِ همین امروز است (تغییر قیمت نسبت به دیروز)؛ "weeklyReturn"
  بازده تقریبی یک هفته اخیر (آخرین ~۵ روز کاری) است. وقتی کاربر می‌گوید «امروز»/«روزانه» از
  changePct و وقتی می‌گوید «هفتگی»/«این هفته»/«یک هفته اخیر» از weeklyReturn استفاده کن —
  این دو را با هم اشتباه نگیر.
- "sortDir": "asc" یا "desc" (پیش‌فرض "desc" اگر مشخص نبود ولی sortBy ست شده)
- "minChangePct": عدد یا null — حداقل درصد تغییر قیمت امروز
- "maxChangePct": عدد یا null — حداکثر درصد تغییر قیمت امروز
- "minTradeValue": عدد یا null — حداقل ارزش معاملات (میلیارد تومان)
- "onlyPositiveFlow": true/false/null — فقط صندوق‌هایی با ورود پول حقیقی مثبت
- "onlyNegativeFlow": true/false/null — فقط صندوق‌هایی با خروج پول حقیقی
- "topHoldingQuery": نام سهم/دارایی (رشته) یا null — وقتی کاربر می‌پرسد کدام صندوق (سهامی/مختلط)
  بیشترین وزن را روی یک سهم خاص دارد (مثلاً «صندوق سهامی با بیشترین وزن بانک ملت» یا
  «کدوم صندوق بیشترین فولاد مبارکه رو داره»)، فقط نام دقیق سهم را این‌جا بگذار (مثلاً «بانک ملت»)
  و بقیه فیلدها را null بگذار — این حالت کاملاً جدا از فیلترهای عددی بالاست.
- "fundReturnFundName": نام صندوق (رشته) یا null — وقتی کاربر بازده یک صندوق مشخص را در یک
  بازه زمانی می‌پرسد (مثلاً «بازده صندوق پایا تو یک ماه گذشته چقدره؟» یا «آسام امسال چقدر بازده داده؟»)،
  فقط نام دقیق صندوق را بگذار و بقیه فیلدها را null بگذار.
- "fundReturnPeriod": یکی از "day"|"week"|"month"|"quarter"|"year"|null — فقط وقتی
  fundReturnFundName ست شده، بازه زمانی درخواستی را اینجا بگذار (پیش‌فرض "month" اگر نامشخص بود).

قوانین:
- برای عبارت‌های کیفی مثل «قوی»/«زیاد»/«ضعیف»، یک آستانه عددی معقول خودت انتخاب کن
  (مثلاً «رشد قوی» یعنی minChangePct حدود ۲ تا ۳).
- اگر کاربر دسته دارایی (طلا/نقره/سهام و ...) نگفت، category را null بگذار.
- اگر topHoldingQuery ست شد، بقیه فیلدهای عددی/بولین/fundReturn* را null بگذار.
- اگر fundReturnFundName ست شد، بقیه فیلدهای عددی/بولین/topHoldingQuery را null بگذار.
- فقط همان JSON را برگردان، بدون Markdown fence یا توضیح اضافه.`

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    category: { type: 'STRING', nullable: true },
    sortBy: { type: 'STRING', nullable: true },
    sortDir: { type: 'STRING', nullable: true },
    minChangePct: { type: 'NUMBER', nullable: true },
    maxChangePct: { type: 'NUMBER', nullable: true },
    minTradeValue: { type: 'NUMBER', nullable: true },
    onlyPositiveFlow: { type: 'BOOLEAN', nullable: true },
    onlyNegativeFlow: { type: 'BOOLEAN', nullable: true },
    topHoldingQuery: { type: 'STRING', nullable: true },
    fundReturnFundName: { type: 'STRING', nullable: true },
    fundReturnPeriod: { type: 'STRING', nullable: true },
  },
  required: [],
}
const OPENROUTER_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: ['string', 'null'] },
    sortBy: { type: ['string', 'null'] },
    sortDir: { type: ['string', 'null'] },
    minChangePct: { type: ['number', 'null'] },
    maxChangePct: { type: ['number', 'null'] },
    minTradeValue: { type: ['number', 'null'] },
    onlyPositiveFlow: { type: ['boolean', 'null'] },
    onlyNegativeFlow: { type: ['boolean', 'null'] },
    topHoldingQuery: { type: ['string', 'null'] },
    fundReturnFundName: { type: ['string', 'null'] },
    fundReturnPeriod: { type: ['string', 'null'] },
  },
  required: [],
  additionalProperties: false,
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  if (!rateLimit(`fund-filter-nl:${ip}`, 10, 60_000)) {
    return NextResponse.json({ ok: false, error: 'تعداد درخواست‌ها زیاد است' }, { status: 429 })
  }

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!OPENROUTER_KEY && !GEMINI_KEY) {
    return NextResponse.json({ ok: false, error: 'OPENROUTER_API_KEY/GEMINI_API_KEY تنظیم نشده' }, { status: 500 })
  }

  let body: { query?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.query?.trim()) return NextResponse.json({ ok: false, error: 'query الزامی است' }, { status: 400 })

  try {
    const raw = await callNarrate(GEMINI_KEY, OPENROUTER_KEY, SYSTEM, body.query, GEMINI_SCHEMA, OPENROUTER_SCHEMA, 'fund_filter', 250)
    if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: 502 })
    let filter: Record<string, unknown>
    try {
      filter = JSON.parse(raw.text)
    } catch {
      return NextResponse.json({ ok: false, error: 'خروجی غیرقابل‌پردازش از مدل' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, filter })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }, { status: 502 })
  }
}
