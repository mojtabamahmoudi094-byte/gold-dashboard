import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'رصد لحظه‌ای بازار',
  description: 'نمودار و رصد زنده شاخص‌ها و نمادهای بورس تهران',
  alternates: { canonical: '/monitor' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
