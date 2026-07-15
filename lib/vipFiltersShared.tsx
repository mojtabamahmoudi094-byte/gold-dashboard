/**
 * ابزارهای مشترک صفحات فیلتر بورس سنج (/vip/filters و /vip/useful-filters)
 * دیتای پایه: BrsApi AllSymbols (فقط IP ایران — فچ سمت کلاینت در هر صفحه جدا)
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'

export const BRSAPI_KEY = process.env.NEXT_PUBLIC_BRSAPI_KEY ?? 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'

// ── اعداد ────────────────────────────────────────────────────────────────────
export const num = (v: unknown): number | null => {
  const x = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(x) ? x : null
}
export const faN = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
// حجم (تعداد سهم) — فشرده
export const fVol = (v: number | null) =>
  v == null ? '—'
  : v >= 1e9 ? `${faN(v / 1e9, 1)} میلیارد`
  : v >= 1e6 ? `${faN(v / 1e6, 1)} میلیون`
  : v >= 1e3 ? `${faN(v / 1e3, 0)} هزار`
  : faN(v)
// ارزش ریالی → تومان فشرده
export const fToman = (rial: number | null) => {
  if (rial == null) return '—'
  const t = rial / 10
  return t >= 1e12 ? `${faN(t / 1e12, 2)} همت`
    : t >= 1e9 ? `${faN(t / 1e9, 1)} میلیارد ت`
    : t >= 1e6 ? `${faN(t / 1e6, 0)} میلیون ت`
    : `${faN(t, 0)} ت`
}
export const fPct = (v: number | null, d = 1) => (v == null ? '—' : `${faN(v, d)}٪`)
// ارزش ریالی → میلیارد تومان با واحد ثابت (بدون فشرده‌سازی همت/میلیون)
export const fBn = (rial: number | null) => (rial == null ? '—' : `${faN(rial / 10 / 1e9, 2)} میلیارد ت`)
// مقادیر کوچک‌تر از ۱ با ۲ رقم اعشار — وگرنه «×۰» نمایش داده می‌شود
export const fX = (v: number | null) => (v == null ? '—' : `${faN(v, v < 1 ? 2 : 1)}×`)

// ── نرمال‌سازی نام + تشخیص سهم (همان منطق scripts/stocks-industries.js) ──────
export const clean = (s: unknown) => String(s || '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[‌‎‏‪-‮]/g, ' ')
  .replace(/\s+/g, ' ').trim()

export const NOT_STOCK_CS = /صندوق|اوراق|تسهیلات|صکوک|اسناد|اختیار|آتی|سپرده|امتیاز|مشارکت|اجاره|مرابحه|خزانه/

// ── متریک‌های هر نماد ────────────────────────────────────────────────────────
export type M = {
  sym: string; name: string
  pl: number; plp: number; pc: number; pcp: number
  tvol: number; tval: number
  bp: number | null          // قدرت خرید حقیقی
  perCapB: number | null     // سرانه خرید حقیقی (ریال)
  perCapS: number | null
  buyNPct: number | null     // سهم حقوقی از خرید (٪ حجم)
  sellNPct: number | null
  buyNVol: number | null
  netNVal: number            // خالص خرید حقوقی (ریال، +ورود)
  dVal: number; oVal: number // ارزش تقاضا/عرضه سطح ۱–۵ (ریال)
  pd1: number | null; po1: number | null
  spreadPct: number | null   // (عرضه−تقاضا)÷تقاضا ٪
  ratioW: number | null; ratioM: number | null
  avgVolW: number | null; avgVolM: number | null   // میانگین حجم خام هفته/ماه
  buyQueue: boolean          // صف خرید (قفل در سقف قیمت)
  sellQueue: boolean         // صف فروش (قفل در کف قیمت)
  mv: number                 // ارزش بازار شرکت (ریال)
  floatShares: number | null // تعداد سهام شناور (z × ff٪)
  buyCountI: number          // تعداد کد خریدار حقیقی
  sellCountI: number         // تعداد کد فروشنده حقیقی
  qd1: number | null; qo1: number | null   // حجم بهترین سفارش خرید/فروش (حجم صف وقتی buyQueue/sellQueue باشد)
  moneyInI: number           // خالص ورود پول حقیقی امروز (ریال، + یعنی ورود)
  perCapBuyerN: number | null // سرانه خرید حقوقی (ریال)
}

export function buildMetrics(
  arr: any[],
  vol: Map<string, { w: number | null; m: number | null }>,
  float: Map<string, { ff: number | null; z: number | null }> = new Map(),
): M[] {
  const allL18 = new Set(arr.map((it) => clean(it.l18)))
  const out: M[] = []
  for (const it of arr) {
    const sym = clean(it.l18), name = clean(it.l30), cs = clean(it.cs)
    if (!sym) continue
    if (cs && NOT_STOCK_CS.test(cs)) continue
    if (/[0-9۰-۹]/.test(sym)) continue
    if (/حق تقدم|حق‌تقدم/.test(name)) continue
    if (sym.endsWith('ح') && allL18.has(sym.slice(0, -1))) continue

    const pl = num(it.pl) ?? 0, pc = num(it.pc) ?? 0
    const tvol = num(it.tvol) ?? 0, tval = num(it.tval) ?? 0
    if (!pl || !pc || tvol <= 0) continue

    const bI = num(it.Buy_I_Volume) ?? 0, sI = num(it.Sell_I_Volume) ?? 0
    const bN = num(it.Buy_N_Volume) ?? 0, sN = num(it.Sell_N_Volume) ?? 0
    const bCI = num(it.Buy_CountI) ?? 0, sCI = num(it.Sell_CountI) ?? 0
    const perCapB = bCI > 0 ? (bI * pc) / bCI : null
    const perCapS = sCI > 0 ? (sI * pc) / sCI : null
    const bp = perCapB != null && perCapS != null && perCapS > 0 ? perCapB / perCapS : null
    const bCN = num(it.Buy_CountN) ?? 0
    const perCapBuyerN = bCN > 0 ? (bN * pc) / bCN : null

    let dVal = 0, oVal = 0
    for (let i = 1; i <= 5; i++) {
      const qd = num(it['qd' + i]) ?? 0, pd = num(it['pd' + i]) ?? 0
      const qo = num(it['qo' + i]) ?? 0, po = num(it['po' + i]) ?? 0
      if (qd > 0 && pd > 0) dVal += qd * pd
      if (qo > 0 && po > 0) oVal += qo * po
    }
    const pd1 = num(it.pd1), po1 = num(it.po1)
    const spreadPct = pd1 && po1 && pd1 > 0 && po1 > 0 ? ((po1 - pd1) / pd1) * 100 : null

    // صف خرید/فروش (همان منطق scripts/stocks-industries.js)
    const tmax = num(it.tmax), tmin = num(it.tmin)
    const qd1 = num(it.qd1) ?? 0, qo1 = num(it.qo1) ?? 0
    const buyQueue = !!(tmax && pd1 != null && pd1 >= tmax && qd1 > 0)
    const sellQueue = !!(tmin && po1 != null && po1 <= tmin && qo1 > 0)

    const v = vol.get(sym)
    const fl = float.get(sym)
    const floatShares = fl?.ff != null && fl?.z != null ? fl.z * (fl.ff / 100) : null
    out.push({
      sym, name,
      pl, plp: num(it.plp) ?? 0, pc, pcp: num(it.pcp) ?? 0,
      tvol, tval,
      bp, perCapB, perCapS,
      buyNPct: tvol > 0 ? (bN / tvol) * 100 : null,
      sellNPct: tvol > 0 ? (sN / tvol) * 100 : null,
      buyNVol: bN,
      netNVal: (bN - sN) * pc,
      dVal, oVal, pd1, po1, spreadPct,
      ratioW: v?.w ? tvol / v.w : null,
      ratioM: v?.m ? tvol / v.m : null,
      avgVolW: v?.w ?? null, avgVolM: v?.m ?? null,
      buyQueue, sellQueue,
      mv: num(it.mv) ?? 0, floatShares,
      buyCountI: bCI, sellCountI: sCI,
      qd1, qo1,
      moneyInI: (bI - sI) * pc,
      perCapBuyerN,
    })
  }
  return out
}

// ── تعریف جدول‌ها ────────────────────────────────────────────────────────────
export type Col = { label: string; key: keyof M | 'spreadAbs'; fmt: (r: M) => string; num: (r: M) => number }
export type Card = { id: string; title: string; tone: 'green' | 'red'; desc: string; cols: Col[]; rows: M[]; needVol?: boolean; needFloat?: boolean }

export const cSym: Col = { label: 'نماد', key: 'sym', fmt: (r) => r.sym, num: () => 0 }
export const cPl: Col = { label: 'قیمت آخر', key: 'pl', fmt: (r) => `${faN(r.pl)} (${faN(r.plp, 2)}٪)`, num: (r) => r.plp }
export const cVol: Col = { label: 'حجم', key: 'tvol', fmt: (r) => fVol(r.tvol), num: (r) => r.tvol }
export const cRatioM: Col = { label: 'ضریب حجم', key: 'ratioM', fmt: (r) => fX(r.ratioM), num: (r) => r.ratioM ?? 0 }

// ── جدول با سورت (استفاده مشترک هر صفحه‌ای که رو نوع M کار می‌کند) ────────────
// compact: بدون سقف ارتفاع/اسکرول — برای جدول‌های تمام‌عرض با ستون‌های زیاد (مثل صف خرید/فروش)
export function FilterTable({ card, isDark, compact }: { card: Card; isDark: boolean; compact?: boolean }) {
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
  const titleClr = card.tone === 'green' ? 'oklch(0.74 0.16 150)' : '#EF4444'

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
        <span style={{ fontSize: 14, fontWeight: 700, color: titleClr, textAlign: 'center', flex: 1 }}>
          {card.title}
        </span>
        <span style={{ width: 18 }} />
      </div>

      <div style={{ overflowX: compact ? 'visible' : 'auto', overflowY: compact ? 'visible' : 'auto', maxHeight: compact ? 'none' : 430, flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? 11 : 12, tableLayout: compact ? 'fixed' : 'auto' }}>
          <thead>
            <tr>
              {card.cols.map((c, i) => (
                <th key={i}
                  onClick={() => { if (sortI === i) setAsc(!asc); else { setSortI(i); setAsc(false) } }}
                  style={{
                    position: 'sticky', top: 0, background: headBg, zIndex: 1,
                    padding: compact ? '7px 4px' : '8px 8px', fontWeight: 700, color: text,
                    whiteSpace: compact ? 'normal' : 'nowrap', cursor: 'pointer', userSelect: 'none',
                    backdropFilter: 'blur(6px)', wordBreak: compact ? 'break-word' : 'normal',
                    fontSize: compact ? 10.5 : undefined, lineHeight: compact ? 1.4 : undefined,
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
                {card.needFloat ? 'داده شناوری هنوز در دسترس نیست' : card.needVol ? 'نمادی با این شرط پیدا نشد' : 'در حال حاضر نمادی شرایط این فیلتر را ندارد'}
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.sym} style={{ borderBottom: `1px solid ${line}` }}>
                {card.cols.map((c, i) => (
                  <td key={i} style={{
                    padding: compact ? '6px 4px' : '7px 8px', textAlign: 'center',
                    whiteSpace: compact ? 'normal' : 'nowrap', wordBreak: compact ? 'break-word' : 'normal',
                    color: i === 0 ? '#3b82f6' : cream,
                  }}>
                    {i === 0 ? (
                      <Link href={`/technical/${encodeURIComponent(r.sym)}`} style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 700 }}>
                        {r.sym}
                      </Link>
                    ) : (
                      <span style={{
                        color: c.key === 'pl' ? (r.plp > 0 ? 'oklch(0.74 0.16 150)' : r.plp < 0 ? '#EF4444' : cream)
                          : c.key === 'netNVal' ? (r.netNVal >= 0 ? 'oklch(0.74 0.16 150)' : '#EF4444')
                          : cream,
                        fontWeight: 500,
                      }}>{c.fmt(r)}</span>
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
