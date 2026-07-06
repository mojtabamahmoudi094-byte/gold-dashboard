'use client'

/**
 * پورتفوی من — مدیریت شخصی سبد دارایی (الهام از PortfolioPlus)
 * هر کاربر تراکنش‌های خرید/فروش خودش را ثبت می‌کند؛ میانگین خرید، بهای تمام‌شده،
 * ارزش روز، سود/زیان محقق‌شده و محقق‌نشده و نقطه سربه‌سر محاسبه می‌شود.
 * قیمت لحظه‌ای سهام از /stocks/industries.json و صندوق‌ها از /api/funds می‌آید.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../../lib/supabase'
import { darkTheme, lightTheme } from '../../lib/theme'
import { useIsMobile } from '../../lib/useIsMobile'
import { safe, fmtNum, fmtPct } from '../../lib/format'

type Instrument = {
  symbol: string        // l18 برای سهام، slug برای صندوق
  name: string
  type: 'stock' | 'fund'
  price: number         // آخرین قیمت (ریال)
  changePct: number
}

type Tx = {
  id: number
  symbol: string
  name: string
  asset_type: 'stock' | 'fund'
  side: 'buy' | 'sell'
  quantity: number
  price: number
  commission: number
  trade_date: string
  created_at: string
}

type Holding = {
  symbol: string
  name: string
  type: 'stock' | 'fund'
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

// نرخ کارمزد تقریبی بورس تهران (خرید/فروش سهام)
const FEE_BUY = 0.003712
const FEE_SELL = 0.0088

const todayShamsi = () =>
  new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())

const fmtRial = (v: any) => safe(v).toLocaleString('fa-IR', { maximumFractionDigits: 0 })

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1']

export default function PortfolioPage() {
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  const t = isDark ? darkTheme : lightTheme

  const [user, setUser] = useState<any>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)
  const [dbMissing, setDbMissing] = useState(false)

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

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'light') setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)

    supabase.auth.getUser().then(({ data }) => { setUser(data.user ?? null); setAuthChecked(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setUser(s?.user ?? null))

    setDate(todayShamsi())

    return () => {
      window.removeEventListener('themechange', handler)
      subscription.unsubscribe()
    }
  }, [])

  // قیمت‌های روز: سهام + صندوق‌ها
  useEffect(() => {
    const load = async () => {
      const list: Instrument[] = []
      try {
        const res = await fetch('/stocks/industries.json')
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
      setInstruments(list)
    }
    load()
  }, [])

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

  useEffect(() => {
    if (user) loadTxs()
    else if (authChecked) setLoading(false)
  }, [user, authChecked])

  const priceMap = useMemo(() => {
    const m = new Map<string, Instrument>()
    for (const i of instruments) m.set(i.symbol, i)
    return m
  }, [instruments])

  // کارمزد خودکار وقتی تعداد/قیمت/جهت عوض می‌شود
  useEffect(() => {
    if (!autoFee) return
    const gross = safe(qty) * safe(price)
    if (gross <= 0) { setCommission(''); return }
    setCommission(String(Math.round(gross * (side === 'buy' ? FEE_BUY : FEE_SELL))))
  }, [qty, price, side, autoFee])

  const searchResults = useMemo(() => {
    const q = query.trim()
    if (q.length < 1) return []
    return instruments
      .filter(i => i.symbol.includes(q) || i.name.includes(q))
      .slice(0, 8)
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
      h.breakEven = h.qty > 0 ? h.avgCost / (1 - FEE_SELL) : 0
      const inst = priceMap.get(h.symbol)
      if (inst && inst.price > 0) {
        h.price = inst.price
        h.changePct = inst.changePct
        if (h.qty > 0) {
          h.value = h.qty * inst.price
          h.unrealized = h.value - h.totalCost
          h.unrealizedPct = h.totalCost > 0 ? (h.unrealized / h.totalCost) * 100 : null
        }
      }
      out.push(h)
    }
    // اول دارایی‌های فعال (بزرگ‌ترین ارزش)، بعد بسته‌شده‌ها
    return out.sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
  }, [txs, priceMap])

  const active = holdings.filter(h => h.qty > 0)
  const closed = holdings.filter(h => h.qty <= 0 && h.realized !== 0)

  const totals = useMemo(() => {
    let cost = 0, value = 0, realized = 0
    let priced = true
    for (const h of holdings) realized += h.realized
    for (const h of active) {
      cost += h.totalCost
      if (h.value == null) priced = false
      else value += h.value
    }
    const unrealized = value - cost
    return {
      cost, value, realized, unrealized,
      unrealizedPct: cost > 0 ? (unrealized / cost) * 100 : null,
      priced,
    }
  }, [holdings, active])

  const pieData = active
    .filter(h => (h.value ?? 0) > 0)
    .map(h => ({ name: h.symbol, value: h.value as number }))

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
      price: safe(price),
      commission: safe(commission),
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

  const removeTx = async (id: number) => {
    if (!window.confirm('این تراکنش حذف شود؟')) return
    await supabase.from('portfolio_transactions').delete().eq('id', id)
    loadTxs()
  }

  const pickInstrument = (i: Instrument) => {
    setPicked(i)
    setQuery(i.symbol)
    if (i.price > 0 && !price) setPrice(String(i.price))
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
                placeholder="مثلاً: فولاد، طلا…"
              />
              {query && !picked && searchResults.length > 0 && (
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
                        {i.type === 'fund' ? 'صندوق' : 'سهم'} · {fmtRial(i.price)}
                      </span>
                    </button>
                  ))}
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
              <span style={label}>قیمت واحد (ریال)</span>
              <input style={input} inputMode="numeric" value={price} onChange={e => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder={picked ? String(picked.price) : '—'} />
            </div>

            <div>
              <span style={label}>تاریخ (شمسی)</span>
              <input style={input} value={date} onChange={e => setDate(e.target.value)} placeholder="1405/04/15" />
            </div>

            <div style={{ gridColumn: isMobile ? '1 / -1' : 'span 2' }}>
              <span style={label}>
                کارمزد (ریال)
                <label style={{ marginRight: 10, fontSize: 10.5, color: t.faint, cursor: 'pointer' }}>
                  <input type="checkbox" checked={autoFee} onChange={e => setAutoFee(e.target.checked)} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                  محاسبه خودکار ({side === 'buy' ? '۰٫۳۷٪ خرید' : '۰٫۸۸٪ فروش'})
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

      {/* کارت‌های خلاصه */}
      <div style={{
        display: 'grid', gap: 12, marginBottom: 22,
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
      }}>
        {[
          { title: 'بهای تمام‌شده', value: fmtRial(totals.cost) + ' ریال', color: t.text },
          { title: 'ارزش روز پورتفو', value: totals.priced ? fmtRial(totals.value) + ' ریال' : '—', color: t.brand },
          {
            title: 'سود/زیان باز',
            value: totals.priced ? `${fmtRial(totals.unrealized)} (${fmtPct(totals.unrealizedPct, 1)})` : '—',
            color: pnlColor(totals.unrealized),
          },
          { title: 'سود/زیان محقق‌شده', value: fmtRial(totals.realized) + ' ریال', color: pnlColor(totals.realized) },
        ].map(c => (
          <div key={c.title} style={{ ...card, padding: isMobile ? '12px 14px' : '16px 18px' }}>
            <div style={{ fontSize: 11, color: t.muted, marginBottom: 8 }}>{c.title}</div>
            <div style={{ fontSize: isMobile ? 13.5 : 16, fontWeight: 700, color: c.color, direction: 'ltr', textAlign: 'right' }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

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
                </tr>
              </thead>
              <tbody>
                {active.map(h => (
                  <tr key={h.symbol}>
                    <td style={td}>
                      {h.type === 'stock'
                        ? <Link href={`/stock/${encodeURIComponent(h.symbol)}`} style={{ color: t.brand, textDecoration: 'none', fontWeight: 600 }}>{h.symbol}</Link>
                        : <Link href={`/fund/${encodeURIComponent(h.symbol)}`} style={{ color: t.brand, textDecoration: 'none', fontWeight: 600 }}>{h.name}</Link>}
                      <div style={{ fontSize: 10, color: t.faint, marginTop: 2 }}>{h.type === 'fund' ? 'صندوق' : h.name}</div>
                    </td>
                    <td style={td}>{fmtNum(h.qty)}</td>
                    <td style={td}>{fmtRial(h.avgCost)}</td>
                    <td style={{ ...td, color: t.muted }}>{fmtRial(h.breakEven)}</td>
                    <td style={td}>
                      {h.price != null ? fmtRial(h.price) : '—'}
                      {h.changePct != null && (
                        <span style={{ fontSize: 10.5, marginRight: 5, color: pnlColor(h.changePct) }}>{fmtPct(h.changePct, 1)}</span>
                      )}
                    </td>
                    <td style={td}>{h.value != null ? fmtRial(h.value) : '—'}</td>
                    <td style={{ ...td, color: pnlColor(h.unrealized), fontWeight: 600 }}>
                      {h.unrealized != null ? <>{fmtRial(h.unrealized)}<span style={{ fontSize: 10.5, marginRight: 5 }}>{fmtPct(h.unrealizedPct, 1)}</span></> : '—'}
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
                      <td style={{ ...td, color: pnlColor(h.realized), fontWeight: 600 }}>{fmtRial(h.realized)} ریال</td>
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
            <div style={{ width: '100%', height: 230, direction: 'ltr' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
                    {pieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                  </Pie>
                  <ReTooltip
                    formatter={(v: any, n: any) => [`${fmtRial(v)} ریال`, n]}
                    contentStyle={{ background: t.panelSolid, border: `1px solid ${t.borderStrong}`, borderRadius: 10, fontSize: 12, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {pieData.map((p, idx) => {
                const pct = totals.value > 0 ? (p.value / totals.value) * 100 : 0
                return (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5 }}>
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
                    <td style={{ ...td, fontWeight: 600 }}>{tx.asset_type === 'fund' ? tx.name : tx.symbol}</td>
                    <td style={{ ...td, color: tx.side === 'buy' ? t.green : t.red, fontWeight: 600 }}>
                      {tx.side === 'buy' ? 'خرید' : 'فروش'}
                    </td>
                    <td style={td}>{fmtNum(tx.quantity)}</td>
                    <td style={td}>{fmtRial(tx.price)}</td>
                    <td style={{ ...td, color: t.muted }}>{fmtRial(tx.commission)}</td>
                    <td style={td}>{fmtRial(total)}</td>
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
    </>
  )
}
