import type { Metadata } from 'next'
import Link from 'next/link'
import JsonLd from '../../components/JsonLd'
import { SITE_URL } from '../../lib/site'

export const metadata: Metadata = {
  title: 'بهترین سایت‌های تحلیل بورس ایران (۱۴۰۵) — مقایسه و معرفی',
  description:
    'مقایسه صادقانه بهترین سایت‌های تحلیل بورس ایران در سال ۱۴۰۵: بورس سنج، ره‌آورد ۳۶۵، TSETMC، فیپیران، سهامیاب و بیشتر — نقاط قوت، ضعف و مناسب برای چه کسی.',
  alternates: { canonical: '/best-bourse-tools' },
}

const LAST_UPDATED = '۱ مرداد ۱۴۰۵'

type Site = {
  name: string
  url: string
  free: string
  strengths: string[]
  weaknesses: string[]
  bestFor: string
  isOurs?: boolean
}

const SITES: Site[] = [
  {
    name: 'بورس سنج',
    url: SITE_URL,
    free: 'کاملاً رایگان',
    strengths: [
      'داده لحظه‌ای سهام و صندوق‌های طلا، نقره و زعفران به‌همراه محاسبه حباب',
      'تحلیل بنیادی خودکار از گزارش‌های کدال (فروش ماهانه، سود، حاشیه سود)',
      'سیگنال‌های داده‌محور با سابقه شفاف و قابل راستی‌آزمایی (صفحه Track Record)',
      'دستیار هوش مصنوعی برای پرسش و پاسخ درباره نمادها',
      'اسکرینر تکنیکال، بک‌تست استراتژی و نقشه بازار',
    ],
    weaknesses: [
      'سایت جوان‌تری است و کامیونیتی کاربری کوچک‌تری نسبت به سایت‌های قدیمی دارد',
      'نمودار تکنیکال آن به اندازه ابزارهای تخصصی چارت قابل شخصی‌سازی نیست',
    ],
    bestFor: 'کسانی که رصد روزانه سهام و صندوق‌های کالایی + تحلیل بنیادی آماده و رایگان می‌خواهند',
    isOurs: true,
  },
  {
    name: 'ره‌آورد ۳۶۵',
    url: 'https://rahavard365.com',
    free: 'بخشی رایگان، امکانات کامل با اشتراک پولی',
    strengths: [
      'قدیمی‌ترین و شناخته‌شده‌ترین مرجع تحلیل بازار سرمایه ایران',
      'نمودار تکنیکال پیشرفته و داده‌های بنیادی گسترده',
      'امکان مقایسه چند نماد و ابزارهای متنوع نموداری',
    ],
    weaknesses: ['امکانات کلیدی پشت پرداخت اشتراک است', 'برای کاربر تازه‌کار می‌تواند شلوغ و پیچیده باشد'],
    bestFor: 'تحلیل‌گران حرفه‌ای که حاضرند برای چارت و داده عمیق‌تر هزینه کنند',
  },
  {
    name: 'TSETMC (تابلوی رسمی بورس)',
    url: 'http://tsetmc.com',
    free: 'رایگان',
    strengths: ['منبع رسمی و مرجع داده لحظه‌ای معاملات بورس و فرابورس', 'کامل‌ترین جزئیات تابلو (صف‌ها، حقیقی/حقوقی، ریزمعاملات)'],
    weaknesses: ['رابط کاربری قدیمی و غیرواکنش‌گرا، روی موبایل سخت‌استفاده', 'هیچ تحلیل یا خلاصه‌سازی‌ای ارائه نمی‌دهد؛ فقط داده خام'],
    bestFor: 'کسانی که داده خام رسمی تابلو را می‌خواهند و با رابط قدیمی مشکلی ندارند',
  },
  {
    name: 'فیپیران',
    url: 'https://fipiran.ir',
    free: 'رایگان',
    strengths: ['مرجع رسمی داده صندوق‌های سرمایه‌گذاری (NAV، بازدهی، مقایسه)', 'وابسته به شرکت مدیریت فناوری بورس تهران؛ داده معتبر'],
    weaknesses: ['تمرکز اصلی روی صندوق‌هاست، نه تحلیل سهام', 'رابط کاربری و سرعت سایت ضعف دارد'],
    bestFor: 'مقایسه رسمی بازدهی صندوق‌های سرمایه‌گذاری',
  },
  {
    name: 'سهامیاب',
    url: 'https://www.sahamyab.com',
    free: 'بخش عمده رایگان',
    strengths: ['بزرگ‌ترین شبکه اجتماعی سهام‌داران ایران؛ جو و سنتیمنت بازار از گفت‌وگوها', 'پوشش خبری و تحلیل‌های کاربران'],
    weaknesses: ['کیفیت تحلیل‌ها نامتوازن است؛ شایعه و سیگنال بی‌پشتوانه هم زیاد دیده می‌شود', 'ابزار تحلیلی عمیق ندارد'],
    bestFor: 'دنبال‌کردن جو بازار و گفت‌وگوی سهام‌داران درباره نمادها',
  },
  {
    name: 'بورس‌ویو',
    url: 'https://www.bourseview.com',
    free: 'با اشتراک پولی',
    strengths: ['ابزار تکنیکال حرفه‌ای با چارت پیشرفته', 'داده‌های بنیادی و صورت‌های مالی ساخت‌یافته'],
    weaknesses: ['پولی است', 'برای کاربر عادی بیش از نیاز پیچیده است'],
    bestFor: 'تکنیکالیست‌های جدی و تحلیل‌گران نهادی',
  },
  {
    name: 'سهمتو',
    url: 'https://sahmeto.com',
    free: 'بخشی رایگان، امکانات کامل پولی',
    strengths: ['رتبه‌بندی تحلیل‌گران و سیگنال‌دهنده‌ها بر اساس عملکرد', 'جمع‌بندی سیگنال شبکه‌های اجتماعی'],
    weaknesses: ['کیفیت خروجی به کیفیت تحلیل‌گران شبکه‌های اجتماعی وابسته است', 'امکانات کامل نیازمند اشتراک است'],
    bestFor: 'کسانی که می‌خواهند بدانند کدام سیگنال‌دهنده واقعاً عملکرد خوبی داشته',
  },
]

