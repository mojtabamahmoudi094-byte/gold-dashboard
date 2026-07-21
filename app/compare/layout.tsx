import type { Metadata } from 'next'
import JsonLd from '../../components/JsonLd'
import { SITE_URL } from '../../lib/site'

export const metadata: Metadata = {
  title: 'مقایسه صندوق طلا و نقره | بورس سنج',
  description: 'مقایسه بازدهی، حباب، جریان پول و شاخص‌های ۲ تا ۵ صندوق سرمایه‌گذاری طلا، نقره و کالایی بورس کنار هم.',
  alternates: { canonical: '/compare' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: 'مقایسه صندوق‌ها', item: `${SITE_URL}/compare` },
  ],
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  )
}
