import type { Metadata } from 'next'
import { pageMetadata } from '../../../lib/pageMetadata'

type Props = { params: Promise<{ symbol: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params
  const name = decodeURIComponent(symbol)
  return pageMetadata({
    title: `نماد ${name}`,
    description: `قیمت لحظه‌ای، تحلیل بنیادی و تکنیکال نماد ${name} در بورس تهران`,
    path: `/stock/${symbol}`,
  })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
