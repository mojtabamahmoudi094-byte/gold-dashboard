import type { Metadata } from 'next'

type Props = { params: Promise<{ cat: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cat } = await params
  const name = decodeURIComponent(cat)
  return {
    title: `صندوق‌های ${name}`,
    description: `لیست و مقایسه صندوق‌های سرمایه‌گذاری دسته ${name}`,
    alternates: { canonical: `/funds/${cat}` },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
