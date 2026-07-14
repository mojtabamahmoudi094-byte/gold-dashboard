import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'تحلیل بازار نقره',
  description: 'تحلیل قیمت نقره و صندوق‌های نقره در بازار سرمایه ایران',
  alternates: { canonical: '/analysis/silver' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
