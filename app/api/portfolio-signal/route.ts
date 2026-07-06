import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

/**
 * برآورد تغییر NAV روزانه هر صندوق بورسی از پرتفوی کدال + قیمت روز سهام
 *
 * ورودی‌ها (استاتیک در public/):
 *   - portfolio/<نماد>.json  → خروجی scripts/codal-portfolio.js (ماه‌های اخیر + holdings با وزن pct)
 *   - stocks/industries.json → خروجی scripts/stocks-industries.js (قیمت و درصد تغییر روز همه سهام)
 *
 * خروجی: به ازای هر صندوق
 *   navChg   = تغییر برآوردی NAV امروز (٪) = میانگین وزنی تغییر سهام پرتفوی، مقیاس‌شده به کل وزن سهام
 *   coverage = چه کسری از وزن سهام پرتفوی به قیمت روز وصل شد
 *   top      = سه سهم اثرگذار (بیشترین وزن) با تغییر امروزشان
 */

interface StockInfo { l18: string; l30: string; pcp: number | null }
interface FundPort {
  navChg: number
  coverage: number
  reportDate: string
  top: { name: string; l18: string; w: number; chg: number }[]
}

const norm = (s: unknown) => String(s ?? '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[‌‎‏‪-‮]/g, ' ')
  .replace(/\s+/g, ' ').trim()

// کلمات عمومی که در تطبیق نام شرکت‌ها سیگنالی ندارند
const STOP = new Set('شرکت سرمایه گذاری صنایع صنعتی گروه توسعه مجتمع تولیدی ایران ایرانیان و های کارخانجات'.split(' '))
const toks = (s: string) => norm(s).split(' ').filter(t => !STOP.has(t) && t.length > 1)

function buildMatcher(stocks: { name: string; tokens: Set<string>; info: StockInfo }[]) {
  const exact = new Map<string, StockInfo>()
  stocks.forEach(s => { if (!exact.has(s.name)) exact.set(s.name, s.info) })

  return (holdingName: string): StockInfo | null => {
    const n = norm(holdingName)
    const hit = exact.get(n)
    if (hit) return hit
    const t = new Set(toks(n))
    if (t.size === 0) return null
    let best: StockInfo | null = null
    let bestScore = 0
    for (const s of stocks) {
      if (s.tokens.size === 0) continue
      let inter = 0
      for (const tok of t) if (s.tokens.has(tok)) inter++
      if (inter === 0) continue
      const union = t.size + s.tokens.size - inter
      let score = inter / Math.max(union, 1)
      const subset = inter === t.size || inter === s.tokens.size
      if (subset) score += 0.5
      if (score > bestScore) { bestScore = score; best = s.info }
    }
    return bestScore >= 0.6 ? best : null
  }
}

// کش ۵ دقیقه‌ای — فایل‌ها استاتیک‌اند و روزی یک بار عوض می‌شوند
let cache: { at: number; body: any } | null = null
const TTL = 5 * 60 * 1000

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json(cache.body)
  }

  const pub = path.join(process.cwd(), 'public')

  let industries: any
  try {
    industries = JSON.parse(await fs.readFile(path.join(pub, 'stocks', 'industries.json'), 'utf8'))
  } catch {
    return NextResponse.json({ funds: {}, error: 'stocks/industries.json missing' })
  }

  const stocks: { name: string; tokens: Set<string>; info: StockInfo }[] = []
  for (const ind of industries?.industries ?? []) {
    for (const s of ind?.symbols ?? []) {
      const name = norm(s.l30)
      if (!name) continue
      stocks.push({
        name,
        tokens: new Set(toks(name)),
        info: { l18: norm(s.l18), l30: name, pcp: typeof s.pcp === 'number' ? s.pcp : null },
      })
    }
  }
  const match = buildMatcher(stocks)

  const funds: Record<string, FundPort> = {}
  let files: string[] = []
  try {
    files = (await fs.readdir(path.join(pub, 'portfolio'))).filter(f => f.endsWith('.json'))
  } catch { /* پوشه پورتفوی نیست */ }

  for (const file of files) {
    try {
      const d = JSON.parse(await fs.readFile(path.join(pub, 'portfolio', file), 'utf8'))
      const months = Array.isArray(d?.months) ? d.months : []
      const last = months[months.length - 1]
      const holdings: any[] = Array.isArray(last?.holdings) ? last.holdings : []
      if (holdings.length === 0) continue

      // وزن هر سهم از ارزش پایان دوره (n1، ریال) — ستون pct در فایل‌ها واحد یکدستی ندارد
      // (بعضی کسر، بعضی درصد، بعضی خراب) ولی n1 همه‌جا ریال است
      let totalV = 0, matchedV = 0, vSum = 0, sumPct = 0
      const matched: { name: string; l18: string; v: number; chg: number }[] = []
      for (const h of holdings) {
        const v = typeof h.n1 === 'number' && h.n1 > 0 ? h.n1 : 0
        if (v <= 0) continue
        totalV += v
        if (typeof h.pct === 'number' && h.pct > 0) sumPct += h.pct
        const m = match(h.name)
        if (m && m.pcp != null) {
          matchedV += v
          vSum += v * m.pcp
          matched.push({ name: norm(h.name), l18: m.l18, v, chg: m.pcp })
        }
      }
      if (totalV === 0 || matchedV / totalV < 0.3) continue

      // سهم سهام از کل NAV — از جمع pct اگر واحدش سالم بود، وگرنه پیش‌فرض
      const stockShare =
        sumPct > 0.2 && sumPct <= 1.1 ? sumPct :
        sumPct > 20 && sumPct <= 110 ? sumPct / 100 :
        0.85

      // میانگین وزنی تغییر سهام تطبیق‌یافته × سهم سهام از NAV
      // (بخش تطبیق‌نشده هم‌رفتار بقیه سهام فرض می‌شود؛ نقد/اوراق خارج از شیت سهام‌اند)
      const navChg = (vSum / matchedV) * stockShare
      const top = matched.sort((a, b) => b.v - a.v).slice(0, 3)
        .map(t => ({
          name: t.name, l18: t.l18,
          w: Math.round((t.v / totalV) * stockShare * 1000) / 10,
          chg: Math.round(t.chg * 100) / 100,
        }))

      funds[file.replace(/\.json$/, '')] = {
        navChg: Math.round(navChg * 100) / 100,
        coverage: Math.round((matchedV / totalV) * 100) / 100,
        reportDate: String(last?.date ?? ''),
        top,
      }
    } catch { /* فایل خراب — رد شو */ }
  }

  const body = { funds, stocksUpdated: industries?.updated ?? null }
  cache = { at: Date.now(), body }
  return NextResponse.json(body)
}
