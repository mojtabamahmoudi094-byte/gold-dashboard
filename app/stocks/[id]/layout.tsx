import type { Metadata } from 'next'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const name = decodeURIComponent(id)
  return {
    title: `صنعت ${name}`,
    description: `لیست نمادها، قیمت لحظه‌ای و ارزش معاملات صنعت ${name} در بورس تهران`,
    alternates: { canonical: `/stocks/${id}` },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
