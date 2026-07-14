import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ارزش معاملات بازار',
  description: 'ارزش کل معاملات روزانه بازار بورس تهران به تفکیک گروه و صنعت',
  alternates: { canonical: '/trade-value' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
