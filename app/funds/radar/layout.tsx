import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'رادار پول هوشمند صندوق‌ها',
  description: 'رصد ورود و خروج پول هوشمند در صندوق‌های سرمایه‌گذاری کالایی بورس',
  alternates: { canonical: '/funds/radar' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
