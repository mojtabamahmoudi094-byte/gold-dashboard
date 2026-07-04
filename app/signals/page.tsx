'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { darkTheme, lightTheme } from '../../lib/theme'
import { computeMarketBubbles, fundBubbleZati, fundBubbleAsmi, type MarketBubbles } from '../../lib/goldBubbles'

const safe = (v: any) => Number(v || 0)
const pct = (v: number | null, d = 1) =>
  v == null ? null : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}٪`
const fmt = (v: number) => v.toLocaleString('fa-IR', { maximumFractionDigits: 0 })
const fmtM = (v: number) => {
  const m = Math.round(v / 1e6)
  return `${m >= 0 ? '+' : ''}${m.toLocaleString('fa-IR')}M`
}

// ── Auto-signal engine ─────────────────────────────────────────────────────
function computeAutoSignal(api: any, mb: MarketBubbles | null) {
  if (!api) return null

  const bubble     = api.coins?.full?.bubble
  const bubble24   = api.gram?.bubble24
  const goldChg    = api.inputs?.goldUsdChange
  const dollarChg  = api.inputs?.dollarChange
  const bubbleUsdt = api.derived?.bubbleUsdt
  const bubbleDollar = api.derived?.bubbleDollar

  const b = bubble ?? bubble24
  let score = 0
  const reasons: { text: string; dir: 'pos' | 'neg' | 'neu' }[] = []

  // حباب شمش بورس کالا — مهم‌ترین عامل: صندوق‌های طلا عمدتاً شمش نگه می‌دارند
  const bBar = mb?.bullion ?? null
  if (bBar != null) {
    if (bBar < -4) {
      score += 3.5
      reasons.push({ text: `شمش بورس کالا ${Math.abs(bBar).toFixed(1)}٪ زیر قیمت واقعی — دارایی اصلی صندوق‌ها ارزان است`, dir: 'pos' })
    } else if (bBar < -2) {
      score += 2
      reasons.push({ text: `شمش بورس کالا ${Math.abs(bBar).toFixed(1)}٪ زیر قیمت واقعی`, dir: 'pos' })
    } else if (bBar > 4) {
      score -= 3.5
      reasons.push({ text: `حباب شمش بورس کالا ${bBar.toFixed(1)}٪ — دارایی صندوق‌ها گران معامله می‌شود`, dir: 'neg' })
    } else if (bBar > 2) {
      score -= 2
      reasons.push({ text: `حباب شمش بورس کالا ${bBar.toFixed(1)}٪`, dir: 'neg' })
    } else {
      score += 0.3
      reasons.push({ text: `قیمت شمش بورس کالا نزدیک ارزش واقعی (${bBar >= 0 ? '+' : ''}${bBar.toFixed(1)}٪)`, dir: 'neu' })
    }
  }

  // حباب گواهی سکه بورس کالا — وزن کمتر (سهم سکه در صندوق‌ها کم است)
  const bCoin = mb?.coin ?? null
  if (bCoin != null) {
    if (bCoin < -3) {
      score += 1.2
      reasons.push({ text: `گواهی سکه ${Math.abs(bCoin).toFixed(1)}٪ زیر قیمت واقعی`, dir: 'pos' })
    } else if (bCoin > 3) {
      score -= 1.2
      reasons.push({ text: `حباب گواهی سکه ${bCoin.toFixed(1)}٪`, dir: 'neg' })
    }
  }

  if (b != null) {
    if (b > 0.08) {
      score -= 2.5
      reasons.push({ text: `حباب سکه بازار آزاد ${(b*100).toFixed(1)}٪ بالای ارزش ذاتی`, dir: 'neg' })
    } else if (b > 0.05) {
      score -= 1.5
      reasons.push({ text: `حباب متوسط سکه بازار ${(b*100).toFixed(1)}٪`, dir: 'neg' })
    } else if (b > 0.02) {
      score -= 0.6
      reasons.push({ text: `حباب خفیف سکه بازار ${(b*100).toFixed(1)}٪`, dir: 'neg' })
    } else if (b < -0.04) {
      score += 2
      reasons.push({ text: `سکه بازار ${Math.abs(b*100).toFixed(1)}٪ زیر ارزش ذاتی — فرصت خرید`, dir: 'pos' })
    } else if (b < -0.02) {
      score += 1
      reasons.push({ text: `سکه بازار کمی زیر ارزش ذاتی (${(b*100).toFixed(1)}٪)`, dir: 'pos' })
    } else if (b < 0.01) {
      score += 0.4
      reasons.push({ text: `قیمت سکه بازار منطقی (حباب ${(b*100).toFixed(1)}٪)`, dir: 'neu' })
    }
  }

  if (goldChg != null) {
    if (goldChg > 0.015) {
      score += 1.5
      reasons.push({ text: `انس طلا امروز ${pct(goldChg, 2)} رشد کرد`, dir: 'pos' })
    } else if (goldChg > 0.005) {
      score += 0.7
      reasons.push({ text: `انس طلا امروز ${pct(goldChg, 2)}`, dir: 'pos' })
    } else if (goldChg < -0.015) {
      score -= 1.5
      reasons.push({ text: `انس طلا امروز ${pct(goldChg, 2)} افت کرد`, dir: 'neg' })
    } else if (goldChg < -0.005) {
      score -= 0.7
      reasons.push({ text: `انس طلا امروز ${pct(goldChg, 2)}`, dir: 'neg' })
    }
  }

  if (dollarChg != null) {
    if (dollarChg > 0.01) {
      score += 1
      reasons.push({ text: `دلار ${pct(dollarChg, 2)} رشد — فشار خرید طلا`, dir: 'pos' })
    } else if (dollarChg > 0.004) {
      score += 0.4
      reasons.push({ text: `دلار کمی رو به رشد (${pct(dollarChg, 2)})`, dir: 'pos' })
    } else if (dollarChg < -0.01) {
      score -= 0.8
      reasons.push({ text: `دلار ${pct(dollarChg, 2)} افت — کاهش جذابیت طلا`, dir: 'neg' })
    }
  }

  if (bubbleUsdt != null) {
    if (bubbleUsdt > 0.05) {
      score += 0.8
      reasons.push({ text: `USDT ${(bubbleUsdt*100).toFixed(1)}٪ پرمیوم — فشار ارزی بالا`, dir: 'pos' })
    } else if (bubbleUsdt > 0.02) {
      score += 0.3
      reasons.push({ text: `USDT کمی پرمیوم (${(bubbleUsdt*100).toFixed(1)}٪)`, dir: 'neu' })
    } else if (bubbleUsdt < -0.02) {
      score -= 0.4
      reasons.push({ text: `USDT دیسکانت — کاهش تقاضای ارزی`, dir: 'neg' })
    }
  }

  if (bubbleDollar != null && bubbleDollar > 0.04) {
    score += 0.5
    reasons.push({ text: `دلار صرافی ${(bubbleDollar*100).toFixed(1)}٪ بالاتر از درهم`, dir: 'pos' })
  }

  let type: string
  let color: string
  let confidence: number

  if (score >= 2.5) {
    type = 'خرید'
    color = '#10B981'
    confidence = Math.min(90, Math.round(50 + score * 8))
  } else if (score <= -2.5) {
    type = 'فروش'
    color = '#EF4444'
    confidence = Math.min(90, Math.round(50 + Math.abs(score) * 8))
  } else if (score >= 1) {
    type = 'تمایل خرید'
    color = '#3BB07A'
    confidence = Math.round(40 + score * 6)
  } else if (score <= -1) {
    type = 'احتیاط'
    color = '#F59E0B'
    confidence = Math.round(40 + Math.abs(score) * 6)
  } else {
    type = 'نگه‌داری'
    color = '#00C8FF'
    confidence = Math.round(45 + Math.abs(score) * 4)
  }

  return { type, color, confidence, score, reasons }
}

// ── Fund ranking engine ────────────────────────────────────────────────────
interface FundRow {
  asset_id: number
  name: string
  category: string
  slug: string
  price_close: number
  price_change_pct: number
  buy_i_volume: number
  sell_i_volume: number
  trade_value: number
  net: number
  inflowScore: number
  combinedScore: number
  bubbleVaqei: number | null
}

function getRankedFunds(
  signalType: string,
  funds: FundRow[],
  mb: MarketBubbles | null,
  navMap: Record<string, number>,
): FundRow[] {
  // gold-only for gold signals
  const pool = funds.filter(f => f.category === 'طلا')
  if (pool.length === 0) return []

  const scored = pool.map(f => {
    const net = safe(f.buy_i_volume) - safe(f.sell_i_volume)
    const total = safe(f.buy_i_volume) + safe(f.sell_i_volume)
    const inflowScore = total > 0 ? net / total : 0   // [-1, 1]
    const chg = f.price_change_pct ?? 0

    // حباب واقعی = حباب اسمی (قیمت vs NAV) + حباب ذاتی (ترکیب شمش/سکه × حباب بورس کالا)
    const asmi = fundBubbleAsmi(f.price_close, navMap[f.name])
    const zati = mb ? fundBubbleZati(f.name, mb) : null
    const bubbleVaqei = asmi != null && zati != null ? asmi + zati : null

    // ارزندگی: حباب واقعی منفی‌تر = ارزان‌تر = جذاب‌تر برای خرید
    const valueScore = bubbleVaqei != null ? Math.max(-1, Math.min(1, -bubbleVaqei / 5)) : 0
    const combinedScore = bubbleVaqei != null
      ? 0.5 * valueScore + 0.35 * inflowScore + 0.15 * (chg / 5)
      : 0.65 * inflowScore + 0.35 * (chg / 5)

    return { ...f, net, inflowScore, combinedScore, bubbleVaqei }
  })

  const isBuy = signalType === 'خرید' || signalType === 'تمایل خرید'
  const isSell = signalType === 'فروش' || signalType === 'احتیاط'

  if (isBuy) {
    return scored.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, 3)
  } else if (isSell) {
    return scored.sort((a, b) => a.combinedScore - b.combinedScore).slice(0, 3)
  } else {
    // نگه‌داری: کم‌حباب‌ترین‌ها بین نقدشونده‌ها
    return scored
      .sort((a, b) => (b.trade_value || 0) - (a.trade_value || 0))
      .slice(0, 8)
      .sort((a, b) => (a.bubbleVaqei ?? 99) - (b.bubbleVaqei ?? 99))
      .slice(0, 3)
  }
}

function fundReason(f: FundRow, signalType: string): string {
  const netM = Math.round(f.net / 1e6)
  const isBuy = signalType === 'خرید' || signalType === 'تمایل خرید'
  const isSell = signalType === 'فروش' || signalType === 'احتیاط'

  const parts: string[] = []

  if (f.bubbleVaqei != null) {
    const bv = f.bubbleVaqei
    if (bv < -1) parts.push(`حباب واقعی ${bv.toFixed(1)}٪ — زیر ارزش`)
    else if (bv > 3) parts.push(`حباب واقعی +${bv.toFixed(1)}٪ — گران`)
    else parts.push(`حباب واقعی ${bv >= 0 ? '+' : ''}${bv.toFixed(1)}٪`)
  }

  if (isBuy) {
    if (netM > 0) parts.push(`ورود ${netM.toLocaleString('fa-IR')}M واحد حقیقی`)
    if (f.price_change_pct > 0) parts.push(`رشد ${f.price_change_pct?.toFixed(2)}٪`)
    if (parts.length === 0) parts.push('نسبت ورود/خروج مناسب')
  } else if (isSell) {
    if (netM < 0) parts.push(`خروج ${Math.abs(netM).toLocaleString('fa-IR')}M واحد حقیقی`)
    if (f.price_change_pct < 0) parts.push(`افت ${Math.abs(f.price_change_pct)?.toFixed(2)}٪`)
    if (parts.length === 0) parts.push('فشار فروش حقیقی')
  } else {
    parts.push(`نقدشوندگی بالا`)
    if (Math.abs(f.price_change_pct || 0) < 1) parts.push('نوسان کم')
  }

  return parts.join(' · ')
}

// ── Outcome calculation ────────────────────────────────────────────────────
function getOutcome(
  signalDate: string,
  signalType: string,
  dates: string[],
  priceMap: Record<string, number>,
  N: number
): number | null {
  const idx = dates.findIndex(d => d >= signalDate)
  if (idx < 0 || idx + N >= dates.length) return null
  const entry = priceMap[dates[idx]]
  const exit_ = priceMap[dates[idx + N]]
  if (!entry || !exit_) return null
  const ret = (exit_ - entry) / entry * 100
  return signalType === 'فروش' ? -ret : ret
}

export default function SignalsPage() {
  const [signals, setSignals]     = useState<any[]>([])
  const [dates, setDates]         = useState<string[]>([])
  const [priceMap, setPriceMap]   = useState<Record<string, number>>({})
  const [flowMap, setFlowMap]     = useState<Record<string, number>>({})
  const [fundData, setFundData]   = useState<FundRow[]>([])
  const [navMap, setNavMap]       = useState<Record<string, number>>({})
  const [apiData, setApiData]     = useState<any>(null)
  const [isDark, setIsDark]       = useState(true)
  const [isAdmin, setIsAdmin]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const [isMobile, setIsMobile]   = useState(false)
  const [showDays, setShowDays]   = useState<5 | 10 | 20>(10)

  const t: any = isDark ? darkTheme : lightTheme

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => {
      window.removeEventListener('themechange', handler)
      window.removeEventListener('resize', checkMobile)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      // ۰. وضعیت ادمین (برای ثبت خودکار سیگنال و پاکسازی)
      const { data: sess } = await supabase.auth.getSession()
      const admin = !!sess?.session
      setIsAdmin(admin)

      // ۱. سیگنال‌های معتبر موتور جدید ([v2]) — حذف تکراری‌های همون روز
      const { data: sigs } = await supabase
        .from('signals')
        .select('*')
        .not('confidence', 'is', null)
        .order('id', { ascending: false })
      if (sigs) {
        // سیگنال‌های موتور قدیمی (MA) با آپدیت جدید سازگار نیستند — فقط [v2] نمایش داده می‌شود
        const v2 = sigs.filter((s: any) => typeof s.note === 'string' && s.note.startsWith('[v2]'))
        const seen = new Set<string>()
        const deduped = v2.filter((s: any) => {
          const key = `${s.signal_date_shamsi}|${s.signal_type}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setSignals(deduped)

        // پاکسازی رکوردهای موتور قدیمی (فقط ادمین — RLS برای مهمان اجازه نمی‌دهد)
        if (admin) {
          const oldIds = sigs.filter((s: any) => !(typeof s.note === 'string' && s.note.startsWith('[v2]'))).map((s: any) => s.id)
          if (oldIds.length) await supabase.from('signals').delete().in('id', oldIds)
        }
      }

      // ۲. تاریخچه قیمت عیار (asset_id=2) برای محاسبه نتیجه
      const { data: prices } = await supabase
        .from('gold_funds')
        .select('trade_date_shamsi, price_close, buy_i_volume, sell_i_volume')
        .eq('asset_id', 2)
        .not('price_close', 'is', null)
        .order('trade_date_shamsi', { ascending: true })
      if (prices?.length) {
        const ds = prices.map((p: any) => p.trade_date_shamsi as string)
        const pm: Record<string, number> = {}
        const fm: Record<string, number> = {}
        prices.forEach((p: any) => {
          pm[p.trade_date_shamsi] = safe(p.price_close)
          fm[p.trade_date_shamsi] = safe(p.buy_i_volume) - safe(p.sell_i_volume)
        })
        setDates(ds)
        setPriceMap(pm)
        setFlowMap(fm)
      }

      // ۳. آخرین داده صندوق‌ها برای رنک‌بندی
      try {
        const { data: latest } = await supabase
          .from('gold_funds')
          .select('trade_date_shamsi')
          .not('price_close', 'is', null)
          .order('trade_date_shamsi', { ascending: false })
          .limit(1)
        const lastDate = latest?.[0]?.trade_date_shamsi
        if (lastDate) {
          const [{ data: funds }, { data: assets }] = await Promise.all([
            supabase.from('gold_funds')
              .select('asset_id, price_close, price_change_pct, buy_i_volume, sell_i_volume, trade_value')
              .eq('trade_date_shamsi', lastDate)
              .not('price_close', 'is', null),
            supabase.from('assets').select('id, name, category, slug'),
          ])
          if (funds && assets) {
            const assetMap: Record<number, any> = {}
            assets.forEach((a: any) => { assetMap[a.id] = a })
            const merged = funds
              .map((f: any) => ({ ...f, ...(assetMap[f.asset_id] || {}) }))
              .filter((f: any) => f.name && f.category)
            setFundData(merged as FundRow[])
          }
        }
      } catch { /* ignore */ }

      // ۴. API طلا برای سیگنال لحظه‌ای + NAV برای حباب اسمی صندوق‌ها
      try {
        const [res, navRes] = await Promise.all([
          fetch('/api/gold-analysis'),
          fetch('/api/gold-nav'),
        ])
        if (res.ok) setApiData(await res.json())
        if (navRes.ok) {
          const nd = await navRes.json()
          setNavMap(nd?.navs ?? {})
        }
      } catch { /* ignore */ }

      setLoading(false)
    }
    load()
  }, [])

  const marketBubbles = apiData?.ime ? computeMarketBubbles(apiData.ime) : null
  const autoSignal = computeAutoSignal(apiData, marketBubbles)
  const rankedFunds = autoSignal ? getRankedFunds(autoSignal.type, fundData, marketBubbles, navMap) : []

  // ثبت خودکار سیگنال موتور جدید در تاریخچه (فقط ادمین، یک بار برای هر روز+نوع)
  useEffect(() => {
    if (!isAdmin || loading || !autoSignal || !apiData?.lastMarketDate) return
    const date = apiData.lastMarketDate as string
    if (signals.some(s => s.signal_date_shamsi === date && s.signal_type === autoSignal.type)) return

    let cancelled = false
    const save = async () => {
      const reason = autoSignal.reasons.map((r: any) => r.text).join(' · ')
      const { data, error } = await supabase.from('signals').insert([{
        signal_date_shamsi: date,
        signal_type: autoSignal.type,
        confidence: autoSignal.confidence,
        note: '[v2] موتور حباب واقعی بورس کالا',
        reason,
      }]).select()
      if (error || cancelled || !data?.[0]) return
      setSignals(prev => [data[0], ...prev])
      fetch('/api/telegram-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: autoSignal.type,
          date,
          confidence: autoSignal.confidence,
          note: reason,
        }),
      }).catch(() => {/* fire-and-forget */})
    }
    save()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, loading, autoSignal?.type, apiData?.lastMarketDate])

  const isBuySignal = autoSignal?.type === 'خرید' || autoSignal?.type === 'تمایل خرید'
  const isSellSignal = autoSignal?.type === 'فروش' || autoSignal?.type === 'احتیاط'

  // stats — only valid signals
  const buys   = signals.filter(s => s.signal_type === 'خرید')
  const sells  = signals.filter(s => s.signal_type === 'فروش')
  const holds  = signals.filter(s => s.signal_type === 'نگه‌داری')
  const trading = signals.filter(s => s.signal_type !== 'نگه‌داری')

  const outcomes10 = trading.map(s => getOutcome(s.signal_date_shamsi, s.signal_type, dates, priceMap, 10))
  const evOuts     = outcomes10.filter(o => o !== null) as number[]
  const won        = evOuts.filter(o => o > 0)
  const winRate    = evOuts.length > 0 ? Math.round(won.length / evOuts.length * 100) : null
  const avgReturn  = evOuts.length > 0 ? evOuts.reduce((a, b) => a + b, 0) / evOuts.length : null

  const BG     = t.bg
  const PANEL  = t.panel
  const BORDER = t.border
  const TEXT   = t.text
  const MUTED  = t.muted
  const FAINT  = t.faint
  const GOLD   = t.gold
  const GOLD_BG = isDark ? 'rgba(212,168,71,0.08)' : 'rgba(212,168,71,0.1)'
  const GREEN  = t.green
  const RED    = t.red

  return (
    <main style={{
      minHeight: '100vh', background: BG, color: TEXT,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      transition: 'background 0.3s, color 0.3s',
    }}>
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: isDark ? '#FFFFFF' : t.textBright }}>
              سیگنال‌های بازار
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>
              بر پایه حباب شمش و گواهی سکه بورس کالا، حباب واقعی صندوق‌ها، انس جهانی و جریان پول حقیقی
            </p>
          </div>
          {apiData?.updatedAt && (
            <span style={{ fontSize: 10.5, color: FAINT }}>
              آخرین بروزرسانی: {new Date(apiData.updatedAt).toLocaleTimeString('fa-IR')}
            </span>
          )}
        </div>

        {/* ── Live auto signal ── */}
        {loading ? (
          <div className="skeleton" style={{ height: 200, borderRadius: 14 }} />
        ) : autoSignal ? (
          <div style={{
            background: isDark ? `rgba(7,20,40,0.92)` : `rgba(255,252,244,0.95)`,
            border: `1px solid ${autoSignal.color}28`,
            borderRadius: 14,
            padding: isMobile ? '20px 18px' : '22px 28px',
            boxShadow: `0 4px 32px rgba(0,0,0,0.35), 0 0 0 1px ${autoSignal.color}14`,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: `linear-gradient(90deg, ${autoSignal.color}, transparent)`,
            }} />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 16 : 28, alignItems: 'flex-start' }}>
              {/* badge + confidence */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140 }}>
                <span style={{ fontSize: 10, color: MUTED, letterSpacing: '0.06em' }}>سیگنال لحظه‌ای</span>
                <span style={{
                  fontSize: isMobile ? 26 : 30, fontWeight: 700,
                  color: autoSignal.color,
                  textShadow: `0 0 20px ${autoSignal.color}40`,
                }}>
                  {autoSignal.type}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 3, background: BORDER, overflow: 'hidden', maxWidth: 100 }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${autoSignal.confidence}%`,
                      background: `linear-gradient(90deg, ${autoSignal.color}99, ${autoSignal.color})`,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: autoSignal.color }}>
                    {autoSignal.confidence}٪
                  </span>
                </div>
              </div>

              {/* reasons */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
                <span style={{ fontSize: 10, color: MUTED, letterSpacing: '0.06em', marginBottom: 2 }}>دلایل</span>
                {autoSignal.reasons.map((r: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 9, color: r.dir === 'pos' ? GREEN : r.dir === 'neg' ? RED : MUTED }}>
                      {r.dir === 'pos' ? '▲' : r.dir === 'neg' ? '▼' : '●'}
                    </span>
                    <span style={{ fontSize: 12, color: r.dir === 'pos' ? GREEN : r.dir === 'neg' ? RED : MUTED }}>
                      {r.text}
                    </span>
                  </div>
                ))}
              </div>

              {/* live snapshot */}
              {apiData && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  padding: '12px 16px',
                  background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10, minWidth: 160,
                }}>
                  <span style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>بازار فعلی</span>
                  {[
                    { label: 'انس طلا', val: `$${fmt(apiData.inputs?.goldUsd)}`, chg: apiData.inputs?.goldUsdChange },
                    { label: 'دلار', val: `${fmt(apiData.inputs?.dollarT)} ت`, chg: apiData.inputs?.dollarChange },
                    { label: 'حباب شمش بورس کالا', val: marketBubbles?.bullion != null ? `${marketBubbles.bullion >= 0 ? '+' : ''}${marketBubbles.bullion.toFixed(1)}٪` : '—', chg: null },
                    { label: 'حباب گواهی سکه', val: marketBubbles?.coin != null ? `${marketBubbles.coin >= 0 ? '+' : ''}${marketBubbles.coin.toFixed(1)}٪` : '—', chg: null },
                    { label: 'حباب سکه بازار', val: apiData.coins?.full?.bubble != null ? `${(apiData.coins.full.bubble*100).toFixed(1)}٪` : '—', chg: null },
                    { label: 'USDT', val: `${fmt(apiData.inputs?.usdtT)} ت`, chg: null },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: MUTED }}>{row.label}</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {row.chg != null && (
                          <span style={{ fontSize: 9, color: row.chg >= 0 ? GREEN : RED }}>
                            {pct(row.chg, 2)}
                          </span>
                        )}
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: TEXT, fontFamily: 'system-ui, sans-serif' }}>
                          {row.val}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* ── Fund recommendations ── */}
        {autoSignal && rankedFunds.length > 0 && (
          <div style={{
            background: PANEL,
            border: `1px solid ${isBuySignal ? '#10B98122' : isSellSignal ? '#EF444422' : BORDER}`,
            borderRadius: 14,
            padding: isMobile ? '18px 16px' : '20px 24px',
            backdropFilter: 'blur(12px)',
          }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 3, height: 20, borderRadius: 2,
                background: isBuySignal ? GREEN : isSellSignal ? RED : t.accent,
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
                {isBuySignal ? 'این صندوق‌ها رو بخر' : isSellSignal ? 'این صندوق‌ها رو بفروش' : 'با این صندوق‌ها بمان'}
              </span>
              <span style={{
                fontSize: 10, color: MUTED,
                marginRight: 'auto',
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                padding: '2px 8px', borderRadius: 5,
              }}>
                {isBuySignal ? 'بر اساس حباب واقعی + ورود پول حقیقی + مومنتوم' : isSellSignal ? 'بر اساس حباب واقعی + خروج پول حقیقی' : 'بر اساس کمترین حباب بین نقدشونده‌ها'}
              </span>
            </div>

            {/* fund cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: 12,
            }}>
              {rankedFunds.map((f, idx) => {
                const netM = Math.round(f.net / 1e6)
                const isPositiveFlow = f.net > 0
                const chg = f.price_change_pct ?? 0
                const rankColor = idx === 0
                  ? (isBuySignal ? GREEN : isSellSignal ? RED : GOLD)
                  : MUTED

                return (
                  <Link
                    key={f.asset_id}
                    href={`/fund/${f.slug}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{
                      background: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)',
                      border: `1px solid ${idx === 0 ? (isBuySignal ? '#10B98130' : isSellSignal ? '#EF444430' : 'rgba(212,168,71,0.3)') : BORDER}`,
                      borderRadius: 12,
                      padding: '14px 16px',
                      cursor: 'pointer',
                      transition: 'border-color 0.18s, background 0.18s',
                      position: 'relative',
                    }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)'
                      }}
                    >
                      {idx === 0 && (
                        <div style={{
                          position: 'absolute', top: 8, left: 8,
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                          color: isBuySignal ? GREEN : isSellSignal ? RED : GOLD,
                          background: isBuySignal ? 'rgba(16,185,129,0.12)' : isSellSignal ? 'rgba(239,68,68,0.12)' : 'rgba(212,168,71,0.12)',
                          border: `1px solid ${isBuySignal ? 'rgba(16,185,129,0.25)' : isSellSignal ? 'rgba(239,68,68,0.25)' : 'rgba(212,168,71,0.25)'}`,
                          borderRadius: 4, padding: '1px 6px',
                        }}>
                          {isBuySignal ? '★ اول' : isSellSignal ? '★ اول' : '★ اول'}
                        </div>
                      )}

                      {/* fund name + rank */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: idx === 0 ? 4 : 0 }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: 6,
                          background: `${rankColor}18`,
                          border: `1px solid ${rankColor}30`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: rankColor,
                          fontFamily: 'system-ui',
                          flexShrink: 0,
                        }}>
                          {idx + 1}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{f.name}</span>
                        <span style={{
                          fontSize: 10.5, fontWeight: 600, marginRight: 'auto',
                          color: chg >= 0 ? GREEN : RED,
                          fontFamily: 'system-ui',
                        }}>
                          {chg >= 0 ? '+' : ''}{chg?.toFixed(2)}٪
                        </span>
                      </div>

                      {/* حباب واقعی chip */}
                      {f.bubbleVaqei != null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 10, color: MUTED }}>حباب واقعی</span>
                          <span style={{
                            fontSize: 10.5, fontWeight: 700, fontFamily: 'system-ui',
                            color: f.bubbleVaqei > 0 ? RED : GREEN,
                            background: f.bubbleVaqei > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                            border: `1px solid ${f.bubbleVaqei > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`,
                            borderRadius: 5, padding: '1px 8px',
                          }}>
                            {f.bubbleVaqei >= 0 ? '+' : ''}{f.bubbleVaqei.toFixed(1)}٪
                          </span>
                        </div>
                      )}

                      {/* net flow bar */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: MUTED }}>جریان پول حقیقی</span>
                          <span style={{
                            fontSize: 10.5, fontWeight: 700,
                            color: isPositiveFlow ? GREEN : RED,
                            fontFamily: 'system-ui',
                          }}>
                            {netM >= 0 ? '+' : ''}{netM.toLocaleString('fa-IR')}M
                          </span>
                        </div>
                        {/* visual bar */}
                        <div style={{ height: 4, borderRadius: 2, background: BORDER, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 2,
                            width: `${Math.min(100, Math.abs(f.inflowScore) * 100)}%`,
                            background: isPositiveFlow ? GREEN : RED,
                            marginRight: isPositiveFlow ? 'auto' : 0,
                            float: isPositiveFlow ? 'right' : 'left',
                          }} />
                        </div>
                      </div>

                      {/* reason */}
                      <p style={{ margin: 0, fontSize: 10.5, color: MUTED, lineHeight: 1.6 }}>
                        {fundReason(f, autoSignal.type)}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>

            <p style={{ margin: '14px 0 0', fontSize: 10, color: FAINT, lineHeight: 1.7 }}>
              ⓘ  رنک‌بندی بر اساس داده‌های همان روز محاسبه می‌شود و جنبه اطلاع‌رسانی دارد — توصیه سرمایه‌گذاری نیست.
            </p>
          </div>
        )}

        {/* ── Summary stats ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          {[
            { label: 'سیگنال خرید',  count: buys.length,  color: GREEN,    suffix: '' },
            { label: 'سیگنال فروش',  count: sells.length, color: RED,      suffix: '' },
            { label: 'نگه‌داری',     count: holds.length, color: t.accent,  suffix: '' },
            ...(winRate !== null ? [{ label: 'نرخ موفقیت ۱۰ روزه', count: winRate, suffix: '٪',
              color: winRate >= 60 ? GREEN : winRate >= 40 ? '#F59E0B' : RED }] : []),
            ...(avgReturn !== null ? [{ label: 'میانگین بازده', count: Math.abs(avgReturn), suffix: `٪ ${avgReturn >= 0 ? '↑' : '↓'}`,
              color: avgReturn >= 0 ? GREEN : RED }] : []),
          ].map((card: any) => (
            <div key={card.label} style={{
              background: PANEL, border: `0.5px solid ${BORDER}`,
              borderRadius: 12, padding: '14px 16px',
              backdropFilter: 'blur(12px)',
            }}>
              <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 8 }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: card.color, fontFamily: 'system-ui, sans-serif' }}>
                {card.count.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}
                {card.suffix && <span style={{ fontSize: 13, marginRight: 2 }}>{card.suffix}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* ── Signals history table ── */}
        <div style={{
          background: PANEL, border: `0.5px solid ${BORDER}`,
          borderRadius: 14, padding: '16px 20px',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>تاریخچه سیگنال‌ها</span>
              <span style={{ fontSize: 11, color: MUTED, marginRight: 8 }}>نتیجه بر اساس قیمت پایانی عیار</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {([5, 10, 20] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setShowDays(d)}
                  style={{
                    fontSize: 11, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: showDays === d ? GOLD_BG : 'transparent',
                    border: `1px solid ${showDays === d ? (isDark ? 'rgba(212,168,71,0.35)' : 'rgba(180,140,40,0.3)') : BORDER}`,
                    color: showDays === d ? GOLD : MUTED,
                    transition: 'all 0.18s',
                  }}
                >
                  {d} روزه
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, padding: '13px 10px', borderBottom: `0.5px solid ${BORDER}`, alignItems: 'center', opacity: 1 - i * 0.12 }}>
                  <div className="skeleton" style={{ width: 80, height: 14 }} />
                  <div className="skeleton" style={{ width: 52, height: 22, borderRadius: 6 }} />
                  <div className="skeleton" style={{ width: 60, height: 14 }} />
                  <div className="skeleton" style={{ width: 44, height: 14 }} />
                  <div className="skeleton" style={{ width: 36, height: 14 }} />
                  <div className="skeleton" style={{ width: 120 + (i % 3) * 30, height: 14 }} />
                </div>
              ))}
            </div>
          ) : signals.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>📊</div>
              <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>
                سیگنال‌های تأییدشده هنوز ثبت نشده‌اند
              </p>
              <p style={{ color: FAINT, fontSize: 11, margin: '6px 0 0' }}>
                سیگنال لحظه‌ای بالا را دنبال کنید
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['تاریخ', 'نوع', 'اعتماد', `نتیجه ${showDays} روزه`, 'جریان پول', 'دلیل'].map(h => (
                      <th key={h} style={{
                        color: MUTED, fontWeight: 500, textAlign: 'right',
                        padding: '8px 10px',
                        borderBottom: `1px solid ${BORDER}`,
                        whiteSpace: 'nowrap', fontSize: 11,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s) => {
                    const sigColor = s.signal_type === 'خرید' ? GREEN : s.signal_type === 'فروش' ? RED : t.accent
                    const conf = typeof s.confidence === 'number' ? s.confidence : null
                    const confColor = conf === null ? FAINT : conf >= 70 ? GREEN : conf >= 40 ? '#F59E0B' : RED
                    const outcome = s.signal_type !== 'نگه‌داری'
                      ? getOutcome(s.signal_date_shamsi, s.signal_type, dates, priceMap, showDays)
                      : null
                    const ocColor = outcome === null ? FAINT : outcome > 2 ? GREEN : outcome < -2 ? RED : '#F59E0B'
                    const netFlow = flowMap[s.signal_date_shamsi]
                    const flowM = netFlow != null ? Math.round(netFlow / 1e6) : null

                    return (
                      <tr key={s.id} style={{ borderBottom: `0.5px solid ${BORDER}`, transition: 'background 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <td style={{ padding: '11px 10px', color: TEXT, whiteSpace: 'nowrap', fontSize: 12 }}>
                          {s.signal_date_shamsi}
                        </td>
                        <td style={{ padding: '11px 10px' }}>
                          <span style={{
                            display: 'inline-block',
                            background: `${sigColor}18`,
                            color: sigColor,
                            border: `1px solid ${sigColor}30`,
                            borderRadius: 6, padding: '3px 12px',
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {s.signal_type}
                          </span>
                        </td>
                        <td style={{ padding: '11px 10px', minWidth: 90 }}>
                          {conf !== null ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: confColor, fontFamily: 'system-ui' }}>{conf}٪</span>
                              <div style={{ height: 3, borderRadius: 2, background: BORDER, overflow: 'hidden', width: 60 }}>
                                <div style={{ height: '100%', width: `${conf}%`, background: confColor, borderRadius: 2 }} />
                              </div>
                            </div>
                          ) : <span style={{ color: FAINT, fontSize: 10 }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 10px', whiteSpace: 'nowrap' }}>
                          {outcome !== null ? (
                            <span style={{
                              display: 'inline-block',
                              fontFamily: 'system-ui', fontSize: 11.5, fontWeight: 800,
                              color: ocColor,
                              background: `${ocColor}18`,
                              border: `1px solid ${ocColor}30`,
                              borderRadius: 6, padding: '3px 10px',
                            }}>
                              {outcome > 0 ? '+' : ''}{outcome.toFixed(1)}٪
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: FAINT, fontStyle: 'italic' }}>در انتظار</span>
                          )}
                        </td>
                        <td style={{ padding: '11px 10px', whiteSpace: 'nowrap' }}>
                          {flowM != null ? (
                            <span style={{
                              fontSize: 11, fontWeight: 600,
                              color: flowM >= 0 ? GREEN : RED,
                              fontFamily: 'system-ui',
                            }}>
                              {flowM >= 0 ? '+' : ''}{flowM.toLocaleString('fa-IR')}M
                            </span>
                          ) : <span style={{ color: FAINT, fontSize: 10 }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 10px', color: MUTED, fontSize: 11, maxWidth: 240, lineHeight: 1.5 }}>
                          {s.reason || s.note || <span style={{ color: FAINT, fontSize: 10 }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{
            display: 'flex', gap: 20, marginTop: 14, paddingTop: 12,
            borderTop: `0.5px solid ${BORDER}`,
            flexWrap: 'wrap',
          }}>
            {[
              { color: GREEN, label: 'نتیجه مثبت (>+2٪)' },
              { color: '#F59E0B', label: 'نتیجه خنثی (±2٪)' },
              { color: RED, label: 'نتیجه منفی (<−2٪)' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
                <span style={{ fontSize: 10, color: FAINT }}>{l.label}</span>
              </div>
            ))}
            <span style={{ fontSize: 10, color: FAINT, marginRight: 'auto' }}>
              قیمت مبنا: صندوق عیار (بزرگ‌ترین ETF طلا)
            </span>
          </div>
        </div>

        {/* ── Disclaimer ── */}
        <div style={{ fontSize: 10.5, color: FAINT, textAlign: 'center', padding: '8px 0 4px' }}>
          سیگنال‌های این صفحه صرفاً جنبه اطلاع‌رسانی دارند و توصیه سرمایه‌گذاری نیستند
        </div>

      </div>
    </main>
  )
}
