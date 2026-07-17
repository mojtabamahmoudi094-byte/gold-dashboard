'use client'

/**
 * پول داغ بورس سنج — خرید و فروش‌های درشت و گروهی سهام
 *
 * جدول ۱و۲ (سنگین/میلیاردی): از تاریخچه hot_trades — معاملات تکی/ادغام‌شده ≥۱ میلیارد تومان،
 * جهت (خرید/فروش) با قانون تیک تخمین زده شده (scripts/hot-money.js، کرون سرور هر ۵ دقیقه روی ~۱۵۰ نماد پرارزش)
 * جدول ۳و۴ (گروهی): رتبه‌بندی زنده بر اساس سرانه خرید/فروش حقیقی (پول درشت) — مستقیم از AllSymbols، بدون نیاز به ریزمعامله
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import {
  BRSAPI_KEY, num, faN, fToman, clean, isTehranMarketClosedDay,
  type M, buildMetrics, type Col, type Card, cSym, cPl, FilterTable,
} from '../../../lib/vipFiltersShared'
import AuthGate from '../../../components/AuthGate'
import { shouldUseDark } from '../../../lib/theme'

// ── جدول ۱و۲: معاملات سنگین/میلیاردی از hot_trades ──────────────────────────
type HotRow = { key: string; sym: string; price: number; tickCount: number; value: number; time: string }
type GCol = { label: string; fmt: (r: HotRow) => string; num: (r: HotRow) => number }
type GCard = { id: string; title: string; tone: 'green' | 'red'; desc: string; cols: GCol[]; rows: HotRow[] }

const gSym: GCol = { label: 'نماد', fmt: (r) => r.sym, num: () => 0 }
const gPrice: GCol = { label: 'قیمت', fmt: (r) => faN(r.price), num: (r) => r.price }
const gTicks: GCol = { label: 'نفرات', fmt: (r) => faN(r.tickCount), num: (r) => r.tickCount }
const gAvg: GCol = { label: 'میانگین معامله', fmt: (r) => faN(r.price), num: (r) => r.price }
const gValue: GCol = { label: 'برآیند کل', fmt: (r) => fToman(r.value * 10), num: (r) => r.value } // value از قبل به تومان ذخیره شده
const gTime: GCol = { label: 'زمان معامله', fmt: (r) => r.time, num: () => 0 }

function GTable({ card, isDark }: { card: GCard; isDark: boolean }) {
  const [sortI, setSortI] = useState<number | null>(null)
  const [asc, setAsc] = useState(false)

  const rows = useMemo(() => {
    if (sortI == null) return card.rows
    const col = card.cols[sortI]
    const r = [...card.rows].sort((a, b) => (sortI === 0 ? a.sym.localeCompare(b.sym, 'fa') : col.num(a) - col.num(b)))
    return asc ? r : r.reverse()
  }, [card, sortI, asc])

  const line = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'
  const headBg = isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.14)'
  const text = isDark ? '#E8F4FF' : '#0F1E2E'
  const cream = isDark ? '#ddd5bd' : '#6B7F90'
  const titleClr = card.tone === 'green' ? 'oklch(0.74 0.16 150)' : '#EF4444'

  return (
    <div style={{
      background: isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.92)',
      border: `1px solid ${line}`, borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: '2px solid rgba(59,130,246,0.35)',
      }}>
        <span title={card.desc} style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0, cursor: 'help',
          background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>؟</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: titleClr, textAlign: 'center', flex: 1 }}>{card.title}</span>
        <span style={{ width: 18 }} />
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 460, flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {card.cols.map((c, i) => (
                <th key={i}
                  onClick={() => { if (sortI === i) setAsc(!asc); else { setSortI(i); setAsc(false) } }}
                  style={{
                    position: 'sticky', top: 0, background: headBg, zIndex: 1,
                    padding: '8px 8px', fontWeight: 700, color: text,
                    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', backdropFilter: 'blur(6px)',
                  }}>
                  {c.label}{' '}
                  <span style={{ fontSize: 8, color: sortI === i ? '#3b82f6' : cream }}>
                    {sortI === i ? (asc ? '▲' : '▼') : '▲▼'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={card.cols.length} style={{ padding: '38px 14px', textAlign: 'center', color: cream, fontSize: 12.5 }}>
                امروز معامله‌ای با این شرط ثبت نشده
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.key} style={{ borderBottom: `1px solid ${line}` }}>
                {card.cols.map((c, i) => (
                  <td key={i} style={{ padding: '7px 8px', textAlign: 'center', whiteSpace: 'nowrap', color: i === 0 ? '#3b82f6' : cream, fontWeight: i === 0 ? 700 : 500 }}>
                    {i === 0 ? (
                      <Link href={`/technical/${encodeURIComponent(r.sym)}`} style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 700 }}>{r.sym}</Link>
                    ) : c.fmt(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── صفحه ─────────────────────────────────────────────────────────────────────
export default function HotMoneyPage() {
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  const [buyRows, setBuyRows] = useState<HotRow[] | null>(null)
  const [sellRows, setSellRows] = useState<HotRow[] | null>(null)
  const [hotUpdated, setHotUpdated] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<M[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [marketClosed] = useState(() => isTehranMarketClosedDay())
  const [updated, setUpdated] = useState<string | null>(null)

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  const loadHotTrades = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const raw: { symbol: string; direction: string; trade_time: string; price: number; value: number; tick_count: number }[] = []
      for (let off = 0; off < 20_000; off += 1000) {
        const { data, error } = await supabase
          .from('hot_trades')
          .select('symbol, direction, trade_time, price, value, tick_count')
          .eq('trade_date', today)
          .order('value', { ascending: false })
          .range(off, off + 999)
        if (error || !data?.length) break
        raw.push(...data)
        if (data.length < 1000) break
      }
      const toRow = (r: typeof raw[number]): HotRow => ({
        key: `${r.symbol}-${r.trade_time}-${r.price}-${r.direction}`,
        sym: clean(r.symbol), price: num(r.price) ?? 0, tickCount: num(r.tick_count) ?? 1,
        value: num(r.value) ?? 0, time: r.trade_time,
      })
      setBuyRows(raw.filter((r) => r.direction === 'buy').map(toRow).slice(0, 30))
      setSellRows(raw.filter((r) => r.direction === 'sell').map(toRow).slice(0, 30))
      setHotUpdated(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }))
    } catch { /* جدول هنوز داده ندارد */ }
  }

  useEffect(() => {
    loadHotTrades()
    const iv = setInterval(loadHotTrades, 300_000) // هر ۵ دقیقه — هم‌کادنس با کرون سرور
    return () => clearInterval(iv)
  }, [])

  const loadMetrics = async () => {
    setFailed(false)
    try {
      const res = await fetch(`https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${BRSAPI_KEY}`, {
        cache: 'no-store', signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const arr = Array.isArray(data) ? data : (data?.symbols ?? data?.data ?? [])
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('empty')
      setMetrics(buildMetrics(arr, new Map()))
      setUpdated(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    loadMetrics()
    const iv = setInterval(() => { if (!isTehranMarketClosedDay()) loadMetrics() }, 120_000)
    return () => clearInterval(iv)
  }, [])

  const buyCard: GCard | null = buyRows ? {
    id: 'heavy-buy', title: 'خریدهای سنگین و میلیاردی', tone: 'green',
    desc: 'معاملات تکی/ادغام‌شده ≥۱ میلیارد تومان با جهت خرید (قانون تیک: قیمت بالاتر از معامله قبلی)',
    cols: [gSym, gPrice, gTicks, gAvg, gValue, gTime], rows: buyRows,
  } : null
  const sellCard: GCard | null = sellRows ? {
    id: 'heavy-sell', title: 'فروش‌های سنگین و میلیاردی', tone: 'red',
    desc: 'معاملات تکی/ادغام‌شده ≥۱ میلیارد تومان با جهت فروش (قانون تیک: قیمت پایین‌تر از معامله قبلی)',
    cols: [gSym, gPrice, gTicks, gAvg, gValue, gTime], rows: sellRows,
  } : null

  // ── خرید/فروش گروهی: رتبه‌بندی زنده بر اساس سرانه خرید/فروش حقیقی (پول درشت) ──
  const cBuyerCount: Col = { label: 'نفرات', key: 'buyCountI', fmt: (r) => faN(r.buyCountI), num: (r) => r.buyCountI }
  const cSellerCount: Col = { label: 'نفرات', key: 'sellCountI', fmt: (r) => faN(r.sellCountI), num: (r) => r.sellCountI }
  const cAvgBuy: Col = { label: 'میانگین خرید', key: 'perCapB', fmt: (r) => fToman(r.perCapB), num: (r) => r.perCapB ?? 0 }
  const cAvgSell: Col = { label: 'میانگین فروش', key: 'perCapS', fmt: (r) => fToman(r.perCapS), num: (r) => r.perCapS ?? 0 }
  const cTotalBuy: Col = { label: 'برآیند کل', key: 'perCapB', fmt: (r) => fToman((r.perCapB ?? 0) * r.buyCountI), num: (r) => (r.perCapB ?? 0) * r.buyCountI }
  const cTotalSell: Col = { label: 'برآیند کل', key: 'perCapS', fmt: (r) => fToman((r.perCapS ?? 0) * r.sellCountI), num: (r) => (r.perCapS ?? 0) * r.sellCountI }
  const cTimeNow: Col = { label: 'زمان معامله', key: 'sym', fmt: () => updated ?? '—', num: () => 0 }

  const groupBuyCard: Card | null = metrics ? {
    id: 'group-buy', title: 'خریدهای گروهی', tone: 'green',
    desc: 'رتبه‌بندی بر اساس سرانه خرید حقیقی (پول درشت) — هر خریدار به‌طور میانگین چقدر پول در این نماد جابه‌جا کرده',
    cols: [cSym, cPl, cBuyerCount, cAvgBuy, cTotalBuy, cTimeNow],
    rows: [...metrics].filter((r) => r.tval >= 1e9).sort((a, b) => (b.perCapB ?? 0) - (a.perCapB ?? 0)).slice(0, 30),
  } : null
  const groupSellCard: Card | null = metrics ? {
    id: 'group-sell', title: 'فروش‌های گروهی', tone: 'red',
    desc: 'رتبه‌بندی بر اساس سرانه فروش حقیقی (پول درشت) — هر فروشنده به‌طور میانگین چقدر پول در این نماد جابه‌جا کرده',
    cols: [cSym, cPl, cSellerCount, cAvgSell, cTotalSell, cTimeNow],
    rows: [...metrics].filter((r) => r.tval >= 1e9).sort((a, b) => (b.perCapS ?? 0) - (a.perCapS ?? 0)).slice(0, 30),
  } : null

  const bg = isDark ? '#060B14' : '#F4F7FB'
  const text = isDark ? '#E8F4FF' : '#0F1E2E'
  const cream = isDark ? '#ddd5bd' : '#6B7F90'

  return (
    <AuthGate title="فیلترها">
      <main style={{
        minHeight: '100vh', background: bg, color: text,
        fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '24px 14px' : '36px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
          <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, margin: 0 }}>پول داغ</h1>
          {(hotUpdated || updated) && <span style={{ fontSize: 11.5, color: cream }}>آخرین به‌روزرسانی: {hotUpdated ?? updated}</span>}
        </div>

        <p style={{ fontSize: 12.5, color: cream, margin: '0 0 8px', lineHeight: 2 }}>
          صرفاً ابزار رصد است و توصیه خرید یا فروش نیست. جهت معاملات تکی از «قانون تیک» تخمین زده شده و ممکن است دقیق نباشد.
        </p>

        {marketClosed && (
          <div style={{
            padding: '16px 18px', borderRadius: 12, marginBottom: 18, fontSize: 13,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b',
          }}>
            بازار سرمایه پنج‌شنبه و جمعه تعطیل است — دیتای آخرین روز معاملاتی نمایش داده می‌شود و تا شنبه بروزرسانی خودکار انجام نمی‌شود.
          </div>
        )}

        {failed && (
          <div style={{
            padding: '16px 18px', borderRadius: 12, marginBottom: 18, fontSize: 13,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444',
          }}>
            دریافت داده لحظه‌ای ناموفق بود — منبع داده فقط از IP ایران در دسترس است. چند لحظه دیگر دوباره تلاش کنید.
          </div>
        )}

        <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, margin: '20px 0 6px', color: '#f59e0b' }}>
          خرید و فروش‌های درشت و گروهی سهام
        </h2>
        <p style={{ fontSize: 12.5, color: cream, margin: '0 0 16px', lineHeight: 2 }}>
          «سنگین و میلیاردی» = معاملات تکی بزرگ (≥۱ میلیارد تومان) از ریزمعاملات ~۱۵۰ نماد پرارزش امروز.
          «گروهی» = نمادهایی با سرانه خرید/فروش بسیار بالا (پول درشت هماهنگ)، مستقیم از بازار زنده.
        </p>

        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))',
        }}>
          {buyCard ? <GTable card={buyCard} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت معاملات سنگین…</div>
          )}
          {sellCard ? <GTable card={sellCard} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت معاملات سنگین…</div>
          )}
          {groupBuyCard ? <FilterTable card={groupBuyCard} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت اطلاعات بازار…</div>
          )}
          {groupSellCard ? <FilterTable card={groupSellCard} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت اطلاعات بازار…</div>
          )}
        </div>
        </div>
      </main>
    </AuthGate>
  )
}
