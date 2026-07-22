'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useIsMobile } from '../../lib/useIsMobile'
import { shouldUseDark } from '../../lib/theme'
import { squarify, type Rect } from '../../lib/treemap'
import { TutorialPanel } from '../components/ui/TutorialPanel'

type Board = 'bourse' | 'fara-bourse' | 'other'
type Sym = {
  l18: string; l30: string
  pl: number | null; plp: number | null
  pc: number | null; pcp: number | null
  tval: number | null; tvol: number | null
  mv: number | null; pe: number | null
  board?: Board
}
type Industry = {
  id: number | null; name: string; count: number
  tval: number; mv: number; up: number; down: number
  symbols: Sym[]
}
type ExtraGroup = {
  id: number; name: string; kind: 'fund' | 'right' | 'commodity'; count: number
  tval: number; mv: number; up: number; down: number
  symbols: Sym[]
}
type Payload = { updated: string; industries: Industry[]; extraGroups?: ExtraGroup[] }

type SizeMetric = 'tval' | 'mv'
type ColorMetric = 'plp' | 'pcp'
type GroupBy = 'industry' | 'flat'
type AssetType = 'stock' | 'warrant' | 'fund' | 'option'

const ASSET_TYPES: { key: AssetType; label: string; available: boolean }[] = [
  { key: 'stock',   label: 'سهام',       available: true },
  { key: 'warrant', label: 'حق تقدم',    available: true },
  { key: 'fund',    label: 'صندوق',      available: true },
  { key: 'option',  label: 'آپشن',       available: true },
]

type MarketType = 'bourse' | 'faraBourse' | 'option' | 'fund' | 'commodityFund'

const MARKET_TYPES: { key: MarketType; label: string }[] = [
  { key: 'bourse',        label: 'بورس' },
  { key: 'faraBourse',    label: 'فرا بورس' },
  { key: 'option',        label: 'آپشن' },
  { key: 'fund',          label: 'صندوق‌ها' },
  { key: 'commodityFund', label: 'صندوق کالایی' },
]

type Filters = {
  industryId: string        // 'all' یا id صنعت
  size: SizeMetric
  colorBy: ColorMetric
  groupBy: GroupBy
  showChange: boolean
  assetTypes: Record<AssetType, boolean>
  markets: Record<MarketType, boolean>
}

const DEFAULT_FILTERS: Filters = {
  industryId: 'all',
  size: 'tval',
  colorBy: 'plp',
  groupBy: 'industry',
  showChange: false,
  assetTypes: { stock: true, warrant: false, fund: false, option: false },
  markets: { bourse: true, faraBourse: true, option: true, fund: true, commodityFund: true },
}

// رنگ حرارتی بر اساس درصد تغییر — سقف نمایش ۵٪ (بیشتر از آن هم به رنگ کاملاً اشباع می‌رسد)
function heatColor(pct: number | null): string {
  if (pct == null || pct === 0) return 'oklch(0.32 0.01 250)'
  const cap = 5
  const t = Math.min(Math.abs(pct), cap) / cap
  const L = 0.28 + 0.24 * t
  const C = 0.05 + 0.17 * t
  const H = pct > 0 ? 150 : 25
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H})`
}

const fmtPct = (v: number | null) =>
  v == null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`

const fmtToman = (rial: number | null) =>
  rial == null ? '—' : `${rial > 0 ? '+' : ''}${Math.round(rial / 10).toLocaleString('fa-IR')} ت`

const hemat = (rial: number) =>
  rial >= 1e13
    ? `${(rial / 1e13).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} همت`
    : `${Math.round(rial / 1e10).toLocaleString('fa-IR')} میلیارد ت`

