import type { Metadata } from 'next'
import FundamentalsPage from './FundamentalsClient'
import { getFundamentals } from '../../../lib/fundamentalsData'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const raw = decodeURIComponent((await params).symbol).replace(/-/g, ' ')
  const data = await getFundamentals(raw)
  if (!data) return { title: `نسبت‌های مالی ${raw}` }
  const ratio = (v: number | null) => (v == null ? '—' : v.toLocaleString('fa-IR', { maximumFractionDigits: 2 }))
  return {
    title: `نسبت‌های مالی ${data.symbol}`,
    description: `نسبت‌های مالی نماد ${data.symbol} — P/E ${ratio(data.pe)}, P/B ${ratio(data.pb)}, ROE، ROA، حاشیه سود و اهرم مالی، محاسبه‌شده از صورت‌های مالی سالانه کدال (دوره ${data.period}).`,
  }
}

export default async function Page({ params }: { params: Promise<{ symbol: string }> }) {
  const raw = decodeURIComponent((await params).symbol).replace(/-/g, ' ')
  const data = await getFundamentals(raw)
  return <FundamentalsPage symbol={raw} initialData={data} />
}
