import type { Metadata } from 'next'
import { pageMetadata } from '../../../lib/pageMetadata'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const name = decodeURIComponent(slug)
  return pageMetadata({
    title: `صندوق ${name}`,
    description: `اطلاعات، NAV و تحلیل صندوق ${name} در بورس سنج`,
    path: `/fund/${slug}`,
  })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
