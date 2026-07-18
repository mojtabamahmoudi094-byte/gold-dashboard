import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'نقشه بازار | بورس سنج',
  description: 'نقشه حرارتی بازار سهام بورس و فرابورس ایران به تفکیک صنعت، بر اساس ارزش معاملات و درصد تغییر قیمت',
  alternates: { canonical: '/market-map' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