const FAQ = [
  {
    q: 'بهترین سایت رایگان تحلیل بورس کدام است؟',
    a: 'برای داده خام رسمی TSETMC، برای صندوق‌ها فیپیران و برای رصد لحظه‌ای + تحلیل بنیادی آماده و سیگنال با سابقه شفاف، بورس سنج کاملاً رایگان است.',
  },
  {
    q: 'آیا این سایت‌ها توصیه خرید و فروش می‌دهند؟',
    a: 'هیچ‌کدام از این ابزارها جایگزین تصمیم شخصی نیستند. تحلیل‌ها و سیگنال‌ها صرفاً جنبه اطلاع‌رسانی دارند و مسئولیت هر معامله بر عهده خود سرمایه‌گذار است.',
  },
  {
    q: 'برای شروع کدام سایت مناسب‌تر است؟',
    a: 'اگر تازه‌کار هستید، سایتی با رابط ساده و داده خلاصه‌شده (مثل بورس سنج یا بخش رایگان ره‌آورد ۳۶۵) نقطه شروع بهتری از داده خام TSETMC است.',
  },
]

export default function BestBourseToolsPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'بهترین سایت‌های تحلیل بورس', item: `${SITE_URL}/best-bourse-tools` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'بهترین سایت‌های تحلیل بورس ایران ۱۴۰۵',
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      numberOfItems: SITES.length,
      itemListElement: SITES.map((s, i) => ({
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
        <span>بهترین سایت‌های تحلیل بورس</span>
      </nav>

      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.6 }}>
        بهترین سایت‌های تحلیل بورس ایران (۱۴۰۵)
      </h1>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>آخرین به‌روزرسانی: {LAST_UPDATED}</div>

      <p style={{ fontSize: 16, lineHeight: 2, color: 'var(--text-2)', margin: '0 0 14px' }}>
        در این صفحه مهم‌ترین سایت‌های رصد و تحلیل بازار سرمایه ایران را کنار هم گذاشته‌ایم: از منابع رسمی داده تا
        ابزارهای تحلیلی رایگان و پولی. برای هرکدام نقاط قوت، ضعف و این‌که مناسب چه کاربری است را صادقانه نوشته‌ایم.
      </p>

      <div style={{
        padding: '12px 16px', borderRadius: 12, marginBottom: 28,
        background: 'var(--card)', border: '1px solid var(--border)',
        fontSize: 14, lineHeight: 1.9, color: 'var(--text-2)',
      }}>
        <strong style={{ color: 'var(--text)' }}>شفافیت:</strong> بورس سنج متعلق به ماست و طبیعتاً در این فهرست حضور دارد.
        سعی کرده‌ایم قوت رقبا را همان‌قدر صادقانه بنویسیم که قوت خودمان را. امکانات و قیمت سایت‌های دیگر ممکن است
        تغییر کرده باشد — همیشه از سایت خودشان چک کنید.
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>معیارهای مقایسه</h2>
      <p style={{ fontSize: 15, lineHeight: 2, color: 'var(--text-2)', margin: '0 0 28px' }}>
        رایگان یا پولی بودن، عمق داده (لحظه‌ای، بنیادی، صندوق‌ها)، وجود تحلیل آماده در برابر داده خام،
        شفافیت سابقه سیگنال‌ها، و قابل‌استفاده بودن روی موبایل.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>معرفی سایت‌ها</h2>
      <div style={{ display: 'grid', gap: 16, marginBottom: 36 }}>
        {SITES.map((s, i) => (
          <section key={s.name} style={{
            padding: '18px 20px', borderRadius: 14,
            background: 'var(--card)',
            border: s.isOurs ? '1px solid var(--brand)' : '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                {i + 1}. {s.name}
              </h3>
              {s.isOurs && (
                <span style={{ fontSize: 12, color: 'var(--brand)', border: '1px solid var(--brand)', borderRadius: 999, padding: '1px 10px' }}>
                  سایت ما
                </span>
              )}
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{s.free}</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 2, color: 'var(--text-2)' }}>
              <div style={{ marginBottom: 6 }}>
                <strong style={{ color: 'var(--text)' }}>نقاط قوت:</strong>
                <ul style={{ margin: '4px 0 0', paddingRight: 20 }}>
                  {s.strengths.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </div>
              <div style={{ marginBottom: 6 }}>
                <strong style={{ color: 'var(--text)' }}>نقاط ضعف:</strong>
                <ul style={{ margin: '4px 0 0', paddingRight: 20 }}>
                  {s.weaknesses.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </div>
              <div><strong style={{ color: 'var(--text)' }}>مناسب برای:</strong> {s.bestFor}</div>
              {!s.isOurs && (
                <div style={{ marginTop: 6 }}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--brand)', fontSize: 13 }}>
                    وب‌سایت {s.name} ↗
                  </a>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      <div style={{
        padding: '18px 20px', borderRadius: 14, marginBottom: 36,
        background: 'var(--card)', border: '1px solid var(--border)',
        fontSize: 15, lineHeight: 2, color: 'var(--text-2)',
      }}>
        <strong style={{ color: 'var(--text)' }}>جمع‌بندی:</strong> هیچ سایت واحدی برای همه بهترین نیست.
        داده رسمی خام را از TSETMC، مقایسه رسمی صندوق‌ها را از فیپیران و چارت حرفه‌ای را از ابزارهای پولی بگیرید.
        اگر یک داشبورد رایگان می‌خواهید که سهام، صندوق‌های طلا و نقره، تحلیل بنیادی کدال و سیگنال با سابقه شفاف را
        یک‌جا داشته باشد، از{' '}
        <Link href="/" style={{ color: 'var(--brand)', fontWeight: 700 }}>بورس سنج</Link> شروع کنید —
        مثلاً <Link href="/funds" style={{ color: 'var(--brand)' }}>حباب صندوق‌های طلا</Link>،{' '}
        <Link href="/signals" style={{ color: 'var(--brand)' }}>سیگنال‌ها</Link> و{' '}
        <Link href="/track-record" style={{ color: 'var(--brand)' }}>سابقه شفاف آن‌ها</Link>.
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
        <Link href="/alternatives/rahavard365" style={{ color: 'var(--brand)' }}>جایگزین‌های رایگان ره‌آورد ۳۶۵</Link>
      </p>

      <p style={{ fontSize: 13, lineHeight: 2, color: 'var(--text-2)' }}>
        این مقایسه صرفاً جنبه اطلاع‌رسانی دارد و توصیه سرمایه‌گذاری نیست. اطلاعات سایت‌های دیگر بر اساس منابع عمومی
        در تاریخ به‌روزرسانی صفحه گردآوری شده و ممکن است تغییر کرده باشد.
      </p>
    </main>
  )
}
