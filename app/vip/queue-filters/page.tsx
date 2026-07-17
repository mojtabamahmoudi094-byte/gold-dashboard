'use client'

/**
 * فیلترهای صف خرید و فروش بورس سنج
 *
 * صف خرید/فروش از qd1/pd1 و qo1/po1 (بهترین سفارش خرید/فروش) تشخیص داده می‌شود:
 * صف خرید یعنی بهترین قیمت خرید = سقف مجاز روز (pd1 ≥ tmax) و حجم آن > ۰ (منطق مشترک buildMetrics)
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import {
  BRSAPI_KEY, num, faN, fPct, fX, fBn, fToman, clean, isTehranMarketClosedDay,
  type M, buildMetrics, type Col, type Card, cSym, cVol, FilterTable,
} from '../../../lib/vipFiltersShared'
import AuthGate from '../../../components/AuthGate'

const cLastPct: Col = { label: 'درصد آخرین قیمت', key: 'plp', fmt: (r) => fPct(r.plp, 2), num: (r) => r.plp }
const cClosePct: Col = { label: 'درصد قیمت پایانی', key: 'pcp', fmt: (r) => fPct(r.pcp, 2), num: (r) => r.pcp }
const cMv: Col = { label: 'ارزش مارکت شرکت', key: 'mv', fmt: (r) => fToman(r.mv), num: (r) => r.mv }
const cBuyPower: Col = { label: 'قدرت خریداران', key: 'bp', fmt: (r) => fX(r.bp), num: (r) => r.bp ?? 0 }
const cSellPower: Col = {
  label: 'قدرت فروشندگان', key: 'bp',
  fmt: (r) => fX(r.bp && r.bp > 0 ? 1 / r.bp : null),
  num: (r) => (r.bp && r.bp > 0 ? 1 / r.bp : 0),
}
const cMoneyIn: Col = { label: 'ارزش ورود پول', key: 'moneyInI', fmt: (r) => fToman(r.moneyInI), num: (r) => r.moneyInI }
const cMoneyOut: Col = { label: 'ارزش خروج پول', key: 'moneyInI', fmt: (r) => fToman(-r.moneyInI), num: (r) => -r.moneyInI }

const cBuyQueueVol: Col = { label: 'حجم صف', key: 'qd1', fmt: (r) => faN(r.qd1 ?? 0), num: (r) => r.qd1 ?? 0 }
const cBuyQueueVal: Col = { label: 'ارزش صف', key: 'qd1', fmt: (r) => fBn((r.qd1 ?? 0) * r.pl), num: (r) => (r.qd1 ?? 0) * r.pl }
const cBuyQueueMvPct: Col = {
  label: 'نسبت صف به مارکت', key: 'qd1',
  fmt: (r) => (r.mv > 0 ? fPct(((r.qd1 ?? 0) * r.pl / r.mv) * 100, 3) : '—'),
  num: (r) => (r.mv > 0 ? ((r.qd1 ?? 0) * r.pl / r.mv) * 100 : 0),
}
const cSellQueueVol: Col = { label: 'حجم صف', key: 'qo1', fmt: (r) => faN(r.qo1 ?? 0), num: (r) => r.qo1 ?? 0 }
const cSellQueueVal: Col = { label: 'ارزش صف', key: 'qo1', fmt: (r) => fBn((r.qo1 ?? 0) * r.pl), num: (r) => (r.qo1 ?? 0) * r.pl }
const cSellQueueMvPct: Col = {
  label: 'نسبت صف به مارکت', key: 'qo1',
  fmt: (r) => (r.mv > 0 ? fPct(((r.qo1 ?? 0) * r.pl / r.mv) * 100, 3) : '—'),
  num: (r) => (r.mv > 0 ? ((r.qo1 ?? 0) * r.pl / r.mv) * 100 : 0),
}

type QueueStats = { buyCount: number; buyTotalVal: number; sellCount: number; sellTotalVal: number }

const cNearBuyPct: Col = {
  label: 'فاصله تا سقف', key: 'tmax',
  fmt: (r) => (r.tmax ? fPct(((r.tmax - r.pl) / r.tmax) * 100, 2) : '—'),
  num: (r) => (r.tmax ? ((r.tmax - r.pl) / r.tmax) * 100 : 99),
}
const cNearSellPct: Col = {
  label: 'فاصله تا کف', key: 'tmin',
  fmt: (r) => (r.tmin ? fPct(((r.pl - r.tmin) / r.tmin) * 100, 2) : '—'),
  num: (r) => (r.tmin ? ((r.pl - r.tmin) / r.tmin) * 100 : 99),
}

function buildQueueCards(ms: M[]): { cards: Card[]; stats: QueueStats } {
  const top = (rows: M[], by: (r: M) => number, n = 30) => [...rows].sort((a, b) => by(b) - by(a)).slice(0, n)

  const buyRows = ms.filter((r) => r.buyQueue)
  const sellRows = ms.filter((r) => r.sellQueue)
  const buyVal = (r: M) => (r.qd1 ?? 0) * r.pl
  const sellVal = (r: M) => (r.qo1 ?? 0) * r.pl

  // آستانه صف: نزدیک صف اما هنوز قفل نشده (فیلتر ۷۲/۱۰۷ PDF)
  const nearBuy = ms.filter((r) => !r.buyQueue && r.tmax != null && r.pl >= 0.994 * r.tmax)
  const nearSell = ms.filter((r) => !r.sellQueue && r.tmin != null && r.pl <= 1.006 * r.tmin)

  const stats: QueueStats = {
    buyCount: buyRows.length,
    buyTotalVal: buyRows.reduce((s, r) => s + buyVal(r), 0),
    sellCount: sellRows.length,
    sellTotalVal: sellRows.reduce((s, r) => s + sellVal(r), 0),
  }

  const cards: Card[] = [
    {
      id: 'buy-queue', title: 'بیشترین صف‌های خرید', tone: 'green',
      desc: 'نمادهایی که امروز صف خرید دارند (بهترین سفارش خرید روی سقف قیمت روز قفل شده) — بزرگ‌ترین صف‌ها بر اساس ارزش ریالی',
      cols: [cSym, cLastPct, cClosePct, cBuyQueueVol,
        { label: 'ارزش صف', key: 'qd1', fmt: (r) => fBn(buyVal(r)), num: (r) => buyVal(r) },
        cVol, cBuyPower, cMv, cBuyQueueMvPct, cMoneyIn],
      rows: top(buyRows, buyVal),
    },
    {
      id: 'sell-queue', title: 'بیشترین صف‌های فروش', tone: 'red',
      desc: 'نمادهایی که امروز صف فروش دارند (بهترین سفارش فروش روی کف قیمت روز قفل شده) — بزرگ‌ترین صف‌ها بر اساس ارزش ریالی',
      cols: [cSym, cLastPct, cClosePct, cSellQueueVol,
        { label: 'ارزش صف', key: 'qo1', fmt: (r) => fBn(sellVal(r)), num: (r) => sellVal(r) },
        cVol, cSellPower, cMv, cSellQueueMvPct, cMoneyOut],
      rows: top(sellRows, sellVal),
    },
    {
      id: 'near-buy-queue', title: 'در آستانه صف خرید', tone: 'green',
      desc: 'آخرین قیمت حداقل ۹۹.۴٪ سقف مجاز روز است اما هنوز صف خرید قفل نشده — نامزد صف خرید',
      cols: [cSym, cLastPct, cClosePct, cNearBuyPct, cVol, cBuyPower, cMv, cMoneyIn],
      rows: top(nearBuy, (r) => -(cNearBuyPct.num(r))),
    },
    {
      id: 'near-sell-queue', title: 'در آستانه صف فروش', tone: 'red',
      desc: 'آخرین قیمت حداکثر ۰.۶٪ بالاتر از کف مجاز روز است اما هنوز صف فروش قفل نشده — نامزد صف فروش',
      cols: [cSym, cLastPct, cClosePct, cNearSellPct, cVol, cSellPower, cMv, cMoneyOut],
      rows: top(nearSell, (r) => -(cNearSellPct.num(r))),
    },
  ]

  return { cards, stats }
}

// ── صفحه ─────────────────────────────────────────────────────────────────────
export default function QueueFiltersPage() {
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  const [metrics, setMetrics] = useState<M[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [updated, setUpdated] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [marketClosed] = useState(() => isTehranMarketClosedDay())

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
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const iv = setInterval(() => { if (!isTehranMarketClosedDay()) load() }, 120_000)
    return () => clearInterval(iv)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { cards, stats } = useMemo(
    () => (metrics ? buildQueueCards(metrics) : { cards: [] as Card[], stats: null as QueueStats | null }),
    [metrics],
  )

  const bg = isDark ? '#060B14' : '#F4F7FB'
  const text = isDark ? '#E8F4FF' : '#0F1E2E'
  const cream = isDark ? '#ddd5bd' : '#6B7F90'

  const statBar = (count: number, totalVal: number, tone: 'green' | 'red') => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, fontSize: 12.5,
      color: tone === 'green' ? 'oklch(0.74 0.16 150)' : '#EF4444', fontWeight: 700,
    }}>
      <span>{faN(count)} نماد دارای صف</span>
      <span style={{ color: cream, fontWeight: 500 }}>ارزش کل: {fToman(totalVal)}</span>
    </div>
  )

  return (
    <AuthGate title="فیلترها">
      <main style={{
        minHeight: '100vh', background: bg, color: text,
        fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '24px 14px' : '36px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
          <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, margin: 0 }}>فیلترهای صف خرید و فروش</h1>
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
          نمادهای در صف خرید/فروش لحظه‌ای بازار — بزرگ‌ترین صف‌ها بر اساس ارزش ریالی. صرفاً ابزار رصد است و توصیه خرید یا فروش نیست.
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

        {metrics && stats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {/* هر جدول تمام عرض صفحه — با ۱۰ ستون بدون نیاز به اسکرول افقی جا می‌شود */}
            <div>
              {statBar(stats.buyCount, stats.buyTotalVal, 'green')}
              <FilterTable card={cards[0]} isDark={isDark} compact />
            </div>
            <div>
              {statBar(stats.sellCount, stats.sellTotalVal, 'red')}
              <FilterTable card={cards[1]} isDark={isDark} compact />
            </div>
            <div><FilterTable card={cards[2]} isDark={isDark} compact /></div>
            <div><FilterTable card={cards[3]} isDark={isDark} compact /></div>
          </div>
        )}
        </div>
      </main>
    </AuthGate>
  )
}
