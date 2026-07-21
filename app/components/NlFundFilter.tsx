'use client'

import { useState } from 'react'
import Link from 'next/link'

type Fund = {
  symbol: string; slug: string; category: string
  changePct: number; tradeValue: number; netFlow: number; buyPower: number; score: number
}

type Filter = {
  category?: string | null
  sortBy?: 'score' | 'changePct' | 'tradeValue' | 'netFlow' | 'buyPower' | null
  sortDir?: 'asc' | 'desc' | null
  minChangePct?: number | null
  maxChangePct?: number | null
  minTradeValue?: number | null
  onlyPositiveFlow?: boolean | null
  onlyNegativeFlow?: boolean | null
}

const safe = (v: unknown) => Number(v) || 0
const GREEN = '#00E5A0'
const RED = '#FF4D6A'
const ACCENT = '#38BDF8'

const EXAMPLES = [
  'صندوق‌های طلا با بیشترین رشد امروز',
  'صندوق‌هایی با ورود پول قوی',
  'صندوق‌های نقره با بیشترین ارزش معاملات',
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
    try {
      const [fundsRes, filterRes] = await Promise.all([
        fetch('/api/funds', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/fund-filter-nl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) }).then(r => r.json()),
      ])
      if (!filterRes.ok) { setError(filterRes.error || 'فهم درخواست ناموفق بود'); setLoading(false); return }
      const filter: Filter = filterRes.filter || {}

      const assets: any[] = fundsRes.assets ?? []
      const records: any[] = fundsRes.records ?? []
      const recById = new Map(records.map(r => [r.asset_id, r]))
      let list: Omit<Fund, 'score'>[] = assets.map(a => {
        const rec = recById.get(a.id)
        const buyAvg = safe(rec?.buy_count_i) > 0 ? (safe(rec?.buy_i_volume) * safe(rec?.price_close)) / safe(rec?.buy_count_i) : 0
        const sellAvg = safe(rec?.sell_count_i) > 0 ? (safe(rec?.sell_i_volume) * safe(rec?.price_close)) / safe(rec?.sell_count_i) : 0
        return {
          symbol: a.name, slug: a.slug, category: a.category || 'طلا',
          changePct: safe(rec?.price_change_pct),
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
                  <span style={{ fontSize: 12, fontWeight: 700, color: f.changePct >= 0 ? GREEN : RED }}>
                    {f.changePct >= 0 ? '+' : ''}{f.changePct.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪
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
