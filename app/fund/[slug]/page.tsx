import type { Metadata } from 'next'
import FundDetailPage from './FundPageClient'
import { getFundDetail } from '../../../lib/fundDetailData'
import { safe } from '../../../lib/format'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug)
  const { asset, record } = await getFundDetail(slug)
  if (!asset) return { title: `${slug} — بورس سنج` }
  if (!record) return { title: asset.name }

  const priceIsRial = safe(record.trade_value) > 1e6
  const priceToman = priceIsRial ? Math.round(safe(record.price_close) / 10) : safe(record.price_close)
  const changePct = safe(record.price_change_pct)
  return {
    title: asset.name,
    description: `صندوق ${asset.name} (${slug}) — قیمت پایانی ${priceToman.toLocaleString('fa-IR')} تومان (${changePct > 0 ? '+' : ''}${changePct.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪) — ارزش بازار، ارزش معاملات، جریان پول حقیقی و تحلیل صندوق.`,
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const slug = decodeURIComponent((await params).slug)
  const { asset, record } = await getFundDetail(slug)
  return <FundDetailPage slug={slug} initialAsset={asset} initialRecord={record} />
}
