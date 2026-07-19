import type { Metadata } from 'next'
import JsonLd from '../../components/JsonLd'
import { SITE_URL } from '../../lib/site'

export const metadata: Metadata = {
  title: 'حریم خصوصی',
  description: 'سیاست حریم خصوصی بورس سنج — چه اطلاعاتی جمع‌آوری می‌شود و چگونه استفاده می‌شود.',
  alternates: { canonical: '/privacy' },
}

const SECTIONS = [
  {
    title: '۱. اطلاعاتی که جمع‌آوری می‌کنیم',
    body: 'برای ثبت‌نام و ورود، شماره موبایل شما دریافت و از طریق پیامک تأیید می‌شود. در صورت استفاده از پورتفوی شخصی، نمادها و مقادیر واردشده توسط شما ذخیره می‌شود. گفتگوهای شما با دستیار هوشمند سایت برای بهبود کیفیت پاسخ‌ها ثبت می‌شود.',
  },
  {
    title: '۲. کوکی و ابزار تحلیلی',
    body: 'سایت از Google Analytics برای بررسی آماری بازدید (نه شناسایی فردی) استفاده می‌کند. تنظیم حالت روشن/تاریک در حافظه محلی مرورگر (localStorage) شما ذخیره می‌شود و به سرور ارسال نمی‌شود.',
  },
  {
    title: '۳. نحوه استفاده از اطلاعات',
    body: 'شماره موبایل صرفاً برای احراز هویت و ورود به حساب استفاده می‌شود. داده‌های پورتفوی فقط برای نمایش به خود شما استفاده می‌شوند. اطلاعات شما به هیچ شخص ثالثی برای مقاصد تبلیغاتی فروخته یا اجاره داده نمی‌شود.',
  },
  {
    title: '۴. نگهداری و امنیت',
    body: 'اطلاعات در پایگاه‌داده امن (Supabase) با کنترل دسترسی نگهداری می‌شوند. کدهای تأیید پیامکی پس از انقضا غیرفعال می‌شوند.',
  },
  {
    title: '۵. حقوق کاربر',
    body: 'می‌توانید درخواست حذف حساب و داده‌های پورتفوی خود را از طریق صفحه «تماس با ما» ارسال کنید.',
  },
  {
    title: '۶. تغییر این سیاست',
    body: 'این سیاست ممکن است به‌مرور به‌روزرسانی شود. تغییرات مهم در همین صفحه اعلام می‌شود.',
  },
  {
    title: '۷. تماس',
    body: 'برای سؤال درباره حریم خصوصی از صفحه «تماس با ما» اقدام کنید.',
  },
]

export default function PrivacyPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'حریم خصوصی', item: `${SITE_URL}/privacy` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'حریم خصوصی',
      url: `${SITE_URL}/privacy`,
      isPartOf: { '@type': 'WebSite', name: 'بورس سنج', url: SITE_URL },
    },
  ]

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 6vw 80px', direction: 'rtl', fontFamily: 'Vazirmatn, Arial, sans-serif' }}>
      <JsonLd data={jsonLd} />

      <h1 style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', margin: '0 0 16px' }}>حریم خصوصی</h1>

      <p style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--muted)', margin: '0 0 32px' }}>
        آخرین به‌روزرسانی: تیر ۱۴۰۵
      </p>

      <div style={{ display: 'grid', gap: 20 }}>
        {SECTIONS.map(s => (
          <section key={s.title}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>{s.title}</h2>
            <p style={{ fontSize: 15, lineHeight: 2, color: 'var(--text-2)', margin: 0 }}>{s.body}</p>
          </section>
        ))}
      </div>
    </main>
  )
}
