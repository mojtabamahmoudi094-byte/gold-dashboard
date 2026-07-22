import type { Metadata } from 'next'
import FundDetailPage from './FundPageClient'
import { getFundDetail } from '../../../lib/fundDetailData'
import { safe } from '../../../lib/format'
import JsonLd from '../../../components/JsonLd'
import { SITE_URL } from '../../../lib/site'
import { pageMetadata } from '../../../lib/pageMetadata'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug)
  const { asset, record } = await getFundDetail(slug)
  const path = `/fund/${encodeURIComponent(slug)}`
  if (!asset) return pageMetadata({ title: `قیمت صندوق ${slug} امروز + تحلیل لحظه‌ای رایگان`, description: `قیمت لحظه‌ای، حباب و تحلیل صندوق ${slug} — رایگان و بدون ثبت‌نام`, path })
  if (!record) return pageMetadata({ title: `قیمت صندوق ${asset.name} امروز + تحلیل لحظه‌ای رایگان`, description: `قیمت لحظه‌ای، حباب، جریان پول حقیقی و تحلیل صندوق ${asset.name} — رایگان و بدون ثبت‌نام`, path })

  const priceIsRial = safe(record.trade_value) > 1e6
  const priceToman = priceIsRial ? Math.round(safe(record.price_close) / 10) : safe(record.price_close)
  const changePct = safe(record.price_change_pct)
  return pageMetadata({
    title: `قیمت صندوق ${asset.name} امروز + تحلیل لحظه‌ای رایگان`,
    description: `قیمت لحظه‌ای صندوق ${asset.name} (${slug}) — قیمت پایانی ${priceToman.toLocaleString('fa-IR')} تومان (${changePct > 0 ? '+' : ''}${changePct.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪) — حباب، جریان پول حقیقی، ارزش بازار و تحلیل صندوق، رایگان و بدون ثبت‌نام.`,
    path,
  })
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const slug = decodeURIComponent((await params).slug)
  const { asset, record } = await getFundDetail(slug)

  const jsonLd: object[] = []
  if (asset) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'صندوق‌ها', item: `${SITE_URL}/funds` },
        { '@type': 'ListItem', position: 3, name: asset.name, item: `${SITE_URL}/fund/${encodeURIComponent(slug)}` },
      ],
    })
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FinancialProduct',
      name: asset.name,
      url: `${SITE_URL}/fund/${encodeURIComponent(slug)}`,
      provider: { '@type': 'Organization', name: 'بورس سنج', url: SITE_URL },
      category: asset.category ? `صندوق سرمایه‌گذاری ${asset.category}` : 'صندوق سرمایه‌گذاری',
    })
  }

  return (
    <>
      {jsonLd.length > 0 && <JsonLd data={jsonLd} />}
      <FundDetailPage key={slug} slug={slug} initialAsset={asset} initialRecord={record} />
    </>
  )
}
