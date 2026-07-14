import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'پورتفوی من',
  description: 'مدیریت و رصد پورتفوی سرمایه‌گذاری شخصی در صندوق‌ها و سهام بورس',
  alternates: { canonical: '/portfolio' },
  robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
