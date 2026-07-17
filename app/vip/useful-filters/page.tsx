'use client'

/**
 * فیلترهای کاربردی بورس سنج
 *
 * ۱) افزایش سرانه خریدار — تاریخچه روزانه سرانه خرید حقیقی هر نماد (stock_per_capita_daily،
 *    کرون سرور هر ۵ دقیقه ردیف امروز را upsert می‌کند — scripts/stocks-industries.js).
 *    چون تاریخچه گذشته موجود نبود، جمع‌آوری از نصب شروع شده — میانگین‌های ۱۰/۲۰ روزه تا تکمیل زمان می‌برند.
 * ۲) حجم به شناوری و مارکت — نیازمند stock_float (کرون روزانه scripts/stock-float.js، چون
 *    درصد شناوری فقط با فراخوانی BrsApi Symbol.php به‌ازای هر نماد جداگانه به دست می‌آید).
 * ۳) تعداد کد خریدار و فروشنده — بیشترین تعداد کد حقیقی خریدار/فروشنده امروز هر نماد.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import {
  BRSAPI_KEY, num, clean, fPct, fX, faN, fToman as fTomanShared, isTehranMarketClosedDay,
  type M, buildMetrics, type Col, type Card, cSym, cPl, cRatioM, cVol, FilterTable,
} from '../../../lib/vipFiltersShared'
import AuthGate from '../../../components/AuthGate'

// سرانه خرید روزانه از قبل به تومان ذخیره شده (بدون تقسیم بر ۱۰) — همان فرمت fToman ولی بدون تبدیل ریال
const fTomanT = (t: number | null) => {
  if (t == null) return '—'
  return t >= 1e9 ? `${faN(t / 1e9, 2)} میلیارد ت`
    : t >= 1e6 ? `${faN(t / 1e6, 0)} میلیون ت`
    : `${faN(t, 0)} ت`
}
const fBn = (rial: number | null) => (rial == null ? '—' : `${faN(rial / 10 / 1e9, 2)} میلیارد ت`)

// ── حجم به شناوری و مارکت ──────────────────────────────────────────────────
const cMv: Col = { label: 'مارکت سهم', key: 'mv', fmt: (r) => fTomanShared(r.mv), num: (r) => r.mv }
const cValBn: Col = { label: 'ارزش معاملات', key: 'tval', fmt: (r) => fBn(r.tval), num: (r) => r.tval }
const cVolFloatToday: Col = {
  label: 'حجم امروز/شناوری', key: 'floatShares',
  fmt: (r) => (r.floatShares ? fPct((r.tvol / r.floatShares) * 100, 2) : '—'),
  num: (r) => (r.floatShares ? (r.tvol / r.floatShares) * 100 : 0),
}
const cVolFloatWeek: Col = {
  label: 'حجم هفته/شناوری', key: 'floatShares',
  fmt: (r) => (r.floatShares && r.avgVolW ? fPct((r.avgVolW / r.floatShares) * 100, 2) : '—'),
  num: (r) => (r.floatShares && r.avgVolW ? (r.avgVolW / r.floatShares) * 100 : 0),
}
const cVolFloatMonth: Col = {
  label: 'حجم ماه/شناوری', key: 'floatShares',
  fmt: (r) => (r.floatShares && r.avgVolM ? fPct((r.avgVolM / r.floatShares) * 100, 2) : '—'),
  num: (r) => (r.floatShares && r.avgVolM ? (r.avgVolM / r.floatShares) * 100 : 0),
}
const cValMvPct: Col = {
  label: 'ارزش/مارکت', key: 'mv',
  fmt: (r) => (r.mv > 0 ? fPct((r.tval / r.mv) * 100, 2) : '—'),
  num: (r) => (r.mv > 0 ? (r.tval / r.mv) * 100 : 0),
}
const cValFloatPct: Col = {
  label: 'ارزش/شناوری', key: 'floatShares',
  fmt: (r) => (r.floatShares && r.pc ? fPct((r.tval / (r.floatShares * r.pc)) * 100, 2) : '—'),
  num: (r) => (r.floatShares && r.pc ? (r.tval / (r.floatShares * r.pc)) * 100 : 0),
}

function buildVolFloatCards(ms: M[]): Card[] {
  const top = (rows: M[], by: (r: M) => number, n = 30) => [...rows].sort((a, b) => by(b) - by(a)).slice(0, n)
  const withFloat = ms.filter((r) => r.floatShares != null && r.floatShares > 0)

  const volFloat = top(withFloat, (r) => r.tvol / (r.floatShares as number))
  const valMv = top(ms.filter((r) => r.mv > 0), (r) => r.tval / r.mv)
  const valFloat = top(withFloat, (r) => r.tval / ((r.floatShares as number) * r.pc))

  return [
    {
      id: 'vol-float', title: 'بیشترین درصد حجم نسبت به شناوری', tone: 'green', needFloat: true,
      desc: 'حجم معاملات امروز نسبت به تعداد سهام شناور شرکت — نمادهایی که بخش بزرگی از شناورشان امروز جابه‌جا شده',
      cols: [cSym, cPl, cRatioM, cVolFloatToday, cVolFloatWeek, cVolFloatMonth, cVol], rows: volFloat,
    },
    {
      id: 'val-mv', title: 'بیشترین ارزش معاملات نسبت به مارکت شرکت', tone: 'green',
      desc: 'ارزش معاملات امروز نسبت به ارزش بازار کل شرکت',
      cols: [cSym, cPl, cValMvPct, cValBn, cVol, cMv], rows: valMv,
    },
    {
      id: 'val-float', title: 'بیشترین ارزش معاملات نسبت به شناوری', tone: 'green', needFloat: true,
      desc: 'ارزش معاملات امروز نسبت به ارزش بازار سهام شناور شرکت',
      cols: [cSym, cPl, cValFloatPct, cValBn, cVol, cMv], rows: valFloat,
    },
  ]
}

// ── تعداد کد خریدار و فروشنده ──────────────────────────────────────────────
const cBuyCount: Col = { label: 'تعداد خریدار', key: 'buyCountI', fmt: (r) => faN(r.buyCountI), num: (r) => r.buyCountI }
const cSellCount: Col = { label: 'تعداد فروشنده', key: 'sellCountI', fmt: (r) => faN(r.sellCountI), num: (r) => r.sellCountI }
const cBuyPower: Col = { label: 'قدرت خریدار', key: 'bp', fmt: (r) => fX(r.bp), num: (r) => r.bp ?? 0 }
const cSellPower: Col = {
  label: 'قدرت فروشنده', key: 'bp',
  fmt: (r) => fX(r.bp && r.bp > 0 ? 1 / r.bp : null),
  num: (r) => (r.bp && r.bp > 0 ? 1 / r.bp : 0),
}
const cValToday: Col = { label: 'ارزش معاملات امروز', key: 'tval', fmt: (r) => fTomanShared(r.tval), num: (r) => r.tval }

function buildCodeCountCards(ms: M[]): Card[] {
  const top = (rows: M[], by: (r: M) => number, n = 30) => [...rows].sort((a, b) => by(b) - by(a)).slice(0, n)
  const withCounts = ms.filter((r) => r.buyCountI > 0 || r.sellCountI > 0)

  return [
    {
      id: 'most-buyers', title: 'بیشترین تعداد کد خریدار حقیقی', tone: 'green',
      desc: 'نمادهایی که امروز بیشترین تعداد کد حقیقی خریدار داشته‌اند — نشانه تقاضای گسترده و توزیع‌شده',
      cols: [cSym, cBuyCount, cSellCount, cBuyPower, cValToday], rows: top(withCounts, (r) => r.buyCountI),
    },
    {
      id: 'most-sellers', title: 'بیشترین تعداد کد فروشنده حقیقی', tone: 'red',
      desc: 'نمادهایی که امروز بیشترین تعداد کد حقیقی فروشنده داشته‌اند — نشانه عرضه گسترده و توزیع‌شده',
      cols: [cSym, cSellCount, cBuyCount, cSellPower, cValToday], rows: top(withCounts, (r) => r.sellCountI),
    },
  ]
}

// ── افزایش سرانه خریدار: سرانه امروز/میانگین N روزه هر نماد از stock_per_capita_daily ─────────
type PerCapRow = { sym: string; today: number; avg3: number | null; avg5: number | null; avg10: number | null; avg20: number | null }
type PCol = { label: string; fmt: (r: PerCapRow) => string; num: (r: PerCapRow) => number }
type PCard = { id: string; title: string; desc: string; cols: PCol[]; rows: PerCapRow[] }

const pcSym: PCol = { label: 'نماد', fmt: (r) => r.sym, num: () => 0 }
const pcToday: PCol = { label: 'سرانه امروز', fmt: (r) => fTomanT(r.today), num: (r) => r.today }

type PCNumKey = 'today' | 'avg3' | 'avg5' | 'avg10' | 'avg20'
const pcVal = (r: PerCapRow, k: PCNumKey): number | null => r[k]

// جدول با نماد + سرانه امروز + دو میانگین (کوتاه/بلند) + درصد افزایش کوتاه نسبت به بلند — فقط افزایش (٪>۰)
function buildPerCapCard(
  id: string, title: string, desc: string,
  rows: PerCapRow[], shortKey: PCNumKey, shortLbl: string, longKey: PCNumKey, longLbl: string,
): PCard {
  const withDiff = rows
    .map((r) => {
      const shortV = pcVal(r, shortKey), longV = pcVal(r, longKey)
      if (shortV == null || longV == null || longV <= 0) return null
      return { r, diff: ((shortV - longV) / longV) * 100 }
    })
    .filter((x): x is { r: PerCapRow; diff: number } => x != null && x.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 30)

  return {
    id, title, desc,
    cols: [
      pcSym, pcToday,
      ...(shortKey === 'today' ? [] : [{ label: shortLbl, fmt: (r) => fTomanT(pcVal(r, shortKey)), num: (r) => pcVal(r, shortKey) ?? 0 } as PCol]),
      { label: longLbl, fmt: (r) => fTomanT(pcVal(r, longKey)), num: (r) => pcVal(r, longKey) ?? 0 },
      { label: 'افزایش سرانه', fmt: (r) => {
        const shortV = pcVal(r, shortKey), longV = pcVal(r, longKey)
        if (shortV == null || longV == null || longV <= 0) return '—'
        return fPct(((shortV - longV) / longV) * 100)
      }, num: (r) => {
        const shortV = pcVal(r, shortKey), longV = pcVal(r, longKey)
        return shortV != null && longV != null && longV > 0 ? ((shortV - longV) / longV) * 100 : 0
      } },
    ],
    rows: withDiff.map((x) => x.r),
  }
}

function buildPerCapCards(rows: PerCapRow[]): PCard[] {
  return [
    buildPerCapCard('pc-1-5', 'افزایش سرانه خرید روزانه به ۵ روزه',
      'سرانه خرید امروز نسبت به میانگین ۵ روز اخیر — فقط نمادهای افزایشی', rows, 'today', 'سرانه امروز', 'avg5', 'سرانه ۵ روزه'),
    buildPerCapCard('pc-3-10', 'افزایش سرانه خرید ۳ به ۱۰ روزه',
      'میانگین سرانه خرید ۳ روز اخیر نسبت به میانگین ۱۰ روز اخیر — فقط نمادهای افزایشی', rows, 'avg3', 'سرانه ۳ روزه', 'avg10', 'سرانه ۱۰ روزه'),
    buildPerCapCard('pc-5-20', 'افزایش سرانه خرید ۵ به ۲۰ روزه',
      'میانگین سرانه خرید ۵ روز اخیر نسبت به میانگین ۲۰ روز اخیر — فقط نمادهای افزایشی', rows, 'avg5', 'سرانه ۵ روزه', 'avg20', 'سرانه ۲۰ روزه'),
  ]
}

// همان ظاهر FilterTable مشترک، برای جدول‌های سرانه (رنگ تیتر همیشه سبز — این جدول‌ها فقط افزایشی نشان می‌دهند)
function PerCapTable({ card, isDark }: { card: PCard; isDark: boolean }) {
  const [sortI, setSortI] = useState<number | null>(null)
  const [asc, setAsc] = useState(false)

  const rows = useMemo(() => {
    if (sortI == null) return card.rows
    const col = card.cols[sortI]
    const r = [...card.rows].sort((a, b) =>
      sortI === 0 ? a.sym.localeCompare(b.sym, 'fa') : col.num(a) - col.num(b))
    return asc ? r : r.reverse()
  }, [card, sortI, asc])

  const line = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'
  const headBg = isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.14)'
  const text = isDark ? '#E8F4FF' : '#0F1E2E'
  const cream = isDark ? '#ddd5bd' : '#6B7F90'

  return (
    <div style={{
      background: isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.92)',
      border: `1px solid ${line}`, borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: `2px solid rgba(59,130,246,0.35)`,
      }}>
        <span title={card.desc} style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0, cursor: 'help',
          background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>؟</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'oklch(0.74 0.16 150)', textAlign: 'center', flex: 1 }}>
          {card.title}
        </span>
        <span style={{ width: 18 }} />
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 430, flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {card.cols.map((c, i) => (
                <th key={i}
                  onClick={() => { if (sortI === i) setAsc(!asc); else { setSortI(i); setAsc(false) } }}
                  style={{
                    position: 'sticky', top: 0, background: headBg, zIndex: 1,
                    padding: '8px 8px', fontWeight: 700, color: text,
                    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
                    backdropFilter: 'blur(6px)',
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
                در حال حاضر نمادی شرایط این فیلتر را ندارد
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.sym} style={{ borderBottom: `1px solid ${line}` }}>
                {card.cols.map((c, i) => (
                  <td key={i} style={{ padding: '7px 8px', textAlign: 'center', whiteSpace: 'nowrap', color: i === 0 ? '#3b82f6' : cream }}>
                    {i === 0 ? (
                      <Link href={`/technical/${encodeURIComponent(r.sym)}`} style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 700 }}>
                        {r.sym}
                      </Link>
                    ) : (
                      <span style={{ color: cream, fontWeight: 500 }}>{c.fmt(r)}</span>
                    )}
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
export default function UsefulFiltersPage() {
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  const [metrics, setMetrics] = useState<M[] | null>(null)
  const [hasFloat, setHasFloat] = useState(false)
  const [failed, setFailed] = useState(false)
  const [updated, setUpdated] = useState<string | null>(null)
  const [perCapRows, setPerCapRows] = useState<PerCapRow[] | null>(null)
  const [perCapUpdated, setPerCapUpdated] = useState<string | null>(null)
  const [marketClosed] = useState(() => isTehranMarketClosedDay())

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  const load = async () => {
    setFailed(false)
    try {
      // میانگین حجم هفته/ماه از view سوپابیس (اختیاری — بدون آن ستون‌های حجم/شناوری هفته و ماه خالی می‌مانند)
      const volMap = new Map<string, { w: number | null; m: number | null }>()
      try {
        for (let off = 0; off < 10000; off += 1000) {
          const { data, error } = await supabase
            .from('stock_vol_avgs')
            .select('symbol, avg_vol_w, avg_vol_m')
            .range(off, off + 999)
          if (error || !data?.length) break
          for (const r of data) volMap.set(clean(r.symbol), { w: num(r.avg_vol_w), m: num(r.avg_vol_m) })
          if (data.length < 1000) break
        }
      } catch { /* view هنوز ساخته نشده */ }

      // شناوری هر نماد (ff٪, z) از جدول stock_float (کرون روزانه stock-float.js) — اختیاری
      const floatMap = new Map<string, { ff: number | null; z: number | null }>()
      try {
        for (let off = 0; off < 10000; off += 1000) {
          const { data, error } = await supabase
            .from('stock_float')
            .select('symbol, free_float_pct, shares_outstanding')
            .range(off, off + 999)
          if (error || !data?.length) break
          for (const r of data) floatMap.set(clean(r.symbol), { ff: num(r.free_float_pct), z: num(r.shares_outstanding) })
          if (data.length < 1000) break
        }
      } catch { /* جدول هنوز ساخته نشده */ }
      setHasFloat(floatMap.size > 0)

      // BrsApi فقط از IP ایران جواب می‌دهد — فچ سمت کلاینت (الگوی Header)
      const res = await fetch(`https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${BRSAPI_KEY}`, {
        cache: 'no-store', signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const arr = Array.isArray(data) ? data : (data?.symbols ?? data?.data ?? [])
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('empty')

      setMetrics(buildMetrics(arr, volMap, floatMap))
      setUpdated(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    load()
    const iv = setInterval(() => { if (!isTehranMarketClosedDay()) load() }, 120_000)
    return () => clearInterval(iv)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // افزایش سرانه خریدار: تاریخچه روزانه از stock_per_capita_daily (کرون سرور هر ۵ دقیقه ردیف امروز را به‌روز می‌کند)
  const loadPerCapita = async () => {
    try {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      const cutoffStr = cutoff.toISOString().slice(0, 10)
      const raw: { symbol: string; trade_date: string; per_capita_buy: number | null }[] = []
      for (let off = 0; off < 50_000; off += 1000) {
        const { data, error } = await supabase
          .from('stock_per_capita_daily')
          .select('symbol, trade_date, per_capita_buy')
          .gte('trade_date', cutoffStr)
          .order('trade_date', { ascending: false })
          .order('symbol', { ascending: true })
          .range(off, off + 999)
        if (error || !data?.length) break
        raw.push(...data)
        if (data.length < 1000) break
      }
      const bySym = new Map<string, number[]>()
      for (const r of raw) {
        if (r.per_capita_buy == null) continue
        if (!bySym.has(r.symbol)) bySym.set(r.symbol, [])
        bySym.get(r.symbol)!.push(r.per_capita_buy) // ترتیب نزولی تاریخ حفظ می‌شود
      }
      const avgN = (arr: number[], n: number) => {
        const s = arr.slice(0, n)
        return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null
      }
      const out: PerCapRow[] = []
      for (const [sym, arr] of bySym) {
        if (arr.length === 0) continue
        out.push({ sym, today: arr[0], avg3: avgN(arr, 3), avg5: avgN(arr, 5), avg10: avgN(arr, 10), avg20: avgN(arr, 20) })
      }
      setPerCapRows(out)
      setPerCapUpdated(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }))
    } catch { /* جدول هنوز داده ندارد */ }
  }

  useEffect(() => {
    loadPerCapita()
    const iv = setInterval(loadPerCapita, 300_000) // هر ۵ دقیقه — هم‌کادنس با کرون سرور
    return () => clearInterval(iv)
  }, [])

  const perCapCards = useMemo(() => (perCapRows ? buildPerCapCards(perCapRows) : []), [perCapRows])
  const volFloatCards = useMemo(() => (metrics ? buildVolFloatCards(metrics) : []), [metrics])
  const codeCountCards = useMemo(() => (metrics ? buildCodeCountCards(metrics) : []), [metrics])

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
          <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, margin: 0 }}>فیلترهای کاربردی</h1>
          {(perCapUpdated || updated) && <span style={{ fontSize: 11.5, color: cream }}>آخرین به‌روزرسانی: {perCapUpdated ?? updated}</span>}
        </div>

        <p style={{ fontSize: 12.5, color: cream, margin: '0 0 24px', lineHeight: 2 }}>
          فیلترهای تکمیلی روی کل سهام بازار — افزایش سرانه خریدار و حجم/ارزش معاملات نسبت به شناوری و مارکت شرکت. صرفاً ابزار رصد است و توصیه خرید یا فروش نیست.
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

        <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, margin: '0 0 6px', color: 'oklch(0.74 0.16 150)' }}>
          افزایش سرانه خریدار
        </h2>
        <p style={{ fontSize: 12.5, color: cream, margin: '0 0 16px', lineHeight: 2 }}>
          سرانه خرید حقیقی هر نماد از امروز به‌صورت روزانه ذخیره می‌شود؛ تا تکمیل تاریخچه ۲۰ روزه، میانگین‌های بلندتر بر مبنای روزهای موجود محاسبه می‌شوند.
          جدول‌ها فقط نمادهای با سرانه افزایشی را نشان می‌دهند.
        </p>

        {!perCapRows && (
          <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت تاریخچه سرانه…</div>
        )}
        {perCapRows && perCapRows.length === 0 && (
          <div style={{
            padding: '16px 18px', borderRadius: 12, marginBottom: 18, fontSize: 13,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b',
          }}>
            هنوز داده‌ای در جدول تاریخچه سرانه ثبت نشده — از فردا پس از اجرای کرون سرور تکمیل می‌شود.
          </div>
        )}
        {perCapRows && perCapRows.length > 0 && (
          <div style={{
            display: 'grid', gap: 16, marginBottom: 36,
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))',
          }}>
            {perCapCards.map((c) => <PerCapTable key={c.id} card={c} isDark={isDark} />)}
          </div>
        )}

        <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, margin: '0 0 6px', color: 'oklch(0.74 0.16 150)' }}>
          حجم به شناوری و مارکت
        </h2>
        <p style={{ fontSize: 12.5, color: cream, margin: '0 0 16px', lineHeight: 2 }}>
          حجم و ارزش معاملات امروز هر نماد نسبت به تعداد سهام شناور و ارزش بازار شرکت — نمادهایی که نسبت به اندازه واقعی خودشان معاملات سنگینی داشته‌اند.
        </p>

        {!hasFloat && metrics && (
          <div style={{
            padding: '10px 16px', borderRadius: 10, marginBottom: 16, fontSize: 12,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b',
          }}>
            داده شناوری هر نماد هنوز در دسترس نیست — جدول‌های «نسبت به شناوری» خالی می‌مانند تا کرون روزانه اجرا شود.
          </div>
        )}
        {!metrics ? (
          <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت اطلاعات بازار…</div>
        ) : (
          <div style={{
            display: 'grid', gap: 16,
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))',
          }}>
            {volFloatCards.map((c) => <FilterTable key={c.id} card={c} isDark={isDark} />)}
          </div>
        )}

        <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, margin: '32px 0 6px', color: 'oklch(0.74 0.16 150)' }}>
          تعداد کد خریدار و فروشنده
        </h2>
        <p style={{ fontSize: 12.5, color: cream, margin: '0 0 16px', lineHeight: 2 }}>
          نمادهایی که امروز بیشترین تعداد کد حقیقی خریدار/فروشنده را داشته‌اند — نشانه تقاضا یا عرضه گسترده و توزیع‌شده بین سهامداران، نه فقط چند کد بزرگ.
        </p>

        {!metrics ? (
          <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت اطلاعات بازار…</div>
        ) : (
          <div style={{
            display: 'grid', gap: 16,
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))',
          }}>
            {codeCountCards.map((c) => <FilterTable key={c.id} card={c} isDark={isDark} />)}
          </div>
        )}
        </div>
      </main>
    </AuthGate>
  )
}
