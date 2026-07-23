import type { Metadata } from 'next'
import QuarterlyPageClient from './QuarterlyPageClient'
import { getStockReport } from '../../../../lib/stockReportsData'
import type { Reports } from '../../../../lib/stockInsights'
import { pageMetadata } from '../../../../lib/pageMetadata'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const symbol = decodeURIComponent((await params).symbol)
  return pageMetadata({
    title: `گزارش‌های فصلی ${symbol} — سود و زیان دوره‌ای`,
    description: `صورت سود و زیان دوره‌ای کدال نماد ${symbol} — درآمد، سود خالص، حاشیه سود و EPS همه دوره‌ها، رایگان و بدون ثبت‌نام.`,
    path: `/stock/${encodeURIComponent(symbol)}/quarterly`,
  })
}

export default async function QuarterlyPage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol)
  const reports = await getStockReport(symbol)
  return <QuarterlyPageClient symbol={symbol} initialReports={reports as Reports | null} />
}
