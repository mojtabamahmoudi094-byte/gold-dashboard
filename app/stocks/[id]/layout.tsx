import type { Metadata } from 'next'
import { pageMetadata } from '../../../lib/pageMetadata'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const name = decodeURIComponent(id)
  return pageMetadata({
    title: `صنعت ${name}`,
    description: `لیست نمادها، قیمت لحظه‌ای و ارزش معاملات صنعت ${name} در بورس تهران`,
    path: `/stocks/${id}`,
  })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
