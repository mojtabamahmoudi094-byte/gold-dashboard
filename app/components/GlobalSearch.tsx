'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clean } from '../../lib/vipFiltersShared'

type Sym = { l18: string; l30: string; plp: number | null }
type Industry = { name: string; symbols: Sym[] }
type Payload = { industries: Industry[] }

const norm = (s: unknown) =>
  clean(s).replace(/[آأإ]/g, 'ا').replace(/ة/g, 'ه').replace(/ؤ/g, 'و')

let cache: { s: Sym; indName: string }[] | null = null
let inflight: Promise<{ s: Sym; indName: string }[]> | null = null

async function loadSymbols() {
  if (cache) return cache
  if (!inflight) {
    inflight = fetch('/api/stocks-industries')
      .then(r => r.json())
      .then((data: Payload) => {
        const out: { s: Sym; indName: string }[] = []
        for (const ind of data?.industries ?? [])
          for (const s of ind.symbols ?? []) out.push({ s, indName: ind.name })
        cache = out
        return out
      })
      .catch(() => [])
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
  const [symbols, setSymbols] = useState<{ s: Sym; indName: string }[]>([])
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
    const rank = (x: { s: Sym; indName: string }) => {
      const nSym = norm(x.s.l18)
      const nName = norm(x.s.l30)
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

  const goTo = (sym: string) => {
    setOpen(false)
    setQuery('')
    router.push(`/stock/${encodeURIComponent(sym)}`)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter' && results[activeIdx]) { goTo(results[activeIdx].s.l18) }
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
          background: open ? 'rgba(59,130,246,0.1)' : 'transparent',
          border: `1px solid ${open ? 'rgba(59,130,246,0.35)' : border}`,
          color: open ? '#3b82f6' : muted,
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
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(59,130,246,0.15)'}`,
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
            aria-activedescendant={nq && results[activeIdx] ? `global-search-option-${results[activeIdx].s.l18}` : undefined}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '9px 12px', borderRadius: 10,
              border: `1px solid ${border}`,
              background: isDark ? '#0d1017' : '#fff',
              color: isDark ? '#eef1f8' : '#1A1205',
              fontSize: 13, fontFamily: 'inherit', outline: 'none',
            }}
          />

          {nq && (
            <div id="global-search-listbox" role="listbox" style={{ marginTop: 6, maxHeight: 320, overflowY: 'auto' }}>
              {results.length === 0 ? (
                <div style={{ padding: '14px 8px', fontSize: 12, color: muted, textAlign: 'center' }}>نمادی یافت نشد</div>
              ) : results.map(({ s, indName }, i) => {
                const up = (s.plp ?? 0) > 0
                const down = (s.plp ?? 0) < 0
                return (
                  <div
                    key={s.l18}
                    id={`global-search-option-${s.l18}`}
                    role="option"
                    aria-selected={i === activeIdx}
                    onMouseDown={() => goTo(s.l18)}
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
                    }}>{s.l30} · {indName}</span>
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
