import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'صندوق‌های کالایی طلا و نقره',
  description: 'لیست و مقایسه صندوق‌های سرمایه‌گذاری طلا، نقره و کالایی بورس ایران',
  alternates: { canonical: '/funds' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
