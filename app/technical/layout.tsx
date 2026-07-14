import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'تحلیل تکنیکال',
  description: 'ابزارهای تحلیل تکنیکال، اسکرینر و بک‌تست استراتژی روی نمادهای بورس تهران',
  alternates: { canonical: '/technical' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
