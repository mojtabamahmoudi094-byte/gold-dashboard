import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'صندوق‌های سهامی بورس',
  description: 'لیست و رصد صندوق‌های سرمایه‌گذاری سهامی بورس تهران',
  alternates: { canonical: '/funds/bourse' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
