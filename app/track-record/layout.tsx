import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'سابقه عملکرد سیگنال‌ها',
  description: 'بررسی دقت و عملکرد گذشته سیگنال‌های صادر شده به تفکیک دسته دارایی',
  alternates: { canonical: '/track-record' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
