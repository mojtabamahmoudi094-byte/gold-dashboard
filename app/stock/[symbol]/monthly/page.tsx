import type { Metadata } from 'next'
import MonthlyPageClient from './MonthlyPageClient'
import { getStockReport } from '../../../../lib/stockReportsData'
import type { Reports } from '../../../../lib/stockInsights'
import { pageMetadata } from '../../../../lib/pageMetadata'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const symbol = decodeURIComponent((await params).symbol)
  return pageMetadata({
    title: `گزارش فعالیت ماهانه ${symbol} — روند فروش و محصولات`,
    description: `گزارش‌های فعالیت ماهانه کدال نماد ${symbol} — روند فروش/درآمد ماهانه، محصولات برتر و نرخ فروش، رایگان و بدون ثبت‌نام.`,
    path: `/stock/${encodeURIComponent(symbol)}/monthly`,
  })
}

export default async function MonthlyPage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol)
  const reports = await getStockReport(symbol)
  return <MonthlyPageClient symbol={symbol} initialReports={reports as Reports | null} />
}
