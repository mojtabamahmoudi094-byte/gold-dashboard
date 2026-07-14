import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'اسکرینر تکنیکال',
  description: 'فیلتر و اسکرین نمادهای بورس بر اساس اندیکاتورهای تحلیل تکنیکال',
  alternates: { canonical: '/technical/screener' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
