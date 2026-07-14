import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ارزش‌گذاری بنیادی نماد',
  description: 'ابزار ارزش‌گذاری بنیادی نمادهای بورس تهران بر اساس نسبت‌های مالی',
  alternates: { canonical: '/valuation' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
