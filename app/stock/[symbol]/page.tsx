import type { Metadata } from 'next'
import StockPageClient from './StockPageClient'
import { getStocksIndustries } from '../../../lib/stocksIndustriesData'
import { getStockReport } from '../../../lib/stockReportsData'
import type { Reports } from '../../../lib/stockInsights'
import JsonLd from '../../../components/JsonLd'
import { SITE_URL } from '../../../lib/site'

// ISR به‌جای force-dynamic: دیتای زنده هرچند دقیقه آپدیت می‌شود، کلاینت هم خودش رفرش دارد —
// نیازی به هیت Supabase در هر ریکوئست SSR نیست (روی Render رایگان صرفه‌جویی CPU/تاخیر می‌کند)
export const revalidate = 60

async function findSymbolData(symbol: string) {
  const data = await getStocksIndustries()
  for (const ind of data.industries) {
    const s = ind.symbols.find(x => x.l18 === symbol)
    if (s) return { s, ind, data, isExtra: false }
  }
  // صندوق‌ها/حق تقدم/کالایی‌ها در extraGroups هستند، نه industries
  for (const grp of data.extraGroups ?? []) {
    const s = grp.symbols.find(x => x.l18 === symbol)
    if (s) return { s, ind: { id: null, name: grp.name, count: grp.count, tval: grp.tval, mv: grp.mv, up: grp.up, down: grp.down, symbols: grp.symbols }, data, isExtra: true }
  }
  return { s: null, ind: null, data, isExtra: false }
}

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const symbol = decodeURIComponent((await params).symbol)
  const { s, ind, isExtra } = await findSymbolData(symbol)
  if (!s || !ind) return { title: symbol }
  const price = s.pc == null ? '' : `قیمت پایانی ${s.pc.toLocaleString('fa-IR')} ریال`
  const change = s.pcp == null ? '' : `(${s.pcp > 0 ? '+' : ''}${s.pcp.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪)`
  return {
    title: `قیمت ${s.l18} امروز + نمودار لحظه‌ای و تحلیل رایگان`,
    description: `قیمت لحظه‌ای نماد ${s.l18} (${s.l30}) در بورس تهران (tsetmc) — ${price} ${change} — آخرین گزارش‌های کدال، ارزش بازار، حجم معاملات و تحلیل بنیادی، رایگان و بدون ثبت‌نام.`.trim(),
  }
}

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol)
  const [{ s, ind, data }, reportsRaw] = await Promise.all([
    findSymbolData(symbol),
    getStockReport(symbol),
  ])

  const jsonLd: object[] = []
  if (s && ind) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: ind.id != null ? [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'سهام', item: `${SITE_URL}/stocks` },
        { '@type': 'ListItem', position: 3, name: ind.name, item: `${SITE_URL}/stocks/${ind.id}` },
        { '@type': 'ListItem', position: 4, name: s.l18, item: `${SITE_URL}/stock/${encodeURIComponent(symbol)}` },
      ] : [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: ind.name, item: `${SITE_URL}/market-map` },
        { '@type': 'ListItem', position: 3, name: s.l18, item: `${SITE_URL}/stock/${encodeURIComponent(symbol)}` },
      ],
    })
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: `داده‌های لحظه‌ای و بنیادی نماد ${s.l18}`,
      description: `قیمت لحظه‌ای، ارزش بازار و گزارش‌های کدال نماد ${s.l18} (${s.l30}) در ${ind.id != null ? 'صنعت' : 'گروه'} ${ind.name}`,
      url: `${SITE_URL}/stock/${encodeURIComponent(symbol)}`,
      creator: { '@type': 'Organization', name: 'بورس سنج', url: SITE_URL },
      inLanguage: 'fa-IR',
    })
  }

  return (
    <>
      {jsonLd.length > 0 && <JsonLd data={jsonLd} />}
      <StockPageClient
        key={symbol}
        symbol={symbol}
        initialData={data}
        initialReports={reportsRaw as Reports | null}
      />
    </>
  )
}
