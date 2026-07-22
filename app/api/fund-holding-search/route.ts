import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { faNorm } from '../../../lib/faNorm'

// جست‌وجوی وزن یک سهم خاص (مثلاً «بانک ملت») در پرتفوی صندوق‌های سهامی/مختلط —
// از فایل‌های public/portfolio/<slug>.json می‌خواند (خروجی scripts/codal-portfolio.js)
// که همان داده‌ای‌ست که صفحه هر صندوق (CodalSections) هم نمایش می‌دهد.
export const dynamic = 'force-dynamic'

const norm = faNorm // نرمال‌ساز مشترک (ی/ک عربی + اعراب + نیم‌فاصله) — ZWNJ در نام‌های کدال رایج است

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'q الزامی است' }, { status: 400 })
  const nq = norm(q)

  const dir = path.join(process.cwd(), 'public', 'portfolio')
  let files: string[] = []
  try {
    files = (await fs.readdir(dir)).filter(f => f.endsWith('.json'))
  } catch {
    return NextResponse.json({ results: [] })
  }

  const results: { slug: string; symbol: string; holdingName: string; weightPct: number; period: string }[] = []

  await Promise.all(files.map(async (file) => {
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf8')
      const data = JSON.parse(raw)
      const months = data?.months
      if (!Array.isArray(months) || months.length === 0) return
      const last = months[months.length - 1]
      const holdings = last?.holdings
      if (!Array.isArray(holdings) || holdings.length === 0) return

      const totalNav = holdings.reduce((s: number, h: any) => s + (Number(h.n1) || 0), 0)
      if (!(totalNav > 0)) return

      // اختیار معامله/تعهدی روی سهم را حساب نکن — فقط خودِ سهم (نامش شامل «اختیار»/«تعهد» نیست)
      const match = holdings.find((h: any) => {
        const name = norm(String(h.name || ''))
        return name.includes(nq) && !/اختیار|تعهد/.test(name)
      })
      if (!match) return

      const weightPct = (Number(match.n1) || 0) / totalNav * 100
      results.push({
        slug: file.replace(/\.json$/, ''),
        symbol: data.symbol || file.replace(/\.json$/, ''),
        holdingName: match.name,
        weightPct: Math.round(weightPct * 100) / 100,
        period: last.date,
      })
    } catch { /* فایل خراب/ناقص را رد کن */ }
  }))

  results.sort((a, b) => b.weightPct - a.weightPct)
  return NextResponse.json({ results: results.slice(0, 15) })
}
