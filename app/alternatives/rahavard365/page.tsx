import type { Metadata } from 'next'
import Link from 'next/link'
import JsonLd from '../../../components/JsonLd'
import { SITE_URL } from '../../../lib/site'

export const metadata: Metadata = {
  title: 'جایگزین‌های ره‌آورد ۳۶۵ (رایگان و پولی) — ۱۴۰۵',
  description:
    'دنبال جایگزین ره‌آورد ۳۶۵ هستید؟ مقایسه گزینه‌های رایگان و پولی: بورس سنج، TSETMC، فیپیران، بورس‌ویو و سهامیاب — با نقاط قوت و ضعف هرکدام.',
  alternates: { canonical: '/alternatives/rahavard365' },
}

const LAST_UPDATED = '۱ مرداد ۱۴۰۵'

type Alt = {
  name: string
  url: string
  free: string
  summary: string
  bestFor: string
  isOurs?: boolean
}

const ALTERNATIVES: Alt[] = [
  {
    name: 'بورس سنج',
    url: SITE_URL,
    free: 'کاملاً رایگان',
    summary:
      'داشبورد لحظه‌ای سهام و صندوق‌های طلا، نقره و زعفران با محاسبه حباب، تحلیل بنیادی خودکار از گزارش‌های کدال، سیگنال با سابقه شفاف و دستیار هوش مصنوعی. چارت آن به عمق ره‌آورد نمی‌رسد، اما بخش بزرگی از نیاز روزانه (رصد، بنیادی، صندوق‌ها) را بدون هزینه پوشش می‌دهد.',
    bestFor: 'رصد روزانه + تحلیل بنیادی آماده، بدون پرداخت اشتراک',
    isOurs: true,
  },
  {
    name: 'TSETMC (تابلوی رسمی بورس)',
    url: 'http://tsetmc.com',
    free: 'رایگان',
    summary:
      'منبع رسمی داده لحظه‌ای معاملات. هر داده‌ای که ره‌آورد نمایش می‌دهد ریشه در همین‌جا دارد؛ اما فقط داده خام است، بدون تحلیل، و رابط آن قدیمی و روی موبایل سخت‌استفاده است.',
    bestFor: 'جزئیات کامل تابلو (صف‌ها، حقیقی/حقوقی) به‌صورت رسمی و رایگان',
  },
  {
    name: 'فیپیران',
    url: 'https://fipiran.ir',
    free: 'رایگان',
    summary:
      'مرجع رسمی داده صندوق‌های سرمایه‌گذاری زیر نظر شرکت مدیریت فناوری بورس تهران. برای مقایسه NAV و بازدهی صندوق‌ها جایگزین معتبری است، ولی برای تحلیل سهام کاربرد محدودی دارد.',
    bestFor: 'داده رسمی و مقایسه بازدهی صندوق‌ها',
  },
  {
    name: 'بورس‌ویو',
    url: 'https://www.bourseview.com',
    free: 'اشتراک پولی',
    summary:
      'جایگزین پولی در همان رده ره‌آورد با تمرکز بیشتر بر چارت تکنیکال حرفه‌ای و صورت‌های مالی ساخت‌یافته. اگر از ره‌آورد به‌خاطر کیفیت چارت ناراضی هستید، گزینه جدی‌تری است — اما ارزان‌تر نیست.',
    bestFor: 'تکنیکالیست‌های حرفه‌ای و کاربران نهادی',
  },
  {
    name: 'سهامیاب',
    url: 'https://www.sahamyab.com',
    free: 'بخش عمده رایگان',
    summary:
      'بیش از آن‌که ابزار تحلیل باشد، شبکه اجتماعی سهام‌داران است. جایگزین ره‌آورد برای تحلیل نیست، اما برای حس‌کردن جو بازار و گفت‌وگو درباره نمادها مکمل خوبی است. کیفیت تحلیل کاربران نامتوازن است.',
    bestFor: 'سنتیمنت بازار و گفت‌وگوی سهام‌داران',
  },
]

const FAQ = [
  {
    q: 'آیا جایگزین کاملاً رایگان برای ره‌آورد ۳۶۵ وجود دارد؟',
    a: 'یک سایت واحد که همه امکانات ره‌آورد را رایگان بدهد وجود ندارد، اما ترکیب TSETMC (داده خام)، فیپیران (صندوق‌ها) و بورس سنج (رصد لحظه‌ای + تحلیل بنیادی + سیگنال) بخش بزرگی از نیازها را بدون هزینه پوشش می‌دهد.',
  },
  {
    q: 'قوت اصلی ره‌آورد ۳۶۵ که جایگزین‌ها ندارند چیست؟',
    a: 'عمق چارت تکنیکال، سابقه طولانی داده‌های بنیادی و جایگاه تثبیت‌شده‌اش به‌عنوان استاندارد بازار. اگر این‌ها برایتان حیاتی است، اشتراک آن می‌تواند ارزش داشته باشد.',
  },
]

