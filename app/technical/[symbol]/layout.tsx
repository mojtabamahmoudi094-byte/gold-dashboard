import type { Metadata } from 'next'
import { pageMetadata } from '../../../lib/pageMetadata'

type Props = { params: Promise<{ symbol: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params
  const name = decodeURIComponent(symbol)
  return pageMetadata({
    title: `تحلیل تکنیکال ${name}`,
    description: `نمودار و اندیکاتورهای تحلیل تکنیکال نماد ${name}`,
    path: `/technical/${symbol}`,
  })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
