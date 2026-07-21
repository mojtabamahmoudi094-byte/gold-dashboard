import type { Metadata } from 'next'
import JsonLd from '../../../components/JsonLd'
import { SITE_URL } from '../../../lib/site'

export const metadata: Metadata = {
  title: 'حباب صندوق طلا و سکه امروز | بورس سنج',
  description: 'حباب اسمی، ذاتی و واقعی صندوق‌های طلا و حباب سکه بورس کالا به‌صورت لحظه‌ای — تحلیل قیمت طلا و سکه در بازار سرمایه ایران.',
  alternates: { canonical: '/analysis/gold' },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'حباب صندوق طلا و سکه', item: `${SITE_URL}/analysis/gold` },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'حباب صندوق طلا یعنی چه؟',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'حباب صندوق طلا اختلاف قیمت پایانی صندوق در بورس نسبت به ارزش خالص دارایی (NAV) و ارزش ذاتی سبد طلا/سکه آن است؛ عدد مثبت یعنی صندوق گران‌تر از ارزش واقعی معامله می‌شود.',
        },
      },
      {
        '@type': 'Question',
        name: 'حباب سکه در بورس کالا چطور محاسبه می‌شود؟',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'حباب سکه از تفاضل قیمت تابلوی گواهی سپرده سکه در بورس کالا با قیمت واقعی سکه (بر پایه انس جهانی طلا و نرخ دلار) به‌صورت درصدی محاسبه می‌شود.',
        },
      },
    ],
  },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  )
}
