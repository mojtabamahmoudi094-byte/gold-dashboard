import type { Metadata } from 'next'

type Props = { params: Promise<{ symbol: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params
  const name = decodeURIComponent(symbol)
  return {
    title: `نماد ${name}`,
    description: `قیمت لحظه‌ای، تحلیل بنیادی و تکنیکال نماد ${name} در بورس تهران`,
    alternates: { canonical: `/stock/${symbol}` },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
