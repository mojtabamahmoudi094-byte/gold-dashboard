import type { Metadata } from 'next'
import Link from 'next/link'
import JsonLd from '../../components/JsonLd'
import { SITE_URL } from '../../lib/site'

export const metadata: Metadata = {
  title: 'درباره ما',
  description: 'بورس سنج، سامانه هوشمند رصد، تحلیل و پایش بازار سرمایه ایران — سهام، صندوق‌های طلا و نقره، تحلیل بنیادی و تکنیکال.',
  alternates: { canonical: '/about' },
}

const FEATURES = [
  { title: 'داده لحظه‌ای سهام', desc: 'قیمت، حجم و ارزش معاملات نمادهای بورس و فرابورس تهران به‌صورت زنده.' },
  { title: 'صندوق‌های کالایی', desc: 'رصد صندوق‌های طلا، نقره و زعفران، مقایسه NAV با قیمت بازار و حباب.' },
  { title: 'تحلیل بنیادی خودکار', desc: 'استخراج و خلاصه‌سازی گزارش‌های کدال (فروش ماهانه، سود، حاشیه سود) برای هر نماد.' },
  { title: 'ابزار تکنیکال', desc: 'اسکرینر، بک‌تست استراتژی و نمودار کندل سه‌ساله برای نمادها و شاخص‌ها.' },
  { title: 'سیگنال و هشدار', desc: 'سیگنال‌های خرید/فروش مبتنی بر داده و هشدار قیمت، حباب و صف معاملاتی.' },
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
          <div key={f.title} style={{
            padding: '16px 18px', borderRadius: 14,
            background: 'var(--card)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>{f.title}</div>
            <div style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--text-2)' }}>{f.desc}</div>
          </div>
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
