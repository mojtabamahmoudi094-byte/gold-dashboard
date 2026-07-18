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
 *
 * فیلترهای کاربردی (افزایش سرانه خریدار، حجم به شناوری و مارکت) در /vip/useful-filters هستند
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import {
  BRSAPI_KEY, num, faN, fVol, fToman, fPct, fX, clean, isTehranMarketClosedDay,
  type M, buildMetrics, type Col, type Card, cSym, cPl, cRatioM, cVol, FilterTable,
} from '../../../lib/vipFiltersShared'
import AuthGate from '../../../components/AuthGate'
import { shouldUseDark } from '../../../lib/theme'

const cBp: Col = { label: 'قدرت خرید', key: 'bp', fmt: (r) => fX(r.bp), num: (r) => r.bp ?? 0 }
const cVal: Col = { label: 'ارزش', key: 'tval', fmt: (r) => fToman(r.tval), num: (r) => r.tval }
const cPerCap: Col = { label: 'سرانه خرید', key: 'perCapB', fmt: (r) => fToman(r.perCapB), num: (r) => r.perCapB ?? 0 }
const cSellN: Col = { label: 'فروش حقوقی', key: 'sellNPct', fmt: (r) => fPct(r.sellNPct, 0), num: (r) => r.sellNPct ?? 0 }
const cSellPower: Col = {
  label: 'قدرت فروش', key: 'bp',
  fmt: (r) => fX(r.bp && r.bp > 0 ? 1 / r.bp : null),
  num: (r) => (r.bp && r.bp > 0 ? 1 / r.bp : 0),
}
const cBuyCnt: Col = { label: 'تعداد خریدار', key: 'buyCountI', fmt: (r) => faN(r.buyCountI), num: (r) => r.buyCountI }
const cSellCnt: Col = { label: 'تعداد فروشنده', key: 'sellCountI', fmt: (r) => faN(r.sellCountI), num: (r) => r.sellCountI }
const cPcpCol: Col = { label: 'درصد پایانی', key: 'pcp', fmt: (r) => fPct(r.pcp, 2), num: (r) => r.pcp }

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
  const tickDown = ms.filter((r) => r.pl < r.pc && r.plp < 0 && r.pcp < 0 && r.bp != null && r.bp > 0 && r.bp < 1)
  const swingReversal = ms.filter((r) => r.pcp < -3 && r.plp > -3)
  const spread = top(ms.filter((r) => r.tval >= 5e8 && r.spreadPct != null && r.spreadPct > 0), (r) => r.spreadPct ?? 0, 20)
  const golden = ms.filter((r) =>
    r.plp > 0 && (r.bp ?? 0) >= 2 && (r.perCapB ?? 0) >= 3e8
    && (r.sellNPct ?? 0) >= 30 && hotVol(r, 1.5))
  const withPower = ms.filter((r) => r.bp != null && r.bp > 0 && (r.buyCountI > 0 || r.sellCountI > 0))
  const suspHeavy = hasVol ? ms.filter((r) => (r.ratioM ?? 0) >= 5) : []

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
    {
      id: 'most-buy-power', title: 'بیشترین قدرت خریدار حقیقی', tone: 'green',
      desc: 'نسبت سرانه خرید به سرانه فروش حقیقی — بدون شرط حجمی، صرفاً رتبه‌بندی قدرت خریداران',
      cols: [cSym, cPl, cBp, cBuyCnt, cSellCnt, cVol], rows: top(withPower, (r) => r.bp ?? 0),
    },
    {
      id: 'most-sell-power', title: 'بیشترین قدرت فروشنده حقیقی', tone: 'red',
      desc: 'نسبت سرانه فروش به سرانه خرید حقیقی — بدون شرط حجمی، صرفاً رتبه‌بندی قدرت فروشندگان',
      cols: [cSym, cPl, cSellPower, cSellCnt, cBuyCnt, cVol], rows: top(withPower, (r) => (r.bp && r.bp > 0 ? 1 / r.bp : 0)),
    },
    {
      id: 'susp-heavy', title: `حجم خیلی مشکوک (${faN(suspHeavy.length)})`, tone: 'red', needVol: true,
      desc: 'حجم امروز حداقل ۵ برابر میانگین حجم ماه — نشانه‌ی جابه‌جایی غیرعادی',
      cols: [cSym, cRatioM, cVol, cBp, cPl], rows: top(suspHeavy, (r) => r.ratioM ?? 0),
    },
    {
      id: 'tick-down', title: 'فیلتر الگوی تیک نزولی', tone: 'red',
      desc: 'آخرین قیمت پایین‌تر از پایانی + پایانی منفی + قدرت فروشنده حقیقی >۱ — احتمال ادامه افت فردا',
      cols: [cSym, cPl, cSellPower, cPerCap, cRatioM, cVol], rows: top(tickDown, (r) => (r.bp && r.bp > 0 ? 1 / r.bp : 0)),
    },
    {
      id: 'swing-reversal', title: 'فیلتر نوسان‌گیری', tone: 'green',
      desc: 'پایانی حداقل ۳٪ منفی بوده ولی آخرین معامله بهتر از منفی۳٪ است — نشانه برگشت قیمتی روزانه، مناسب نوسان‌گیری کوتاه‌مدت',
      cols: [cSym, cPl, cPcpCol, cVol, cVal], rows: top(swingReversal, (r) => r.plp - r.pcp),
    },
  ]
}

// ── صفحه ─────────────────────────────────────────────────────────────────────
export default function VipFiltersPage() {
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  const [metrics, setMetrics] = useState<M[] | null>(null)
  const [hasVol, setHasVol] = useState(false)
  const [failed, setFailed] = useState(false)
  const [updated, setUpdated] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [marketClosed] = useState(() => isTehranMarketClosedDay())

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
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

      // BrsApi فقط از IP ایران جواب می‌دهد — فچ سمت کلاینت (الگوی Header)
      const res = await fetch(`https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${BRSAPI_KEY}`, {
        cache: 'no-store', signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const arr = Array.isArray(data) ? data : (data?.symbols ?? data?.data ?? [])
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('empty')

      setMetrics(buildMetrics(arr, volMap))
      setUpdated(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }))
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load() // همیشه یک‌بار در بارگذاری صفحه — حتی پنج‌شنبه/جمعه (آخرین اسنپ‌شات قبل تعطیلی را می‌گیرد)
    const iv = setInterval(() => { if (!isTehranMarketClosedDay()) load() }, 120_000) // فقط روزهای بازار تکرار می‌شود
    return () => clearInterval(iv)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cards = useMemo(() => (metrics ? buildCards(metrics, hasVol) : []), [metrics, hasVol])

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
              background: 'rgba(217,180,91,0.1)', border: '1px solid rgba(217,180,91,0.3)',
              color: '#d9b45b', fontFamily: 'inherit', fontWeight: 600,
            }}>{loading ? 'در حال دریافت…' : 'به‌روزرسانی'}</button>
          </div>
        </div>

        <p style={{ fontSize: 12.5, color: cream, margin: '0 0 20px', lineHeight: 2 }}>
          ۱۷ فیلتر لحظه‌ای روی کل سهام بازار — پول هوشمند، کد به کد، حجم مشکوک، اردرهای سنگین، قدرت خریدار/فروشنده، الگوی تیک و فیلتر طلایی.
          داده‌ها در ساعت بازار (۹:۰۰–۱۲:۳۰) هر ۲ دقیقه به‌روز می‌شود. این فیلترها صرفاً ابزار رصد هستند و توصیه خرید یا فروش نیستند.
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
        </div>
      </main>
    </AuthGate>
  )
}