export default function RahavardAlternativesPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'جایگزین‌های ره‌آورد ۳۶۵', item: `${SITE_URL}/alternatives/rahavard365` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'جایگزین‌های ره‌آورد ۳۶۵',
      numberOfItems: ALTERNATIVES.length,
      itemListElement: ALTERNATIVES.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: s.name,
        url: s.url,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ]

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 6vw 80px', direction: 'rtl', fontFamily: 'Vazirmatn, Arial, sans-serif' }}>
      <JsonLd data={jsonLd} />

      <nav style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 18 }}>
        <Link href="/" style={{ color: 'var(--brand)' }}>خانه</Link>
        {' › '}
        <Link href="/best-bourse-tools" style={{ color: 'var(--brand)' }}>مقایسه سایت‌های بورسی</Link>
        {' › '}
        <span>جایگزین‌های ره‌آورد ۳۶۵</span>
      </nav>

      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.6 }}>
        جایگزین‌های ره‌آورد ۳۶۵ — رایگان و پولی (۱۴۰۵)
      </h1>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>آخرین به‌روزرسانی: {LAST_UPDATED}</div>

      <p style={{ fontSize: 16, lineHeight: 2, color: 'var(--text-2)', margin: '0 0 14px' }}>
        ره‌آورد ۳۶۵ سال‌هاست استاندارد تحلیل بازار سرمایه ایران است و نقاط قوت واقعی دارد: چارت پیشرفته و داده بنیادی
        عمیق. اما امکانات کلیدی‌اش پولی است و برای خیلی از کاربران بیش از نیازشان پیچیده است. در این صفحه گزینه‌های
        جایگزین — رایگان و پولی — را با نگاه صادقانه معرفی می‌کنیم.
      </p>

      <div style={{
        padding: '12px 16px', borderRadius: 12, marginBottom: 28,
        background: 'var(--card)', border: '1px solid var(--border)',
        fontSize: 14, lineHeight: 1.9, color: 'var(--text-2)',
      }}>
        <strong style={{ color: 'var(--text)' }}>شفافیت:</strong> بورس سنج متعلق به ماست. امکانات و قیمت
        سایت‌های دیگر ممکن است از تاریخ به‌روزرسانی این صفحه تغییر کرده باشد؛ همیشه از سایت خودشان چک کنید.
      </div>

      <div style={{ display: 'grid', gap: 16, marginBottom: 36 }}>
        {ALTERNATIVES.map((s, i) => (
          <section key={s.name} style={{
            padding: '18px 20px', borderRadius: 14,
            background: 'var(--card)',
            border: s.isOurs ? '1px solid var(--brand)' : '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                {i + 1}. {s.name}
              </h2>
              {s.isOurs && (
                <span style={{ fontSize: 12, color: 'var(--brand)', border: '1px solid var(--brand)', borderRadius: 999, padding: '1px 10px' }}>
                  سایت ما
                </span>
              )}
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{s.free}</span>
            </div>
            <p style={{ fontSize: 14, lineHeight: 2, color: 'var(--text-2)', margin: '0 0 8px' }}>{s.summary}</p>
            <div style={{ fontSize: 14, lineHeight: 2, color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--text)' }}>مناسب برای:</strong> {s.bestFor}
            </div>
            {!s.isOurs && (
              <div style={{ marginTop: 6 }}>
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--brand)', fontSize: 13 }}>
                  وب‌سایت {s.name} ↗
                </a>
              </div>
            )}
          </section>
        ))}
      </div>

      <div style={{
        padding: '18px 20px', borderRadius: 14, marginBottom: 36,
        background: 'var(--card)', border: '1px solid var(--border)',
        fontSize: 15, lineHeight: 2, color: 'var(--text-2)',
      }}>
        <strong style={{ color: 'var(--text)' }}>جمع‌بندی:</strong> اگر چارت حرفه‌ای برایتان حیاتی است، ره‌آورد یا
        بورس‌ویو را نگه دارید. اگر رصد روزانه، صندوق‌های طلا و نقره، تحلیل بنیادی کدال و سیگنال با سابقه شفاف
        می‌خواهید، <Link href="/" style={{ color: 'var(--brand)', fontWeight: 700 }}>بورس سنج</Link> را رایگان امتحان کنید —
        از <Link href="/funds" style={{ color: 'var(--brand)' }}>صندوق‌ها</Link>،{' '}
        <Link href="/fundamentals" style={{ color: 'var(--brand)' }}>تحلیل بنیادی</Link> یا{' '}
        <Link href="/signals" style={{ color: 'var(--brand)' }}>سیگنال‌ها</Link> شروع کنید.
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '0 0 14px' }}>پرسش‌های پرتکرار</h2>
      <div style={{ display: 'grid', gap: 12, marginBottom: 36 }}>
        {FAQ.map((f) => (
          <div key={f.q} style={{ padding: '14px 18px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>{f.q}</div>
            <div style={{ fontSize: 14, lineHeight: 2, color: 'var(--text-2)' }}>{f.a}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 14, lineHeight: 2, color: 'var(--text-2)', marginBottom: 20 }}>
        مطلب مرتبط:{' '}
        <Link href="/best-bourse-tools" style={{ color: 'var(--brand)' }}>بهترین سایت‌های تحلیل بورس ایران (۱۴۰۵)</Link>
      </p>

      <p style={{ fontSize: 13, lineHeight: 2, color: 'var(--text-2)' }}>
        این مقایسه صرفاً جنبه اطلاع‌رسانی دارد و توصیه سرمایه‌گذاری نیست. «ره‌آورد ۳۶۵» متعلق به شرکت سازنده خود است
        و این صفحه هیچ وابستگی‌ای به آن ندارد.
      </p>
    </main>
  )
}
