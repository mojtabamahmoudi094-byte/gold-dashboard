import type { Metadata } from 'next'
import JsonLd from '../../components/JsonLd'
import { SITE_URL } from '../../lib/site'

export const metadata: Metadata = {
  title: 'بهترین صندوق طلا و نقره + حباب هر صندوق | بورس سنج',
  description: 'لیست، رتبه‌بندی هوشمند و مقایسه صندوق‌های سرمایه‌گذاری طلا، نقره و زعفران بورس ایران — با حباب، جریان پول و امتیاز هر صندوق.',
  alternates: { canonical: '/funds' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: 'صندوق‌های طلا و نقره', item: `${SITE_URL}/funds` },
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
