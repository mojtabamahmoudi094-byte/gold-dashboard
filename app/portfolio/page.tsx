'use client'

/**
 * پورتفوی من — مدیریت شخصی سبد دارایی (الهام از PortfolioPlus)
 * هر کاربر تراکنش‌های خرید/فروش خودش را ثبت می‌کند؛ میانگین خرید، بهای تمام‌شده،
 * ارزش روز، سود/زیان محقق‌شده و محقق‌نشده و نقطه سربه‌سر محاسبه می‌شود.
 * قیمت لحظه‌ای سهام از /stocks/industries.json و صندوق‌ها از /api/funds می‌آید.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  PieChart, Pie, Cell, Sector, Tooltip as ReTooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { darkTheme, lightTheme } from '../../lib/theme'
import { useIsMobile } from '../../lib/useIsMobile'
import { safe, fmtNum, fmtPct, todayShamsi } from '../../lib/format'

type AssetType = 'stock' | 'fund' | 'physical'

type Instrument = {
  symbol: string        // l18 برای سهام، slug برای صندوق و دارایی فیزیکی
  name: string
  type: AssetType
  price: number         // آخرین قیمت (ریال) — برای فیزیکی ممکن است ۰ باشد (قیمت دستی)
  changePct: number
}

type Tx = {
  id: number
  symbol: string
  name: string
  asset_type: AssetType
  side: 'buy' | 'sell'
  quantity: number
  price: number
  commission: number
  trade_date: string
  created_at: string
}

type Snapshot = {
  snap_date: string        // تاریخ شمسی
  total_value: number      // ارزش روز پورتفو (ریال) — ثبت‌شده توسط کرون روزانه
  invested_capital: number
  created_at: string
}

type Holding = {
  symbol: string
  name: string
  type: AssetType
  qty: number
  totalCost: number      // بهای تمام‌شده باقی‌مانده (شامل کارمزد خرید)
  avgCost: number
  realized: number       // سود/زیان محقق‌شده از فروش‌ها
  price: number | null   // قیمت روز
  changePct: number | null
  value: number | null
  unrealized: number | null
  unrealizedPct: number | null
  breakEven: number      // قیمت سربه‌سر با احتساب کارمزد فروش
}

// نرخ کارمزد تقریبی بورس تهران (خرید/فروش سهام) — دارایی فیزیکی کارمزد ندارد
const FEE_BUY = 0.003712
const FEE_SELL = 0.0088

// دارایی‌های فیزیکی قابل ثبت — قیمت روز از /api/physical-prices یا دستی
const PHYSICAL_ITEMS: { symbol: string; name: string }[] = [
  { symbol: 'gold-18k',     name: 'طلای ۱۸ عیار (گرم)' },
  { symbol: 'gold-24k',     name: 'طلای ۲۴ عیار (گرم)' },
  { symbol: 'gold-melted',  name: 'طلای آب‌شده (گرم)' },
  { symbol: 'coin-emami',   name: 'سکه امامی' },
  { symbol: 'coin-bahar',   name: 'سکه بهار آزادی' },
  { symbol: 'coin-half',    name: 'نیم‌سکه' },
  { symbol: 'coin-quarter', name: 'ربع‌سکه' },
  { symbol: 'coin-gram',    name: 'سکه گرمی' },
  { symbol: 'silver',       name: 'نقره (گرم)' },
]
const PHYSICAL_KEYWORDS = ['طلا', 'سکه', 'نقره', 'فیزیکی', 'گرم']

// نرمال‌سازی فارسی برای جستجو — ی/ي، ک/ك، نیم‌فاصله، اعراب و همزه‌ها
const normFa = (s: string) =>
  s.replace(/[يی]/g, 'ی')
   .replace(/[كک]/g, 'ک')
   .replace(/[‌‎‏​﻿ ]/g, ' ')  // نیم‌فاصله و کاراکترهای نامرئی (از اکسل کارگزاری) → فاصله
   .replace(/[أإآ]/g, 'ا')
   .replace(/ؤ/g, 'و')
   .replace(/ة/g, 'ه')
   .replace(/[ً-ٰٟ]/g, '')  // اعراب
   .replace(/\s+/g, ' ')
   .trim()

const MANUAL_PRICES_KEY = 'portfolio_manual_prices'


// همه‌ی مبالغ داخلی (تراکنش‌ها، محاسبات، دیتابیس) بر حسب ریال ذخیره/محاسبه می‌شوند؛
// نمایش به کاربر بر حسب تومان است (تقسیم بر ۱۰).
const RIAL_PER_TOMAN = 10
const fmtToman = (v: any) => safe(safe(v) / RIAL_PER_TOMAN).toLocaleString('fa-IR', { maximumFractionDigits: 0 })
const toToman = (v: any) => Math.round(safe(v) / RIAL_PER_TOMAN)
const tomanToRial = (v: any) => Math.round(safe(v) * RIAL_PER_TOMAN)

// پالت مدرن ترکیب پورتفو — رنگ‌های زنده با کنتراست کافی روی هر دو تم
const PIE_COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#0ea5e9', '#a855f7', '#14b8a6', '#fb923c', '#ec4899', '#84cc16']

// شکل بزرگ‌شده‌ی برش هاور — حس مدرن و زنده به چارت دایره‌ای می‌دهد
const renderActivePieShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <g style={{ filter: `drop-shadow(0 0 10px ${fill}80)` }}>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 7} startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  )
}

export default function PortfolioPage() {
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  const t = isDark ? darkTheme : lightTheme
  const cream = isDark ? '#ddd5bd' : '#6B5A3A'

  const [user, setUser] = useState<any>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [instruments, setInstruments] = useState<Instrument[]>([])
  // فهرست کامل نمادهای بورس (شامل نمادهای متوقف/بدون معامله امروز) — فقط برای شناسایی نماد
  // در آپلود اکسل کارگزاری استفاده می‌شود؛ instruments بالا فقط نمادهای «زنده‌ی امروز» را دارد
  const [symbolMaster, setSymbolMaster] = useState<{ symbol: string; name: string }[]>([])
  const [txs, setTxs] = useState<Tx[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [dbMissing, setDbMissing] = useState(false)
  // قیمت دستی دارایی‌های فیزیکی وقتی قیمت آنلاین در دسترس نیست
  const [manualPrices, setManualPrices] = useState<Record<string, number>>({})
  // چارت ترکیب پورتفو: برش هاورشده + دارایی انتخاب‌شده برای مودال جزئیات
  const [pieActiveIdx, setPieActiveIdx] = useState<number | undefined>(undefined)
  const [pieSelected, setPieSelected] = useState<Holding | null>(null)

  // فرم افزودن تراکنش
  const [showForm, setShowForm] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Instrument | null>(null)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [commission, setCommission] = useState('')
  const [autoFee, setAutoFee] = useState(true)
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // فروش سریع / خرید مجدد از روی ردیف دارایی — بدون نیاز به جستجوی نماد در فرم اصلی
  const [quickTx, setQuickTx] = useState<{ symbol: string; name: string; type: AssetType; side: 'buy' | 'sell'; maxQty: number } | null>(null)
  const [qtQty, setQtQty] = useState('')
  const [qtPrice, setQtPrice] = useState('')
  const [qtDate, setQtDate] = useState('')
  const [qtCommission, setQtCommission] = useState('')
  const [qtAutoFee, setQtAutoFee] = useState(true)
  const [qtSaving, setQtSaving] = useState(false)
  const [qtMsg, setQtMsg] = useState<string | null>(null)

  // آپلود اکسل کارگزاری — پیش‌نمایش + تایید قبل از افزودن به پورتفو
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<{ symbol: string; name: string; type: AssetType; qty: number; price: number; date: string; matched: boolean }[]>([])
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  // اتصال به بات تلگرام — کد یک‌بارمصرف
  const [showTelegram, setShowTelegram] = useState(false)
  const [tgLinked, setTgLinked] = useState(false)
  const [tgUsername, setTgUsername] = useState<string | null>(null)
  const [tgCode, setTgCode] = useState<string | null>(null)
  const [tgLoading, setTgLoading] = useState(false)
  const [tgMsg, setTgMsg] = useState<string | null>(null)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)

    supabase.auth.getUser().then(({ data }) => { setUser(data.user ?? null); setAuthChecked(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setUser(s?.user ?? null))

    setDate(todayShamsi())

    try {
      setManualPrices(JSON.parse(window.localStorage.getItem(MANUAL_PRICES_KEY) || '{}'))
    } catch { /* — */ }

    return () => {
      window.removeEventListener('themechange', handler)
      subscription.unsubscribe()
    }
  }, [])

  // وضعیت اتصال به بات تلگرام
  useEffect(() => {
    if (!user) return
    loadTelegramStatus()
  }, [user])

  // قیمت‌های روز: سهام + صندوق‌ها
  useEffect(() => {
    const load = async () => {
      const list: Instrument[] = []
      try {
        const res = await fetch('/api/stocks-industries')
        const data = await res.json()
        for (const ind of data.industries ?? []) {
          for (const s of ind.symbols ?? []) {
            list.push({ symbol: s.l18, name: s.l30 || s.l18, type: 'stock', price: safe(s.pl), changePct: safe(s.plp) })
          }
        }
      } catch { /* بدون قیمت سهام هم صفحه کار می‌کند */ }
      try {
        const res = await fetch('/api/funds')
        const data = await res.json()
        const byId = new Map<number, any>()
        for (const r of data.records ?? []) byId.set(r.asset_id, r)
        for (const a of data.assets ?? []) {
          const r = byId.get(a.id)
          if (!r) continue
          list.push({ symbol: a.slug, name: a.name, type: 'fund', price: safe(r.price_close), changePct: safe(r.price_change_pct) })
        }
      } catch { /* — */ }
      // دارایی‌های فیزیکی — قیمت آنلاین از BrsApi، در نبودش ۰ (قیمت دستی)
      let physPrices: Record<string, number> = {}
      try {
        const res = await fetch('/api/physical-prices')
        const data = await res.json()
        physPrices = data.prices ?? {}
      } catch { /* — */ }
      for (const p of PHYSICAL_ITEMS) {
        list.push({ symbol: p.symbol, name: p.name, type: 'physical', price: safe(physPrices[p.symbol]), changePct: 0 })
      }
      setInstruments(list)
    }
    load()

    // فهرست کامل نمادها (شامل نمادهای متوقف/بدون معامله امروز و حق‌تقدم‌ها) — فقط برای شناسایی، بدون قیمت زنده
    fetch('/stocks/all-symbols.json')
      .then(r => r.json())
      .then((data: { l18: string; l30: string }[]) => {
        setSymbolMaster((data ?? []).map(d => ({ symbol: d.l18, name: d.l30 || d.l18 })))
      })
      .catch(() => { /* نبودش فقط یعنی fallback شناسایی نمادهای متوقف کار نمی‌کند */ })
  }, [])

  const setManualPrice = (symbol: string, value: number) => {
    const next = { ...manualPrices }
    if (value > 0) next[symbol] = value
    else delete next[symbol]
    setManualPrices(next)
    window.localStorage.setItem(MANUAL_PRICES_KEY, JSON.stringify(next))
  }

  const loadTxs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('portfolio_transactions')
      .select('*')
      .order('trade_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      // جدول هنوز ساخته نشده (اجرای scripts/sql/portfolio.sql لازم است)
      if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) setDbMissing(true)
      setTxs([])
    } else {
      setDbMissing(false)
      setTxs((data ?? []) as Tx[])
    }
    setLoading(false)
  }

  // تصویر روزانه‌ی ارزش پورتفو — برای عملکرد دوره‌ای و چارت روند واقعی (اسکریپت scripts/snapshot-portfolio.js)
  const loadSnapshots = async () => {
    const { data, error } = await supabase
      .from('portfolio_daily_snapshot')
      .select('snap_date, total_value, invested_capital, created_at')
      .order('created_at', { ascending: true })
    if (!error) setSnapshots((data ?? []) as Snapshot[])
  }

  useEffect(() => {
    if (user) { loadTxs(); loadSnapshots() }
    else if (authChecked) setLoading(false)
  }, [user, authChecked])

  // اگر کاربر فایل اکسل را قبل از تکمیل بارگذاری لیست نمادها آپلود کرده باشد،
  // ردیف‌های «ناشناس» را به‌محض رسیدن لیست دوباره تطبیق بده — بدون نیاز به آپلود دوباره
  useEffect(() => {
    if (instruments.length === 0 && symbolMaster.length === 0) return
    setImportRows(prev => {
      if (prev.length === 0) return prev
      let changed = false
      const next = prev.map(r => {
        if (r.matched) return r
        const inst = matchInstrument(r.symbol)
        if (!inst) return r
        changed = true
        return { ...r, symbol: inst.symbol, name: inst.name, type: inst.type, matched: true }
      })
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instruments, symbolMaster])

  const priceMap = useMemo(() => {
    const m = new Map<string, Instrument>()
    for (const i of instruments) m.set(i.symbol, i)
    return m
  }, [instruments])

  // کارمزد خودکار وقتی تعداد/قیمت/جهت عوض می‌شود — فیزیکی کارمزد بورسی ندارد
  useEffect(() => {
    if (!autoFee) return
    if (picked?.type === 'physical') { setCommission('0'); return }
    const gross = safe(qty) * safe(price)
    if (gross <= 0) { setCommission(''); return }
    setCommission(String(Math.round(gross * (side === 'buy' ? FEE_BUY : FEE_SELL))))
  }, [qty, price, side, autoFee, picked])

  // کارمزد خودکار برای فرم فروش/خرید مجدد سریع روی ردیف دارایی
  useEffect(() => {
    if (!quickTx || !qtAutoFee) return
    if (quickTx.type === 'physical') { setQtCommission('0'); return }
    const gross = safe(qtQty) * safe(qtPrice)
    if (gross <= 0) { setQtCommission(''); return }
    setQtCommission(String(Math.round(gross * (quickTx.side === 'buy' ? FEE_BUY : FEE_SELL))))
  }, [qtQty, qtPrice, qtAutoFee, quickTx])

  const searchResults = useMemo(() => {
    const q = normFa(query)
    if (q.length < 1) return []
    // رتبه‌بندی: تطبیق دقیق نماد → شروع نماد → تطبیق دقیق/شروع نام → شامل‌بودن
    // بدون این، جستجوی «فولاد» بین ده‌ها نماد حاوی «فولاد» گم می‌شد
    const scored: { i: Instrument; score: number }[] = []
    for (const i of instruments) {
      const sym = normFa(i.symbol)
      const name = normFa(i.name)
      let score: number
      if (sym === q) score = 0
      else if (sym.startsWith(q)) score = 1
      else if (name === q) score = 2
      else if (name.startsWith(q)) score = 3
      else if (sym.includes(q)) score = 4
      else if (name.includes(q)) score = 5
      else continue
      scored.push({ i, score })
    }
    // دارایی فیزیکی بالاتر بیاید وقتی جستجو به طلا/سکه/نقره می‌خورد
    const physBoost = PHYSICAL_KEYWORDS.some(k => q.includes(normFa(k)))
    scored.sort((a, b) => {
      if (physBoost) {
        const pa = a.i.type === 'physical' ? 0 : 1
        const pb = b.i.type === 'physical' ? 0 : 1
        if (pa !== pb) return pa - pb
      }
      if (a.score !== b.score) return a.score - b.score
      return a.i.symbol.length - b.i.symbol.length
    })
    return scored.slice(0, 10).map(s => s.i)
  }, [query, instruments])

  // ─── محاسبه‌ی دارایی‌ها به روش میانگین موزون ───
  const holdings = useMemo<Holding[]>(() => {
    const map = new Map<string, Holding>()
    for (const tx of txs) {
      let h = map.get(tx.symbol)
      if (!h) {
        h = {
          symbol: tx.symbol, name: tx.name, type: tx.asset_type,
          qty: 0, totalCost: 0, avgCost: 0, realized: 0,
          price: null, changePct: null, value: null, unrealized: null, unrealizedPct: null, breakEven: 0,
        }
        map.set(tx.symbol, h)
      }
      const q = safe(tx.quantity)
      if (tx.side === 'buy') {
        h.totalCost += q * safe(tx.price) + safe(tx.commission)
        h.qty += q
      } else {
        const avg = h.qty > 0 ? h.totalCost / h.qty : 0
        const sellQty = Math.min(q, h.qty)
        const proceeds = q * safe(tx.price) - safe(tx.commission)
        h.realized += proceeds - avg * sellQty
        h.totalCost -= avg * sellQty
        h.qty -= sellQty
      }
    }
    const out: Holding[] = []
    for (const h of map.values()) {
      h.avgCost = h.qty > 0 ? h.totalCost / h.qty : 0
      // فیزیکی کارمزد فروش بورسی ندارد — سربه‌سر همان میانگین است
      h.breakEven = h.qty > 0 ? (h.type === 'physical' ? h.avgCost : h.avgCost / (1 - FEE_SELL)) : 0
      const inst = priceMap.get(h.symbol)
      // قیمت روز: آنلاین، و در نبودش قیمت دستی کاربر (هر نوع دارایی —
      // مثلاً نمادی که در دیتای روز جا افتاده یا نماد متوقف)
      const live = inst && inst.price > 0 ? inst.price : null
      const manual = safe(manualPrices[h.symbol]) || null
      const px = live ?? manual
      if (px != null) {
        h.price = px
        h.changePct = live != null && inst ? inst.changePct : null
        if (h.qty > 0) {
          h.value = h.qty * px
          h.unrealized = h.value - h.totalCost
          h.unrealizedPct = h.totalCost > 0 ? (h.unrealized / h.totalCost) * 100 : null
        }
      }
      out.push(h)
    }
    // اول دارایی‌های فعال (بزرگ‌ترین ارزش)، بعد بسته‌شده‌ها
    return out.sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
  }, [txs, priceMap, manualPrices])

  const active = holdings.filter(h => h.qty > 0)
  const closed = holdings.filter(h => h.qty <= 0 && h.realized !== 0)

  // «بهای تمام‌شده» همیشه روی همه‌ی دارایی‌های فعال است؛ «ارزش روز» و «سود/زیان باز» فقط
  // روی نمادهایی که قیمت روز دارند — قبلاً یک نماد بی‌قیمت (مثلاً صندوق‌ غیرطلا بدون فید زنده،
  // یا نماد متوقف) کل ارزش/سود‌وزیان پورتفو را «—» می‌کرد، حتی وقتی بقیه نمادها قیمت داشتند.
  const totals = useMemo(() => {
    let cost = 0, pricedCost = 0, value = 0, realized = 0, unpricedCount = 0
    for (const h of holdings) realized += h.realized
    for (const h of active) {
      cost += h.totalCost
      if (h.value == null) { unpricedCount++; continue }
      pricedCost += h.totalCost
      value += h.value
    }
    const unrealized = value - pricedCost
    return {
      cost, value, realized, unrealized,
      unrealizedPct: pricedCost > 0 ? (unrealized / pricedCost) * 100 : null,
      priced: unpricedCount === 0 && active.length > 0,
      unpricedCount,
    }
  }, [holdings, active])

  const pieData = active
    .filter(h => (h.value ?? 0) > 0)
    .map(h => ({ name: h.type === 'stock' ? h.symbol : h.name, value: h.value as number, holding: h }))

  // ─── نمودار رشد سرمایه: سرمایه‌ی درگیر تجمعی بر اساس تاریخ تراکنش ───
  const growthData = useMemo(() => {
    if (txs.length === 0) return []
    const sorted = [...txs].sort((a, b) =>
      a.trade_date === b.trade_date
        ? a.created_at.localeCompare(b.created_at)
        : a.trade_date.localeCompare(b.trade_date, undefined, { numeric: true })
    )
    const byDate = new Map<string, number>()
    let cum = 0
    for (const tx of sorted) {
      const gross = safe(tx.quantity) * safe(tx.price)
      cum += tx.side === 'buy' ? gross + safe(tx.commission) : -(gross - safe(tx.commission))
      byDate.set(tx.trade_date, cum)
    }
    return [...byDate.entries()].map(([date, invested]) => ({ date, invested }))
  }, [txs])

  // ─── عملکرد دوره‌ای: مقایسه‌ی ارزش فعلی پورتفو با نزدیک‌ترین snapshot به شروع هر بازه ───
  // مبنای مقایسه created_at واقعی (میلادی) هر snapshot است، نه رشته‌ی تاریخ شمسی —
  // چون کتابخانه‌ی تقویم جلالی در پروژه وجود ندارد و created_at قابل‌اتکاست.
  const PERIODS = [
    { key: 'week', label: 'هفتگی', days: 7 },
    { key: 'month', label: 'ماهانه', days: 30 },
    { key: 'quarter', label: 'فصلی', days: 91 },
    { key: 'year', label: 'سالیانه', days: 365 },
  ] as const

  const periodPerformance = useMemo(() => {
    const now = Date.now()
    return PERIODS.map(p => {
      const cutoff = now - p.days * 86400000
      // آخرین snapshot ثبت‌شده در یا قبل از نقطه‌ی شروع بازه
      let baseline: Snapshot | null = null
      for (const s of snapshots) {
        if (new Date(s.created_at).getTime() <= cutoff) baseline = s
        else break
      }
      if (!baseline || baseline.total_value <= 0 || totals.value <= 0) {
        return { ...p, pct: null as number | null }
      }
      const pct = ((totals.value - baseline.total_value) / baseline.total_value) * 100
      return { ...p, pct }
    })
  }, [snapshots, totals])

  const firstSnapshotDate = snapshots[0]?.snap_date ?? null

  // اسنپ‌شات شبانه (scripts/snapshot-portfolio.js) فقط یک‌بار در روز ثبت می‌شود؛
  // تا وقتی کرون آن اجرا نشده، امروز را با ارزش زنده‌ی همین لحظه (قیمت‌های priceMap) پر می‌کنیم
  // تا نمودار به‌محض بسته‌شدن بازار و لود دوباره‌ی صفحه به‌روز به نظر برسد
  const chartSnapshots = useMemo<Snapshot[]>(() => {
    const today = todayShamsi()
    if (snapshots.some(s => s.snap_date === today)) return snapshots
    if (totals.value <= 0) return snapshots
    const live: Snapshot = {
      snap_date: today, total_value: totals.value, invested_capital: totals.cost,
      created_at: new Date().toISOString(),
    }
    return [...snapshots, live]
  }, [snapshots, totals])

  // ─── ثبت تراکنش ───
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (!picked) { setMsg('یک نماد انتخاب کنید'); return }
    if (safe(qty) <= 0 || safe(price) <= 0) { setMsg('تعداد و قیمت باید بزرگ‌تر از صفر باشد'); return }
    setSaving(true)
    const { error } = await supabase.from('portfolio_transactions').insert({
      symbol: picked.symbol,
      name: picked.name,
      asset_type: picked.type,
      side,
      quantity: safe(qty),
      // فرم بر حسب تومان پر می‌شود؛ ذخیره در دیتابیس هم‌سو با رکوردهای قدیمی بر حسب ریال است
      price: tomanToRial(price),
      commission: tomanToRial(commission),
      trade_date: date || todayShamsi(),
    })
    setSaving(false)
    if (error) {
      setMsg('خطا در ثبت: ' + error.message)
    } else {
      setQty(''); setPrice(''); setCommission(''); setPicked(null); setQuery('')
      setMsg(null)
      loadTxs()
    }
  }

  // شناسایی نماد اکسل کارگزاری در لیست زنده نمادها (سهم/صندوق/فیزیکی).
  // برخی کارگزاری‌ها یک رقم اضافه (مثلاً «کارا۱») یا کاراکترهای نامرئی/فاصله انتهای نماد اضافه می‌کنند
  // که با تطبیق مستقیم جور در نمی‌آید؛ برای همین اول تطبیق دقیق و در نبودش با حذف رقم انتهایی و تطبیق روی نام امتحان می‌شود.
  const matchInstrument = (rawSymbol: string): Instrument | undefined => {
    const norm = normFa(rawSymbol)
    if (!norm) return undefined
    let inst = instruments.find(i => normFa(i.symbol) === norm)
    if (inst) return inst
    const stripped = norm.replace(/[0-9۰-۹]+$/, '').trim()
    if (stripped && stripped !== norm) {
      inst = instruments.find(i => normFa(i.symbol) === stripped)
      if (inst) return inst
    }
    inst = instruments.find(i => normFa(i.name) === norm || (stripped && normFa(i.name) === stripped))
    if (inst) return inst
    // نمادهای متوقف/بدون معامله‌ی امروز در instruments (اسنپ‌شات زنده) نیستند ولی معتبرند —
    // symbolMaster فهرست کامل بورس است، فقط بدون قیمت زنده (مثل ثبت دستی نماد)
    const master = symbolMaster.find(m => normFa(m.symbol) === norm || (stripped && normFa(m.symbol) === stripped))
    if (master) {
      const isFund = /صندوق/.test(master.name)
      return { symbol: master.symbol, name: master.name, type: isFund ? 'fund' : 'stock', price: 0, changePct: 0 }
    }
    return undefined
  }

  // ─── آپلود اکسل کارگزاری — استخراج دارایی‌های سهام از خروجی پورتفوی کارگزاری ───
  // فایل کارگزاری «موجودی/تعداد/میانگین خرید» فعلیِ هر نماد را می‌دهد، نه تک‌تک تراکنش‌ها؛
  // برای همین هر ردیف را به‌عنوان یک تراکنش خرید ترکیبی (تعداد کل × میانگین خرید) با تاریخ امروز ثبت می‌کنیم
  // تا میانگین قیمت و بهای تمام‌شده‌ی فعلی در پورتفو درست بازسازی شود.
  const parseBrokerExcel = async (file: File) => {
    setImportMsg(null)
    setImportRows([])
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // سطر هدر — اولین سطری که ستون «نماد» در آن است (ممکن است چند سطر اول فایل خالی/عنوان باشد)
      const headerIdx = rows.findIndex(r => r.some(c => normFa(String(c)).includes('نماد')))
      if (headerIdx === -1) { setImportMsg('ستون «نماد» در فایل پیدا نشد. فرمت اکسل کارگزاری را بررسی کنید.'); return }
      const header = rows[headerIdx].map(c => normFa(String(c)))
      const colOf = (...keys: string[]) => header.findIndex(h => keys.every(k => h.includes(k)))
      const cSymbol = colOf('نماد')
      const cQty = colOf('تعداد')
      const cAvgBuy = colOf('میانگین', 'خرید')
      if (cSymbol === -1 || cQty === -1 || cAvgBuy === -1) {
        setImportMsg('ستون‌های «نماد»، «تعداد» یا «میانگین خرید» در فایل پیدا نشد.')
        return
      }

      const out: typeof importRows = []
      for (const r of rows.slice(headerIdx + 1)) {
        const rawSymbol = String(r[cSymbol] ?? '').trim()
        const qty = safe(r[cQty])
        const avgBuy = safe(r[cAvgBuy])
        if (!rawSymbol || qty <= 0 || avgBuy <= 0) continue
        const inst = matchInstrument(rawSymbol)
        out.push({
          symbol: inst?.symbol ?? rawSymbol, name: inst?.name ?? rawSymbol, type: inst?.type ?? 'stock',
          qty, price: avgBuy, date: todayShamsi(), matched: !!inst,
        })
      }
      if (out.length === 0) { setImportMsg('هیچ ردیف معتبری (با تعداد و میانگین خرید مثبت) در فایل پیدا نشد.'); return }
      setImportRows(out)
    } catch (err: any) {
      setImportMsg('خطا در خواندن فایل اکسل: ' + (err?.message || String(err)))
    }
  }

  // ویرایش/حذف تک‌تک ردیف‌های پیش‌نمایش قبل از ثبت نهایی
  const updateImportRow = (idx: number, patch: Partial<typeof importRows[number]>) => {
    setImportRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }
  const removeImportRow = (idx: number) => {
    setImportRows(prev => prev.filter((_, i) => i !== idx))
  }
  // وقتی کاربر خودش نماد یک ردیف ناشناس را دستی اصلاح می‌کند، دوباره با لیست زنده تطبیق بده
  const rematchImportRow = (idx: number, newSymbol: string) => {
    const inst = matchInstrument(newSymbol)
    updateImportRow(idx, {
      symbol: inst?.symbol ?? newSymbol.trim(),
      name: inst?.name ?? newSymbol.trim(),
      type: inst?.type ?? 'stock',
      matched: !!inst,
    })
  }

  const confirmImport = async () => {
    if (importRows.length === 0) return
    setImporting(true)
    const { error } = await supabase.from('portfolio_transactions').insert(
      importRows.map(r => ({
        symbol: r.symbol,
        name: r.name,
        asset_type: r.type,
        side: 'buy',
        quantity: r.qty,
        price: r.price,          // اکسل کارگزاری از قبل بر حسب ریال است — بدون تبدیل تومان→ریال
        commission: 0,
        trade_date: r.date || todayShamsi(),
        note: 'ایمپورت از اکسل کارگزاری',
      }))
    )
    setImporting(false)
    if (error) {
      setImportMsg('خطا در ثبت: ' + error.message)
    } else {
      setImportRows([])
      setShowImport(false)
      setImportMsg(null)
      loadTxs()
    }
  }

  // ─── فروش سریع / خرید مجدد از روی ردیف دارایی ───
  const openQuickTx = (h: Holding, side: 'buy' | 'sell') => {
    setQuickTx({ symbol: h.symbol, name: h.name, type: h.type, side, maxQty: h.qty })
    setQtQty(side === 'sell' ? String(h.qty) : '')
    const livePx = h.price ?? 0
    setQtPrice(livePx > 0 ? String(toToman(livePx)) : '')
    setQtDate(todayShamsi())
    setQtAutoFee(true)
    setQtCommission('')
    setQtMsg(null)
  }

  const submitQuickTx = async () => {
    if (!quickTx) return
    setQtMsg(null)
    if (safe(qtQty) <= 0 || safe(qtPrice) <= 0) { setQtMsg('تعداد و قیمت باید بزرگ‌تر از صفر باشد'); return }
    if (quickTx.side === 'sell' && safe(qtQty) > quickTx.maxQty) {
      setQtMsg(`تعداد فروش نمی‌تواند از موجودی فعلی (${fmtNum(quickTx.maxQty)}) بیشتر باشد`)
      return
    }
    setQtSaving(true)
    const { error } = await supabase.from('portfolio_transactions').insert({
      symbol: quickTx.symbol,
      name: quickTx.name,
      asset_type: quickTx.type,
      side: quickTx.side,
      quantity: safe(qtQty),
      price: tomanToRial(qtPrice),
      commission: tomanToRial(qtCommission),
      trade_date: qtDate || todayShamsi(),
    })
    setQtSaving(false)
    if (error) { setQtMsg('خطا در ثبت: ' + error.message); return }
    setQuickTx(null)
    loadTxs()
  }

  const removeTx = async (id: number) => {
    if (!window.confirm('این تراکنش حذف شود؟')) return
    await supabase.from('portfolio_transactions').delete().eq('id', id)
    loadTxs()
  }

  const pickInstrument = (i: Instrument) => {
    setPicked(i)
    setQuery(i.type === 'stock' ? i.symbol : i.name)
    const px = i.price > 0 ? i.price : safe(manualPrices[i.symbol])
    if (px > 0 && !price) setPrice(String(toToman(px)))
  }

  // ─── خروجی Excel (دو شیت: دارایی‌ها + تراکنش‌ها) ───
  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    const holdingsSheet = XLSX.utils.aoa_to_sheet([
      ['نماد', 'نام', 'نوع', 'تعداد', 'میانگین خرید (تومان)', 'سربه‌سر (تومان)', 'قیمت روز (تومان)', 'ارزش روز (تومان)', 'سود/زیان باز (تومان)', 'سود/زیان ٪', 'سود/زیان محقق‌شده (تومان)'],
      ...holdings.map(h => [
        h.symbol, h.name,
        h.type === 'stock' ? 'سهم' : h.type === 'fund' ? 'صندوق' : 'فیزیکی',
        h.qty, toToman(h.avgCost), toToman(h.breakEven),
        h.price != null ? toToman(h.price) : '', h.value != null ? toToman(h.value) : '',
        h.unrealized != null ? toToman(h.unrealized) : '',
        h.unrealizedPct != null ? Number(h.unrealizedPct.toFixed(2)) : '',
        toToman(h.realized),
      ]),
      [],
      ['بهای تمام‌شده', toToman(totals.cost)],
      ['ارزش روز', totals.value > 0 ? toToman(totals.value) : ''],
      ['سود/زیان باز', totals.value > 0 ? toToman(totals.unrealized) : ''],
      ['سود/زیان محقق‌شده', toToman(totals.realized)],
    ])
    XLSX.utils.book_append_sheet(wb, holdingsSheet, 'دارایی‌ها')

    const txSheet = XLSX.utils.aoa_to_sheet([
      ['تاریخ', 'نماد', 'نام', 'نوع دارایی', 'خرید/فروش', 'تعداد', 'قیمت واحد (تومان)', 'کارمزد (تومان)', 'مبلغ کل (تومان)'],
      ...txs.map(tx => {
        const gross = safe(tx.quantity) * safe(tx.price)
        return [
          tx.trade_date, tx.symbol, tx.name,
          tx.asset_type === 'stock' ? 'سهم' : tx.asset_type === 'fund' ? 'صندوق' : 'فیزیکی',
          tx.side === 'buy' ? 'خرید' : 'فروش',
          safe(tx.quantity), toToman(tx.price), toToman(tx.commission),
          toToman(tx.side === 'buy' ? gross + safe(tx.commission) : gross - safe(tx.commission)),
        ]
      }),
    ])
    XLSX.utils.book_append_sheet(wb, txSheet, 'تراکنش‌ها')

    XLSX.writeFile(wb, `portfolio-${todayShamsi().replace(/\//g, '-')}.xlsx`)
  }

  // ─── خروجی PDF از راه پنجره چاپ مرورگر (فونت فارسی سیستم) ───
  const exportPdf = () => {
    const row = (cells: (string | number)[], tag = 'td') =>
      `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`
    const typeLabel = (ty: AssetType) => ty === 'stock' ? 'سهم' : ty === 'fund' ? 'صندوق' : 'فیزیکی'
    const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
<title>پورتفوی من — بورس سنج</title>
<style>
  body { font-family: Vazirmatn, Tahoma, Arial, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; } .sub { font-size: 11px; color: #666; margin-bottom: 18px; }
  h2 { font-size: 14px; margin: 20px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: right; }
  th { background: #f0f2f7; }
  .pos { color: #059669; } .neg { color: #DC2626; }
</style></head><body>
<h1>پورتفوی من — بورس سنج</h1>
<div class="sub">تاریخ گزارش: ${todayShamsi()} — bourssanj.ir</div>
<h2>خلاصه</h2>
<table>${row(['بهای تمام‌شده (تومان)', 'ارزش روز (تومان)', 'سود/زیان باز (تومان)', 'سود/زیان محقق‌شده (تومان)'], 'th')}
${row([fmtToman(totals.cost), totals.value > 0 ? fmtToman(totals.value) : '—', fmtToman(totals.unrealized), fmtToman(totals.realized)])}</table>
<h2>دارایی‌های فعال</h2>
<table>${row(['نماد', 'نوع', 'تعداد', 'میانگین خرید (تومان)', 'سربه‌سر (تومان)', 'قیمت روز (تومان)', 'ارزش روز (تومان)', 'سود/زیان (تومان)'], 'th')}
${active.map(h => row([
      h.type === 'stock' ? h.symbol : h.name, typeLabel(h.type), fmtNum(h.qty), fmtToman(h.avgCost), fmtToman(h.breakEven),
      h.price != null ? fmtToman(h.price) : '—', h.value != null ? fmtToman(h.value) : '—',
      h.unrealized != null ? `<span class="${h.unrealized >= 0 ? 'pos' : 'neg'}">${fmtToman(h.unrealized)} (${fmtPct(h.unrealizedPct, 1)})</span>` : '—',
    ])).join('')}</table>
<h2>تاریخچه تراکنش‌ها</h2>
<table>${row(['تاریخ', 'نماد', 'خرید/فروش', 'تعداد', 'قیمت (تومان)', 'کارمزد (تومان)'], 'th')}
${txs.map(tx => row([
      tx.trade_date, tx.asset_type === 'stock' ? tx.symbol : tx.name,
      tx.side === 'buy' ? 'خرید' : 'فروش', fmtNum(tx.quantity), fmtToman(tx.price), fmtToman(tx.commission),
    ])).join('')}</table>
<script>window.onload = () => { window.print() }</script>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) { alert('پنجره چاپ باز نشد — Popup Blocker را غیرفعال کنید') ; return }
    w.document.write(html)
    w.document.close()
  }

  // ─── اتصال به بات تلگرام ───
  const authHeader = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }

  const loadTelegramStatus = async () => {
    const res = await fetch('/api/telegram/link-code', { headers: await authHeader() })
    if (!res.ok) return
    const data = await res.json()
    setTgLinked(!!data.linked)
    setTgUsername(data.username ?? null)
  }

  const requestTelegramCode = async () => {
    setTgLoading(true); setTgMsg(null)
    try {
      const res = await fetch('/api/telegram/link-code', { method: 'POST', headers: await authHeader() })
      const data = await res.json()
      if (!res.ok) { setTgMsg(data.error || 'خطا در دریافت کد'); return }
      setTgCode(data.code)
    } finally {
      setTgLoading(false)
    }
  }

  const unlinkTelegram = async () => {
    setTgLoading(true); setTgMsg(null)
    try {
      const res = await fetch('/api/telegram/link-code', { method: 'DELETE', headers: await authHeader() })
      if (res.ok) { setTgLinked(false); setTgUsername(null); setTgCode(null) }
    } finally {
      setTgLoading(false)
    }
  }

  // ─── استایل‌های مشترک ───
  const card: React.CSSProperties = {
    background: t.panel, border: `1px solid ${t.border}`, borderRadius: 14,
    padding: isMobile ? 14 : 20, boxShadow: t.cardShadow,
  }
  const input: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
    background: t.inputBg, color: t.text, border: `1px solid ${t.borderStrong}`,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }
  const label: React.CSSProperties = { fontSize: 11.5, color: t.muted, marginBottom: 5, display: 'block' }
  const th: React.CSSProperties = {
    padding: '9px 10px', fontSize: 11, color: t.muted, fontWeight: 600,
    textAlign: 'right', borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    padding: '10px 10px', fontSize: 12.5, color: t.text,
    borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap',
  }
  const pnlColor = (v: number | null) => v == null ? t.muted : v > 0 ? t.green : v < 0 ? t.red : t.muted

  const page = (children: React.ReactNode) => (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      padding: isMobile ? '20px 14px 60px' : '32px 24px 80px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>{children}</div>
    </main>
  )

  if (!authChecked || (user && loading && txs.length === 0 && !dbMissing)) {
    return page(<div style={{ padding: 60, textAlign: 'center', color: t.muted }}>در حال بارگذاری…</div>)
  }

  // ورود لازم است
  if (!user) {
    return page(
      <div style={{ ...card, maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>پورتفوی من</h1>
        <p style={{ fontSize: 13, color: t.muted, lineHeight: 2, margin: '0 0 20px' }}>
          برای ساخت و مشاهده‌ی پورتفوی شخصی ابتدا وارد حساب کاربری شوید.
          پورتفوی شما فقط برای خودتان قابل مشاهده است.
        </p>
        <Link href="/auth" style={{
          display: 'inline-block', padding: '10px 28px', borderRadius: 10, fontSize: 13.5, fontWeight: 600,
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', textDecoration: 'none',
        }}>ورود / ثبت‌نام</Link>
      </div>
    )
  }

  // جدول دیتابیس ساخته نشده
  if (dbMissing) {
    return page(
      <div style={{ ...card, maxWidth: 560, margin: '80px auto', textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🛠️</div>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>راه‌اندازی اولیه لازم است</h1>
        <p style={{ fontSize: 13, color: t.muted, lineHeight: 2 }}>
          جدول پورتفوی هنوز در دیتابیس ساخته نشده. فایل
          <code style={{ margin: '0 6px', padding: '2px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: t.brand, fontSize: 12 }}>
            scripts/sql/portfolio.sql
          </code>
          را در Supabase SQL Editor اجرا کنید و صفحه را رفرش کنید.
        </p>
      </div>
    )
  }

  return page(
    <>
      {/* سربرگ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 19 : 23, fontWeight: 800, margin: 0 }}>پورتفوی من 💼</h1>
          <p style={{ fontSize: 12, color: t.muted, margin: '6px 0 0' }}>
            ثبت خرید و فروش، میانگین قیمت، سود/زیان و ترکیب دارایی — قیمت‌ها بر اساس آخرین داده‌ی سایت
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label
            title={instruments.length === 0 ? 'در حال بارگذاری لیست نمادها…' : undefined}
            style={{
              padding: '10px 16px', borderRadius: 10, fontSize: 12.5, fontWeight: 600,
              cursor: instruments.length === 0 ? 'not-allowed' : 'pointer',
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)',
              color: t.brand, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center',
              opacity: instruments.length === 0 ? 0.5 : 1,
            }}>
            {instruments.length === 0 ? '⏳ در حال بارگذاری نمادها…' : '📥 ارسال اکسل کارگزاری'}
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={instruments.length === 0}
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) { setShowImport(true); parseBrokerExcel(f) }
                e.target.value = ''
              }}
            />
          </label>
          {txs.length > 0 && (
            <>
              <button type="button" onClick={exportExcel} title="دانلود فایل اکسل" style={{
                padding: '10px 16px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)',
                color: t.green, fontFamily: 'inherit',
              }}>📄 Excel</button>
              <button type="button" onClick={exportPdf} title="چاپ / ذخیره به PDF" style={{
                padding: '10px 16px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
                color: t.red, fontFamily: 'inherit',
              }}>📄 PDF</button>
            </>
          )}
          <button
            type="button"
            onClick={() => { setShowTelegram(!showTelegram); setTgMsg(null) }}
            style={{
              padding: '10px 16px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              background: tgLinked ? 'rgba(16,185,129,0.08)' : 'rgba(59,130,246,0.08)',
              border: `1px solid ${tgLinked ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)'}`,
              color: tgLinked ? t.green : t.brand, fontFamily: 'inherit',
            }}
          >
            {tgLinked ? '✅ متصل به تلگرام' : '🤖 اتصال به بات تلگرام'}
          </button>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: showForm ? 'transparent' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: showForm ? t.brand : '#fff',
              border: showForm ? `1px solid ${t.brand}` : 'none',
              fontFamily: 'inherit',
            }}
          >
            {showForm ? 'بستن فرم' : '+ ثبت تراکنش جدید'}
          </button>
        </div>
      </div>

      {/* اتصال به بات تلگرام */}
      {showTelegram && (
        <div style={{ ...card, marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>اتصال به بات تلگرام پورتفو</h3>
            <button type="button" onClick={() => setShowTelegram(false)} style={{
              background: 'transparent', border: 'none', color: t.muted, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
            }}>✕ بستن</button>
          </div>

          {tgLinked ? (
            <div>
              <p style={{ fontSize: 12.5, color: t.text, margin: '0 0 12px' }}>
                حساب شما به تلگرام {tgUsername ? <b>@{tgUsername}</b> : 'شما'} متصل است. برای دیدن خلاصه پورتفو در تلگرام دکمه «📊 پورتفوی من» را بزنید.
              </p>
              <button type="button" onClick={unlinkTelegram} disabled={tgLoading} style={{
                padding: '9px 18px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
                color: t.red, fontFamily: 'inherit', opacity: tgLoading ? 0.6 : 1,
              }}>{tgLoading ? '...' : 'قطع اتصال'}</button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 12.5, color: t.muted, margin: '0 0 12px', lineHeight: 2 }}>
                یک کد یک‌بارمصرف بگیرید، در تلگرام بات بورس سنج را باز کنید، دکمه «🔗 اتصال حساب» را بزنید و کد را بفرستید.
              </p>
              {tgCode && (
                <div>
                  <div style={{
                    display: 'inline-block', padding: '10px 20px', borderRadius: 8, fontSize: 20, fontWeight: 800,
                    letterSpacing: '0.25em', background: t.inputBg, border: `1px solid ${t.borderStrong}`,
                    color: t.text, marginBottom: 10,
                  }}>{tgCode}</div>
                  <p style={{ fontSize: 11.5, color: t.muted, margin: '0 0 12px' }}>این کد تا ۱۰ دقیقه معتبر است.</p>
                </div>
              )}
              <button type="button" onClick={requestTelegramCode} disabled={tgLoading} style={{
                padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', border: 'none',
                fontFamily: 'inherit', opacity: tgLoading ? 0.6 : 1,
              }}>{tgLoading ? 'در حال دریافت…' : tgCode ? 'دریافت کد جدید' : 'دریافت کد اتصال'}</button>
              {tgMsg && <p style={{ fontSize: 12, color: t.red, margin: '10px 0 0' }}>{tgMsg}</p>}
            </div>
          )}
        </div>
      )}

      {/* فرم افزودن */}
      {showForm && (
        <form onSubmit={submit} style={{ ...card, marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6, 1fr)', gap: 12 }}>
            {/* جستجوی نماد */}
            <div style={{ position: 'relative', gridColumn: isMobile ? '1 / -1' : 'span 2' }}>
              <span style={label}>نماد (سهم یا صندوق)</span>
              <input
                style={input}
                value={query}
                onChange={e => { setQuery(e.target.value); setPicked(null) }}
                placeholder="مثلاً: فولاد، سکه امامی، طلای ۱۸…"
              />
              {query.trim() && !picked && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 20,
                  background: t.panelSolid, border: `1px solid ${t.borderStrong}`, borderRadius: 10,
                  marginTop: 4, overflow: 'hidden', boxShadow: t.cardShadow,
                }}>
                  {searchResults.map(i => (
                    <button
                      key={i.type + i.symbol}
                      type="button"
                      onClick={() => pickInstrument(i)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                        width: '100%', padding: '9px 12px', fontSize: 12.5, cursor: 'pointer',
                        background: 'transparent', border: 'none', borderBottom: `1px solid ${t.border}`,
                        color: t.text, fontFamily: 'inherit', textAlign: 'right',
                      }}
                    >
                      <span>
                        <b>{i.symbol}</b>
                        <span style={{ color: t.muted, marginRight: 6, fontSize: 11 }}>{i.name}</span>
                      </span>
                      <span style={{ fontSize: 11, color: t.muted }}>
                        {i.type === 'fund' ? 'صندوق' : i.type === 'physical' ? '🥇 فیزیکی' : 'سهم'}
                        {i.price > 0 && <> · {fmtToman(i.price)}</>}
                      </span>
                    </button>
                  ))}
                  {/* اگر نماد در دیتای روز نبود (مثلاً متوقف/جاافتاده) ثبت دستی ممکن باشد */}
                  {!searchResults.some(i => normFa(i.symbol) === normFa(query)) && (
                    <button
                      type="button"
                      onClick={() => pickInstrument({ symbol: query.trim(), name: query.trim(), type: 'stock', price: 0, changePct: 0 })}
                      style={{
                        display: 'block', width: '100%', padding: '9px 12px', fontSize: 12, cursor: 'pointer',
                        background: 'rgba(59,130,246,0.06)', border: 'none',
                        color: t.brand, fontFamily: 'inherit', textAlign: 'right',
                      }}
                    >
                      ➕ ثبت دستی نماد «{query.trim()}» — قیمت را خودتان وارد می‌کنید
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* جهت */}
            <div>
              <span style={label}>نوع</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['buy', 'sell'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setSide(s)} style={{
                    flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: side === s ? (s === 'buy' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)') : 'transparent',
                    color: side === s ? (s === 'buy' ? t.green : t.red) : t.muted,
                    border: `1px solid ${side === s ? (s === 'buy' ? t.green : t.red) : t.borderStrong}`,
                  }}>
                    {s === 'buy' ? 'خرید' : 'فروش'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span style={label}>تعداد</span>
              <input style={input} inputMode="numeric" value={qty} onChange={e => setQty(e.target.value.replace(/[^\d.]/g, ''))} placeholder="۱۰۰۰" />
            </div>

            <div>
              <span style={label}>قیمت واحد (تومان)</span>
              <input style={input} inputMode="numeric" value={price} onChange={e => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder={picked ? String(toToman(picked.price)) : '—'} />
            </div>

            <div>
              <span style={label}>تاریخ (شمسی)</span>
              <input style={input} value={date} onChange={e => setDate(e.target.value)} placeholder="1405/04/15" />
            </div>

            <div style={{ gridColumn: isMobile ? '1 / -1' : 'span 2' }}>
              <span style={label}>
                کارمزد (تومان)
                <label style={{ marginRight: 10, fontSize: 10.5, color: cream, cursor: 'pointer' }}>
                  <input type="checkbox" checked={autoFee} onChange={e => setAutoFee(e.target.checked)} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                  محاسبه خودکار ({picked?.type === 'physical' ? 'فیزیکی: بدون کارمزد' : side === 'buy' ? '۰٫۳۷٪ خرید' : '۰٫۸۸٪ فروش'})
                </label>
              </span>
              <input style={input} inputMode="numeric" value={commission} onChange={e => { setAutoFee(false); setCommission(e.target.value.replace(/[^\d.]/g, '')) }} placeholder="۰" />
            </div>

            <div style={{ gridColumn: isMobile ? '1 / -1' : 'span 4', display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              <button type="submit" disabled={saving} style={{
                padding: '10px 32px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', border: 'none',
                fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'در حال ثبت…' : 'ثبت تراکنش'}
              </button>
              {msg && <span style={{ fontSize: 12, color: t.red }}>{msg}</span>}
            </div>
          </div>
        </form>
      )}

      {/* پیش‌نمایش آپلود اکسل کارگزاری */}
      {showImport && (
        <div style={{ ...card, marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>پیش‌نمایش اکسل کارگزاری</h3>
            <button type="button" onClick={() => { setShowImport(false); setImportRows([]); setImportMsg(null) }} style={{
              background: 'transparent', border: 'none', color: t.muted, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
            }}>✕ بستن</button>
          </div>
          {importMsg && <p style={{ fontSize: 12.5, color: t.red, margin: '0 0 12px' }}>{importMsg}</p>}
          {importRows.length === 0 && !importMsg && (
            <p style={{ fontSize: 12.5, color: t.muted, margin: 0 }}>در حال خواندن فایل…</p>
          )}
          {importRows.length > 0 && (
            <>
              <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>نماد</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>تعداد</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>میانگین خرید (تومان)</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>تاریخ خرید</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>وضعیت</th>
                      <th style={{ padding: '6px 8px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, idx) => (
                      <tr key={idx} style={{ borderBottom: `1px solid ${t.border}` }}>
                        <td style={{ padding: '6px 8px', minWidth: 160 }}>
                          {r.matched ? (
                            <>
                              <b>{r.symbol}</b>
                              {r.name !== r.symbol && <span style={{ color: t.muted, marginRight: 6, fontSize: 11 }}>{r.name}</span>}
                            </>
                          ) : (
                            <input
                              value={r.symbol}
                              onChange={e => updateImportRow(idx, { symbol: e.target.value })}
                              onBlur={e => rematchImportRow(idx, e.target.value)}
                              placeholder="نماد را اصلاح کنید"
                              style={{ ...input, padding: '5px 8px', fontSize: 12, border: `1px solid ${t.red}` }}
                            />
                          )}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            inputMode="numeric"
                            value={r.qty}
                            onChange={e => updateImportRow(idx, { qty: safe(e.target.value.replace(/[^\d.]/g, '')) })}
                            style={{ ...input, padding: '5px 8px', fontSize: 12, width: 100 }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            inputMode="numeric"
                            value={toToman(r.price)}
                            onChange={e => updateImportRow(idx, { price: tomanToRial(e.target.value.replace(/[^\d.]/g, '')) })}
                            style={{ ...input, padding: '5px 8px', fontSize: 12, width: 100 }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            value={r.date}
                            onChange={e => updateImportRow(idx, { date: e.target.value })}
                            placeholder="1405/04/15"
                            style={{ ...input, padding: '5px 8px', fontSize: 12, width: 100 }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', color: r.matched ? t.green : t.red, whiteSpace: 'nowrap' }}>
                          {r.matched ? 'شناسایی‌شده' : 'نماد ناشناس'}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <button
                            type="button"
                            onClick={() => removeImportRow(idx)}
                            title="حذف این ردیف"
                            style={{
                              background: 'transparent', border: 'none', color: t.red, cursor: 'pointer',
                              fontSize: 14, fontFamily: 'inherit', padding: 4,
                            }}
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 11.5, color: t.muted, margin: '0 0 12px', lineHeight: 1.9 }}>
                هر ردیف به‌عنوان یک تراکنش «خرید» بدون کارمزد به پورتفوی شما اضافه می‌شود — تاریخ پیش‌فرض امروز است،
                اگر واقعاً قبل‌تر خریده‌اید تاریخ واقعی خرید را در ستون «تاریخ خرید» اصلاح کنید تا نمودار رشد سرمایه درست باشد.
                اگر قبلاً تراکنشی برای این نمادها ثبت کرده‌اید، این مقدار روی آن جمع می‌شود، جایگزینش نمی‌کند.
                ردیف‌های «نماد ناشناس» را می‌توانید قبل از تایید، ویرایش یا حذف کنید.
              </p>
              <button type="button" onClick={confirmImport} disabled={importing} style={{
                padding: '10px 28px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', border: 'none',
                fontFamily: 'inherit', opacity: importing ? 0.6 : 1,
              }}>
                {importing ? 'در حال ثبت…' : `تایید و افزودن ${importRows.length} ردیف`}
              </button>
            </>
          )}
        </div>
      )}

      {/* کارت‌های خلاصه */}
      <div style={{
        display: 'grid', gap: 12, marginBottom: 22,
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
      }}>
        {[
          { title: 'بهای تمام‌شده', value: fmtToman(totals.cost) + ' تومان', pct: null as string | null, color: t.text },
          { title: 'ارزش روز پورتفو', value: totals.value > 0 ? fmtToman(totals.value) + ' تومان' : '—', pct: null as string | null, color: t.brand },
          {
            title: 'سود/زیان باز',
            value: totals.value > 0 ? fmtToman(totals.unrealized) + ' تومان' : '—',
            pct: totals.value > 0 ? fmtPct(totals.unrealizedPct, 1) : null,
            color: pnlColor(totals.unrealized),
          },
          { title: 'سود/زیان محقق‌شده', value: fmtToman(totals.realized) + ' تومان', pct: null as string | null, color: pnlColor(totals.realized) },
        ].map(c => (
          <div key={c.title} style={{ ...card, padding: isMobile ? '12px 14px' : '16px 18px' }}>
            <div style={{ fontSize: 11, color: t.muted, marginBottom: 8 }}>{c.title}</div>
            <div style={{ fontSize: isMobile ? 13.5 : 16, fontWeight: 700, color: c.color, direction: 'ltr', textAlign: 'right' }}>
              {c.value}
              {c.pct != null && <span style={{ fontSize: 12, marginRight: 10, opacity: 0.85 }}>({c.pct})</span>}
            </div>
          </div>
        ))}
      </div>
      {/* بعضی نمادها (صندوق‌های غیرطلا، نمادهای متوقف) قیمت روز در سایت ندارند —
          ارزش/سود‌وزیان بالا فقط روی نمادهای قیمت‌دار محاسبه شده، نه کل پورتفو */}
      {totals.unpricedCount > 0 && (
        <p style={{ fontSize: 11.5, color: t.muted, margin: '-14px 0 22px', lineHeight: 1.9 }}>
          ⚠️ {fmtNum(totals.unpricedCount)} نماد از دارایی‌های شما قیمت روز در سایت ندارند (صندوق غیرطلا یا نماد متوقف)؛
          ارزش روز و سود/زیان باز فقط برای بقیه‌ی نمادها محاسبه شده. برای این نمادها می‌توانید در جدول زیر قیمت را دستی ثبت کنید.
        </p>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: isMobile || pieData.length === 0 ? '1fr' : '2fr 1fr', alignItems: 'start' }}>
        {/* جدول دارایی‌ها */}
        <div style={{ ...card, overflowX: 'auto' }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 700, margin: '0 0 12px' }}>دارایی‌های فعال</h2>
          {active.length === 0 ? (
            <p style={{ fontSize: 12.5, color: t.muted, padding: '20px 0', textAlign: 'center' }}>
              هنوز دارایی‌ای ثبت نکرده‌اید — با «ثبت تراکنش جدید» شروع کنید.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>نماد</th>
                  <th style={th}>تعداد</th>
                  <th style={th}>میانگین خرید</th>
                  <th style={th}>سربه‌سر</th>
                  <th style={th}>قیمت روز</th>
                  <th style={th}>ارزش روز</th>
                  <th style={th}>سود/زیان</th>
                  <th style={th}>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {active.map(h => (
                  <tr key={h.symbol}>
                    <td style={td}>
                      {h.type === 'stock'
                        ? <Link href={`/stock/${encodeURIComponent(h.symbol)}`} style={{ color: t.brand, textDecoration: 'none', fontWeight: 600 }}>{h.symbol}</Link>
                        : h.type === 'fund'
                          ? <Link href={`/fund/${encodeURIComponent(h.symbol)}`} style={{ color: t.brand, textDecoration: 'none', fontWeight: 600 }}>{h.name}</Link>
                          : <span style={{ fontWeight: 600 }}>🥇 {h.name}</span>}
                      <div style={{ fontSize: 10, color: cream, marginTop: 2 }}>
                        {h.type === 'fund' ? 'صندوق' : h.type === 'physical' ? 'دارایی فیزیکی' : h.name}
                      </div>
                    </td>
                    <td style={td}>{fmtNum(h.qty)}</td>
                    <td style={td}>{fmtToman(h.avgCost)}</td>
                    <td style={{ ...td, color: t.muted }}>{fmtToman(h.breakEven)}</td>
                    <td style={td}>
                      {(priceMap.get(h.symbol)?.price ?? 0) <= 0 ? (
                        // قیمت آنلاین در دسترس نیست — ورودی قیمت دستی (در مرورگر ذخیره می‌شود)
                        <input
                          style={{ ...input, width: 110, padding: '5px 8px', fontSize: 11.5 }}
                          inputMode="numeric"
                          defaultValue={manualPrices[h.symbol] ? toToman(manualPrices[h.symbol]) : ''}
                          placeholder="قیمت دستی…"
                          title="قیمت روز را دستی وارد کنید (تومان)"
                          onBlur={e => setManualPrice(h.symbol, tomanToRial(e.target.value.replace(/[^\d.]/g, '')))}
                        />
                      ) : (
                        <>
                          {h.price != null ? fmtToman(h.price) : '—'}
                          {h.changePct != null && (
                            <span style={{ fontSize: 10.5, marginRight: 9, color: pnlColor(h.changePct) }}>({fmtPct(h.changePct, 1)})</span>
                          )}
                        </>
                      )}
                    </td>
                    <td style={td}>{h.value != null ? fmtToman(h.value) : '—'}</td>
                    <td style={{ ...td, color: pnlColor(h.unrealized), fontWeight: 600 }}>
                      {h.unrealized != null ? <>{fmtToman(h.unrealized)}<span style={{ fontSize: 10.5, marginRight: 9, opacity: 0.85 }}>({fmtPct(h.unrealizedPct, 1)})</span></> : '—'}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => openQuickTx(h, 'sell')} style={{
                          padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          background: 'rgba(239,68,68,0.08)', border: `1px solid ${t.red}`, color: t.red, fontFamily: 'inherit',
                        }}>فروش</button>
                        <button type="button" onClick={() => openQuickTx(h, 'buy')} style={{
                          padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          background: 'rgba(16,185,129,0.08)', border: `1px solid ${t.green}`, color: t.green, fontFamily: 'inherit',
                        }}>خرید مجدد</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {closed.length > 0 && (
            <>
              <h2 style={{ fontSize: 13.5, fontWeight: 700, margin: '22px 0 10px', color: t.muted }}>موقعیت‌های بسته‌شده</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>نماد</th>
                    <th style={th}>سود/زیان محقق‌شده</th>
                  </tr>
                </thead>
                <tbody>
                  {closed.map(h => (
                    <tr key={h.symbol}>
                      <td style={td}>{h.symbol}</td>
                      <td style={{ ...td, color: pnlColor(h.realized), fontWeight: 600 }}>{fmtToman(h.realized)} تومان</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* نمودار ترکیب دارایی */}
        {pieData.length > 0 && (
          <div style={card}>
            <h2 style={{ fontSize: 14.5, fontWeight: 700, margin: '0 0 4px' }}>ترکیب پورتفو</h2>
            <p style={{ fontSize: 10.5, color: t.muted, margin: '0 0 6px' }}>روی هر برش کلیک کنید تا جزئیات دارایی باز شود</p>
            <div style={{ width: '100%', height: 230, direction: 'ltr' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={3}
                    stroke="none"
                    isAnimationActive
                    animationDuration={900}
                    animationEasing="ease-out"
                    activeShape={renderActivePieShape}
                    onMouseEnter={(_: any, idx: number) => setPieActiveIdx(idx)}
                    onMouseLeave={() => setPieActiveIdx(undefined)}
                    onClick={(entry: any) => setPieSelected(entry.holding ?? entry.payload?.holding ?? null)}
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} style={{ cursor: 'pointer' }} />
                    ))}
                  </Pie>
                  <ReTooltip
                    formatter={(v: any, n: any) => [`${fmtToman(v)} تومان`, n]}
                    contentStyle={{ background: t.panelSolid, border: `1px solid ${t.borderStrong}`, borderRadius: 10, fontSize: 12, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {pieData.map((p, idx) => {
                const pct = totals.value > 0 ? (p.value / totals.value) * 100 : 0
                return (
                  <div
                    key={p.name}
                    onClick={() => setPieSelected(p.holding)}
                    onMouseEnter={() => setPieActiveIdx(idx)}
                    onMouseLeave={() => setPieActiveIdx(undefined)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5,
                      cursor: 'pointer', borderRadius: 6, padding: '3px 6px', margin: '0 -6px',
                      background: pieActiveIdx === idx ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
                      transition: 'background 150ms ease',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.text }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: PIE_COLORS[idx % PIE_COLORS.length], display: 'inline-block' }} />
                      {p.name}
                    </span>
                    <span style={{ color: t.muted }}>{pct.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* مودال جزئیات دارایی — با کلیک روی برش یا ردیف چارت ترکیب پورتفو */}
      {pieSelected && (() => {
        const h = pieSelected
        const pct = totals.value > 0 ? ((h.value ?? 0) / totals.value) * 100 : 0
        const rows: [string, string, React.CSSProperties?][] = [
          ['تعداد', fmtNum(h.qty)],
          ['میانگین خرید', `${fmtToman(h.avgCost)} تومان`],
          ['سربه‌سر', `${fmtToman(h.breakEven)} تومان`],
          ['قیمت روز', h.price != null ? `${fmtToman(h.price)} تومان` : '—'],
          ['ارزش روز', h.value != null ? `${fmtToman(h.value)} تومان` : '—'],
          ['سهم از پورتفو', `${pct.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`],
          ['سود/زیان باز', h.unrealized != null ? `${fmtToman(h.unrealized)} تومان (${fmtPct(h.unrealizedPct, 1)})` : '—', { color: pnlColor(h.unrealized), fontWeight: 700 }],
        ]
        return (
          <div
            onClick={() => setPieSelected(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                ...card, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
                animation: 'portfolioPopIn 180ms ease-out',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{h.type === 'stock' ? h.symbol : h.name}</div>
                  <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>
                    {h.type === 'fund' ? 'صندوق' : h.type === 'physical' ? 'دارایی فیزیکی' : h.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPieSelected(null)}
                  aria-label="بستن"
                  style={{
                    width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 15,
                    background: 'transparent', border: `1px solid ${t.borderStrong}`, color: t.muted, fontFamily: 'inherit',
                  }}
                >✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rows.map(([k, v, extra]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: t.muted }}>{k}</span>
                    <span style={{ direction: 'ltr', ...extra }}>{v}</span>
                  </div>
                ))}
              </div>
              {h.type === 'stock' && (
                <Link href={`/stock/${encodeURIComponent(h.symbol)}`} style={{
                  display: 'block', textAlign: 'center', marginTop: 16, padding: '9px 0', borderRadius: 10,
                  fontSize: 12.5, fontWeight: 600, color: t.brand, textDecoration: 'none', border: `1px solid ${t.brand}`,
                }}>مشاهده صفحه نماد ←</Link>
              )}
              {h.type === 'fund' && (
                <Link href={`/fund/${encodeURIComponent(h.symbol)}`} style={{
                  display: 'block', textAlign: 'center', marginTop: 16, padding: '9px 0', borderRadius: 10,
                  fontSize: 12.5, fontWeight: 600, color: t.brand, textDecoration: 'none', border: `1px solid ${t.brand}`,
                }}>مشاهده صفحه صندوق ←</Link>
              )}
            </div>
            <style>{`@keyframes portfolioPopIn { from { opacity: 0; transform: scale(0.94) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }`}</style>
          </div>
        )
      })()}

      {/* عملکرد دوره‌ای پورتفو */}
      {active.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 700, margin: '0 0 4px' }}>📊 عملکرد پورتفو</h2>
          <p style={{ fontSize: 11, color: t.muted, margin: '0 0 14px' }}>
            درصد تغییر ارزش پورتفو نسبت به هر بازه — بر پایه‌ی ثبت روزانه‌ی ارزش (از {firstSnapshotDate ? firstSnapshotDate : 'اولین ثبت روزانه'} به بعد)
          </p>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)' }}>
            {periodPerformance.map(p => (
              <div key={p.key} style={{ background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: t.muted, marginBottom: 8 }}>{p.label}</div>
                {p.pct == null ? (
                  <div style={{ fontSize: 11, color: t.muted }}>داده کافی نیست</div>
                ) : (
                  <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: pnlColor(p.pct), direction: 'ltr' }}>
                    {fmtPct(p.pct, 1)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* نمودار روند واقعی ارزش پورتفو — بر پایه‌ی snapshot روزانه (نه سرمایه‌ی سرمایه‌گذاری‌شده) */}
      {active.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 700, margin: '0 0 4px' }}>📉 روند واقعی ارزش پورتفو</h2>
          {chartSnapshots.length > 1 ? (
            <>
              <p style={{ fontSize: 11, color: t.muted, margin: '0 0 12px' }}>
                ارزش روز پورتفو بر اساس ثبت‌های روزانه — برخلاف چارت «رشد سرمایه» زیر، این خط قیمت واقعی بازار را نشان می‌دهد
                {chartSnapshots.length > snapshots.length && ' — نقطه‌ی امروز بر اساس قیمت لحظه‌ای است تا ثبت شبانه انجام شود'}
              </p>
              <div style={{ width: '100%', height: 260, direction: 'ltr' }}>
                <ResponsiveContainer>
                  <AreaChart data={chartSnapshots} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={t.green} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={t.green} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={t.border} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="snap_date" tick={{ fontSize: 10, fill: t.muted, fontFamily: 'Vazirmatn, Arial, sans-serif' }} tickMargin={8} />
                    <YAxis
                      tick={{ fontSize: 10, fill: t.muted }}
                      tickFormatter={(v: number) => { const tm = v / RIAL_PER_TOMAN; return tm >= 1e9 ? `${(tm / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مـ` : tm >= 1e6 ? `${(tm / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} م` : fmtToman(v) }}
                      width={70}
                      orientation="right"
                    />
                    <ReTooltip
                      formatter={(v: any) => [`${fmtToman(v)} تومان`, 'ارزش پورتفو']}
                      labelFormatter={(l: any) => `تاریخ: ${l}`}
                      contentStyle={{ background: t.panelSolid, border: `1px solid ${t.borderStrong}`, borderRadius: 10, fontSize: 12, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}
                    />
                    <Area type="monotone" dataKey="total_value" stroke={t.green} strokeWidth={2} fill="url(#trendFill)" isAnimationActive animationDuration={900} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12, color: t.muted, padding: '16px 0' }}>
              این چارت بعد از ثبت روزانه‌ی چند روز ارزش پورتفو (کرون شبانه) تکمیل می‌شود — هنوز داده‌ی کافی ثبت نشده.
            </p>
          )}
        </div>
      )}

      {/* نمودار رشد سرمایه */}
      {growthData.length > 1 && (
        <div style={{ ...card, marginTop: 16 }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 700, margin: '0 0 4px' }}>📈 رشد سرمایه</h2>
          <p style={{ fontSize: 11, color: t.muted, margin: '0 0 12px' }}>
            سرمایه‌ی درگیر تجمعی (خریدها منهای فروش‌ها) بر اساس تاریخ تراکنش
            {totals.priced && ' — خط‌چین: ارزش روز فعلی پورتفو'}
          </p>
          <div style={{ width: '100%', height: 260, direction: 'ltr' }}>
            <ResponsiveContainer>
              <AreaChart data={growthData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={t.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: t.muted, fontFamily: 'Vazirmatn, Arial, sans-serif' }} tickMargin={8} />
                <YAxis
                  tick={{ fontSize: 10, fill: t.muted }}
                  tickFormatter={(v: number) => { const tm = v / RIAL_PER_TOMAN; return tm >= 1e9 ? `${(tm / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مـ` : tm >= 1e6 ? `${(tm / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} م` : fmtToman(v) }}
                  width={70}
                  orientation="right"
                />
                <ReTooltip
                  formatter={(v: any) => [`${fmtToman(v)} تومان`, 'سرمایه درگیر']}
                  labelFormatter={(l: any) => `تاریخ: ${l}`}
                  contentStyle={{ background: t.panelSolid, border: `1px solid ${t.borderStrong}`, borderRadius: 10, fontSize: 12, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}
                />
                {totals.priced && totals.value > 0 && (
                  <ReferenceLine y={totals.value} stroke={t.green} strokeDasharray="6 4" />
                )}
                <Area type="stepAfter" dataKey="invested" stroke="#3b82f6" strokeWidth={2} fill="url(#growthFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* تاریخچه تراکنش‌ها */}
      {txs.length > 0 && (
        <div style={{ ...card, marginTop: 16, overflowX: 'auto' }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 700, margin: '0 0 12px' }}>تاریخچه تراکنش‌ها</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>تاریخ</th>
                <th style={th}>نماد</th>
                <th style={th}>نوع</th>
                <th style={th}>تعداد</th>
                <th style={th}>قیمت</th>
                <th style={th}>کارمزد</th>
                <th style={th}>مبلغ کل</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {[...txs].reverse().map(tx => {
                const gross = safe(tx.quantity) * safe(tx.price)
                const total = tx.side === 'buy' ? gross + safe(tx.commission) : gross - safe(tx.commission)
                return (
                  <tr key={tx.id}>
                    <td style={{ ...td, color: t.muted, fontSize: 11.5 }}>{tx.trade_date}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{tx.asset_type === 'stock' ? tx.symbol : tx.name}</td>
                    <td style={{ ...td, color: tx.side === 'buy' ? t.green : t.red, fontWeight: 600 }}>
                      {tx.side === 'buy' ? 'خرید' : 'فروش'}
                    </td>
                    <td style={td}>{fmtNum(tx.quantity)}</td>
                    <td style={td}>{fmtToman(tx.price)}</td>
                    <td style={{ ...td, color: t.muted }}>{fmtToman(tx.commission)}</td>
                    <td style={td}>{fmtToman(total)}</td>
                    <td style={td}>
                      <button type="button" onClick={() => removeTx(tx.id)} title="حذف" style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                        background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
                        color: t.red, fontFamily: 'inherit',
                      }}>حذف</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* مودال فروش سریع / خرید مجدد از روی ردیف دارایی */}
      {quickTx && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => setQuickTx(null)}
        >
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 420 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>
              {quickTx.side === 'sell' ? '📤 فروش' : '📥 خرید مجدد'} {quickTx.symbol}
            </h3>
            <p style={{ fontSize: 11.5, color: t.muted, margin: '0 0 16px', lineHeight: 1.9 }}>
              {quickTx.side === 'sell'
                ? `موجودی فعلی: ${fmtNum(quickTx.maxQty)} — مبلغ فروش به‌عنوان سود/زیان محقق‌شده در پورتفو ثبت می‌شود.`
                : 'میانگین خرید و تعداد این دارایی به‌صورت خودکار بر اساس این خرید به‌روزرسانی می‌شود.'}
            </p>
            <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
              <div>
                <span style={label}>تعداد {quickTx.side === 'sell' ? `(حداکثر ${fmtNum(quickTx.maxQty)})` : ''}</span>
                <input style={input} inputMode="numeric" value={qtQty} onChange={e => setQtQty(e.target.value.replace(/[^\d.]/g, ''))} />
              </div>
              <div>
                <span style={label}>قیمت واحد (تومان)</span>
                <input style={input} inputMode="numeric" value={qtPrice} onChange={e => setQtPrice(e.target.value.replace(/[^\d.]/g, ''))} />
              </div>
              <div>
                <span style={label}>تاریخ (شمسی)</span>
                <input style={input} value={qtDate} onChange={e => setQtDate(e.target.value)} placeholder="1405/04/15" />
              </div>
              <div>
                <span style={label}>
                  کارمزد (تومان)
                  <label style={{ marginRight: 10, fontSize: 10.5, color: cream, cursor: 'pointer' }}>
                    <input type="checkbox" checked={qtAutoFee} onChange={e => setQtAutoFee(e.target.checked)} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                    محاسبه خودکار
                  </label>
                </span>
                <input style={input} inputMode="numeric" value={qtCommission} onChange={e => { setQtAutoFee(false); setQtCommission(e.target.value.replace(/[^\d.]/g, '')) }} />
              </div>
            </div>
            {qtMsg && <p style={{ fontSize: 12, color: t.red, margin: '0 0 12px' }}>{qtMsg}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={submitQuickTx} disabled={qtSaving} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: quickTx.side === 'sell' ? 'linear-gradient(135deg, #ef4444, #f97316)' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: '#fff', border: 'none', fontFamily: 'inherit', opacity: qtSaving ? 0.6 : 1,
              }}>
                {qtSaving ? 'در حال ثبت…' : quickTx.side === 'sell' ? 'ثبت فروش' : 'ثبت خرید'}
              </button>
              <button type="button" onClick={() => setQuickTx(null)} style={{
                padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${t.borderStrong}`, color: t.muted, fontFamily: 'inherit',
              }}>انصراف</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
