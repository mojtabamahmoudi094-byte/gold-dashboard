import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

// پورتفوی کامل یک صندوق مشخص (holdings) یا خرید/فروش اخیرش (buys/sells) —
// از همان public/portfolio/<slug>.json که app/api/fund-holding-search هم می‌خواند.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')?.trim()
  const mode = req.nextUrl.searchParams.get('mode') || 'holdings'
  if (!slug) return NextResponse.json({ error: 'slug الزامی است' }, { status: 400 })

  let data: any
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'public', 'portfolio', `${slug}.json`), 'utf8')
    data = JSON.parse(raw)
  } catch {
    return NextResponse.json({ items: [], period: null, symbol: null })
  }

  const months = data?.months
  if (!Array.isArray(months) || months.length === 0) return NextResponse.json({ items: [], period: null, symbol: data?.symbol ?? null })
  const last = months[months.length - 1]
  const holdings: any[] = Array.isArray(last?.holdings) ? last.holdings : []
  const isOptionRow = (name: string) => /اختیار|تعهد/.test(name)

  let items: { name: string; value: number }[] = []
  if (mode === 'buys') {
    items = holdings.filter(h => (Number(h.bc) || 0) > 0 && !isOptionRow(String(h.name || '')))
      .sort((a, b) => (Number(b.bc) || 0) - (Number(a.bc) || 0))
      .slice(0, 8)
      .map(h => ({ name: h.name, value: Number(h.bc) || 0 }))
  } else if (mode === 'sells') {
    items = holdings.filter(h => (Number(h.sa) || 0) > 0 && !isOptionRow(String(h.name || '')))
      .sort((a, b) => (Number(b.sa) || 0) - (Number(a.sa) || 0))
      .slice(0, 8)
      .map(h => ({ name: h.name, value: Number(h.sa) || 0 }))
  } else {
    const totalNav = holdings.reduce((s, h) => s + (Number(h.n1) || 0), 0)
    items = holdings.filter(h => (Number(h.n1) || 0) > 0 && !isOptionRow(String(h.name || '')))
      .sort((a, b) => (Number(b.n1) || 0) - (Number(a.n1) || 0))
      .slice(0, 15)
      .map(h => ({ name: h.name, value: totalNav > 0 ? Math.round((Number(h.n1) || 0) / totalNav * 10000) / 100 : 0 }))
  }

  return NextResponse.json({ items, period: last.date, symbol: data.symbol ?? slug })
}
