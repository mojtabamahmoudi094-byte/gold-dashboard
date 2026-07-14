import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'اسکرینر ارزش‌گذاری',
  description: 'فیلتر نمادهای بورس بر اساس نسبت‌های ارزش‌گذاری بنیادی',
  alternates: { canonical: '/valuation/screener' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
