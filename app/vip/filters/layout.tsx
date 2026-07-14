import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'فیلترهای VIP بازار',
  description: 'فیلترهای زنده بازار سرمایه برای اعضای ویژه بورس سنج',
  alternates: { canonical: '/vip/filters' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
