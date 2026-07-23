import type { Metadata } from 'next'
import CodalPageClient from './CodalPageClient'
import { pageMetadata } from '../../../../lib/pageMetadata'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const symbol = decodeURIComponent((await params).symbol)
  return pageMetadata({
    title: `اطلاعیه‌های کدال ${symbol} — آخرین اطلاعیه‌های رسمی`,
    description: `آخرین اطلاعیه‌های کدال نماد ${symbol} — گزارش ماهانه، صورت مالی، افشا و مجمع، دریافت زنده از سامانه codal.ir، رایگان و بدون ثبت‌نام.`,
    path: `/stock/${encodeURIComponent(symbol)}/codal`,
  })
}

export default async function CodalPage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol)
  return <CodalPageClient symbol={symbol} />
}
