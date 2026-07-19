import type { Metadata } from 'next'
import JsonLd from '../../components/JsonLd'
import { SITE_URL } from '../../lib/site'

export const metadata: Metadata = {
  title: 'تماس با ما',
  description: 'راه‌های ارتباط با تیم بورس سنج — کانال تلگرام و دستیار هوشمند سایت.',
  alternates: { canonical: '/contact' },
}

const CHANNELS = [
  {
    title: 'کانال تلگرام',
    desc: 'اخبار، به‌روزرسانی‌ها و امکان ارسال پیام مستقیم به تیم بورس سنج.',
    href: 'https://t.me/bourssanjj',
    cta: 'ورود به کانال',
  },
  {
    title: 'دستیار هوشمند سایت',
    desc: 'پرسش‌های مربوط به نحوه کار سایت یا داده‌های بازار را از دستیار هوشمند (آیکون گفتگوی شناور) بپرسید.',
    href: null,
    cta: 'باز کردن گفتگو',
  },
]

export default function ContactPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'تماس با ما', item: `${SITE_URL}/contact` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: 'تماس با بورس سنج',
      url: `${SITE_URL}/contact`,
      isPartOf: { '@type': 'WebSite', name: 'بورس سنج', url: SITE_URL },
    },
  ]

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 6vw 80px', direction: 'rtl', fontFamily: 'Vazirmatn, Arial, sans-serif' }}>
      <JsonLd data={jsonLd} />

      <h1 style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', margin: '0 0 16px' }}>تماس با ما</h1>

      <p style={{ fontSize: 16, lineHeight: 2, color: 'var(--text-2)', margin: '0 0 32px' }}>
        برای سؤال، گزارش خطا یا پیشنهاد درباره داده‌ها و امکانات بورس سنج از یکی از راه‌های زیر با ما در
        ارتباط باشید.
      </p>

      <div style={{ display: 'grid', gap: 14 }}>
        {CHANNELS.map(c => (
          <div key={c.title} style={{
            padding: '20px 22px', borderRadius: 14,
            background: 'var(--card)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>{c.title}</div>
            <div style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--text-2)', marginBottom: 14 }}>{c.desc}</div>
            {c.href && (
              <a href={c.href} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-block', fontSize: 14, fontWeight: 600, color: '#fff',
                background: 'linear-gradient(135deg, var(--brand) 0%, var(--brand2) 100%)',
                padding: '9px 18px', borderRadius: 10, textDecoration: 'none',
              }}>
                {c.cta}
              </a>
            )}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.9, color: 'var(--muted)', marginTop: 32 }}>
        داده‌ها و تحلیل‌های سایت جنبه اطلاع‌رسانی دارند و توصیه سرمایه‌گذاری نیستند.
      </p>
    </main>
  )
}
