import type { Metadata } from 'next'
import ArchiveClient from './ArchiveClient'
import { pageMetadata } from '../../../../../lib/pageMetadata'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const symbol = decodeURIComponent((await params).symbol)
  return pageMetadata({
    title: `آرشیو تابلوخوانی ${symbol} — تاریخچه ۹۰ روزه`,
    description: `آرشیو نمودارهای تابلوخوانی نماد ${symbol} — ورود و خروج پول حقیقی، سرانه، قدرت خریدار و تفکیک حقیقی/حقوقی تا ۹۰ روز اخیر.`,
    path: `/stock/${encodeURIComponent(symbol)}/tape/archive`,
  })
}

export default async function TapeArchivePage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol)
  return <ArchiveClient symbol={symbol} />
}
