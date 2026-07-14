import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'سیگنال‌های بازار',
  description: 'سیگنال‌های خرید و فروش صندوق‌ها و نمادهای بورسی بر اساس داده‌های بازار',
  alternates: { canonical: '/signals' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
