import type { Metadata } from 'next'
import JsonLd from '../../components/JsonLd'
import { SITE_URL } from '../../lib/site'

export const metadata: Metadata = {
  title: 'قوانین و شرایط استفاده',
  description: 'قوانین و شرایط استفاده از خدمات بورس سنج.',
  alternates: { canonical: '/terms' },
}

const SECTIONS = [
  {
    title: '۱. پذیرش قوانین',
    body: 'با استفاده از بورس سنج، این قوانین را می‌پذیرید. اگر با هر بخش از این قوانین موافق نیستید، از استفاده از سایت خودداری کنید.',
  },
  {
    title: '۲. ماهیت خدمات',
    body: 'بورس سنج داده‌های بازار سرمایه ایران (سهام، صندوق‌های طلا/نقره/زعفران)، تحلیل بنیادی خودکار برگرفته از گزارش‌های کدال، ابزار تکنیکال و سیگنال را نمایش می‌دهد. تمامی این موارد صرفاً جنبه اطلاع‌رسانی دارند و توصیه سرمایه‌گذاری، خرید یا فروش محسوب نمی‌شوند. مسئولیت هر تصمیم مالی بر عهده خود کاربر است.',
  },
  {
    title: '۳. دقت داده‌ها',
    body: 'داده‌ها از منابع رسمی (تابلوی معاملات، کدال) به‌صورت خودکار جمع‌آوری می‌شوند و ممکن است با تأخیر یا خطای فنی همراه باشند. بورس سنج هیچ تضمینی برای صحت، کامل بودن یا به‌روز بودن لحظه‌ای داده‌ها ارائه نمی‌دهد.',
  },
  {
    title: '۴. حساب کاربری',
    body: 'برخی امکانات (مانند پورتفوی شخصی) نیاز به ثبت‌نام با شماره موبایل و تأیید پیامکی دارند. کاربر مسئول محرمانه نگه‌داشتن دسترسی به حساب خود است.',
  },
  {
    title: '۵. مالکیت محتوا',
    body: 'طراحی، کد و تحلیل‌های تولیدشده در بورس سنج متعلق به این سایت است. کپی یا استفاده تجاری از محتوا بدون ذکر منبع مجاز نیست.',
  },
  {
    title: '۶. محدودیت مسئولیت',
    body: 'بورس سنج در قبال زیان مالی ناشی از استفاده از داده‌ها، تحلیل‌ها یا سیگنال‌های سایت مسئولیتی ندارد.',
  },
  {
    title: '۷. تغییر قوانین',
    body: 'این قوانین ممکن است به‌مرور به‌روزرسانی شوند. ادامه استفاده از سایت پس از تغییر، به معنای پذیرش نسخه جدید است.',
  },
  {
    title: '۸. تماس',
    body: 'برای سؤال درباره این قوانین از صفحه «تماس با ما» اقدام کنید.',
  },
]

export default function TermsPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'قوانین', item: `${SITE_URL}/terms` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'قوانین و شرایط استفاده',
      url: `${SITE_URL}/terms`,
      isPartOf: { '@type': 'WebSite', name: 'بورس سنج', url: SITE_URL },
    },
  ]

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 6vw 80px', direction: 'rtl', fontFamily: 'Vazirmatn, Arial, sans-serif' }}>
      <JsonLd data={jsonLd} />

      <h1 style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', margin: '0 0 16px' }}>قوانین و شرایط استفاده</h1>

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
