'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { darkTheme, lightTheme, shouldUseDark } from '../../lib/theme'
import { useIsMobile } from '../../lib/useIsMobile'
import { safe, todayShamsi } from '../../lib/format'
import { computeMarketBubbles, fundBubbleZati, fundBubbleAsmi, computeSilverBubble, silverFundBubbleZati, SILVER_FUND_WEIGHTS, type MarketBubbles } from '../../lib/goldBubbles'
import { computeStockSignal, type Reports } from '../../lib/stockInsights'
import AuthGate from '../../components/AuthGate'

type PriceSeries = { dates: string[]; priceMap: Record<string, number> }
const EMPTY_SERIES: PriceSeries = { dates: [], priceMap: {} }

const pct = (v: number | null, d = 1) =>
  v == null ? null : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}٪`
const fmt = (v: number) => v.toLocaleString('fa-IR', { maximumFractionDigits: 0 })
const fmtM = (v: number) => {
  const m = Math.round(v / 1e6)
  return `${m >= 0 ? '+' : ''}${m.toLocaleString('fa-IR')}M`
}

// روزهای بعد از سیگنال — برای چارت مستطیلی نتیجه ۱۰ روزه
function getDailyOutcomes(signalDate: string, signalType: string, dts: string[], pm: Record<string, number>, maxN: number): (number | null)[] {
  const idx = dts.findIndex(d => d >= signalDate)
  const out: (number | null)[] = []
  for (let n = 1; n <= maxN; n++) {
    if (idx < 0 || idx + n >= dts.length) { out.push(null); continue }
    const entry = pm[dts[idx]], exit_ = pm[dts[idx + n]]
    if (!entry || !exit_) { out.push(null); continue }
    const ret = (exit_ - entry) / entry * 100
    out.push(signalType === 'فروش' ? -ret : ret)
  }
  return out
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
  navChg?: number | null   // تغییر NAV برآوردی امروز از پرتفوی (صندوق‌های بورسی)
  navLag?: number | null   // قیمت − NAV برآوردی؛ منفی = قیمت جا مانده
}

function getRankedFunds(
  signalType: string,
  funds: FundRow[],
  navMap: Record<string, number>,
  category: string,
  zatiFor: (name: string) => number | null,
  portMap?: Record<string, FundPort>,
): FundRow[] {
  const pool = funds.filter(f => f.category === category)
  if (pool.length === 0) return []

  const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))

  const scored = pool.map(f => {
    const net = safe(f.buy_i_volume) - safe(f.sell_i_volume)
    const total = safe(f.buy_i_volume) + safe(f.sell_i_volume)
    const inflowScore = total > 0 ? net / total : 0   // [-1, 1]
    const chg = f.price_change_pct ?? 0

    // حباب واقعی = حباب اسمی (قیمت vs NAV) + حباب ذاتی (ترکیب دارایی × حباب بورس کالا)
    const asmi = fundBubbleAsmi(f.price_close, navMap[f.name])
    const zati = zatiFor(f.name)
    const bubbleVaqei = asmi != null && zati != null ? asmi + zati : null

    // صندوق بورسی: NAV برآوردی از پرتفوی کدال × قیمت روز سهام
    const p = portMap?.[f.slug]
    const navChg = p?.navChg ?? null
    const navLag = navChg != null ? chg - navChg : null

    // ارزندگی: حباب واقعی منفی‌تر = ارزان‌تر = جذاب‌تر برای خرید
    const valueScore = bubbleVaqei != null ? clamp1(-bubbleVaqei / 5) : 0
    const combinedScore = bubbleVaqei != null
      ? 0.5 * valueScore + 0.35 * inflowScore + 0.15 * (chg / 5)
      : navChg != null && navLag != null
        // بورسی: رشد NAV + جاماندگی قیمت از NAV + ورود پول + مومنتوم
        ? 0.3 * clamp1(navChg / 3) + 0.2 * clamp1(-navLag / 2) + 0.35 * inflowScore + 0.15 * (chg / 5)
        : 0.65 * inflowScore + 0.35 * (chg / 5)

    return { ...f, net, inflowScore, combinedScore, bubbleVaqei, navChg, navLag }
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
  } else if (f.navChg != null) {
    parts.push(`NAV برآوردی ${f.navChg >= 0 ? '+' : ''}${f.navChg.toFixed(1)}٪ امروز`)
    if (f.navLag != null && f.navLag < -0.7) parts.push('قیمت از NAV جا مانده')
    else if (f.navLag != null && f.navLag > 0.7) parts.push('قیمت جلوتر از NAV')
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

// ── Bourse funds signal engine (اهرمی / بخشی / سهامی) ─────────────────────
// سیگنال بر پایه NAV برآوردی از پرتفوی کدال + قیمت سهام اثرگذار،
// جریان پول حقیقی، عرض بازار و مومنتوم
interface CatTrendDay { ratio: number; avgChg: number }
interface FundPort {
  navChg: number
  coverage: number
  reportDate: string
  top: { name: string; l18: string; w: number; chg: number }[]
}

function computeBourseSignal(
  todayFunds: FundRow[],
  trend: CatTrendDay[],
  portMap: Record<string, FundPort>,
) {
  if (todayFunds.length === 0) return null
  let score = 0
  const reasons: { text: string; dir: 'pos' | 'neg' | 'neu' }[] = []

  // جریان پول حقیقی امروز (نسبت خالص به کل)
  const buy = todayFunds.reduce((s, f) => s + safe(f.buy_i_volume), 0)
  const sell = todayFunds.reduce((s, f) => s + safe(f.sell_i_volume), 0)
  const total = buy + sell
  const ratio = total > 0 ? (buy - sell) / total : 0
  const netM = Math.round((buy - sell) / 1e6)
  const netStr = `${netM >= 0 ? '+' : ''}${netM.toLocaleString('fa-IR')}M`
  if (ratio > 0.15) {
    score += 2
    reasons.push({ text: `ورود قوی پول حقیقی امروز (${netStr} واحد)`, dir: 'pos' })
  } else if (ratio > 0.05) {
    score += 1
    reasons.push({ text: `ورود پول حقیقی امروز (${netStr} واحد)`, dir: 'pos' })
  } else if (ratio < -0.15) {
    score -= 2
    reasons.push({ text: `خروج شدید پول حقیقی امروز (${netStr} واحد)`, dir: 'neg' })
  } else if (ratio < -0.05) {
    score -= 1
    reasons.push({ text: `خروج پول حقیقی امروز (${netStr} واحد)`, dir: 'neg' })
  } else {
    reasons.push({ text: 'جریان پول حقیقی امروز متعادل', dir: 'neu' })
  }

  // NAV برآوردی از پرتفوی کدال × قیمت روز سهام اثرگذار
  const withPort = todayFunds
    .map(f => ({ f, p: portMap[f.slug] }))
    .filter(x => x.p != null)
  if (withPort.length > 0) {
    const avgNav = withPort.reduce((s, x) => s + x.p.navChg, 0) / withPort.length
    // فاصله قیمت صندوق از حرکت NAV — مثبت یعنی قیمت جلوتر از دارایی‌ها رفته
    const avgLag = withPort.reduce((s, x) => s + ((x.f.price_change_pct ?? 0) - x.p.navChg), 0) / withPort.length

    if (avgNav > 1) {
      score += 1.5
      reasons.push({ text: `NAV برآوردی صندوق‌ها امروز +${avgNav.toFixed(1)}٪ (رشد سهام پرتفوی)`, dir: 'pos' })
    } else if (avgNav > 0.3) {
      score += 0.7
      reasons.push({ text: `NAV برآوردی صندوق‌ها امروز +${avgNav.toFixed(1)}٪`, dir: 'pos' })
    } else if (avgNav < -1) {
      score -= 1.5
      reasons.push({ text: `NAV برآوردی صندوق‌ها امروز ${avgNav.toFixed(1)}٪ (افت سهام پرتفوی)`, dir: 'neg' })
    } else if (avgNav < -0.3) {
      score -= 0.7
      reasons.push({ text: `NAV برآوردی صندوق‌ها امروز ${avgNav.toFixed(1)}٪`, dir: 'neg' })
    }

    if (avgLag < -0.7) {
      score += 1
      reasons.push({ text: `قیمت صندوق‌ها ${Math.abs(avgLag).toFixed(1)}٪ از رشد NAV جا مانده — پتانسیل جبران`, dir: 'pos' })
    } else if (avgLag > 0.7) {
      score -= 1
      reasons.push({ text: `قیمت صندوق‌ها ${avgLag.toFixed(1)}٪ جلوتر از NAV — حباب کوتاه‌مدت`, dir: 'neg' })
    }

    // سهام اثرگذار پرتفوی‌ها — پروزن‌ترین‌ها در کل دسته
    const stockAgg: Record<string, { w: number; chg: number }> = {}
    withPort.forEach(x => x.p.top.forEach(t => {
      stockAgg[t.l18] ??= { w: 0, chg: t.chg }
      stockAgg[t.l18].w += t.w
    }))
    const topStocks = Object.entries(stockAgg).sort((a, b) => b[1].w - a[1].w).slice(0, 3)
    if (topStocks.length > 0) {
      const txt = topStocks
        .map(([l18, v]) => `${l18} ${v.chg >= 0 ? '+' : ''}${v.chg.toFixed(1)}٪`)
        .join(' · ')
      reasons.push({ text: `سهام اثرگذار: ${txt}`, dir: avgNav > 0.2 ? 'pos' : avgNav < -0.2 ? 'neg' : 'neu' })
    }
  }

  // عرض بازار — چند درصد صندوق‌ها مثبت بودند
  const up = todayFunds.filter(f => (f.price_change_pct ?? 0) > 0).length
  const pctUp = up / todayFunds.length
  if (pctUp >= 0.75) {
    score += 1
    reasons.push({ text: `${Math.round(pctUp * 100)}٪ صندوق‌ها مثبت — تقاضای فراگیر`, dir: 'pos' })
  } else if (pctUp <= 0.25) {
    score -= 1
    reasons.push({ text: `فقط ${Math.round(pctUp * 100)}٪ صندوق‌ها مثبت — فشار فروش گسترده`, dir: 'neg' })
  }

  // میانگین تغییر قیمت امروز
  const avgChg = todayFunds.reduce((s, f) => s + (f.price_change_pct ?? 0), 0) / todayFunds.length
  if (avgChg > 1.5) {
    score += 1
    reasons.push({ text: `میانگین رشد امروز ${avgChg.toFixed(1)}٪`, dir: 'pos' })
  } else if (avgChg > 0.5) {
    score += 0.5
    reasons.push({ text: `میانگین رشد امروز ${avgChg.toFixed(1)}٪`, dir: 'pos' })
  } else if (avgChg < -1.5) {
    score -= 1
    reasons.push({ text: `میانگین افت امروز ${Math.abs(avgChg).toFixed(1)}٪`, dir: 'neg' })
  } else if (avgChg < -0.5) {
    score -= 0.5
    reasons.push({ text: `میانگین افت امروز ${Math.abs(avgChg).toFixed(1)}٪`, dir: 'neg' })
  }

  // روند چند روز اخیر — جریان پول و مومنتوم
  if (trend.length >= 3) {
    const avgRatio = trend.reduce((s, t) => s + t.ratio, 0) / trend.length
    const posDays = trend.filter(t => t.ratio > 0).length
    if (avgRatio > 0.08) {
      score += 1.5
      reasons.push({ text: `ورود پول در ${posDays.toLocaleString('fa-IR')} روز از ${trend.length.toLocaleString('fa-IR')} روز اخیر`, dir: 'pos' })
    } else if (avgRatio < -0.08) {
      score -= 1.5
      reasons.push({ text: `خروج پول در ${(trend.length - posDays).toLocaleString('fa-IR')} روز از ${trend.length.toLocaleString('fa-IR')} روز اخیر`, dir: 'neg' })
    }
    const cum = trend.reduce((s, t) => s + t.avgChg, 0)
    if (cum > 4) {
      score += 0.5
      reasons.push({ text: `مومنتوم مثبت ${cum.toFixed(1)}٪ در ${trend.length.toLocaleString('fa-IR')} روز اخیر`, dir: 'pos' })
    } else if (cum < -4) {
      score -= 0.5
      reasons.push({ text: `افت ${Math.abs(cum).toFixed(1)}٪ در ${trend.length.toLocaleString('fa-IR')} روز اخیر`, dir: 'neg' })
    }
  }

  let type: string, color: string, confidence: number
  if (score >= 2.5) { type = 'خرید'; color = '#10B981'; confidence = Math.min(90, Math.round(50 + score * 8)) }
  else if (score <= -2.5) { type = 'فروش'; color = '#EF4444'; confidence = Math.min(90, Math.round(50 + Math.abs(score) * 8)) }
  else if (score >= 1) { type = 'تمایل خرید'; color = '#3BB07A'; confidence = Math.round(40 + score * 6) }
  else if (score <= -1) { type = 'احتیاط'; color = '#F59E0B'; confidence = Math.round(40 + Math.abs(score) * 6) }
  else { type = 'نگه‌داری'; color = '#00C8FF'; confidence = Math.round(45 + Math.abs(score) * 4) }

  return { type, color, confidence, score, reasons }
}

const BOURSE_CATS = [
  { key: 'leveraged', label: 'اهرمی', color: '#F0654A' },
  { key: 'sector',    label: 'بخشی',  color: '#38BDF8' },
  { key: 'equity',    label: 'سهامی', color: '#A78BFA' },
]

const CATEGORY_LABELS: Record<string, string> = {
  gold: 'طلا', silver: 'نقره', leveraged: 'اهرمی', sector: 'بخشی', equity: 'سهامی', stock: 'سهام',
}

// ── Silver signal engine ───────────────────────────────────────────────────
function computeSilverSignal(silverBubble: number | null, api: any) {
  if (silverBubble == null) return null
  let score = 0
  const reasons: { text: string; dir: 'pos' | 'neg' | 'neu' }[] = []

  if (silverBubble < -3) {
    score += 3
    reasons.push({ text: `شمش نقره بورس کالا ${Math.abs(silverBubble).toFixed(1)}٪ زیر قیمت واقعی — فرصت خرید`, dir: 'pos' })
  } else if (silverBubble < -1.5) {
    score += 1.5
    reasons.push({ text: `شمش نقره ${Math.abs(silverBubble).toFixed(1)}٪ زیر قیمت واقعی`, dir: 'pos' })
  } else if (silverBubble > 3) {
    score -= 3
    reasons.push({ text: `حباب شمش نقره ${silverBubble.toFixed(1)}٪ — گران معامله می‌شود`, dir: 'neg' })
  } else if (silverBubble > 1.5) {
    score -= 1.5
    reasons.push({ text: `حباب شمش نقره ${silverBubble.toFixed(1)}٪`, dir: 'neg' })
  } else {
    score += 0.3
    reasons.push({ text: `قیمت شمش نقره نزدیک ارزش واقعی (${silverBubble >= 0 ? '+' : ''}${silverBubble.toFixed(1)}٪)`, dir: 'neu' })
  }

  const goldUsd = api?.inputs?.goldUsd, silverUsd = api?.inputs?.silverUsd
  const ratio = goldUsd && silverUsd ? goldUsd / silverUsd : null
  if (ratio != null) {
    if (ratio > 85) {
      score += 1
      reasons.push({ text: `نسبت طلا/نقره ${ratio.toFixed(0)} — نقره نسبت به طلا ارزان`, dir: 'pos' })
    } else if (ratio < 55) {
      score -= 1
      reasons.push({ text: `نسبت طلا/نقره ${ratio.toFixed(0)} — نقره نسبت به طلا گران`, dir: 'neg' })
    }
  }

  const chg = api?.inputs?.silverUsdChange
  if (chg != null) {
    if (chg > 0.015) { score += 1; reasons.push({ text: `انس نقره امروز ${pct(chg, 2)}`, dir: 'pos' }) }
    else if (chg < -0.015) { score -= 1; reasons.push({ text: `انس نقره امروز ${pct(chg, 2)}`, dir: 'neg' }) }
  }

  let type: string, color: string, confidence: number
  if (score >= 2.5) { type = 'خرید'; color = '#10B981'; confidence = Math.min(90, Math.round(50 + score * 8)) }
  else if (score <= -2.5) { type = 'فروش'; color = '#EF4444'; confidence = Math.min(90, Math.round(50 + Math.abs(score) * 8)) }
  else if (score >= 1) { type = 'تمایل خرید'; color = '#3BB07A'; confidence = Math.round(40 + score * 6) }
  else if (score <= -1) { type = 'احتیاط'; color = '#F59E0B'; confidence = Math.round(40 + Math.abs(score) * 6) }
  else { type = 'نگه‌داری'; color = '#00C8FF'; confidence = Math.round(45 + Math.abs(score) * 4) }

  return { type, color, confidence, score, reasons }
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
  const [catTrends, setCatTrends] = useState<Record<string, CatTrendDay[]>>({})
  const [portMap, setPortMap]     = useState<Record<string, FundPort>>({})
  const [navMap, setNavMap]       = useState<Record<string, number>>({})
  const [apiData, setApiData]     = useState<any>(null)
  const [isDark, setIsDark]       = useState(true)
  const [isAdmin, setIsAdmin]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const isMobile = useIsMobile()
  const [showDays, setShowDays]   = useState<5 | 10 | 20>(10)
  const [lastFundsDate, setLastFundsDate] = useState<string | null>(null)
  // سری قیمت مرجع برای محاسبه نتیجه سیگنال — طلا (dates/priceMap بالا) پیش‌فرض تاریخی است،
  // این‌ها برای دسته‌های تازه‌اضافه‌شده (نقره، صندوق‌های بورسی، سهام) هستند
  const [silverSeries, setSilverSeries] = useState<PriceSeries>(EMPTY_SERIES)
  const [bourseSeries, setBourseSeries] = useState<Record<string, PriceSeries>>({})
  const [stockSeries, setStockSeries]   = useState<Record<string, PriceSeries>>({})
  const [stockCandidates, setStockCandidates] = useState<{ symbol: string; name: string; chg: number; sig: NonNullable<ReturnType<typeof computeStockSignal>> }[]>([])
  const [historyCat, setHistoryCat] = useState<'all' | 'gold' | 'silver' | 'leveraged' | 'sector' | 'equity' | 'stock'>('all')

  const t: any = isDark ? darkTheme : lightTheme

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => {
      window.removeEventListener('themechange', handler)
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
            setLastFundsDate(lastDate)
            const assetMap: Record<number, any> = {}
            assets.forEach((a: any) => { assetMap[a.id] = a })
            const merged = funds
              .map((f: any) => ({ ...f, ...(assetMap[f.asset_id] || {}) }))
              .filter((f: any) => f.name && f.category)
            setFundData(merged as FundRow[])

            // قیمت مرجع نقره — صندوق تقریباً خالص نقره (برای محاسبه نتیجه سیگنال نقره)
            const silverAssets = assets.filter((a: any) => a.category === 'نقره')
            const silverBenchmark = silverAssets.find((a: any) => (SILVER_FUND_WEIGHTS[a.name]?.silver ?? 0) >= 99) ?? silverAssets[0]
            if (silverBenchmark) {
              const { data: sp } = await supabase.from('gold_funds')
                .select('trade_date_shamsi, price_close')
                .eq('asset_id', silverBenchmark.id)
                .not('price_close', 'is', null)
                .order('trade_date_shamsi', { ascending: true })
              if (sp?.length) {
                const spm: Record<string, number> = {}
                sp.forEach((p: any) => { spm[p.trade_date_shamsi] = safe(p.price_close) })
                setSilverSeries({ dates: sp.map((p: any) => p.trade_date_shamsi as string), priceMap: spm })
              }
            }

            // شاخص ترکیبی روزانه هر دسته بورسی (اهرمی/بخشی/سهامی) — برای محاسبه نتیجه سیگنال آن دسته
            const bourseCatSetFull = new Set(BOURSE_CATS.map(c => c.label))
            const catByKey: Record<string, string> = Object.fromEntries(BOURSE_CATS.map(c => [c.label, c.key]))
            const allBourseIds = assets.filter((a: any) => bourseCatSetFull.has(a.category)).map((a: any) => a.id)
            if (allBourseIds.length) {
              const { data: fullHist } = await supabase.from('gold_funds')
                .select('asset_id, trade_date_shamsi, price_change_pct')
                .in('asset_id', allBourseIds)
                .not('price_change_pct', 'is', null)
                .order('trade_date_shamsi', { ascending: true })
              if (fullHist?.length) {
                const byCatDateFull: Record<string, Record<string, { sum: number; cnt: number }>> = {}
                fullHist.forEach((r: any) => {
                  const cat = assetMap[r.asset_id]?.category
                  const key = cat ? catByKey[cat] : null
                  if (!key) return
                  byCatDateFull[key] ??= {}
                  byCatDateFull[key][r.trade_date_shamsi] ??= { sum: 0, cnt: 0 }
                  byCatDateFull[key][r.trade_date_shamsi].sum += r.price_change_pct ?? 0
                  byCatDateFull[key][r.trade_date_shamsi].cnt++
                })
                const bs: Record<string, PriceSeries> = {}
                Object.entries(byCatDateFull).forEach(([key, days]) => {
                  const ds = Object.keys(days).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                  const pm: Record<string, number> = {}
                  let idx = 100
                  ds.forEach(d => {
                    const avgChg = days[d].sum / days[d].cnt
                    idx *= (1 + avgChg / 100)
                    pm[d] = idx
                  })
                  bs[key] = { dates: ds, priceMap: pm }
                })
                setBourseSeries(bs)
              }
            }

            // روند ۵ روز اخیر صندوق‌های بورسی (اهرمی/بخشی/سهامی) برای موتور سیگنال
            const bourseCatSet = new Set(BOURSE_CATS.map(c => c.label))
            const bourseIds = assets
              .filter((a: any) => bourseCatSet.has(a.category))
              .map((a: any) => a.id)
            const trendDates = (prices ?? [])
              .map((p: any) => p.trade_date_shamsi as string)
              .filter(d => d < lastDate)
              .slice(-5)
            if (bourseIds.length && trendDates.length) {
              const { data: hist } = await supabase.from('gold_funds')
                .select('asset_id, trade_date_shamsi, price_change_pct, buy_i_volume, sell_i_volume')
                .in('trade_date_shamsi', trendDates)
                .in('asset_id', bourseIds)
                .not('price_close', 'is', null)
              if (hist) {
                const byCatDate: Record<string, Record<string, { buy: number; sell: number; chg: number; cnt: number }>> = {}
                hist.forEach((r: any) => {
                  const cat = assetMap[r.asset_id]?.category
                  if (!cat) return
                  byCatDate[cat] ??= {}
                  byCatDate[cat][r.trade_date_shamsi] ??= { buy: 0, sell: 0, chg: 0, cnt: 0 }
                  const o = byCatDate[cat][r.trade_date_shamsi]
                  o.buy += safe(r.buy_i_volume)
                  o.sell += safe(r.sell_i_volume)
                  o.chg += r.price_change_pct ?? 0
                  o.cnt++
                })
                const ct: Record<string, CatTrendDay[]> = {}
                Object.entries(byCatDate).forEach(([cat, days]) => {
                  ct[cat] = trendDates
                    .filter(d => days[d])
                    .map(d => {
                      const o = days[d]
                      const tot = o.buy + o.sell
                      return { ratio: tot > 0 ? (o.buy - o.sell) / tot : 0, avgChg: o.cnt ? o.chg / o.cnt : 0 }
                    })
                })
                setCatTrends(ct)
              }
            }
          }
        }
      } catch { /* ignore */ }

      // ۳ب. تاریخچه قیمت نمادهایی که سیگنال سهام برایشان صادر شده (برای نتیجه N روزه)
      try {
        const { data: sp } = await supabase.from('stock_signal_prices')
          .select('symbol, snap_date, price')
          .order('snap_date', { ascending: true })
        if (sp?.length) {
          const bySym: Record<string, PriceSeries> = {}
          sp.forEach((r: any) => {
            bySym[r.symbol] ??= { dates: [], priceMap: {} }
            bySym[r.symbol].dates.push(r.snap_date)
            bySym[r.symbol].priceMap[r.snap_date] = safe(r.price)
          })
          setStockSeries(bySym)
        }
      } catch { /* جدول ممکن است هنوز ساخته نشده باشد */ }

      // ۴. API طلا برای سیگنال لحظه‌ای + NAV برای حباب اسمی صندوق‌ها
      try {
        const [res, navRes, portRes] = await Promise.all([
          fetch('/api/gold-analysis'),
          fetch('/api/gold-nav'),
          fetch('/api/portfolio-signal'),
        ])
        if (res.ok) setApiData(await res.json())
        if (navRes.ok) {
          const nd = await navRes.json()
          setNavMap(nd?.navs ?? {})
        }
        if (portRes.ok) {
          const pd = await portRes.json()
          setPortMap(pd?.funds ?? {})
        }
      } catch { /* ignore */ }

      setLoading(false)
    }
    load()
  }, [])

  // سیگنال سهام — قانون‌محور از گزارش‌های کدال (فقط نمادهایی که گزارش دارند، ۱۹۰ از ۶۷۱ نماد)
  useEffect(() => {
    const loadStockSignals = async () => {
      try {
        const [listRes, stocksRes] = await Promise.all([
          fetch('/api/stock-reports-list'),
          fetch('/api/stocks-industries'),
        ])
        const { symbols: reportSymbols } = await listRes.json()
        const stocksData = await stocksRes.json()
        const bySymbol = new Map<string, { name: string; chg: number }>()
        for (const ind of stocksData.industries ?? []) {
          for (const s of ind.symbols ?? []) bySymbol.set(s.l18, { name: s.l30 || s.l18, chg: safe(s.pcp) })
        }

        const CONCURRENCY = 20
        const results: { symbol: string; name: string; chg: number; sig: NonNullable<ReturnType<typeof computeStockSignal>> }[] = []
        for (let i = 0; i < (reportSymbols?.length ?? 0); i += CONCURRENCY) {
          const batch: string[] = reportSymbols.slice(i, i + CONCURRENCY)
          const settled = await Promise.allSettled(batch.map((sym: string) =>
            fetch(`/reports/${encodeURIComponent(sym.replace(/\s+/g, '-'))}.json`).then(r => {
              if (!r.ok) throw new Error('report fetch failed')
              return r.json()
            })
          ))
          settled.forEach((r, idx) => {
            if (r.status !== 'fulfilled') return
            const rep: Reports = r.value
            const sig = computeStockSignal(rep.months ?? [], rep.quarters ?? [])
            if (!sig || sig.type === 'نگه‌داری') return
            const meta = bySymbol.get(batch[idx]) ?? { name: batch[idx], chg: 0 }
            results.push({ symbol: batch[idx], name: meta.name, chg: meta.chg, sig })
          })
        }
        results.sort((a, b) => Math.abs(b.sig.score) - Math.abs(a.sig.score))
        setStockCandidates(results)
      } catch { /* — */ }
    }
    loadStockSignals()
  }, [])

  const stockBuys = stockCandidates.filter(c => c.sig.type === 'خرید' || c.sig.type === 'تمایل خرید').slice(0, 3)
  const stockSells = stockCandidates.filter(c => c.sig.type === 'فروش' || c.sig.type === 'احتیاط').slice(0, 3)
  const bestStockCandidate = stockCandidates[0] ?? null

  // سری قیمت مرجع برای محاسبه نتیجه سیگنال — بر اساس دسته (طلا/نقره/بورسی/سهام)
  const seriesFor = (category: string | undefined, symbol?: string | null): PriceSeries => {
    const cat = category || 'gold'
    if (cat === 'gold') return { dates, priceMap }
    if (cat === 'silver') return silverSeries
    if (cat === 'stock') return (symbol && stockSeries[symbol]) || EMPTY_SERIES
    return bourseSeries[cat] || EMPTY_SERIES
  }

  const marketBubbles = apiData?.ime ? computeMarketBubbles(apiData.ime) : null
  const silverBubble = apiData?.ime ? computeSilverBubble(apiData.ime) : null
  const autoSignal = computeAutoSignal(apiData, marketBubbles)
  const silverSignal = computeSilverSignal(silverBubble, apiData)
  const rankedFunds = autoSignal
    ? getRankedFunds(autoSignal.type, fundData, navMap, 'طلا', n => marketBubbles ? fundBubbleZati(n, marketBubbles) : null)
    : []
  const rankedSilverFunds = silverSignal
    ? getRankedFunds(silverSignal.type, fundData, navMap, 'نقره', n => silverFundBubbleZati(n, silverBubble))
    : []
  const bourseSections = BOURSE_CATS.map(c => {
    const sig = computeBourseSignal(fundData.filter(f => f.category === c.label), catTrends[c.label] ?? [], portMap)
    const funds = sig ? getRankedFunds(sig.type, fundData, navMap, c.label, () => null, portMap) : []
    return { ...c, sig, funds }
  }).filter(s => s.sig)

  // ثبت خودکار همه‌ی موتورهای سیگنال در تاریخچه (طلا، نقره، بورسی، سهام) — فقط ادمین، یک بار برای هر روز+دسته+نوع
  useEffect(() => {
    if (!isAdmin || loading) return

    type Candidate = { category: string; sig: { type: string; confidence: number; reasons: { text: string }[] }; date: string; symbol?: string; note: string; telegram?: boolean }
    const candidates: Candidate[] = []
    if (autoSignal && apiData?.lastMarketDate) {
      candidates.push({ category: 'gold', sig: autoSignal, date: apiData.lastMarketDate, note: '[v2] موتور حباب واقعی بورس کالا', telegram: true })
    }
    if (silverSignal && apiData?.lastMarketDate) {
      candidates.push({ category: 'silver', sig: silverSignal, date: apiData.lastMarketDate, note: '[v2] موتور حباب واقعی نقره' })
    }
    if (lastFundsDate) {
      bourseSections.forEach(sec => {
        if (sec.sig) candidates.push({ category: sec.key, sig: sec.sig, date: lastFundsDate, note: `[v2] موتور NAV صندوق‌های ${sec.label}` })
      })
    }
    if (bestStockCandidate) {
      candidates.push({
        category: 'stock', sig: bestStockCandidate.sig, date: todayShamsi(), symbol: bestStockCandidate.symbol,
        note: '[v2] موتور قاعده‌محور گزارش‌های کدال',
      })
    }

    const toInsert = candidates.filter(c =>
      c.sig.type !== 'نگه‌داری' &&
      !signals.some(s =>
        s.signal_date_shamsi === c.date && s.signal_type === c.sig.type &&
        (s.category || 'gold') === c.category && (c.category !== 'stock' || s.symbol === c.symbol)
      )
    )
    if (toInsert.length === 0) return

    let cancelled = false
    const save = async () => {
      for (const c of toInsert) {
        const reason = c.sig.reasons.map(r => r.text).join(' · ')
        const { data, error } = await supabase.from('signals').insert([{
          signal_date_shamsi: c.date,
          signal_type: c.sig.type,
          confidence: c.sig.confidence,
          category: c.category,
          symbol: c.symbol ?? null,
          note: c.note,
          reason,
        }]).select()
        if (error || cancelled || !data?.[0]) continue
        setSignals(prev => [data[0], ...prev])
        if (c.telegram) {
          const fundLine = (f: FundRow) =>
            f.bubbleVaqei != null ? `${f.name} (حباب واقعی ${f.bubbleVaqei >= 0 ? '+' : ''}${f.bubbleVaqei.toFixed(1)}٪)` : f.name
          const { data: { session: notifySession } } = await supabase.auth.getSession()
          fetch('/api/telegram-notify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(notifySession?.access_token ? { Authorization: `Bearer ${notifySession.access_token}` } : {}),
            },
            body: JSON.stringify({
              signal_type: c.sig.type,
              date: c.date,
              confidence: c.sig.confidence,
              note: reason,
              gold_funds: rankedFunds.map(fundLine),
              silver_signal: silverSignal?.type ?? null,
              silver_confidence: silverSignal?.confidence ?? null,
              silver_funds: rankedSilverFunds.map(fundLine),
            }),
          }).catch(() => {/* fire-and-forget */})
        }
      }
    }
    save()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, loading, autoSignal?.type, silverSignal?.type, lastFundsDate, bestStockCandidate?.symbol])

  // فیلتر تاریخچه بر اساس دسته — پیش‌فرض همه
  const filteredSignals = historyCat === 'all' ? signals : signals.filter(s => (s.category || 'gold') === historyCat)

  // stats — only valid signals (مطابق فیلتر دسته‌ی انتخاب‌شده)
  const buys   = filteredSignals.filter(s => s.signal_type === 'خرید')
  const sells  = filteredSignals.filter(s => s.signal_type === 'فروش')
  const holds  = filteredSignals.filter(s => s.signal_type === 'نگه‌داری')
  const trading = filteredSignals.filter(s => s.signal_type !== 'نگه‌داری')

  const outcomes10 = trading.map(s => {
    const ser = seriesFor(s.category, s.symbol)
    return getOutcome(s.signal_date_shamsi, s.signal_type, ser.dates, ser.priceMap, 10)
  })
  const evOuts     = outcomes10.filter(o => o !== null) as number[]
  const won        = evOuts.filter(o => o > 0)
  const winRate    = evOuts.length > 0 ? Math.round(won.length / evOuts.length * 100) : null
  const avgReturn  = evOuts.length > 0 ? evOuts.reduce((a, b) => a + b, 0) / evOuts.length : null

  const BG     = t.bg
  const PANEL  = t.panel
  const BORDER = t.border
  const TEXT   = t.text
  const MUTED  = t.muted
  const FAINT  = isDark ? '#ddd5bd' : '#6B5A3A'
  const GOLD   = t.gold
  const GOLD_BG = isDark ? 'rgba(212,168,71,0.08)' : 'rgba(212,168,71,0.1)'
  const GREEN  = t.green
  const RED    = t.red

  return (
    <AuthGate title="سیگنال‌ها">
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
              بر پایه حباب شمش و گواهی سکه بورس کالا، حباب واقعی صندوق‌ها، انس جهانی و جریان پول حقیقی — به‌همراه سیگنال صندوق‌های بورسی (اهرمی، بخشی، سهامی)
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

        {/* ── Fund recommendations (طلا + نقره) ── */}
        {([
          { key: 'gold', label: 'طلا', sig: autoSignal, funds: rankedFunds },
          { key: 'silver', label: 'نقره', sig: silverSignal, funds: rankedSilverFunds },
        ] as { key: string; label: string; sig: any; funds: FundRow[] }[])
          .filter(sec => sec.sig && sec.funds.length > 0)
          .map(sec => {
          const secBuy = sec.sig.type === 'خرید' || sec.sig.type === 'تمایل خرید'
          const secSell = sec.sig.type === 'فروش' || sec.sig.type === 'احتیاط'
          return (
          <div key={sec.key} style={{
            background: PANEL,
            border: `1px solid ${secBuy ? '#10B98122' : secSell ? '#EF444422' : BORDER}`,
            borderRadius: 14,
            padding: isMobile ? '18px 16px' : '20px 24px',
            backdropFilter: 'blur(12px)',
          }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 3, height: 20, borderRadius: 2,
                background: secBuy ? GREEN : secSell ? RED : t.accent,
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
                {secBuy ? `این صندوق‌های ${sec.label} رو بخر` : secSell ? `این صندوق‌های ${sec.label} رو بفروش` : `با این صندوق‌های ${sec.label} بمان`}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: sec.sig.color,
                background: `${sec.sig.color}16`, border: `1px solid ${sec.sig.color}30`,
                padding: '2px 10px', borderRadius: 5,
              }}>
                {sec.sig.type} · {sec.sig.confidence}٪
              </span>
              <span style={{
                fontSize: 10, color: MUTED,
                marginRight: 'auto',
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                padding: '2px 8px', borderRadius: 5,
              }}>
                {secBuy ? 'بر اساس حباب واقعی + ورود پول حقیقی + مومنتوم' : secSell ? 'بر اساس حباب واقعی + خروج پول حقیقی' : 'بر اساس کمترین حباب بین نقدشونده‌ها'}
              </span>
            </div>

            {/* fund cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: 12,
            }}>
              {sec.funds.map((f, idx) => {
                const netM = Math.round(f.net / 1e6)
                const isPositiveFlow = f.net > 0
                const chg = f.price_change_pct ?? 0
                const rankColor = idx === 0
                  ? (secBuy ? GREEN : secSell ? RED : GOLD)
                  : MUTED

                return (
                  <Link
                    key={f.asset_id}
                    href={`/fund/${f.slug}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{
                      background: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)',
                      border: `1px solid ${idx === 0 ? (secBuy ? '#10B98130' : secSell ? '#EF444430' : 'rgba(212,168,71,0.3)') : BORDER}`,
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
                          color: secBuy ? GREEN : secSell ? RED : GOLD,
                          background: secBuy ? 'rgba(16,185,129,0.12)' : secSell ? 'rgba(239,68,68,0.12)' : 'rgba(212,168,71,0.12)',
                          border: `1px solid ${secBuy ? 'rgba(16,185,129,0.25)' : secSell ? 'rgba(239,68,68,0.25)' : 'rgba(212,168,71,0.25)'}`,
                          borderRadius: 4, padding: '1px 6px',
                        }}>
                          ★ اول
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
                        {fundReason(f, sec.sig.type)}
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
          )
        })}

        {/* ── Bourse funds signals (اهرمی / بخشی / سهامی) ── */}
        {!loading && bourseSections.length > 0 && (
          <div style={{
            background: PANEL,
            border: `0.5px solid ${BORDER}`,
            borderRadius: 14,
            padding: isMobile ? '18px 16px' : '20px 24px',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 3, height: 20, borderRadius: 2, background: t.accent }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
                سیگنال صندوق‌های بورسی
              </span>
              <span style={{
                fontSize: 10, color: MUTED, marginRight: 'auto',
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                padding: '2px 8px', borderRadius: 5,
              }}>
                بر اساس NAV برآوردی از پرتفوی کدال، سهام اثرگذار، جریان پول حقیقی و مومنتوم
              </span>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 11, color: MUTED }}>
              اهرمی · بخشی · سهامی
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: 12,
            }}>
              {bourseSections.map(sec => {
                const sig = sec.sig!
                return (
                  <div key={sec.key} style={{
                    background: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)',
                    border: `1px solid ${sig.color}28`,
                    borderRadius: 12,
                    padding: '16px 16px 14px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 2.5,
                      background: `linear-gradient(90deg, ${sig.color}, transparent)`,
                    }} />

                    {/* category + signal badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: sec.color,
                      }}>
                        صندوق {sec.label}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: sig.color,
                        background: `${sig.color}16`, border: `1px solid ${sig.color}30`,
                        padding: '2px 10px', borderRadius: 5,
                        marginRight: 'auto',
                      }}>
                        {sig.type}
                      </span>
                    </div>

                    {/* confidence */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: BORDER, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          width: `${sig.confidence}%`,
                          background: `linear-gradient(90deg, ${sig.color}99, ${sig.color})`,
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: sig.color, fontFamily: 'system-ui' }}>
                        {sig.confidence}٪
                      </span>
                    </div>

                    {/* reasons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {sig.reasons.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <span style={{ fontSize: 8, marginTop: 3, color: r.dir === 'pos' ? GREEN : r.dir === 'neg' ? RED : MUTED }}>
                            {r.dir === 'pos' ? '▲' : r.dir === 'neg' ? '▼' : '●'}
                          </span>
                          <span style={{ fontSize: 10.5, lineHeight: 1.6, color: r.dir === 'pos' ? GREEN : r.dir === 'neg' ? RED : MUTED }}>
                            {r.text}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* top funds */}
                    {sec.funds.length > 0 && (
                      <div style={{ borderTop: `0.5px solid ${BORDER}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 9.5, color: FAINT, letterSpacing: '0.04em' }}>
                          {sig.type === 'خرید' || sig.type === 'تمایل خرید'
                            ? 'گزینه‌های خرید'
                            : sig.type === 'فروش' || sig.type === 'احتیاط'
                              ? 'کاندیدهای فروش'
                              : 'کم‌ریسک‌ترین‌ها برای نگه‌داری'}
                        </span>
                        {sec.funds.map((f, idx) => {
                          const netM = Math.round(f.net / 1e6)
                          const chg = f.price_change_pct ?? 0
                          return (
                            <Link key={f.asset_id} href={`/fund/${f.slug}`} style={{ textDecoration: 'none' }}>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '5px 8px', borderRadius: 8,
                                background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                                transition: 'background 0.15s',
                              }}
                                onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
                              >
                                <span style={{
                                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                                  background: `${idx === 0 ? sec.color : MUTED}18`,
                                  border: `1px solid ${idx === 0 ? sec.color : MUTED}30`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 9, fontWeight: 700, color: idx === 0 ? sec.color : MUTED,
                                  fontFamily: 'system-ui',
                                }}>
                                  {idx + 1}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{f.name}</span>
                                {f.navChg != null && (
                                  <span style={{
                                    fontSize: 9, fontWeight: 600, marginRight: 'auto',
                                    color: MUTED, fontFamily: 'system-ui', whiteSpace: 'nowrap',
                                  }}>
                                    NAV {f.navChg >= 0 ? '+' : ''}{f.navChg.toFixed(1)}٪
                                  </span>
                                )}
                                <span style={{
                                  fontSize: 10, fontWeight: 600,
                                  marginRight: f.navChg != null ? 0 : 'auto',
                                  color: chg >= 0 ? GREEN : RED, fontFamily: 'system-ui',
                                }}>
                                  {chg >= 0 ? '+' : ''}{chg?.toFixed(2)}٪
                                </span>
                                <span style={{
                                  fontSize: 10, fontWeight: 600,
                                  color: netM >= 0 ? GREEN : RED, fontFamily: 'system-ui',
                                }}>
                                  {netM >= 0 ? '+' : ''}{netM.toLocaleString('fa-IR')}M
                                </span>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <p style={{ margin: '14px 0 0', fontSize: 10, color: FAINT, lineHeight: 1.7 }}>
              ⓘ  سیگنال هر دسته از NAV برآوردی (پرتفوی کدال × قیمت روز سهام)، فاصله قیمت از NAV، جریان پول حقیقی، درصد صندوق‌های مثبت و روند ۵ روز اخیر محاسبه می‌شود — توصیه سرمایه‌گذاری نیست.
            </p>
          </div>
        )}

        {/* ── Stock signals (سیگنال سهام) — قانون‌محور از گزارش‌های ماهانه/فصلی کدال ── */}
        {(stockBuys.length > 0 || stockSells.length > 0) && (
          <div style={{
            background: PANEL, border: `0.5px solid ${BORDER}`,
            borderRadius: 14, padding: isMobile ? '18px 16px' : '20px 24px',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 3, height: 20, borderRadius: 2, background: t.accent }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>سیگنال سهام</span>
              <span style={{
                fontSize: 10, color: MUTED, marginRight: 'auto',
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                padding: '2px 8px', borderRadius: 5,
              }}>
                قاعده‌محور از گزارش‌های ماهانه و فصلی کدال ({stockCandidates.length.toLocaleString('fa-IR')} نماد بررسی‌شده)
              </span>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 11, color: MUTED }}>
              فقط نمادهایی که گزارش کدال دارند بررسی می‌شوند — تحلیل بیشتر هر نماد در صفحه اختصاصی آن
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              {[
                { title: 'کاندیدهای خرید', list: stockBuys, color: GREEN },
                { title: 'کاندیدهای فروش', list: stockSells, color: RED },
              ].filter(col => col.list.length > 0).map(col => (
                <div key={col.title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: col.color }}>{col.title}</span>
                  {col.list.map(c => (
                    <Link key={c.symbol} href={`/stock/${encodeURIComponent(c.symbol)}`} style={{ textDecoration: 'none' }}>
                      <div style={{
                        background: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)',
                        border: `1px solid ${col.color}28`, borderRadius: 12, padding: '12px 14px',
                        cursor: 'pointer', transition: 'background 0.18s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>{c.symbol}</span>
                          <span style={{ fontSize: 10.5, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 600, marginRight: 'auto', color: c.chg >= 0 ? GREEN : RED, fontFamily: 'system-ui' }}>
                            {c.chg >= 0 ? '+' : ''}{c.chg.toFixed(2)}٪
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: c.sig.color,
                            background: `${c.sig.color}16`, border: `1px solid ${c.sig.color}30`,
                            padding: '1px 8px', borderRadius: 5,
                          }}>
                            {c.sig.type} · {c.sig.confidence}٪
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {c.sig.reasons.slice(0, 3).map((r, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                              <span style={{ fontSize: 8, marginTop: 3, color: r.dir === 'pos' ? GREEN : r.dir === 'neg' ? RED : MUTED }}>
                                {r.dir === 'pos' ? '▲' : r.dir === 'neg' ? '▼' : '●'}
                              </span>
                              <span style={{ fontSize: 10.5, lineHeight: 1.6, color: MUTED }}>{r.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
            </div>

            <p style={{ margin: '14px 0 0', fontSize: 10, color: FAINT, lineHeight: 1.7 }}>
              ⓘ  علت هر سیگنال از رشد/افت فروش ماهانه نسبت به سال قبل، رشد سود خالص فصلی و حاشیه سود استخراج می‌شود — توصیه سرمایه‌گذاری نیست.
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

        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <Link href="/track-record" style={{ fontSize: 11.5, color: t.accent, textDecoration: 'none' }}>
            رکورد کامل عملکرد همه سیگنال‌ها ←
          </Link>
        </div>

        {/* ── نتیجه ۱۰ روزه سیگنال‌ها — چارت مستطیلی ── */}
        {trading.length > 0 && (
          <div style={{
            background: PANEL, border: `0.5px solid ${BORDER}`,
            borderRadius: 14, padding: '16px 20px',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>نتیجه ۱۰ روزه سیگنال‌ها</span>
              <span style={{ fontSize: 11, color: MUTED }}>هر خانه = بازده تجمعی تا آن روز؛ خاکستری یعنی هنوز داده کافی نیست</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 480 }}>
                {trading.slice(0, 10).map(s => {
                  const ser = seriesFor(s.category, s.symbol)
                  const daily = getDailyOutcomes(s.signal_date_shamsi, s.signal_type, ser.dates, ser.priceMap, 10)
                  const cat = s.category || 'gold'
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 11, color: TEXT, fontWeight: 600 }}>
                          {CATEGORY_LABELS[cat] ?? cat}{cat === 'stock' && s.symbol ? ` · ${s.symbol}` : ''}
                        </span>
                        <span style={{ fontSize: 9.5, color: FAINT }}>{s.signal_date_shamsi} · {s.signal_type}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {daily.map((v, i) => {
                          const bg = v == null
                            ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')
                            : v > 0
                              ? `rgba(16,185,129,${Math.min(0.9, 0.25 + Math.abs(v) / 12)})`
                              : v < 0
                                ? `rgba(239,68,68,${Math.min(0.9, 0.25 + Math.abs(v) / 12)})`
                                : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')
                          return (
                            <div
                              key={i}
                              title={v == null ? `روز ${i + 1}: در انتظار` : `روز ${i + 1}: ${v > 0 ? '+' : ''}${v.toFixed(1)}٪`}
                              style={{ width: 20, height: 20, borderRadius: 4, background: bg }}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Signals history table ── */}
        <div style={{
          background: PANEL, border: `0.5px solid ${BORDER}`,
          borderRadius: 14, padding: '16px 20px',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>تاریخچه سیگنال‌ها</span>
              <span style={{ fontSize: 11, color: MUTED, marginRight: 8 }}>نتیجه بر اساس قیمت مرجع همان دسته</span>
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

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {([
              ['all', 'همه'], ['gold', 'طلا'], ['silver', 'نقره'],
              ['leveraged', 'اهرمی'], ['sector', 'بخشی'], ['equity', 'سهامی'], ['stock', 'سهام'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setHistoryCat(key)}
                style={{
                  fontSize: 10.5, padding: '4px 11px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: historyCat === key ? 'rgba(59,130,246,0.14)' : 'transparent',
                  border: `1px solid ${historyCat === key ? 'rgba(59,130,246,0.4)' : BORDER}`,
                  color: historyCat === key ? '#60A5FA' : MUTED,
                  transition: 'all 0.18s',
                }}
              >
                {label}
              </button>
            ))}
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
          ) : filteredSignals.length === 0 ? (
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
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['تاریخ', 'دسته', 'نوع', 'اعتماد', `نتیجه ${showDays} روزه`, 'جریان پول', 'دلیل'].map(h => (
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
                  {filteredSignals.map((s) => {
                    const cat = s.category || 'gold'
                    const sigColor = s.signal_type === 'خرید' ? GREEN : s.signal_type === 'فروش' ? RED : t.accent
                    const conf = typeof s.confidence === 'number' ? s.confidence : null
                    const confColor = conf === null ? FAINT : conf >= 70 ? GREEN : conf >= 40 ? '#F59E0B' : RED
                    const ser = seriesFor(s.category, s.symbol)
                    const outcome = s.signal_type !== 'نگه‌داری'
                      ? getOutcome(s.signal_date_shamsi, s.signal_type, ser.dates, ser.priceMap, showDays)
                      : null
                    const ocColor = outcome === null ? FAINT : outcome > 2 ? GREEN : outcome < -2 ? RED : '#F59E0B'
                    // جریان پول فقط برای طلا موجود است (asset_id=2)
                    const netFlow = cat === 'gold' ? flowMap[s.signal_date_shamsi] : null
                    const flowM = netFlow != null ? Math.round(netFlow / 1e6) : null

                    return (
                      <tr key={s.id} style={{ borderBottom: `0.5px solid ${BORDER}`, transition: 'background 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <td style={{ padding: '11px 10px', color: TEXT, whiteSpace: 'nowrap', fontSize: 12 }}>
                          {s.signal_date_shamsi}
                        </td>
                        <td style={{ padding: '11px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 11, color: MUTED }}>{CATEGORY_LABELS[cat] ?? cat}</span>
                          {cat === 'stock' && s.symbol && (
                            <Link href={`/stock/${encodeURIComponent(s.symbol)}`} style={{ fontSize: 10.5, color: '#60A5FA', textDecoration: 'none', marginRight: 6 }}>
                              {s.symbol}
                            </Link>
                          )}
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
              قیمت مبنا: طلا=صندوق عیار · نقره=صندوق نقره خالص · بورسی=شاخص ترکیبی همان دسته · سهام=قیمت خود نماد
            </span>
          </div>
        </div>

        {/* ── Disclaimer ── */}
        <div style={{ fontSize: 10.5, color: FAINT, textAlign: 'center', padding: '8px 0 4px' }}>
          سیگنال‌های این صفحه صرفاً جنبه اطلاع‌رسانی دارند و توصیه سرمایه‌گذاری نیستند
        </div>

        </div>
      </main>
    </AuthGate>
  )
}
