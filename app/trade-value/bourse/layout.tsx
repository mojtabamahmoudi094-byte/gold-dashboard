import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ارزش معاملات بورس',
  description: 'ارزش معاملات روزانه نمادهای بورس تهران به تفکیک گروه',
  alternates: { canonical: '/trade-value/bourse' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
