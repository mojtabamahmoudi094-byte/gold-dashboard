import type { Metadata } from 'next'
import JsonLd from '../../../components/JsonLd'
import AiDisclaimer from '../../../components/AiDisclaimer'
import { SITE_URL } from '../../../lib/site'

export const metadata: Metadata = {
  title: 'حباب صندوق نقره امروز | بورس سنج',
  description: 'حباب اسمی و ذاتی صندوق‌های نقره و حباب شمش نقره بورس کالا به‌صورت لحظه‌ای — تحلیل قیمت نقره در بازار سرمایه ایران.',
  alternates: { canonical: '/analysis/silver' },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'حباب صندوق نقره', item: `${SITE_URL}/analysis/silver` },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'حباب صندوق نقره یعنی چه؟',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'حباب صندوق نقره اختلاف قیمت پایانی صندوق در بورس نسبت به ارزش خالص دارایی (NAV) و ارزش ذاتی گواهی نقره پشتوانه آن است؛ عدد مثبت یعنی صندوق گران‌تر از ارزش واقعی معامله می‌شود.',
        },
      },
    ],
  },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={jsonLd} />
      <AiDisclaimer />
      {children}
    </>
  )
}
