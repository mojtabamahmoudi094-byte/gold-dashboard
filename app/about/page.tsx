import type { Metadata } from 'next'
import Link from 'next/link'
import JsonLd from '../../components/JsonLd'
import { SITE_URL } from '../../lib/site'

export const metadata: Metadata = {
  title: 'درباره ما',
  description: 'بورس سنج، سامانه هوشمند رصد، تحلیل و پایش بازار سرمایه ایران — سهام، صندوق‌های طلا و نقره، بازار آتی، تحلیل بنیادی و تکنیکال، پرتفوی و دستیار هوشمند.',
  alternates: { canonical: '/about' },
}

const FEATURES = [
  { title: 'داده لحظه‌ای سهام', desc: 'قیمت، حجم و ارزش معاملات نمادهای بورس و فرابورس تهران به‌صورت زنده.', href: '/stocks' },
  { title: 'صندوق‌های کالایی', desc: 'رصد صندوق‌های طلا، نقره و زعفران، مقایسه NAV با قیمت بازار و حباب.', href: '/funds' },
  { title: 'تحلیل بنیادی خودکار', desc: 'استخراج و خلاصه‌سازی گزارش‌های کدال (فروش ماهانه، فصلی، سود، حاشیه سود) برای هر نماد، با به‌روزرسانی خودکار.', href: '/fundamentals' },
  { title: 'ابزار تکنیکال', desc: 'اسکرینر، بک‌تست استراتژی، استراتژی‌های آماده و نمودار کندل سه‌ساله با تعدیل قیمت برای نمادها و شاخص‌ها.', href: '/technical' },
  { title: 'سیگنال و هشدار', desc: 'سیگنال‌های خرید/فروش مبتنی بر داده و هشدار قیمت، حباب و صف معاملاتی.', href: '/signals' },
  { title: 'کارنامه شفاف سیگنال‌ها', desc: 'نتیجه واقعی هر سیگنال پس از انتشار ثبت و به‌صورت عمومی نمایش داده می‌شود — بدون حذف یا دست‌کاری.', href: '/track-record' },
  { title: 'اسکرینر ارزش‌گذاری', desc: 'مقایسه P/E هر نماد با صدک تاریخی صنعت و شناسایی نمادهای ارزان و گران بازار.', href: '/valuation' },
  { title: 'نقشه بازار', desc: 'نمای گرافیکی کل بازار در یک نگاه؛ صنایع و نمادها بر اساس ارزش و تغییر قیمت.', href: '/market-map' },
  { title: 'مقایسه چندنمادی', desc: 'مقایسه هم‌زمان چند نماد از نظر قیمت، بازده و نسبت‌های بنیادی در یک جدول.', href: '/compare' },
  { title: 'بازار آتی', desc: 'قیمت لحظه‌ای قراردادهای آتی بورس کالای ایران در کنار آتی جهانی طلا، نقره و کالاها.', href: '/futures' },
  { title: 'پرتفوی و پایش زنده', desc: 'ساخت پرتفوی شخصی، هشدار تمرکز صنعتی، بهینه‌سازی وزن‌ها و پایش لحظه‌ای معاملات نمادهای پرتفوی.', href: '/portfolio' },
  { title: 'دستیار هوشمند بازار', desc: 'پرسش و پاسخ فارسی درباره نمادها و گزارش‌های کدال با هوش مصنوعی، مستقیم در صفحه هر نماد.', href: '/stocks' },
]

export default function AboutPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'درباره ما', item: `${SITE_URL}/about` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'درباره بورس سنج',
      url: `${SITE_URL}/about`,
      isPartOf: { '@type': 'WebSite', name: 'بورس سنج', url: SITE_URL },
    },
  ]

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 6vw 80px', direction: 'rtl', fontFamily: 'Vazirmatn, Arial, sans-serif' }}>
      <JsonLd data={jsonLd} />

      <h1 style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', margin: '0 0 16px' }}>درباره بورس سنج</h1>

      <p style={{ fontSize: 16, lineHeight: 2, color: 'var(--text-2)', margin: '0 0 20px' }}>
        بورس سنج سامانه‌ای برای رصد، تحلیل و پایش بازار سرمایه ایران است. هدف ما در دسترس قرار دادن داده‌های
        بازار سهام و صندوق‌های کالایی (طلا، نقره، زعفران) به‌صورت شفاف، سریع و رایگان است — بدون نیاز به منابع
        پراکنده و پرزحمت.
      </p>

      <p style={{ fontSize: 16, lineHeight: 2, color: 'var(--text-2)', margin: '0 0 32px' }}>
        داده‌های سایت از منابع رسمی بازار سرمایه (سامانه کدال، تابلوی معاملات بورس و فرابورس) جمع‌آوری و
        به‌صورت خودکار پردازش می‌شوند. تحلیل‌های بنیادی و سیگنال‌های نمایش‌داده‌شده صرفاً جنبه اطلاع‌رسانی دارند
        و توصیه سرمایه‌گذاری یا خرید و فروش محسوب نمی‌شوند؛ مسئولیت هر تصمیم مالی بر عهده خود کاربر است.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>امکانات سایت</h2>
      <div style={{ display: 'grid', gap: 14, marginBottom: 36 }}>
        {FEATURES.map(f => (
          <Link key={f.title} href={f.href} style={{
            padding: '16px 18px', borderRadius: 14,
            background: 'var(--card)', border: '1px solid var(--border)',
            textDecoration: 'none', display: 'block',
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>{f.title}</div>
            <div style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--text-2)' }}>{f.desc}</div>
          </Link>
        ))}
      </div>

      <p style={{ fontSize: 15, lineHeight: 2, color: 'var(--text-2)' }}>
        سؤال یا پیشنهادی دارید؟ سراغ صفحه{' '}
        <Link href="/contact" style={{ color: 'var(--brand)' }}>تماس با ما</Link> بروید یا از طریق{' '}
        <a href="https://t.me/bourssanjj" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)' }}>
          کانال تلگرام
        </a>{' '}
        با ما در ارتباط باشید.
      </p>
    </main>
  )
}