export default function MarketMapPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [optionGroup, setOptionGroup] = useState<ExtraGroup | null>(null)
  const [failed, setFailed] = useState(false)
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()

  const [pending, setPending] = useState<Filters>(DEFAULT_FILTERS)
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS)
  const [fullscreen, setFullscreen] = useState(false)
  const [hover, setHover] = useState<Sym | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 560 })

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    fetch('/api/stocks-industries')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setFailed(true))
    fetch('/api/option-chain')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setOptionGroup(d?.group ?? null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => setBox({
      w: el.clientWidth,
      h: isMobile ? Math.max(window.innerHeight - 300, 420) : Math.max(window.innerHeight - 260, 520),
    })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => { ro.disconnect(); window.removeEventListener('resize', update) }
  }, [isMobile, data])

  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = () => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) el.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  const bg    = isDark ? '#060B14' : '#F4F7FB'
  const panel = isDark ? 'rgba(10,18,30,0.9)' : 'rgba(255,255,255,0.92)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'
  const line  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,30,46,0.1)'
  const accent = isDark ? '#7FB5E8' : '#2563EB'

  const applyFilters = () => setApplied(pending)

  const groups = useMemo(() => {
    // 'other' یعنی ISIN نماد با الگوی استاندارد بورس/فرابورس مطابقت نداشت (داده BrsApi همیشه کامل نیست) —
    // به‌جای حذف نماد از نقشه، همیشه نمایش داده می‌شود تا فیلتر بازار باعث گم‌شدن سهم واقعی نشود
    const boardOk = (b?: Board) =>
      !b || b === 'other' ||
      (b === 'bourse' && applied.markets.bourse) || (b === 'fara-bourse' && applied.markets.faraBourse)

    const stockGroups = applied.assetTypes.stock
      ? (() => {
          const industries = data?.industries ?? []
          const picked = applied.industryId === 'all'
            ? industries
            : industries.filter(ind => String(ind.id) === applied.industryId)
          return picked
            .map(ind => ({ id: ind.id ?? -2, name: ind.name, symbols: ind.symbols.filter(s => boardOk(s.board)) }))
            .filter(ind => ind.symbols.length > 0)
        })()
      : []

    const extra = (data?.extraGroups ?? []).filter(g =>
      (g.kind === 'fund' && applied.assetTypes.fund && applied.markets.fund) ||
      (g.kind === 'commodity' && applied.assetTypes.fund && applied.markets.commodityFund) ||
      (g.kind === 'right' && applied.assetTypes.warrant),
    )

    const option = applied.assetTypes.option && applied.markets.option && optionGroup ? [optionGroup] : []

    const all = [...stockGroups, ...extra, ...option]

    if (applied.groupBy === 'flat') {
      const symbols = all.flatMap(g => g.symbols)
      return symbols.length ? [{ id: -1, name: 'همه بازار', symbols }] : []
    }
    return all
  }, [data, optionGroup, applied])

  const sizeOf = (s: Sym) => Math.max(s[applied.size] ?? 0, 1)

  const layout = useMemo(() => {
    if (!box.w || groups.length === 0) return []
    const withSize = groups.map(g => ({ g, total: g.symbols.reduce((a, s) => a + sizeOf(s), 0) }))
    const sorted = [...withSize].sort((a, b) => b.total - a.total)
    const rects = squarify(sorted.map(x => x.total), 0, 0, box.w, box.h)
    return sorted.map((x, i) => ({ group: x.g, rect: rects[i] as Rect }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, box, applied.size])

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '20px 12px 40px' : '32px 24px 48px' }}>

        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: isMobile ? 19 : 22, fontWeight: 700, color: text, margin: '0 0 6px' }}>
            نقشه بازار
          </h1>
          <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.8 }}>
            نقشه حرارتی سهام بورس و فرابورس — اندازه هر جعبه بر اساس {applied.size === 'tval' ? 'ارزش معاملات' : 'ارزش بازار'} و
            رنگ آن بر اساس درصد تغییر {applied.colorBy === 'plp' ? 'قیمت آخرین' : 'قیمت پایانی'}
            {data && <span style={{ marginRight: 8 }}>· به‌روزرسانی: {data.updated}</span>}
          </div>
        </div>

        <TutorialPanel t={{
          bg, surface: panel, panel, panelSolid: panel,
          border: line, borderStrong: line, borderData: line,
          text, textBright: text, muted, faint: muted,
          brand: accent, brand2: accent, accent,
          green: 'oklch(0.74 0.16 150)', red: 'oklch(0.68 0.19 25)',
          inputBg: panel, headerBg: panel, cardShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }} isDark={isDark} storageKey="market_map_tutorial_open" title="چطور از این صفحه استفاده کنم؟">
          هر جعبه یک نماد است — اندازه‌اش با ارزش معاملات (یا ارزش بازار) و رنگش با درصد تغییر قیمت مشخص می‌شود؛
          سبز یعنی مثبت، قرمز یعنی منفی و هرچه رنگ پررنگ‌تر باشد تغییر بزرگ‌تر است. روی هر جعبه بزنید تا وارد صفحه نماد شوید.
          از فیلترهای بالا برای محدود کردن به یک صنعت خاص یا تغییر معیار اندازه/رنگ استفاده کنید و «اعمال فیلتر» را بزنید.
        </TutorialPanel>

        {/* نوار ابزار فیلتر */}
        {data && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: isMobile ? 'nowrap' : 'wrap',
            overflowX: isMobile ? 'auto' : 'visible',
            background: panel, border: `0.5px solid ${line}`, borderRadius: 14,
            padding: '10px 14px', marginBottom: 14, backdropFilter: 'blur(12px)',
          }}>
            <IconBtn title={fullscreen ? 'خروج از تمام‌صفحه' : 'نمایش تمام‌صفحه'} onClick={toggleFullscreen} muted={muted} line={line}>
              {fullscreen ? <ExitFsIcon /> : <FsIcon />}
            </IconBtn>
            <IconBtn title="به‌زودی" disabled muted={muted} line={line}>
              <CameraIcon />
            </IconBtn>

            <AssetMenu
              value={pending.assetTypes}
              onChange={v => setPending(p => ({ ...p, assetTypes: v }))}
              muted={muted} line={line} panel={panel} text={text}
            />

            <MarketMenu
              value={pending.markets}
              onChange={v => setPending(p => ({ ...p, markets: v }))}
              muted={muted} line={line} panel={panel} text={text}
            />

            <Field label="صنعت" muted={muted}>
              <Select
                value={pending.industryId}
                onChange={v => setPending(p => ({ ...p, industryId: v }))}
                line={line} panel={panel} text={text}
              >
                <option value="all">همه صنایع</option>
                {(data.industries ?? []).map(ind => (
                  <option key={ind.id ?? ind.name} value={String(ind.id)}>{ind.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="اندازه" muted={muted}>
              <Select
                value={pending.size}
                onChange={v => setPending(p => ({ ...p, size: v as SizeMetric }))}
                line={line} panel={panel} text={text}
              >
                <option value="tval">ارزش معاملات</option>
                <option value="mv">ارزش بازار</option>
              </Select>
            </Field>

            <Field label="بازه قیمتی" muted={muted}>
              <Select value="soon" onChange={() => {}} line={line} panel={panel} text={text} disabled>
                <option value="soon">به‌زودی</option>
              </Select>
            </Field>

            <Field label="دسته‌بندی" muted={muted}>
              <Select
                value={pending.groupBy}
                onChange={v => setPending(p => ({ ...p, groupBy: v as GroupBy }))}
                line={line} panel={panel} text={text}
              >
                <option value="industry">بر اساس صنعت</option>
                <option value="flat">بدون گروه‌بندی</option>
              </Select>
            </Field>

            <Field label="رنگ‌بندی" muted={muted}>
              <Select
                value={pending.colorBy}
                onChange={v => setPending(p => ({ ...p, colorBy: v as ColorMetric }))}
                line={line} panel={panel} text={text}
              >
                <option value="plp">درصد تغییر قیمت آخرین</option>
                <option value="pcp">درصد تغییر قیمت پایانی</option>
              </Select>
            </Field>

            <Field label="سابقه" muted={muted}>
              <input disabled placeholder="به‌زودی" style={{
                width: 90, padding: '7px 10px', borderRadius: 9, border: `0.5px solid ${line}`,
                background: 'transparent', color: muted, fontSize: 11.5, fontFamily: 'inherit',
              }} />
            </Field>

            <Toggle label="نمایش گشایش پیش" checked={false} onChange={() => {}} disabled muted={muted} line={line} text={text} />
            <Toggle
              label="نمایش قیمت"
              checked={pending.showChange}
              onChange={v => setPending(p => ({ ...p, showChange: v }))}
              muted={muted} line={line} text={text}
            />

            <button
              onClick={applyFilters}
              style={{
                marginRight: isMobile ? 0 : 'auto', flexShrink: 0,
                padding: '8px 18px', borderRadius: 10, border: 'none',
                background: accent, color: '#06111f', fontWeight: 700, fontSize: 12.5,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              اعمال فیلتر
            </button>
          </div>
        )}

        {failed && (
          <div style={{
            background: panel, border: `0.5px solid ${line}`, borderRadius: 16,
            padding: '40px 24px', textAlign: 'center', color: muted, fontSize: 13, lineHeight: 2,
          }}>
            داده نقشه بازار هنوز بارگذاری نشده است.
          </div>
        )}

        {!data && !failed && (
          <div style={{ color: muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
            در حال بارگذاری…
          </div>
        )}

        {data && (
          <div
            ref={containerRef}
            style={{
              background: isDark ? '#04070d' : '#0c1420',
              borderRadius: 14, border: `0.5px solid ${line}`,
              padding: 4, position: 'relative',
            }}
          >
            <div ref={stageRef} style={{ position: 'relative', width: '100%', height: box.h }}>
              {layout.map(({ group, rect }) => (
                <GroupBlock
                  key={group.id}
                  group={group}
                  rect={rect}
                  applied={applied}
                  onHover={setHover}
                />
              ))}
              {layout.length === 0 && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: muted, fontSize: 13,
                }}>
                  نمادی برای نمایش با این فیلتر پیدا نشد
                </div>
              )}
            </div>

            {hover && (
              <div style={{
                position: 'absolute', bottom: 10, right: 10, zIndex: 5,
                background: panel, border: `0.5px solid ${line}`, borderRadius: 12,
                padding: '10px 14px', minWidth: 180, backdropFilter: 'blur(12px)',
                pointerEvents: 'none',
              }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: text }}>{hover.l18}</div>
                <div style={{ fontSize: 11, color: muted, marginBottom: 6 }}>{hover.l30}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                  <span style={{ color: muted }}>تغییر قیمت آخرین</span>
                  <span style={{ color: (hover.plp ?? 0) > 0 ? 'oklch(0.74 0.16 150)' : (hover.plp ?? 0) < 0 ? 'oklch(0.68 0.19 25)' : muted }}>
                    {fmtPct(hover.plp)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                  <span style={{ color: muted }}>ارزش معاملات</span>
                  <span style={{ color: text }}>{hemat(hover.tval ?? 0)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* راهنمای رنگ */}
        {data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: muted }}>
            <span>منفی</span>
            <div style={{ display: 'flex', height: 8, width: 160, borderRadius: 4, overflow: 'hidden' }}>
              {[5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5].map((v, i) => (
                <div key={i} style={{ flex: 1, background: heatColor(i < 5 ? -v : v) }} />
              ))}
            </div>
            <span>مثبت</span>
          </div>
        )}
      </div>
    </main>
  )
}

function GroupBlock({ group, rect, applied, onHover }: {
  group: { id: number; name: string; symbols: Sym[] }
  rect: Rect
  applied: Filters
  onHover: (s: Sym | null) => void
}) {
  const showHeader = rect.h > 44 && rect.w > 60
  const headerH = showHeader ? 22 : 0
  const sizeOf = (s: Sym) => Math.max(s[applied.size] ?? 0, 1)

  const inner = useMemo(() => {
    if (rect.w <= 0 || rect.h - headerH <= 0) return []
    const sorted = [...group.symbols].sort((a, b) => sizeOf(b) - sizeOf(a))
    const rects = squarify(sorted.map(sizeOf), 0, 0, rect.w, rect.h - headerH)
    return sorted.map((s, i) => ({ s, r: rects[i] as Rect }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, rect.w, rect.h, applied.size])

  return (
    <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      {showHeader && (
        <div style={{
          height: headerH, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#000', color: '#fff', fontSize: 11.5, fontWeight: 700,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', padding: '0 6px',
        }}>
          {group.name}
        </div>
      )}
      <div style={{ position: 'absolute', left: 0, top: headerH, width: rect.w, height: rect.h - headerH }}>
        {inner.map(({ s, r }) => {
          const pct = s[applied.colorBy]
          const color = heatColor(pct)
          const showText = r.w > 34 && r.h > 22
          return (
            <Link
              key={s.l18}
              href={`/stock/${encodeURIComponent(s.l18)}`}
              onMouseEnter={() => onHover(s)}
              onMouseLeave={() => onHover(null)}
              style={{
                position: 'absolute', left: r.x + 0.5, top: r.y + 0.5, width: Math.max(r.w - 1, 0), height: Math.max(r.h - 1, 0),
                background: color, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', overflow: 'hidden', textDecoration: 'none',
                color: '#fff', fontWeight: 700, cursor: 'pointer',
              }}
            >
              {showText && (
                <>
                  <span style={{ fontSize: Math.min(Math.max(r.w / 5, 10), 20) }}>{s.l18}</span>
                  <span style={{ fontSize: Math.min(Math.max(r.w / 7, 9), 13), opacity: 0.9 }}>
                    {fmtPct(pct)}
                  </span>
                  {applied.showChange && r.h > 46 && (
                    <span style={{ fontSize: 10, opacity: 0.85 }}>{fmtToman(s.pl)}</span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function AssetMenu({ value, onChange, muted, line, panel, text }: {
  value: Record<AssetType, boolean>
  onChange: (v: Record<AssetType, boolean>) => void
  muted: string; line: string; panel: string; text: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // پنل با createPortal بیرون از wrapRef در DOM رندر می‌شود — پس کلیک داخل خودِ پنل هم
    // باید به‌عنوان «داخل» حساب شود، وگرنه هر کلیک روی چک‌باکس‌ها منو را می‌بندد
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // پنل با createPortal به document.body و position:fixed رندر می‌شود — چون نوار ابزار
  // backdrop-filter دارد و طبق مشخصات CSS این هم مثل transform یک containing-block جدید
  // برای فرزندهای fixed می‌سازد؛ بدون پورتال، پنل به‌جای viewport نسبت به همان نوار ابزار جابه‌جا می‌شد.
  // موقعیت فقط لحظه باز شدن محاسبه نمی‌شود؛ چون این صفحه دیتای async زیادی لود می‌کند که می‌تواند
  // layout را جابجا کند، تا وقتی باز است با اسکرول/ریسایز هم به‌روز می‌شود.
  useLayoutEffect(() => {
    if (!open) return
    const recompute = () => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    recompute()
    window.addEventListener('scroll', recompute, true)
    window.addEventListener('resize', recompute)
    return () => {
      window.removeEventListener('scroll', recompute, true)
      window.removeEventListener('resize', recompute)
    }
  }, [open])

  const toggleOpen = () => setOpen(v => !v)

  const available = ASSET_TYPES.filter(t => t.available)
  const allChecked = available.every(t => value[t.key])
  const checkedCount = available.filter(t => value[t.key]).length
  const summary = checkedCount === 0 ? 'هیچ‌کدام' : checkedCount === available.length ? 'همه' : ASSET_TYPES.find(t => value[t.key])?.label ?? ''

  const toggleAll = () => {
    const next = { ...value }
    for (const t of available) next[t.key] = !allChecked
    onChange(next)
  }
  const toggleOne = (key: AssetType) => onChange({ ...value, [key]: !value[key] })

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <Field label="دارایی" muted={muted}>
        <button
          onClick={toggleOpen}
          style={{
            padding: '7px 10px', borderRadius: 9, border: `0.5px solid ${line}`,
            background: 'transparent', color: text, fontSize: 11.5, fontFamily: 'inherit',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
          }}
        >
          {summary}
          <span style={{ fontSize: 9, color: muted }}>▾</span>
        </button>
      </Field>

      {open && pos && createPortal(
        <div ref={panelRef} style={{
          position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000, minWidth: 160,
          background: panel, border: `0.5px solid ${line}`, borderRadius: 12,
          padding: 8, backdropFilter: 'blur(12px)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer',
            fontSize: 12, color: text, fontWeight: 700, borderBottom: `0.5px solid ${line}`, marginBottom: 4,
          }}>
            <input type="checkbox" checked={allChecked} onChange={toggleAll} />
            انتخاب همه
          </label>
          {ASSET_TYPES.map(t => (
            <label
              key={t.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                cursor: t.available ? 'pointer' : 'not-allowed',
                fontSize: 12, color: t.available ? text : muted, opacity: t.available ? 1 : 0.55,
              }}
            >
              <input
                type="checkbox"
                checked={value[t.key]}
                disabled={!t.available}
                onChange={() => t.available && toggleOne(t.key)}
              />
              {t.label}
              {!t.available && <span style={{ fontSize: 10 }}>(به‌زودی)</span>}
            </label>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

function MarketMenu({ value, onChange, muted, line, panel, text }: {
  value: Record<MarketType, boolean>
  onChange: (v: Record<MarketType, boolean>) => void
  muted: string; line: string; panel: string; text: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const recompute = () => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    recompute()
    window.addEventListener('scroll', recompute, true)
    window.addEventListener('resize', recompute)
    return () => {
      window.removeEventListener('scroll', recompute, true)
      window.removeEventListener('resize', recompute)
    }
  }, [open])

  const toggleOpen = () => setOpen(v => !v)

  const allChecked = MARKET_TYPES.every(t => value[t.key])
  const checkedCount = MARKET_TYPES.filter(t => value[t.key]).length
  const summary = checkedCount === 0 ? 'هیچ‌کدام' : checkedCount === MARKET_TYPES.length ? 'همه' : MARKET_TYPES.find(t => value[t.key])?.label ?? ''

  const toggleAll = () => {
    const next = { ...value }
    for (const t of MARKET_TYPES) next[t.key] = !allChecked
    onChange(next)
  }
  const toggleOne = (key: MarketType) => onChange({ ...value, [key]: !value[key] })

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <Field label="بازار" muted={muted}>
        <button
          onClick={toggleOpen}
          style={{
            padding: '7px 10px', borderRadius: 9, border: `0.5px solid ${line}`,
            background: 'transparent', color: text, fontSize: 11.5, fontFamily: 'inherit',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
          }}
        >
          {summary}
          <span style={{ fontSize: 9, color: muted }}>▾</span>
        </button>
      </Field>

      {open && pos && createPortal(
        <div ref={panelRef} style={{
          position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000, minWidth: 160,
          background: panel, border: `0.5px solid ${line}`, borderRadius: 12,
          padding: 8, backdropFilter: 'blur(12px)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer',
            fontSize: 12, color: text, fontWeight: 700, borderBottom: `0.5px solid ${line}`, marginBottom: 4,
          }}>
            <input type="checkbox" checked={allChecked} onChange={toggleAll} />
            انتخاب همه
          </label>
          {MARKET_TYPES.map(t => (
            <label
              key={t.key}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', fontSize: 12, color: text }}
            >
              <input type="checkbox" checked={value[t.key]} onChange={() => toggleOne(t.key)} />
              {t.label}
            </label>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

function Field({ label, muted, children }: { label: string; muted: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <span style={{ fontSize: 11.5, color: muted, whiteSpace: 'nowrap' }}>{label}:</span>
      {children}
    </div>
  )
}

function Select({ value, onChange, line, panel, text, disabled, children }: {
  value: string; onChange: (v: string) => void
  line: string; panel: string; text: string; disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '7px 10px', borderRadius: 9, border: `0.5px solid ${line}`,
        background: disabled ? 'transparent' : panel, color: disabled ? '#8b93a7' : text,
        fontSize: 11.5, fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer', maxWidth: 140,
      }}
    >
      {children}
    </select>
  )
}

function Toggle({ label, checked, onChange, disabled, muted, line, text }: {
  label: string; checked: boolean; onChange: (v: boolean) => void
  disabled?: boolean; muted: string; line: string; text: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <span style={{ fontSize: 11.5, color: disabled ? muted : text, whiteSpace: 'nowrap' }}>{label}:</span>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        style={{
          width: 34, height: 19, borderRadius: 10, border: `0.5px solid ${line}`,
          background: checked ? '#2563EB' : 'transparent', position: 'relative',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, padding: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 1.5, right: checked ? 16 : 2, width: 14, height: 14,
          borderRadius: '50%', background: '#fff', transition: 'right 0.15s',
        }} />
      </button>
    </div>
  )
}

function IconBtn({ title, onClick, disabled, muted, line, children }: {
  title: string; onClick?: () => void; disabled?: boolean
  muted: string; line: string; children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: 9, border: `0.5px solid ${line}`,
        background: 'transparent', color: muted, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1, flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

const FsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
)
const ExitFsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" />
  </svg>
)
const CameraIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)
