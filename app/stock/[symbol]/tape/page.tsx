import type { Metadata } from 'next'
import TapePageClient from './TapePageClient'
import { pageMetadata } from '../../../../lib/pageMetadata'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const symbol = decodeURIComponent((await params).symbol)
  return pageMetadata({
    title: `نمودار تابلوخوانی ${symbol} — ورود و خروج پول حقیقی`,
    description: `تابلوخوانی نماد ${symbol} — ورود و خروج پول حقیقی، سرانه خرید و فروش، قدرت خریدار، تعداد کدها و تفکیک حقیقی/حقوقی، رایگان و بدون ثبت‌نام.`,
    path: `/stock/${encodeURIComponent(symbol)}/tape`,
  })
}

export default async function TapePage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol)
  return <TapePageClient symbol={symbol} />
}
