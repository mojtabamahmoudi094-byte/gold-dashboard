import type { Metadata } from 'next'
import FundamentalsPage from './FundamentalsClient'
import { getFundamentals } from '../../../lib/fundamentalsData'
import JsonLd from '../../../components/JsonLd'
import { SITE_URL } from '../../../lib/site'

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

  const jsonLd: object[] = []
  if (data) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'تحلیل', item: `${SITE_URL}/analysis` },
        { '@type': 'ListItem', position: 3, name: `نسبت‌های مالی ${data.symbol}`, item: `${SITE_URL}/fundamentals/${encodeURIComponent(raw)}` },
      ],
    })
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: `نسبت‌های مالی نماد ${data.symbol}`,
      description: `P/E، P/B، ROE، ROA، حاشیه سود و اهرم مالی نماد ${data.symbol} — محاسبه‌شده از صورت‌های مالی سالانه کدال (دوره ${data.period})`,
      url: `${SITE_URL}/fundamentals/${encodeURIComponent(raw)}`,
      creator: { '@type': 'Organization', name: 'بورس سنج', url: SITE_URL },
      inLanguage: 'fa-IR',
    })
  }

  return (
    <>
      {jsonLd.length > 0 && <JsonLd data={jsonLd} />}
      <FundamentalsPage symbol={raw} initialData={data} />
    </>
  )
}
