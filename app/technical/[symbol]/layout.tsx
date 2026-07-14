import type { Metadata } from 'next'

type Props = { params: Promise<{ symbol: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params
  const name = decodeURIComponent(symbol)
  return {
    title: `تحلیل تکنیکال ${name}`,
    description: `نمودار و اندیکاتورهای تحلیل تکنیکال نماد ${name}`,
    alternates: { canonical: `/technical/${symbol}` },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
