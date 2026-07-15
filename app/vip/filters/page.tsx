'use client'

/**
 * فیلترهای VIP بورس سنج — ۱۲ جدول فیلتر لحظه‌ای روی کل سهام بازار
 *
 * دیتا: BrsApi AllSymbols (فقط IP ایران — فچ سمت کلاینت، همان الگوی Header)
 * میانگین حجم هفته/ماه: view سوپابیس stock_vol_avgs (scripts/sql/vip-vol-avgs.sql)
 *
 * تعاریف فیلترها (فیلترنویسی استاندارد TSETMC):
 *  - قدرت خرید حقیقی = سرانه خرید حقیقی ÷ سرانه فروش حقیقی
 *  - ورود پول هوشمند: قدرت خرید ≥۲ + حجم ≥۱.۵× میانگین ماه + آخرین مثبت
 *  - کد به کد حقیقی→حقوقی: خرید حقوقی >۵۰٪ حجم و فروش حقیقی >۵۰٪ حجم
 *  - کد به کد حقوقی→حقیقی: فروش حقوقی >۵۰٪ و خرید حقیقی >۵۰٪ + قدرت خرید ≥۱ + آخرین ≥ پایانی
 *  - حجم مشکوک هفته/ماه: حجم امروز ≥۳× میانگین هفته / ≥۲× میانگین ماه
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'

const BRSAPI_KEY = process.env.NEXT_PUBLIC_BRSAPI_KEY ?? 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'

// ── اعداد ────────────────────────────────────────────────────────────────────
const num = (v: unknown): number | null => {
  const x = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(x) ? x : null
}
const faN = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
// حجم (تعداد سهم) — فشرده
const fVol = (v: number | null) =>
  v == null ? '—'
  : v >= 1e9 ? `${faN(v / 1e9, 1)} میلیارد`
  : v >= 1e6 ? `${faN(v / 1e6, 1)} میلیون`
  : v >= 1e3 ? `${faN(v / 1e3, 0)} هزار`
  : faN(v)
// ارزش ریالی → تومان فشرده
const fToman = (rial: number | null) => {
  if (rial == null) return '—'
  const t = rial / 10
  return t >= 1e12 ? `${faN(t / 1e12, 2)} همت`
    : t >= 1e9 ? `${faN(t / 1e9, 1)} میلیارد ت`
    : t >= 1e6 ? `${faN(t / 1e6, 0)} میلیون ت`
    : `${faN(t, 0)} ت`
}
const fPct = (v: number | null, d = 1) => (v == null ? '—' : `${faN(v, d)}٪`)
// ارزش ریالی → میلیارد تومان با واحد ثابت (بدون فشرده‌سازی همت/میلیون)
const fBn = (rial: number | null) => (rial == null ? '—' : `${faN(rial / 10 / 1e9, 2)} میلیارد ت`)
// سرانه خرید روزانه از قبل به تومان ذخیره شده (بدون تقسیم بر ۱۰)
const fTomanT = (t: number | null) => {
  if (t == null) return '—'
  return t >= 1e9 ? `${faN(t / 1e9, 2)} میلیارد ت`
    : t >= 1e6 ? `${faN(t / 1e6, 0)} میلیون ت`
    : `${faN(t, 0)} ت`
}
// مقادیر کوچک‌تر از ۱ با ۲ رقم اعشار — وگرنه «×۰» نمایش داده می‌شود
const fX = (v: number | null) => (v == null ? '—' : `${faN(v, v < 1 ? 2 : 1)}×`)

// ── نرمال‌سازی نام + تشخیص سهم (همان منطق scripts/stocks-industries.js) ──────
const clean = (s: unknown) => String(s || '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[‌‎‏‪-‮]/g, ' ')
  .replace(/\s+/g, ' ').trim()

const NOT_STOCK_CS = /صندوق|اوراق|تسهیلات|صکوک|اسناد|اختیار|آتی|سپرده|امتیاز|مشارکت|اجاره|مرابحه|خزانه/

// ── متریک‌های هر نماد ────────────────────────────────────────────────────────
type M = {
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
}

function buildMetrics(
  arr: any[],
  vol: Map<string, { w: number | null; m: number | null }>,
  float: Map<string, { ff: number | null; z: number | null }>,
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
    })
  }
  return out
}

// ── تعریف جدول‌ها ────────────────────────────────────────────────────────────
type Col = { label: string; key: keyof M | 'spreadAbs'; fmt: (r: M) => string; num: (r: M) => number }
type Card = { id: string; title: string; tone: 'green' | 'red'; desc: string; cols: Col[]; rows: M[]; needVol?: boolean; needFloat?: boolean }

const cSym: Col = { label: 'نماد', key: 'sym', fmt: (r) => r.sym, num: () => 0 }
const cPl: Col = { label: 'قیمت آخر', key: 'pl', fmt: (r) => `${faN(r.pl)} (${faN(r.plp, 2)}٪)`, num: (r) => r.plp }
const cBp: Col = { label: 'قدرت خرید', key: 'bp', fmt: (r) => fX(r.bp), num: (r) => r.bp ?? 0 }
const cVol: Col = { label: 'حجم', key: 'tvol', fmt: (r) => fVol(r.tvol), num: (r) => r.tvol }
const cVal: Col = { label: 'ارزش', key: 'tval', fmt: (r) => fToman(r.tval), num: (r) => r.tval }
const cPerCap: Col = { label: 'سرانه خرید', key: 'perCapB', fmt: (r) => fToman(r.perCapB), num: (r) => r.perCapB ?? 0 }
const cRatioM: Col = { label: 'ضریب حجم', key: 'ratioM', fmt: (r) => fX(r.ratioM), num: (r) => r.ratioM ?? 0 }
const cSellN: Col = { label: 'فروش حقوقی', key: 'sellNPct', fmt: (r) => fPct(r.sellNPct, 0), num: (r) => r.sellNPct ?? 0 }
const cMv: Col = { label: 'مارکت سهم', key: 'mv', fmt: (r) => fToman(r.mv), num: (r) => r.mv }
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

function buildCards(ms: M[], hasVol: boolean): Card[] {
  const top = (rows: M[], by: (r: M) => number, n = 30) => [...rows].sort((a, b) => by(b) - by(a)).slice(0, n)
  // شرط حجم: با view → نسبت به میانگین ماه؛ بدون view → ارزش معاملات ≥ ۱ میلیارد تومان
  const hotVol = (r: M, k: number) => (hasVol && r.ratioM != null ? r.ratioM >= k : r.tval >= 1e10)

  const smartIn = ms.filter((r) => r.plp > 0 && (r.bp ?? 0) >= 2 && hotVol(r, 1.5))
  const smartOut = ms.filter((r) => r.plp < 0 && r.bp != null && r.bp > 0 && r.bp <= 0.5 && hotVol(r, 1.5))
  const c2cToN = ms.filter((r) => (r.buyNPct ?? 0) >= 50 && (100 - (r.sellNPct ?? 0)) >= 50 && hotVol(r, 1.25))
  const c2cToI = ms.filter((r) =>
    (r.sellNPct ?? 0) >= 50 && (100 - (r.buyNPct ?? 0)) >= 50
    && (r.bp ?? 0) >= 1 && r.pl >= r.pc && r.plp > 0 && hotVol(r, 1.25))
  // صف خرید/فروش حذف می‌شود: نماد قفل‌شده «سنگین خرید/فروش» زنده نیست، حالت متفاوتی است
  const heavyBuy = ms.filter((r) => r.dVal >= 3e10 && r.dVal >= 2 * r.oVal && !r.buyQueue)
  const heavySell = ms.filter((r) => r.oVal >= 3e10 && r.oVal >= 2 * r.dVal && !r.sellQueue)
  const suspW = hasVol ? ms.filter((r) => (r.ratioW ?? 0) >= 3) : []
  const suspM = hasVol ? ms.filter((r) => (r.ratioM ?? 0) >= 2) : []
  const legalBuy = top(ms.filter((r) => r.tval >= 1e9 && (r.buyNPct ?? 0) > 0), (r) => r.buyNPct ?? 0, 20)
  const tick = ms.filter((r) => r.pl > r.pc && r.plp > 0 && r.pcp > 0 && (r.bp ?? 0) > 1)
  const spread = top(ms.filter((r) => r.tval >= 5e8 && r.spreadPct != null && r.spreadPct > 0), (r) => r.spreadPct ?? 0, 20)
  const golden = ms.filter((r) =>
    r.plp > 0 && (r.bp ?? 0) >= 2 && (r.perCapB ?? 0) >= 3e8
    && (r.sellNPct ?? 0) >= 30 && hotVol(r, 1.5))

  const cDemand: Col = { label: 'تقاضا به عرضه', key: 'dVal', fmt: (r) => (r.oVal > 0 ? fX(r.dVal / r.oVal) : '∞'), num: (r) => (r.oVal > 0 ? r.dVal / r.oVal : 1e9) }
  const cSupply: Col = { label: 'عرضه به تقاضا', key: 'oVal', fmt: (r) => (r.dVal > 0 ? fX(r.oVal / r.dVal) : '∞'), num: (r) => (r.dVal > 0 ? r.oVal / r.dVal : 1e9) }

  return [
    {
      id: 'smart-in', title: 'ورود پول هوشمند', tone: 'green',
      desc: 'قدرت خریدار حقیقی ≥۲ برابر فروشنده + حجم معاملات بالا + آخرین قیمت مثبت',
      cols: [cSym, cPl, cBp, cVol, cVal], rows: top(smartIn, (r) => r.bp ?? 0),
    },
    {
      id: 'smart-out', title: 'خروج پول هوشمند', tone: 'red',
      desc: 'قدرت فروشنده حقیقی ≥۲ برابر خریدار + حجم بالا + آخرین قیمت منفی',
      cols: [cSym, cPl, cBp, cVol, cVal], rows: top(smartOut, (r) => (r.bp ? 1 / r.bp : 0)),
    },
    {
      id: 'c2c-to-legal', title: 'کد به کد حقیقی به حقوقی', tone: 'red',
      desc: 'خرید حقوقی بیش از ۵۰٪ حجم و فروشنده عمدتاً حقیقی — انتقال سهم از حقیقی به حقوقی',
      cols: [cSym, cPl,
        { label: 'حجم خرید حقوقی', key: 'buyNVol', fmt: (r) => fVol(r.buyNVol), num: (r) => r.buyNVol ?? 0 },
        cVol], rows: top(c2cToN, (r) => r.buyNPct ?? 0),
    },
    {
      id: 'c2c-to-real', title: 'کد به کد حقوقی به حقیقی', tone: 'green',
      desc: 'فروش حقوقی بیش از ۵۰٪ حجم، خریدار عمدتاً حقیقی با قدرت خرید ≥۱ و آخرین ≥ پایانی — نشانه حمایت',
      cols: [cSym, cPl, cBp, cPerCap, cRatioM, cSellN], rows: top(c2cToI, (r) => r.sellNPct ?? 0),
    },
    {
      id: 'heavy-buy', title: 'اردرهای حمایتی و سنگین خرید', tone: 'green',
      desc: 'ارزش سفارش‌های خرید (۵ سطح تقاضا) ≥۳ میلیارد تومان و حداقل ۲ برابر عرضه — نمادهای در صف خرید حذف می‌شوند',
      cols: [cSym, cPl, cBp, cDemand,
        { label: 'ارزش تقاضا', key: 'dVal', fmt: (r) => fToman(r.dVal), num: (r) => r.dVal },
        cVol], rows: top(heavyBuy, (r) => r.dVal),
    },
    {
      id: 'heavy-sell', title: 'اردرهای ترس و سنگین فروش', tone: 'red',
      desc: 'ارزش سفارش‌های فروش (۵ سطح عرضه) ≥۳ میلیارد تومان و حداقل ۲ برابر تقاضا — نمادهای در صف فروش حذف می‌شوند',
      cols: [cSym, cPl, cBp, cSupply,
        { label: 'ارزش عرضه', key: 'oVal', fmt: (r) => fToman(r.oVal), num: (r) => r.oVal },
        cVol], rows: top(heavySell, (r) => r.oVal),
    },
    {
      id: 'susp-week', title: `حجم مشکوک هفته (${faN(suspW.length)})`, tone: 'red', needVol: true,
      desc: 'حجم امروز حداقل ۳ برابر میانگین حجم ۵ روز اخیر',
      cols: [cSym,
        { label: 'نسبت حجم', key: 'ratioW', fmt: (r) => fX(r.ratioW), num: (r) => r.ratioW ?? 0 },
        cVol, cBp, cPl], rows: top(suspW, (r) => r.ratioW ?? 0),
    },
    {
      id: 'susp-month', title: `حجم مشکوک ماه (${faN(suspM.length)})`, tone: 'green', needVol: true,
      desc: 'حجم امروز حداقل ۲ برابر میانگین حجم ۲۲ روز اخیر',
      cols: [cSym,
        { label: 'نسبت حجم', key: 'ratioM', fmt: (r) => fX(r.ratioM), num: (r) => r.ratioM ?? 0 },
        cVol, cBp, cPl], rows: top(suspM, (r) => r.ratioM ?? 0),
    },
    {
      id: 'legal-buy', title: 'بیشترین درصد حجم خرید حقوقی', tone: 'green',
      desc: 'نمادهایی که بیشترین سهم خرید امروزشان توسط حقوقی‌ها انجام شده',
      cols: [cSym, cPl,
        { label: 'خرید حقوقی', key: 'buyNVol', fmt: (r) => fVol(r.buyNVol), num: (r) => r.buyNVol ?? 0 },
        cVol,
        { label: 'درصد', key: 'buyNPct', fmt: (r) => fPct(r.buyNPct, 0), num: (r) => r.buyNPct ?? 0 },
        { label: 'ورود پول', key: 'netNVal', fmt: (r) => fToman(r.netNVal), num: (r) => r.netNVal },
      ], rows: legalBuy,
    },
    {
      id: 'tick-up', title: 'فیلتر الگوی تیک صعودی', tone: 'green',
      desc: 'آخرین قیمت بالاتر از پایانی + پایانی مثبت + قدرت خریدار حقیقی >۱ — احتمال ادامه رشد فردا',
      cols: [cSym, cPl, cBp, cPerCap, cRatioM, cVol], rows: top(tick, (r) => r.bp ?? 0),
    },
    {
      id: 'spread', title: 'بیشترین درصد اختلاف عرضه و تقاضا', tone: 'green',
      desc: 'بیشترین فاصله بین بهترین قیمت تقاضا و بهترین قیمت عرضه — نشانه بلاتکلیفی یا جمع شدن سفارش‌ها',
      cols: [cSym,
        { label: 'درصد اختلاف', key: 'spreadPct', fmt: (r) => fPct(r.spreadPct, 2), num: (r) => r.spreadPct ?? 0 },
        { label: 'قیمت تقاضا', key: 'pd1', fmt: (r) => (r.pd1 ? faN(r.pd1) : '—'), num: (r) => r.pd1 ?? 0 },
        { label: 'قیمت عرضه', key: 'po1', fmt: (r) => (r.po1 ? faN(r.po1) : '—'), num: (r) => r.po1 ?? 0 },
        cPl,
        { label: 'حجم معاملات', key: 'tvol', fmt: (r) => fVol(r.tvol), num: (r) => r.tvol },
      ], rows: spread,
    },
    {
      id: 'golden', title: 'فیلتر طلایی بورس سنج', tone: 'green',
      desc: 'ترکیب قوی‌ترین نشانه‌ها: قدرت خرید ≥۲ + سرانه خرید حقیقی ≥۳۰ میلیون تومان + فروش حقوقی ≥۳۰٪ (کد به کد) + حجم بالا + آخرین مثبت',
      cols: [cSym, cPl, cBp, cPerCap, cRatioM, cSellN, cVol], rows: top(golden, (r) => r.bp ?? 0),
    },
  ]
}

// ── فیلترهای کاربردی → حجم به شناوری و مارکت — نیازمند stock_float (کرون روزانه stock-float.js) ────
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

// ── جدول با سورت ─────────────────────────────────────────────────────────────
function FilterTable({ card, isDark }: { card: Card; isDark: boolean }) {
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
                {card.needFloat ? 'داده شناوری هنوز در دسترس نیست' : card.needVol ? 'نمادی با این شرط پیدا نشد' : 'در حال حاضر نمادی شرایط این فیلتر را ندارد'}
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

// همان ظاهر FilterTable، برای جدول‌های «فیلترهای کاربردی» (رنگ تیتر همیشه سبز — این جدول‌ها فقط افزایشی نشان می‌دهند)
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
export default function VipFiltersPage() {
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  const [metrics, setMetrics] = useState<M[] | null>(null)
  const [hasVol, setHasVol] = useState(false)
  const [hasFloat, setHasFloat] = useState(false)
  const [failed, setFailed] = useState(false)
  const [updated, setUpdated] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [perCapRows, setPerCapRows] = useState<PerCapRow[] | null>(null)
  const [perCapUpdated, setPerCapUpdated] = useState<string | null>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  const load = async () => {
    setLoading(true)
    setFailed(false)
    try {
      // میانگین حجم هفته/ماه از view سوپابیس (اختیاری — بدون آن فیلترهای حجم مشکوک خالی می‌مانند)
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
      setHasVol(volMap.size > 0)

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
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const iv = setInterval(load, 120_000) // هر ۲ دقیقه
    return () => clearInterval(iv)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // فیلترهای کاربردی → افزایش سرانه خریدار: تاریخچه روزانه از stock_per_capita_daily (کرون سرور هر ۵ دقیقه ردیف امروز را به‌روز می‌کند)
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

  const cards = useMemo(() => (metrics ? buildCards(metrics, hasVol) : []), [metrics, hasVol])
  const perCapCards = useMemo(() => (perCapRows ? buildPerCapCards(perCapRows) : []), [perCapRows])
  const volFloatCards = useMemo(() => (metrics ? buildVolFloatCards(metrics) : []), [metrics])

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
          <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, margin: 0 }}>
            فیلترهای <span style={{
              background: 'linear-gradient(135deg, #f59e0b, #f97316)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>VIP</span> بورس سنج
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {updated && <span style={{ fontSize: 11.5, color: cream }}>آخرین به‌روزرسانی: {updated}</span>}
            <button onClick={load} disabled={loading} style={{
              fontSize: 12, padding: '6px 16px', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
              color: '#3b82f6', fontFamily: 'inherit', fontWeight: 600,
            }}>{loading ? 'در حال دریافت…' : 'به‌روزرسانی'}</button>
          </div>
        </div>

        <p style={{ fontSize: 12.5, color: cream, margin: '0 0 20px', lineHeight: 2 }}>
          ۱۲ فیلتر لحظه‌ای روی کل سهام بازار — پول هوشمند، کد به کد، حجم مشکوک، اردرهای سنگین و فیلتر طلایی.
          داده‌ها در ساعت بازار (۹:۰۰–۱۲:۳۰) هر ۲ دقیقه به‌روز می‌شود. این فیلترها صرفاً ابزار رصد هستند و توصیه خرید یا فروش نیستند.
        </p>

        {failed && (
          <div style={{
            padding: '16px 18px', borderRadius: 12, marginBottom: 18, fontSize: 13,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444',
          }}>
            دریافت داده لحظه‌ای ناموفق بود — منبع داده فقط از IP ایران در دسترس است. چند لحظه دیگر دوباره تلاش کنید.
          </div>
        )}

        {!metrics && !failed && (
          <div style={{ padding: 60, textAlign: 'center', color: cream, fontSize: 14 }}>در حال دریافت اطلاعات بازار…</div>
        )}

        {metrics && !hasVol && (
          <div style={{
            padding: '10px 16px', borderRadius: 10, marginBottom: 16, fontSize: 12,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b',
          }}>
            میانگین حجم هفته/ماه در دسترس نیست — فیلترهای «حجم مشکوک» و ستون «ضریب حجم» غیرفعال‌اند.
          </div>
        )}

        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))',
        }}>
          {cards.map((c) => <FilterTable key={c.id} card={c} isDark={isDark} />)}
        </div>

        {/* فیلترهای کاربردی */}
        <div style={{ margin: '40px 0 20px', paddingTop: 24, borderTop: `2px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,30,46,0.1)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
            <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, margin: 0 }}>فیلترهای کاربردی</h2>
            {perCapUpdated && <span style={{ fontSize: 11.5, color: cream }}>آخرین به‌روزرسانی: {perCapUpdated}</span>}
          </div>
          <h3 style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, margin: '0 0 6px', color: 'oklch(0.74 0.16 150)' }}>
            افزایش سرانه خریدار
          </h3>
          <p style={{ fontSize: 12.5, color: cream, margin: '0 0 16px', lineHeight: 2 }}>
            سرانه خرید حقیقی هر نماد از امروز به‌صورت روزانه ذخیره می‌شود؛ تا تکمیل تاریخچه ۲۰ روزه، میانگین‌های بلندتر بر مبنای روزهای موجود محاسبه می‌شوند.
            جدول‌ها فقط نمادهای با سرانه افزایشی را نشان می‌دهند. صرفاً ابزار رصد است و توصیه خرید نیست.
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
              display: 'grid', gap: 16,
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))',
            }}>
              {perCapCards.map((c) => <PerCapTable key={c.id} card={c} isDark={isDark} />)}
            </div>
          )}

          <h3 style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, margin: '28px 0 6px', color: 'oklch(0.74 0.16 150)' }}>
            حجم به شناوری و مارکت
          </h3>
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
        </div>
      </div>
    </main>
  )
}
