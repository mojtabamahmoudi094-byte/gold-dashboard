import type { Metadata } from 'next'
import { pageMetadata } from '../../../lib/pageMetadata'

type Props = { params: Promise<{ symbol: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params
  const name = decodeURIComponent(symbol)
  return pageMetadata({
    title: `تحلیل تکنیکال ${name} + نمودار لحظه‌ای رایگان`,
    description: `نمودار کندل‌استیک، RSI، MACD، میانگین متحرک و سطوح حمایت و مقاومت نماد ${name} — تحلیل تکنیکال رایگان و بدون ثبت‌نام`,
    path: `/technical/${symbol}`,
  })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
