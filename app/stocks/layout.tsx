import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'سهام بورس و ارزش معاملات نمادها',
  description: 'لیست زنده نمادهای بورس تهران، قیمت لحظه‌ای، ارزش معاملات و فیلتر بر اساس صنعت',
  alternates: { canonical: '/stocks' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
