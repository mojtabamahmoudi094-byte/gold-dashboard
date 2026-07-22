import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rateLimit'
import { clientIp } from '../../../lib/clientIp'

// پروکسی کدال برای هرمس (ایجنت خارجی) — کدال/BrsAPI به IP خارج جواب نمی‌دهد،
// این سایت (Render) هم خارج از ایرانه ولی هرمس فقط به همین می‌رسه، پس واسط می‌شویم.
// فیلدها و فیلتر دسته دقیقاً طبق درخواست هرمس (سشن e17840c0b5a7).
// تماس سرور-به-سرور است، نه از مرورگر — CORS لازم نیست، rate-limit جلوی مصرف بی‌رویه کلید BrsAPI را می‌گیرد.

export const dynamic = 'force-dynamic'

// کلید از env — hardcode fallback حذف شد (کلید قبلی در ریپوی عمومی افشا و باید revoke شود)
const KEY = process.env.BRSAPI_KEY
const PASS_PARAMS = ['l18', 'date_start', 'date_end', 'page', 'length', 'category', 'audited', 'unaudited']

// این دسته‌ها را هرمس اصلاً لازم ندارد — حذف سمت سرور تا وقت/بودجهٔ LLM او تلف نشود
const SKIP_TITLE = /معرفی.*هیئت ?مدیره|تغییر.*هیئت ?مدیره|آگهی ثبت تصمیمات مجمع|کمیته (انتصابات|ریسک|حسابرسی)|تصمیمات مجمع عمومی عادی سالیانه|تغییر سهامدار عمده/

type RawItem = {
  l18?: string; l30?: string; title?: string; code?: string
  date_title?: string; date_publish?: string; time_publish?: string
  link?: string; link_pdf?: string
}

export async function GET(req: NextRequest) {
  const ip = clientIp(req)
  if (!rateLimit(`codal-proxy:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: 'تعداد درخواست‌ها زیاد است' }, { status: 429, headers: { 'Cache-Control': 'no-store' } })
  }

  if (!KEY) {
    return NextResponse.json({ error: 'BRSAPI_KEY تنظیم نشده است' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  const qs = new URLSearchParams()
  for (const k of PASS_PARAMS) {
    const v = req.nextUrl.searchParams.get(k)
    if (v) qs.set(k, v)
  }

  let data: unknown
  try {
    const res = await fetch(`https://Api.BrsApi.ir/Codal/Announcement.php?key=${KEY}&${qs}`, {
      signal: AbortSignal.timeout(30_000),
    })
    data = await res.json()
  } catch {
    return NextResponse.json({ error: 'خطا در ارتباط با کدال/BrsAPI' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }

  if ((data as { successful?: boolean })?.successful === false) {
    return NextResponse.json({ error: (data as { message_error?: string }).message_error || 'BrsAPI error' }, {
      status: 502, headers: { 'Cache-Control': 'no-store' },
    })
  }
  const list: RawItem[] = Array.isArray(data) ? data : ((data as { announcement?: RawItem[] })?.announcement ?? [])

  const announcement = list
    .filter(a => a.title && !SKIP_TITLE.test(a.title))
    .map(a => ({
      l18: a.l18, l30: a.l30, title: a.title, code: a.code,
      date_title: a.date_title, date_publish: a.date_publish, time_publish: a.time_publish,
      link: a.link, link_pdf: a.link_pdf,
    }))

  return NextResponse.json({ announcement }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
