import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const name = decodeURIComponent(slug)
  return {
    title: `صندوق ${name}`,
    description: `اطلاعات، NAV و تحلیل صندوق ${name} در بورس سنج`,
    alternates: { canonical: `/fund/${slug}` },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
