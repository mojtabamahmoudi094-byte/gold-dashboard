import type { Metadata } from 'next'

type Props = { params: Promise<{ cat: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cat } = await params
  const name = decodeURIComponent(cat)
  return {
    title: `ارزش معاملات ${name}`,
    description: `ارزش معاملات روزانه گروه ${name} در بورس تهران`,
    alternates: { canonical: `/trade-value/${cat}` },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
