'use client'

/**
 * فیلترهای ورود/خروج پول بورس سنج — ورود پول حقیقی به تفکیک صنعت
 *
 * جدول ۱ (روزانه): مستقیم از BrsApi AllSymbols لحظه‌ای، گروه‌بندی بر اساس صنعت (همان منطق stocks-industries.js)
 * جدول‌های ۲–۴ (۳روزه/هفتگی/ماهانه): از تاریخچه industry_moneyflow_daily (کرون سرور هر ۵ دقیقه ردیف امروز هر صنعت را upsert می‌کند)
 * هفتگی=۵ روز کاری، ماهانه=۲۲ روز کاری (همان قرارداد پروژه در stock_vol_avgs)
 * چون تاریخچه گذشته موجود نبود، جمع‌آوری از نصب شروع شده — پنجره‌های بلندتر تا تکمیل، از روزهای موجود جمع می‌زنند
 *
 * بخش «بیشترین ورود پول حقیقی» (سطح نماد): جدول روزانه از همان AllSymbols زنده (M.moneyInI)،
 * جدول‌های هفتگی/ماهانه/سه‌ماهه از تاریخچه stock_moneyflow_daily (۵/۲۲/۶۶ روز کاری)
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import {
  BRSAPI_KEY, num, faN, fToman, fX, clean, NOT_STOCK_CS,
  type M, buildMetrics, type Col, type Card, cSym, cPl, FilterTable,
} from '../../../lib/vipFiltersShared'

// عدد از قبل به تومان ذخیره‌شده (بدون تبدیل ریال) — برای مقادیر تاریخچه industry_moneyflow_daily
const fTomanT = (t: number | null) => {
  if (t == null) return '—'
  const sign = t < 0 ? '-' : ''
  const a = Math.abs(t)
  return a >= 1e9 ? `${sign}${faN(a / 1e9, 2)} میلیارد ت`
    : a >= 1e6 ? `${sign}${faN(a / 1e6, 0)} میلیون ت`
    : `${sign}${faN(a, 0)} ت`
}

// ── جدول ۱: ورود پول امروز به تفکیک صنعت — مستقیم از AllSymbols لحظه‌ای ─────
type DailyFlowRow = { key: string; name: string; moneyIn: number; tval: number; bp: number | null }

function buildDailyFlow(arr: any[]): DailyFlowRow[] {
  const allL18 = new Set(arr.map((it) => clean(it.l18)))
  const byInd = new Map<string, { name: string; tval: number; buyVal: number; sellVal: number; buyCnt: number; sellCnt: number; moneyIn: number }>()

  for (const it of arr) {
    const sym = clean(it.l18), name30 = clean(it.l30), cs = clean(it.cs)
    if (!sym) continue
    if (cs && NOT_STOCK_CS.test(cs)) continue
    if (/[0-9۰-۹]/.test(sym)) continue
    if (/حق تقدم|حق‌تقدم/.test(name30)) continue
    if (sym.endsWith('ح') && allL18.has(sym.slice(0, -1))) continue

    const pc = num(it.pc) ?? 0, tval = num(it.tval) ?? 0
    if (!pc || tval <= 0) continue

    const key = cs ? String(num(it.cs_id) ?? cs) : 'سایر'
    if (!byInd.has(key)) byInd.set(key, { name: cs || 'سایر', tval: 0, buyVal: 0, sellVal: 0, buyCnt: 0, sellCnt: 0, moneyIn: 0 })
    const g = byInd.get(key)!
    const bI = num(it.Buy_I_Volume) ?? 0, sI = num(it.Sell_I_Volume) ?? 0
    const bCI = num(it.Buy_CountI) ?? 0, sCI = num(it.Sell_CountI) ?? 0
    g.tval += tval
    g.moneyIn += (bI - sI) * pc
    g.buyVal += bI * pc; g.sellVal += sI * pc
    g.buyCnt += bCI; g.sellCnt += sCI
  }

  const out: DailyFlowRow[] = []
  for (const [key, g] of byInd) {
    const perCapBuy = g.buyCnt > 0 ? g.buyVal / g.buyCnt : null
    const perCapSell = g.sellCnt > 0 ? g.sellVal / g.sellCnt : null
    const bp = perCapBuy != null && perCapSell != null && perCapSell > 0 ? perCapBuy / perCapSell : null
    out.push({ key, name: g.name, moneyIn: g.moneyIn, tval: g.tval, bp })
  }
  return out
}

// ── جدول‌های ۲–۴: مجموع ورود پول صنعت در پنجره‌های ۳/۵/۲۲ روزه از تاریخچه ───
type FlowRow = { key: string; name: string; moneyIn: number }

// ── ستون‌ها و کارت‌ها ────────────────────────────────────────────────────────
type GCol<T> = { label: string; fmt: (r: T) => string; num: (r: T) => number }
type GCard<T> = { id: string; title: string; desc: string; cols: GCol<T>[]; rows: T[] }

function Table<T extends { key: string; name: string }>({ card, isDark }: { card: GCard<T>; isDark: boolean }) {
  const [sortI, setSortI] = useState<number | null>(null)
  const [asc, setAsc] = useState(false)

  const rows = useMemo(() => {
    if (sortI == null) return card.rows
    const col = card.cols[sortI]
    const r = [...card.rows].sort((a, b) =>
      sortI === 0 ? a.name.localeCompare(b.name, 'fa') : col.num(a) - col.num(b))
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
        <span style={{ fontSize: 14, fontWeight: 700, color: 'oklch(0.74 0.16 150)', textAlign: 'center', flex: 1 }}>
          {card.title}
        </span>
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
                در حال حاضر داده‌ای موجود نیست
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.key} style={{ borderBottom: `1px solid ${line}` }}>
                {card.cols.map((c, i) => (
                  <td key={i} style={{ padding: '7px 8px', textAlign: 'center', whiteSpace: 'nowrap', color: i === 0 ? text : cream, fontWeight: i === 0 ? 700 : 500 }}>
                    {c.fmt(r)}
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
export default function MoneyFlowPage() {
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  const [dailyRows, setDailyRows] = useState<DailyFlowRow[] | null>(null)
  const [metrics, setMetrics] = useState<M[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [updated, setUpdated] = useState<string | null>(null)
  const [histRows3, setHistRows3] = useState<FlowRow[] | null>(null)
  const [histRows5, setHistRows5] = useState<FlowRow[] | null>(null)
  const [histRows22, setHistRows22] = useState<FlowRow[] | null>(null)
  const [symMoneyIn5, setSymMoneyIn5] = useState<Map<string, number> | null>(null)
  const [symMoneyIn22, setSymMoneyIn22] = useState<Map<string, number> | null>(null)
  const [symMoneyIn66, setSymMoneyIn66] = useState<Map<string, number> | null>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  const loadDaily = async () => {
    setFailed(false)
    try {
      const res = await fetch(`https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${BRSAPI_KEY}`, {
        cache: 'no-store', signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const arr = Array.isArray(data) ? data : (data?.symbols ?? data?.data ?? [])
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('empty')
      setDailyRows(buildDailyFlow(arr))
      setMetrics(buildMetrics(arr, new Map()))
      setUpdated(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    loadDaily()
    const iv = setInterval(loadDaily, 120_000) // هر ۲ دقیقه
    return () => clearInterval(iv)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadHistory = async () => {
    try {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 35)
      const cutoffStr = cutoff.toISOString().slice(0, 10)
      const raw: { industry_key: string; industry_name: string; trade_date: string; money_in: number | null }[] = []
      for (let off = 0; off < 20_000; off += 1000) {
        const { data, error } = await supabase
          .from('industry_moneyflow_daily')
          .select('industry_key, industry_name, trade_date, money_in')
          .gte('trade_date', cutoffStr)
          .order('trade_date', { ascending: false })
          .order('industry_key', { ascending: true })
          .range(off, off + 999)
        if (error || !data?.length) break
        raw.push(...data)
        if (data.length < 1000) break
      }
      const byKey = new Map<string, { name: string; vals: number[] }>()
      for (const r of raw) {
        if (r.money_in == null) continue
        if (!byKey.has(r.industry_key)) byKey.set(r.industry_key, { name: r.industry_name, vals: [] })
        byKey.get(r.industry_key)!.vals.push(r.money_in) // ترتیب نزولی تاریخ حفظ می‌شود
      }
      const sumN = (vals: number[], n: number) => vals.slice(0, n).reduce((s, v) => s + v, 0)
      const rows3: FlowRow[] = [], rows5: FlowRow[] = [], rows22: FlowRow[] = []
      for (const [key, g] of byKey) {
        if (g.vals.length === 0) continue
        rows3.push({ key, name: g.name, moneyIn: sumN(g.vals, 3) })
        rows5.push({ key, name: g.name, moneyIn: sumN(g.vals, 5) })
        rows22.push({ key, name: g.name, moneyIn: sumN(g.vals, 22) })
      }
      setHistRows3(rows3); setHistRows5(rows5); setHistRows22(rows22)
    } catch { /* جدول هنوز داده ندارد */ }
  }

  useEffect(() => {
    loadHistory()
    const iv = setInterval(loadHistory, 300_000) // هر ۵ دقیقه — هم‌کادنس با کرون سرور
    return () => clearInterval(iv)
  }, [])

  // بیشترین ورود پول حقیقی (سطح نماد) — تاریخچه stock_moneyflow_daily، پنجره‌های ۵/۲۲/۶۶ روز کاری
  const loadSymbolHistory = async () => {
    try {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 100)
      const cutoffStr = cutoff.toISOString().slice(0, 10)
      const raw: { symbol: string; trade_date: string; money_in: number | null }[] = []
      for (let off = 0; off < 100_000; off += 1000) {
        const { data, error } = await supabase
          .from('stock_moneyflow_daily')
          .select('symbol, trade_date, money_in')
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
        if (r.money_in == null) continue
        if (!bySym.has(r.symbol)) bySym.set(r.symbol, [])
        bySym.get(r.symbol)!.push(r.money_in) // ترتیب نزولی تاریخ حفظ می‌شود
      }
      const sumN = (vals: number[], n: number) => vals.slice(0, n).reduce((s, v) => s + v, 0)
      const m5 = new Map<string, number>(), m22 = new Map<string, number>(), m66 = new Map<string, number>()
      for (const [sym, vals] of bySym) {
        if (vals.length === 0) continue
        m5.set(sym, sumN(vals, 5)); m22.set(sym, sumN(vals, 22)); m66.set(sym, sumN(vals, 66))
      }
      setSymMoneyIn5(m5); setSymMoneyIn22(m22); setSymMoneyIn66(m66)
    } catch { /* جدول هنوز داده ندارد */ }
  }

  useEffect(() => {
    loadSymbolHistory()
    const iv = setInterval(loadSymbolHistory, 300_000) // هر ۵ دقیقه — هم‌کادنس با کرون سرور
    return () => clearInterval(iv)
  }, [])

  // moneyIn در DailyFlowRow ریالی است (مستقیم از AllSymbols) — fToman خودش بر ۱۰ تقسیم می‌کند
  const cMoneyIn: GCol<DailyFlowRow> = { label: 'ورود پول به میلیارد تومان', fmt: (r) => fToman(r.moneyIn), num: (r) => r.moneyIn }
  const cTval: GCol<DailyFlowRow> = { label: 'ارزش معاملات', fmt: (r) => fToman(r.tval), num: (r) => r.tval }
  const cBp: GCol<DailyFlowRow> = { label: 'قدرت خریدار', fmt: (r) => fX(r.bp), num: (r) => r.bp ?? 0 }
  const cName: GCol<any> = { label: 'صنعت', fmt: (r) => r.name, num: () => 0 }
  // moneyIn در FlowRow (تاریخچه) از قبل به تومان ذخیره شده (scripts/stocks-industries.js) — بدون تبدیل ریال
  const cFlow: GCol<FlowRow> = { label: 'ورود پول', fmt: (r) => fTomanT(r.moneyIn), num: (r) => r.moneyIn }

  const dailyCard: GCard<DailyFlowRow> | null = dailyRows ? {
    id: 'flow-daily', title: 'ورود پول به صنعت روزانه',
    desc: 'خالص ورود پول حقیقی امروز به هر صنعت (خرید حقیقی منهای فروش حقیقی) — مرتب‌شده بر اساس بیشترین ورود',
    cols: [cName, cMoneyIn, cTval, cBp],
    rows: [...dailyRows].sort((a, b) => b.moneyIn - a.moneyIn).slice(0, 30),
  } : null

  const mk = (id: string, title: string, desc: string, rows: FlowRow[] | null): GCard<FlowRow> | null =>
    rows ? { id, title, desc, cols: [cName, cFlow], rows: [...rows].sort((a, b) => b.moneyIn - a.moneyIn).slice(0, 30) } : null

  const card3 = mk('flow-3', 'ورود پول به صنعت (۳روزه)', 'مجموع خالص ورود پول حقیقی صنعت در ۳ روز کاری اخیر', histRows3)
  const card5 = mk('flow-5', 'ورود پول به صنعت (هفتگی)', 'مجموع خالص ورود پول حقیقی صنعت در ۵ روز کاری اخیر', histRows5)
  const card22 = mk('flow-22', 'ورود پول به صنعت (ماهانه)', 'مجموع خالص ورود پول حقیقی صنعت در ۲۲ روز کاری اخیر', histRows22)

  // ── بیشترین ورود پول حقیقی (سطح نماد) ──────────────────────────────────────
  const cPerCapBuyer: Col = { label: 'سرانه خریدار', key: 'perCapB', fmt: (r) => fToman(r.perCapB), num: (r) => r.perCapB ?? 0 }
  const cTvalSym: Col = { label: 'ارزش معاملات', key: 'tval', fmt: (r) => fToman(r.tval), num: (r) => r.tval }
  const cMoneyInLive: Col = { label: 'ورود پول', key: 'moneyInI', fmt: (r) => fToman(r.moneyInI), num: (r) => r.moneyInI }

  const cMoneyInWindow = (map: Map<string, number>): Col => ({
    label: 'ورود پول', key: 'sym',
    fmt: (r) => fTomanT(map.get(r.sym) ?? 0),
    num: (r) => map.get(r.sym) ?? 0,
  })

  const symDailyCard: Card | null = metrics ? {
    id: 'sym-flow-daily', title: 'ورود پول حقیقی روزانه', tone: 'green',
    desc: 'خالص ورود پول حقیقی امروز هر نماد (خرید حقیقی منهای فروش حقیقی) — مرتب‌شده بر اساس بیشترین ورود',
    cols: [cSym, cPl, cPerCapBuyer, cTvalSym, cMoneyInLive],
    rows: [...metrics].sort((a, b) => b.moneyInI - a.moneyInI).slice(0, 30),
  } : null

  const mkSymCard = (id: string, title: string, desc: string, map: Map<string, number> | null): Card | null => {
    if (!metrics || !map) return null
    const col = cMoneyInWindow(map)
    return {
      id, title, tone: 'green', desc,
      cols: [cSym, cPl, cPerCapBuyer, cTvalSym, col],
      rows: metrics.filter((r) => map.has(r.sym)).sort((a, b) => (map.get(b.sym) ?? 0) - (map.get(a.sym) ?? 0)).slice(0, 30),
    }
  }

  const symCard5 = mkSymCard('sym-flow-5', 'ورود پول حقیقی هفتگی', 'مجموع خالص ورود پول حقیقی نماد در ۵ روز کاری اخیر', symMoneyIn5)
  const symCard22 = mkSymCard('sym-flow-22', 'ورود پول حقیقی ماهانه', 'مجموع خالص ورود پول حقیقی نماد در ۲۲ روز کاری اخیر', symMoneyIn22)
  const symCard66 = mkSymCard('sym-flow-66', 'ورود پول حقیقی سه‌ماهه', 'مجموع خالص ورود پول حقیقی نماد در ۶۶ روز کاری اخیر (~۳ ماه)', symMoneyIn66)

  // ── بیشترین خروج پول حقیقی (سطح نماد) — همان داده، جهت مرتب‌سازی و برچسب برعکس ────
  const cMoneyOutLive: Col = { label: 'خروج پول', key: 'moneyInI', fmt: (r) => fToman(-r.moneyInI), num: (r) => -r.moneyInI }
  const cMoneyOutWindow = (map: Map<string, number>): Col => ({
    label: 'خروج پول', key: 'sym',
    fmt: (r) => fTomanT(-(map.get(r.sym) ?? 0)),
    num: (r) => -(map.get(r.sym) ?? 0),
  })

  const symOutDailyCard: Card | null = metrics ? {
    id: 'sym-out-daily', title: 'خروج پول حقیقی روزانه', tone: 'red',
    desc: 'خالص خروج پول حقیقی امروز هر نماد (فروش حقیقی منهای خرید حقیقی) — مرتب‌شده بر اساس بیشترین خروج',
    cols: [cSym, cPl, cPerCapBuyer, cTvalSym, cMoneyOutLive],
    rows: [...metrics].sort((a, b) => a.moneyInI - b.moneyInI).slice(0, 30),
  } : null

  const mkSymOutCard = (id: string, title: string, desc: string, map: Map<string, number> | null): Card | null => {
    if (!metrics || !map) return null
    const col = cMoneyOutWindow(map)
    return {
      id, title, tone: 'red', desc,
      cols: [cSym, cPl, cPerCapBuyer, cTvalSym, col],
      rows: metrics.filter((r) => map.has(r.sym)).sort((a, b) => (map.get(a.sym) ?? 0) - (map.get(b.sym) ?? 0)).slice(0, 30),
    }
  }

  const symOutCard5 = mkSymOutCard('sym-out-5', 'خروج پول حقیقی هفتگی', 'مجموع خالص خروج پول حقیقی نماد در ۵ روز کاری اخیر', symMoneyIn5)
  const symOutCard22 = mkSymOutCard('sym-out-22', 'خروج پول حقیقی ماهانه', 'مجموع خالص خروج پول حقیقی نماد در ۲۲ روز کاری اخیر', symMoneyIn22)
  const symOutCard66 = mkSymOutCard('sym-out-66', 'خروج پول حقیقی سه‌ماهه', 'مجموع خالص خروج پول حقیقی نماد در ۶۶ روز کاری اخیر (~۳ ماه)', symMoneyIn66)

  const bg = isDark ? '#060B14' : '#F4F7FB'
  const text = isDark ? '#E8F4FF' : '#0F1E2E'
  const cream = isDark ? '#ddd5bd' : '#6B7F90'

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '24px 14px' : '36px 24px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
          <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, margin: 0 }}>فیلترهای ورود/خروج پول</h1>
          {updated && <span style={{ fontSize: 11.5, color: cream }}>آخرین به‌روزرسانی: {updated}</span>}
        </div>

        <p style={{ fontSize: 12.5, color: cream, margin: '0 0 24px', lineHeight: 2 }}>
          خالص ورود پول حقیقی به تفکیک صنعت — روزانه مستقیم از بازار زنده، پنجره‌های ۳روزه/هفتگی/ماهانه از تاریخچه روزانه.
          تا تکمیل تاریخچه ۲۲ روزه، پنجره‌های بلندتر بر مبنای روزهای موجود محاسبه می‌شوند. صرفاً ابزار رصد است و توصیه خرید یا فروش نیست.
        </p>

        {failed && (
          <div style={{
            padding: '16px 18px', borderRadius: 12, marginBottom: 18, fontSize: 13,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444',
          }}>
            دریافت داده لحظه‌ای ناموفق بود — منبع داده فقط از IP ایران در دسترس است. چند لحظه دیگر دوباره تلاش کنید.
          </div>
        )}

        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))',
        }}>
          {dailyCard ? <Table card={dailyCard} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت اطلاعات بازار…</div>
          )}
          {card3 ? <Table card={card3} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت تاریخچه…</div>
          )}
          {card5 ? <Table card={card5} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت تاریخچه…</div>
          )}
          {card22 ? <Table card={card22} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت تاریخچه…</div>
          )}
        </div>

        <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, margin: '32px 0 6px', color: 'oklch(0.74 0.16 150)' }}>
          بیشترین ورود پول حقیقی
        </h2>
        <p style={{ fontSize: 12.5, color: cream, margin: '0 0 16px', lineHeight: 2 }}>
          خالص ورود پول حقیقی هر نماد (خرید حقیقی منهای فروش حقیقی) در بازه‌های مختلف — روزانه مستقیم از بازار زنده،
          هفتگی/ماهانه/سه‌ماهه از تاریخچه روزانه. تا تکمیل تاریخچه، بازه‌های بلندتر بر مبنای روزهای موجود محاسبه می‌شوند.
        </p>

        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))',
        }}>
          {symDailyCard ? <FilterTable card={symDailyCard} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت اطلاعات بازار…</div>
          )}
          {symCard5 ? <FilterTable card={symCard5} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت تاریخچه…</div>
          )}
          {symCard22 ? <FilterTable card={symCard22} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت تاریخچه…</div>
          )}
          {symCard66 ? <FilterTable card={symCard66} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت تاریخچه…</div>
          )}
        </div>

        <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, margin: '32px 0 6px', color: '#EF4444' }}>
          بیشترین خروج پول حقیقی
        </h2>
        <p style={{ fontSize: 12.5, color: cream, margin: '0 0 16px', lineHeight: 2 }}>
          خالص خروج پول حقیقی هر نماد (فروش حقیقی منهای خرید حقیقی) در بازه‌های مختلف — روزانه مستقیم از بازار زنده،
          هفتگی/ماهانه/سه‌ماهه از تاریخچه روزانه. تا تکمیل تاریخچه، بازه‌های بلندتر بر مبنای روزهای موجود محاسبه می‌شوند.
        </p>

        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))',
        }}>
          {symOutDailyCard ? <FilterTable card={symOutDailyCard} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت اطلاعات بازار…</div>
          )}
          {symOutCard5 ? <FilterTable card={symOutCard5} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت تاریخچه…</div>
          )}
          {symOutCard22 ? <FilterTable card={symOutCard22} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت تاریخچه…</div>
          )}
          {symOutCard66 ? <FilterTable card={symOutCard66} isDark={isDark} /> : (
            <div style={{ padding: 40, textAlign: 'center', color: cream, fontSize: 13 }}>در حال دریافت تاریخچه…</div>
          )}
        </div>
      </div>
    </main>
  )
}
