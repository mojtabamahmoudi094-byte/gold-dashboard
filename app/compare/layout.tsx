import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'مقایسه صندوق‌ها',
  description: 'مقایسه بازدهی و شاخص‌های صندوق‌های سرمایه‌گذاری کالایی بورس',
  alternates: { canonical: '/compare' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
