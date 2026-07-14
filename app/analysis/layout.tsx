import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'تحلیل بازارها',
  description: 'تحلیل بنیادی بازار طلا، نقره و صندوق‌های کالایی بورس ایران',
  alternates: { canonical: '/analysis' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
