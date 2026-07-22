'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clean } from '../../lib/vipFiltersShared'

type Sym = { l18: string; l30: string; plp: number | null }
type Industry = { name: string; symbols: Sym[] }
type ExtraGroup = { name: string; symbols: Sym[] }
type Payload = { industries: Industry[]; extraGroups?: ExtraGroup[] }
type Asset = { id: number; name: string; slug: string; category: string }
type FundsPayload = { assets: Asset[] }

const norm = (s: unknown) =>
  clean(s).replace(/[آأإ]/g, 'ا').replace(/ة/g, 'ه').replace(/ؤ/g, 'و')

type Entry = { l18: string; l30: string; plp: number | null; sub: string; href: string }

let cache: Entry[] | null = null
let inflight: Promise<Entry[]> | null = null

async function loadSymbols() {
  if (cache) return cache
  if (!inflight) {
    inflight = Promise.all([
      fetch('/api/stocks-industries').then(r => r.json()).catch(() => ({ industries: [] })),
      fetch('/api/funds').then(r => r.json()).catch(() => ({ assets: [] })),
    ]).then(([stocksData, fundsData]: [Payload, FundsPayload]) => {
      const out: Entry[] = []
      const seen = new Set<string>()

      // نگاشت نام صندوق → slug صفحه اختصاصی /fund (اگر وجود داشته باشد)
      const fundSlug = new Map<string, string>()
      for (const a of fundsData?.assets ?? []) fundSlug.set(a.name, a.slug)

      for (const ind of stocksData?.industries ?? []) {
        for (const s of ind.symbols ?? []) {
          if (seen.has(s.l18)) continue
          seen.add(s.l18)
          out.push({ l18: s.l18, l30: s.l30, plp: s.plp, sub: `${s.l30} · ${ind.name}`, href: `/stock/${encodeURIComponent(s.l18)}` })
        }
      }
      // صندوق‌های سهام‌محور (اهرمی/بخشی/سهامی) — فقط در extraGroups هستند، نه industries
      // اگر صفحه اختصاصی صندوق داشته باشند به /fund می‌روند، وگرنه /stock
      for (const grp of stocksData?.extraGroups ?? []) {
        for (const s of grp.symbols ?? []) {
          if (seen.has(s.l18)) continue
          seen.add(s.l18)
          const slug = fundSlug.get(s.l18)
          const href = slug != null ? `/fund/${encodeURIComponent(slug)}` : `/stock/${encodeURIComponent(s.l18)}`
          out.push({ l18: s.l18, l30: s.l30 || s.l18, plp: s.plp, sub: grp.name, href })
        }
      }
      // صندوق‌های درآمد ثابت/کالایی و بقیه — از جدول assets (شامل slug صفحه صندوق)
      for (const a of fundsData?.assets ?? []) {
        if (seen.has(a.name)) continue
        seen.add(a.name)
        out.push({ l18: a.name, l30: a.name, plp: null, sub: a.category, href: `/fund/${encodeURIComponent(a.slug)}` })
      }

      cache = out
      return out
    })
  }
  return inflight
}

const SearchIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

export default function GlobalSearch({ isDark, compact }: { isDark: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [symbols, setSymbols] = useState<Entry[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    loadSymbols().then(setSymbols)
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const nq = norm(query)

  const results = useMemo(() => {
    if (!nq) return []
    const isSubseq = (s: string) => {
      let i = 0
      for (const ch of s) if (ch === nq[i]) i++
      return i === nq.length
    }
    const rank = (x: Entry) => {
      const nSym = norm(x.l18)
      const nName = norm(x.l30)
      return nSym.startsWith(nq) ? 0
        : nSym.includes(nq) ? 1
        : nName.includes(nq) ? 2
        : nq.length >= 2 && isSubseq(nSym) ? 3
        : -1
    }
    return symbols
      .map(x => ({ x, r: rank(x) }))
      .filter(m => m.r >= 0)
      .sort((a, b) => a.r - b.r)
      .slice(0, 8)
      .map(m => m.x)
  }, [symbols, nq])

  useEffect(() => setActiveIdx(0), [nq])

  const goTo = (href: string) => {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter' && results[activeIdx]) { goTo(results[activeIdx].href) }
  }

  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
  const muted = isDark ? '#6b7280' : '#7A6A50'

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="جستجوی نماد"
        aria-label="جستجوی نماد"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: compact ? 36 : 34, height: compact ? 36 : 34, borderRadius: 8, cursor: 'pointer',
          background: open ? 'rgba(217,180,91,0.1)' : 'transparent',
          border: `1px solid ${open ? 'rgba(217,180,91,0.35)' : border}`,
          color: open ? (isDark ? '#d9b45b' : '#b8860b') : muted,
          transition: 'all 0.2s',
        }}
      >
        <SearchIcon />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', insetInlineEnd: 0,
          width: 300, maxWidth: '90vw', zIndex: 400,
          background: isDark ? '#12161f' : '#fffdf8',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(217,180,91,0.15)'}`,
          borderRadius: 14, padding: 8,
          boxShadow: isDark ? '0 18px 50px rgba(0,0,0,0.6)' : '0 14px 40px rgba(0,0,0,0.14)',
          direction: 'rtl',
        }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="نماد یا نام شرکت… (مثلاً فولاد)"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!!nq && results.length > 0}
            aria-controls="global-search-listbox"
            aria-activedescendant={nq && results[activeIdx] ? `global-search-option-${results[activeIdx].l18}` : undefined}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '9px 12px', borderRadius: 10,
              border: `1px solid ${border}`,
              background: isDark ? '#0d1017' : '#fff',
              color: isDark ? '#eef1f8' : '#1A1205',
              fontSize: 13, fontFamily: 'inherit',
            }}
          />

          {nq && (
            <div id="global-search-listbox" role="listbox" style={{ marginTop: 6, maxHeight: 320, overflowY: 'auto' }}>
              {results.length === 0 ? (
                <div style={{ padding: '14px 8px', fontSize: 12, color: muted, textAlign: 'center' }}>نمادی یافت نشد</div>
              ) : results.map((s, i) => {
                const up = (s.plp ?? 0) > 0
                const down = (s.plp ?? 0) < 0
                return (
                  <div
                    key={s.l18}
                    id={`global-search-option-${s.l18}`}
                    role="option"
                    aria-selected={i === activeIdx}
                    onMouseDown={() => goTo(s.href)}
                    onMouseEnter={() => setActiveIdx(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 8px', borderRadius: 8, cursor: 'pointer',
                      background: i === activeIdx ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.05)') : 'transparent',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#eef1f8' : '#1A1205', flexShrink: 0 }}>{s.l18}</span>
                    <span style={{
                      fontSize: 11, color: muted, flex: 1, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{s.sub}</span>
                    {s.plp != null && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                        color: up ? '#00E5A0' : down ? '#FF4D6A' : muted,
                      }}>
                        {up ? '▲' : down ? '▼' : ''} {s.plp.toFixed(2)}٪
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
