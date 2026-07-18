import type { Metadata } from 'next'
import StockPageClient from './StockPageClient'
import { getStocksIndustries } from '../../../lib/stocksIndustriesData'
import { getStockReport } from '../../../lib/stockReportsData'
import type { Reports } from '../../../lib/stockInsights'

export const dynamic = 'force-dynamic'

async function findSymbolData(symbol: string) {
  const data = await getStocksIndustries()
  for (const ind of data.industries) {
    const s = ind.symbols.find(x => x.l18 === symbol)
    if (s) return { s, ind, data }
  }
  return { s: null, ind: null, data }
}

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const symbol = decodeURIComponent((await params).symbol)
  const { s, ind } = await findSymbolData(symbol)
  if (!s || !ind) return { title: `${symbol} — بورس سنج` }
  const price = s.pc == null ? '' : `قیمت پایانی ${s.pc.toLocaleString('fa-IR')} ریال`
  const change = s.pcp == null ? '' : `(${s.pcp > 0 ? '+' : ''}${s.pcp.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪)`
  return {
    title: `${s.l18} — ${s.l30}`,
    description: `نماد ${s.l18} (${s.l30}) در صنعت ${ind.name} — ${price} ${change} — ارزش بازار، حجم معاملات، گزارش‌های کدال و تحلیل بنیادی.`.trim(),
  }
}

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol)
  const [{ data }, reportsRaw] = await Promise.all([
    findSymbolData(symbol),
    getStockReport(symbol),
  ])
  return (
    <StockPageClient
      symbol={symbol}
      initialData={data}
      initialReports={reportsRaw as Reports | null}
    />
  )
}
