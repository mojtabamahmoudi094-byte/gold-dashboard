import type { Metadata } from 'next'
import { pageMetadata } from '../../../lib/pageMetadata'

type Props = { params: Promise<{ symbol: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params
  const name = decodeURIComponent(symbol)
  return pageMetadata({
    title: `قیمت ${name} امروز + نمودار لحظه‌ای و تحلیل رایگان`,
    description: `قیمت لحظه‌ای نماد ${name} در بورس تهران (tsetmc) — گزارش‌های کدال، تحلیل بنیادی و تکنیکال، رایگان و بدون ثبت‌نام`,
    path: `/stock/${symbol}`,
  })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
