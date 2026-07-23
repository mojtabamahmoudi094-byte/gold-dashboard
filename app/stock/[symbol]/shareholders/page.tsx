import type { Metadata } from 'next'
import ShareholdersPageClient from './ShareholdersPageClient'
import { pageMetadata } from '../../../../lib/pageMetadata'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const symbol = decodeURIComponent((await params).symbol)
  return pageMetadata({
    title: `سهامداران عمده ${symbol} — ترکیب مالکیت روزانه`,
    description: `فهرست کامل سهامداران عمده نماد ${symbol} — درصد مالکیت، تغییرات روزانه، ورود و خروج سهامداران، رایگان و بدون ثبت‌نام.`,
    path: `/stock/${encodeURIComponent(symbol)}/shareholders`,
  })
}

export default async function ShareholdersPage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol)
  return <ShareholdersPageClient symbol={symbol} />
}
