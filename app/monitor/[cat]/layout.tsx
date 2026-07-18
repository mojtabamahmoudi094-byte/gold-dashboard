import type { Metadata } from 'next'
import { pageMetadata } from '../../../lib/pageMetadata'

type Props = { params: Promise<{ cat: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cat } = await params
  const name = decodeURIComponent(cat)
  return pageMetadata({
    title: `رصد بازار ${name}`,
    description: `رصد لحظه‌ای بازار ${name} در بورس سنج`,
    path: `/monitor/${cat}`,
  })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
