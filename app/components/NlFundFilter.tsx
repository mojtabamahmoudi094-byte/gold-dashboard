'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Fund = {
  symbol: string; slug: string; category: string
  changePct: number; weeklyReturn: number; tradeValue: number; netFlow: number; buyPower: number; score: number
}

type Filter = {
  category?: string | null
  sortBy?: 'score' | 'changePct' | 'weeklyReturn' | 'tradeValue' | 'netFlow' | 'buyPower' | null
  sortDir?: 'asc' | 'desc' | null
  minChangePct?: number | null
  maxChangePct?: number | null
  minTradeValue?: number | null
  onlyPositiveFlow?: boolean | null
  onlyNegativeFlow?: boolean | null
  topHoldingQuery?: string | null
  fundReturnFundName?: string | null
  fundReturnPeriod?: 'day' | 'week' | 'month' | 'quarter' | 'year' | null
  fundPortfolioQuery?: string | null
  fundPortfolioMode?: 'holdings' | 'buys' | 'sells' | null
}

type HoldingResult = { slug: string; symbol: string; holdingName: string; weightPct: number; period: string }
type ReturnAnswer = { symbol: string; slug: string; periodLabel: string; pct: number; fromDate: string; toDate: string }
type PortfolioAnswer = { symbol: string; slug: string; mode: 'holdings' | 'buys' | 'sells'; period: string; items: { name: string; value: number }[] }

const PERIOD_LABEL: Record<string, string> = { day: 'روزانه', week: 'یک هفته اخیر', month: 'یک ماه اخیر', quarter: 'سه ماه اخیر', year: 'یک سال اخیر' }
// تقریب تعداد روزهای کاری (نه تقویمی) بورس برای هر بازه
const PERIOD_TRADING_DAYS: Record<string, number> = { day: 1, week: 5, month: 22, quarter: 66, year: 242 }

const safe = (v: unknown) => Number(v) || 0
const GREEN = '#00E5A0'
const RED = '#FF4D6A'
const ACCENT = '#38BDF8'

const EXAMPLES = [
  'صندوق‌های طلا با بیشترین رشد امروز',
  'صندوق درآمد ثابت با بیشترین بازده هفتگی',
  'بازده صندوق پایا تو یک ماه گذشته چقدره؟',
  'صندوق‌هایی با ورود پول قوی',
  'پورتفوی صندوق آسام چیه؟',
]

