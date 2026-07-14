import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'بک‌تست استراتژی تکنیکال',
  description: 'بک‌تست استراتژی‌های معاملاتی روی داده‌های تاریخی نمادهای بورس تهران',
  alternates: { canonical: '/technical/backtest' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
