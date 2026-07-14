import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'تحلیل بازار طلا',
  description: 'تحلیل قیمت طلا، سکه و صندوق‌های طلا در بازار سرمایه ایران',
  alternates: { canonical: '/analysis/gold' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
