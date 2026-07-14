import { NextRequest, NextResponse } from 'next/server'

// پروکسی کدال برای هرمس (ایجنت خارجی) — کدال/BrsAPI به IP خارج جواب نمی‌دهد،
// این سایت (Render) هم خارج از ایرانه ولی هرمس فقط به همین می‌رسه، پس واسط می‌شویم.
// فیلدها و فیلتر دسته دقیقاً طبق درخواست هرمس (سشن e17840c0b5a7).

export const dynamic = 'force-dynamic'

// کلید «رایگان» که هرمس داد نامعتبر بود (BrsAPI: 401 unauthorized) — از همان کلید
// موجود پروژه استفاده می‌کنیم (همان‌جایی که scripts/codal-watch.js و بقیه استفاده می‌کنند)
const KEY = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const PASS_PARAMS = ['l18', 'date_start', 'date_end', 'page', 'length', 'category', 'audited', 'unaudited']

// این دسته‌ها را هرمس اصلاً لازم ندارد — حذف سمت سرور تا وقت/بودجهٔ LLM او تلف نشود
const SKIP_TITLE = /معرفی.*هیئت ?مدیره|تغییر.*هیئت ?مدیره|آگهی ثبت تصمیمات مجمع|کمیته (انتصابات|ریسک|حسابرسی)|تصمیمات مجمع عمومی عادی سالیانه|تغییر سهامدار عمده/

type RawItem = {
  l18?: string; l30?: string; title?: string; code?: string
  date_title?: string; date_publish?: string; time_publish?: string
  link?: string; link_pdf?: string
}

export async function GET(req: NextRequest) {
  const qs = new URLSearchParams()
  for (const k of PASS_PARAMS) {
    const v = req.nextUrl.searchParams.get(k)
    if (v) qs.set(k, v)
  }

  const res = await fetch(`https://Api.BrsApi.ir/Codal/Announcement.php?key=${KEY}&${qs}`, {
    signal: AbortSignal.timeout(30_000),
  })
  const data = await res.json()
  if (data?.successful === false) {
    return NextResponse.json({ error: data.message_error || 'BrsAPI error' }, {
      status: 502, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
    })
  }
  const list: RawItem[] = Array.isArray(data) ? data : (data?.announcement ?? [])

  const announcement = list
    .filter(a => a.title && !SKIP_TITLE.test(a.title))
    .map(a => ({
      l18: a.l18, l30: a.l30, title: a.title, code: a.code,
      date_title: a.date_title, date_publish: a.date_publish, time_publish: a.time_publish,
      link: a.link, link_pdf: a.link_pdf,
    }))

  return NextResponse.json({ announcement }, {
    headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  })
}