// دستیار زبان طبیعی برای فیلتر صندوق‌ها — Gemini فقط جمله را به فیلتر ساختاریافته ترجمه می‌کند
// (app/api/fund-filter-nl)، خودِ فیلتر/مرتب‌سازی روی داده واقعی همین‌جا در کلاینت انجام می‌شود.
export default function NlFundFilter({ isDark }: { isDark: boolean }) {
  const panel = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,46,0.02)'
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,30,46,0.08)'
  const text = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#94A3B8' : '#64748B'

  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Fund[] | null>(null)
  const [holdingResults, setHoldingResults] = useState<HoldingResult[] | null>(null)
  const [returnAnswer, setReturnAnswer] = useState<ReturnAnswer | null>(null)
  const [portfolioAnswer, setPortfolioAnswer] = useState<PortfolioAnswer | null>(null)
  const [activeMetric, setActiveMetric] = useState<'changePct' | 'weeklyReturn'>('changePct')
  // شمارش معکوس تا تلاش خودکار بعد از خطای سهمیه (quota) سرور هوش مصنوعی
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null)
  const retriedRef = useRef(false)
  const retryQueryRef = useRef('')

  // هر ثانیه یکی کم کن؛ به صفر که رسید همان جست‌وجو را خودکار دوباره اجرا کن (فقط یک بار)
  useEffect(() => {
    if (retryCountdown == null) return
    if (retryCountdown <= 0) {
      setRetryCountdown(null)
      if (retryQueryRef.current) run(retryQueryRef.current)
      return
    }
    const t = setTimeout(() => setRetryCountdown(c => (c == null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCountdown])

  const calcScore = (f: Omit<Fund, 'score'>, maxFlow: number, maxTrade: number) => {
    let score = 0
    score += Math.min(Math.max((f.changePct + 3) / 6 * 20, 0), 20)
    score += Math.min(Math.max(((f.netFlow / maxFlow) + 1) / 2 * 25, 0), 25)
    score += Math.min(Math.max(f.buyPower / 2 * 20, 0), 20)
    score += (f.tradeValue / maxTrade) * 15
    score += 10
    return Math.round(score)
  }

  const run = async (q: string) => {
    setQuery(q)
    setLoading(true)
    setError(null)
    setResults(null)
    setHoldingResults(null)
    setReturnAnswer(null)
    setPortfolioAnswer(null)
    setRetryCountdown(null)
    try {
      const filterRes = await fetch('/api/fund-filter-nl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) }).then(r => r.json())
      if (!filterRes.ok) {
        // خطای سهمیه سرور هوش مصنوعی — یک بار خودکار با شمارش معکوس دوباره تلاش کن
        if (filterRes.retryAfterSec != null && !retriedRef.current) {
          retriedRef.current = true
          retryQueryRef.current = q
          setRetryCountdown(Math.min(Number(filterRes.retryAfterSec) || 60, 90))
          setLoading(false)
          return
        }
        setError(filterRes.error || 'فهم درخواست ناموفق بود')
        setLoading(false)
        return
      }
      retriedRef.current = false
      const filter: Filter = filterRes.filter || {}

      // حالت «کدام صندوق بیشترین وزن روی سهم X را دارد» — از پرتفوی واقعی صندوق‌ها، نه فیلتر عددی
      if (filter.topHoldingQuery) {
        const hRes = await fetch(`/api/fund-holding-search?q=${encodeURIComponent(filter.topHoldingQuery)}`).then(r => r.json())
        setHoldingResults(hRes.results ?? [])
        setLoading(false)
        return
      }

      const fundsRes = await fetch('/api/funds', { cache: 'no-store' }).then(r => r.json())
      const assets: any[] = fundsRes.assets ?? []
      const records: any[] = fundsRes.records ?? []
      const histRows: any[] = fundsRes.histRows ?? []
      const recById = new Map(records.map(r => [r.asset_id, r]))
      const histByAsset = new Map<number, any[]>()
      for (const r of [...records, ...histRows]) {
        if (!histByAsset.has(r.asset_id)) histByAsset.set(r.asset_id, [])
        histByAsset.get(r.asset_id)!.push(r)
      }

      // حالت «بازده صندوق X در بازه Y چقدره؟» — برای یک صندوق مشخص، نه لیست/فیلتر
      if (filter.fundReturnFundName) {
        const nq = filter.fundReturnFundName.trim()
        const asset = assets.find(a => a.name === nq)
          || assets.find(a => a.name.includes(nq) || nq.includes(a.name))
        if (!asset) {
          setError(`صندوقی با نام «${nq}» پیدا نشد.`)
          setLoading(false)
          return
        }
        const period = filter.fundReturnPeriod || 'month'
        const snapRes = await fetch(`/api/fund-snapshot?slug=${encodeURIComponent(asset.slug)}`, { cache: 'no-store' }).then(r => r.json())
        const rows: any[] = (snapRes.rows ?? []).filter((r: any) => safe(r.price_close) > 0)
        if (rows.length < 2) {
          setError(`تاریخچه قیمتی کافی برای «${asset.name}» موجود نیست.`)
          setLoading(false)
          return
        }
        const tradingDays = PERIOD_TRADING_DAYS[period] ?? PERIOD_TRADING_DAYS.month
        const latest = rows[rows.length - 1]
        const pastIdx = Math.max(0, rows.length - 1 - tradingDays)
        const past = rows[pastIdx]
        const pct = safe(past.price_close) > 0 ? (safe(latest.price_close) - safe(past.price_close)) / safe(past.price_close) * 100 : 0
        setReturnAnswer({
          symbol: asset.name, slug: asset.slug, periodLabel: PERIOD_LABEL[period] ?? PERIOD_LABEL.month,
          pct, fromDate: past.trade_date_shamsi, toDate: latest.trade_date_shamsi,
        })
        setLoading(false)
        return
      }

      // حالت «پورتفوی صندوق X چیه؟» یا «صندوق X چی خریده/فروخته؟» — پرتفوی واقعی همان صندوق
      if (filter.fundPortfolioQuery) {
        const nq = filter.fundPortfolioQuery.trim()
        const asset = assets.find(a => a.name === nq)
          || assets.find(a => a.name.includes(nq) || nq.includes(a.name))
        if (!asset) {
          setError(`صندوقی با نام «${nq}» پیدا نشد.`)
          setLoading(false)
          return
        }
        const mode = filter.fundPortfolioMode || 'holdings'
        const pRes = await fetch(`/api/fund-portfolio?slug=${encodeURIComponent(asset.slug)}&mode=${mode}`, { cache: 'no-store' }).then(r => r.json())
        if (!pRes.items || pRes.items.length === 0) {
          setError(`اطلاعات پرتفوی برای «${asset.name}» موجود نیست.`)
          setLoading(false)
          return
        }
        setPortfolioAnswer({ symbol: asset.name, slug: asset.slug, mode, period: pRes.period, items: pRes.items })
        setLoading(false)
        return
      }

      let list: Omit<Fund, 'score'>[] = assets.map(a => {
        const rec = recById.get(a.id)
        const buyAvg = safe(rec?.buy_count_i) > 0 ? (safe(rec?.buy_i_volume) * safe(rec?.price_close)) / safe(rec?.buy_count_i) : 0
        const sellAvg = safe(rec?.sell_count_i) > 0 ? (safe(rec?.sell_i_volume) * safe(rec?.price_close)) / safe(rec?.sell_count_i) : 0
        const hist = (histByAsset.get(a.id) ?? []).slice().sort((x, y) => String(x.trade_date_shamsi).localeCompare(String(y.trade_date_shamsi)))
        const oldest = hist[0]
        const weeklyReturn = oldest && safe(oldest.price_close) > 0 && rec
          ? (safe(rec.price_close) - safe(oldest.price_close)) / safe(oldest.price_close) * 100
          : 0
        return {
          symbol: a.name, slug: a.slug, category: a.category || 'طلا',
          changePct: safe(rec?.price_change_pct),
          weeklyReturn,
          tradeValue: Math.round(safe(rec?.trade_value) / 1e9),
          netFlow: (safe(rec?.buy_i_volume) - safe(rec?.sell_i_volume)) * safe(rec?.price_close),
          buyPower: sellAvg > 0 ? buyAvg / sellAvg : 0,
        }
      }).filter(f => f.tradeValue > 0)

      if (filter.category) list = list.filter(f => f.category === filter.category)
      if (filter.minChangePct != null) list = list.filter(f => f.changePct >= filter.minChangePct!)
      if (filter.maxChangePct != null) list = list.filter(f => f.changePct <= filter.maxChangePct!)
      if (filter.minTradeValue != null) list = list.filter(f => f.tradeValue >= filter.minTradeValue!)
      if (filter.onlyPositiveFlow) list = list.filter(f => f.netFlow > 0)
      if (filter.onlyNegativeFlow) list = list.filter(f => f.netFlow < 0)

      const maxFlow = Math.max(...list.map(f => Math.abs(f.netFlow)), 1)
      const maxTrade = Math.max(...list.map(f => f.tradeValue), 1)
      let withScore: Fund[] = list.map(f => ({ ...f, score: calcScore(f, maxFlow, maxTrade) }))

      const sortBy = filter.sortBy || 'score'
      const dir = filter.sortDir === 'asc' ? 1 : -1
      withScore.sort((a, b) => dir * ((a[sortBy] ?? 0) - (b[sortBy] ?? 0)))

      setActiveMetric(sortBy === 'weeklyReturn' ? 'weeklyReturn' : 'changePct')
      setResults(withScore.slice(0, 15))
    } catch {
      setError('دریافت داده ناموفق بود')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section style={{
      background: panel, border: `0.5px solid ${border}`, borderRadius: 16,
      padding: '20px 20px 22px', marginBottom: 22, backdropFilter: 'blur(12px)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: ACCENT, flexShrink: 0, boxShadow: `0 0 10px ${ACCENT}` }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: text }}>دستیار جست‌وجوی صندوق‌ها</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && query.trim()) run(query.trim()) }}
          placeholder="مثلاً: صندوق‌های طلا با بیشترین رشد امروز"
          style={{
            flex: 1, minWidth: 220, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontFamily: 'inherit',
            background: isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: text, border: `0.5px solid ${border}`,
          }}
        />
        <button onClick={() => query.trim() && run(query.trim())} disabled={loading || !query.trim()} style={{
          fontSize: 12.5, fontWeight: 700, padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
          background: ACCENT, color: '#04202e', border: 'none', opacity: loading ? 0.6 : 1,
        }}>
          {loading ? 'در حال جست‌وجو…' : 'جست‌وجو'}
        </button>
      </div>
      {!results && !loading && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {EXAMPLES.map(ex => (
            <button key={ex} onClick={() => run(ex)} style={{
              fontSize: 11, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', color: muted, border: `0.5px solid ${border}`,
            }}>{ex}</button>
          ))}
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: RED, marginTop: 8 }}>{error}</div>}
      {retryCountdown != null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
          fontSize: 12.5, color: muted, padding: '9px 12px', borderRadius: 10,
          background: isDark ? 'rgba(56,189,248,0.06)' : 'rgba(56,189,248,0.08)',
          border: `0.5px solid ${isDark ? 'rgba(56,189,248,0.25)' : 'rgba(56,189,248,0.35)'}`,
        }}>
          <span aria-hidden style={{ flexShrink: 0 }}>⏳</span>
          <span>
            سرور هوش مصنوعی موقتاً شلوغ است — تلاش دوباره تا{' '}
            <b style={{ color: text }}>{retryCountdown.toLocaleString('fa-IR')}</b> ثانیه دیگر…
          </span>
        </div>
      )}
      {returnAnswer && (
        <Link href={`/fund/${encodeURIComponent(returnAnswer.slug)}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '12px 14px', borderRadius: 10, textDecoration: 'none', marginTop: 12,
          background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,30,46,0.02)',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{returnAnswer.symbol}</div>
            <div style={{ fontSize: 10.5, color: muted, marginTop: 3 }}>
              بازده {returnAnswer.periodLabel} ({returnAnswer.fromDate} تا {returnAnswer.toDate})
            </div>
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: returnAnswer.pct >= 0 ? GREEN : RED }}>
            {returnAnswer.pct >= 0 ? '+' : ''}{returnAnswer.pct.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪
          </span>
        </Link>
      )}
      {portfolioAnswer && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>
            {portfolioAnswer.mode === 'buys' ? 'خریدهای اخیر' : portfolioAnswer.mode === 'sells' ? 'فروش‌های اخیر' : 'پرتفوی'} صندوق{' '}
            <Link href={`/fund/${encodeURIComponent(portfolioAnswer.slug)}`} style={{ color: ACCENT, fontWeight: 700 }}>{portfolioAnswer.symbol}</Link>
            {' '}({portfolioAnswer.period})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {portfolioAnswer.items.map((it, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '9px 12px', borderRadius: 10,
                background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,30,46,0.02)',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: text }}>{it.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>
                  {portfolioAnswer.mode === 'holdings'
                    ? `${it.value.toLocaleString('fa-IR')}٪`
                    : `${Math.round(it.value / 1e9).toLocaleString('fa-IR')} م.ت`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {holdingResults && (
        holdingResults.length === 0 ? (
          <div style={{ fontSize: 12.5, color: muted, marginTop: 10 }}>صندوقی با این سهم در پرتفویش پیدا نشد.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            {holdingResults.map(h => (
              <Link key={h.slug} href={`/fund/${encodeURIComponent(h.slug)}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '9px 12px', borderRadius: 10, textDecoration: 'none',
                background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,30,46,0.02)',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: text }}>{h.symbol}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10.5, color: muted }}>{h.period}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>{h.weightPct.toLocaleString('fa-IR')}٪</span>
                </div>
              </Link>
            ))}
          </div>
        )
      )}
      {results && (
        results.length === 0 ? (
          <div style={{ fontSize: 12.5, color: muted, marginTop: 10 }}>صندوقی با این شرایط پیدا نشد.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            {results.map(f => (
              <Link key={f.slug} href={`/fund/${encodeURIComponent(f.slug)}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '9px 12px', borderRadius: 10, textDecoration: 'none',
                background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,30,46,0.02)',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: text }}>{f.symbol}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11.5, color: muted }}>{f.tradeValue.toLocaleString('fa-IR')} م.ت</span>
                  {activeMetric === 'weeklyReturn' && <span style={{ fontSize: 10, color: muted }}>هفتگی</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: f[activeMetric] >= 0 ? GREEN : RED }}>
                    {f[activeMetric] >= 0 ? '+' : ''}{f[activeMetric].toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )
      )}
    </section>
  )
}
