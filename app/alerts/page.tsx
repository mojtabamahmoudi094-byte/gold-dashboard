'use client'

/**
 * هشدارهای قیمت/حباب — کاربر برای سهم، صندوق یا حباب بازار طلا/نقره یک هدف تعیین می‌کند
 * و با رسیدن قیمت/حباب به آن هدف، پیام تلگرام دریافت می‌کند (نیازمند اتصال بات پورتفوی از /portfolio).
 * چک‌کردن دوره‌ای و ارسال پیام توسط scripts/alert-watch.js روی سرور (cron) انجام می‌شود، نه این صفحه.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AuthGate from '../../components/AuthGate'
import { supabase } from '../../lib/supabase'
import { darkTheme, lightTheme } from '../../lib/theme'
import { useIsMobile } from '../../lib/useIsMobile'

type AlertKind = 'price' | 'bubble'
type AssetType = 'stock' | 'fund' | 'market'
type Direction = 'above' | 'below'

type AlertRow = {
  id: number
  kind: AlertKind
  asset_type: AssetType
  symbol: string
  label: string
  direction: Direction
  target_value: number
  status: 'active' | 'triggered' | 'cancelled'
  triggered_at: string | null
  triggered_value: number | null
  created_at: string
}

type Asset = { slug: string; name: string; category: string }

const BUBBLE_TARGETS = [
  { symbol: 'bullion', label: 'حباب شمش طلا' },
  { symbol: 'coin', label: 'حباب سکه' },
  { symbol: 'silver', label: 'حباب شمش نقره' },
]

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })

export default function AlertsPage() {
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [linked, setLinked] = useState<boolean | null>(null)

  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(true)

  const [assetType, setAssetType] = useState<AssetType>('stock')
  const [symbol, setSymbol] = useState('')
  const [direction, setDirection] = useState<Direction>('above')
  const [target, setTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [stockSymbols, setStockSymbols] = useState<{ symbol: string; name: string }[]>([])
  const [funds, setFunds] = useState<Asset[]>([])

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved) setIsDark(saved !== 'light')
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    fetch('/stocks/all-symbols.json')
      .then(r => r.json())
      .then((data: { l18: string; l30: string }[]) => setStockSymbols((data ?? []).map(d => ({ symbol: d.l18, name: d.l30 || d.l18 }))))
      .catch(() => {})
    supabase.from('assets').select('slug,name,category').neq('slug', 'gold').then(({ data }) => setFunds((data ?? []) as Asset[]))
  }, [])

  const loadAlerts = async () => {
    setLoading(true)
    const { data } = await supabase.from('alerts').select('*').order('created_at', { ascending: false })
    setAlerts((data ?? []) as AlertRow[])
    setLoading(false)
  }

  useEffect(() => {
    loadAlerts()
    supabase.from('telegram_links').select('user_id').maybeSingle().then(({ data }) => setLinked(!!data))
  }, [])

  const t = isDark ? darkTheme : lightTheme

  const resetForm = () => { setSymbol(''); setTarget(''); setDirection('above'); setError('') }

  const submit = async () => {
    setError('')
    if (assetType !== 'market' && !symbol.trim()) { setError('نماد را انتخاب کنید'); return }
    if (assetType === 'market' && !symbol) { setError('نوع حباب را انتخاب کنید'); return }
    const targetNum = parseFloat(target)
    if (!Number.isFinite(targetNum)) { setError('هدف را وارد کنید'); return }

    setSaving(true)
    const kind: AlertKind = assetType === 'market' ? 'bubble' : 'price'
    const label = assetType === 'stock'
      ? (stockSymbols.find(s => s.symbol === symbol)?.name || symbol)
      : assetType === 'fund'
      ? (funds.find(f => f.slug === symbol)?.name || symbol)
      : (BUBBLE_TARGETS.find(b => b.symbol === symbol)?.label || symbol)

    const { error: insErr } = await supabase.from('alerts').insert({
      kind, asset_type: assetType, symbol, label, direction, target_value: targetNum,
    })
    setSaving(false)
    if (insErr) { setError('ثبت هشدار ناموفق بود'); return }
    resetForm()
    loadAlerts()
  }

  const cancelAlert = async (id: number) => {
    await supabase.from('alerts').update({ status: 'cancelled' }).eq('id', id)
    loadAlerts()
  }

  const statusLabel: Record<AlertRow['status'], string> = { active: 'فعال', triggered: 'اجراشده', cancelled: 'لغوشده' }
  const statusColor: Record<AlertRow['status'], string> = { active: t.brand, triggered: t.green, cancelled: t.muted }

  return (
    <AuthGate title="هشدار قیمت و حباب" description="برای دیدن و ساخت هشدار، وارد حساب کاربری شوید">
      <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? '20px 12px' : '28px 24px' }}>
          <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, marginBottom: 6 }}>هشدارهای من</h1>
          <p style={{ fontSize: 13, color: t.muted, marginBottom: 18 }}>
            با رسیدن قیمت سهم/صندوق یا حباب بازار طلا و نقره به هدف تعیین‌شده، از راه تلگرام به شما خبر می‌دهیم.
          </p>

          {linked === false && (
            <div style={{
              background: 'rgba(239,83,80,0.08)', border: '1px solid rgba(239,83,80,0.25)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: t.text,
            }}>
              اول باید بات تلگرام پورتفوی خودتان را وصل کنید تا هشدارها به شما ارسال شود —{' '}
              <Link href="/portfolio" style={{ color: t.brand, fontWeight: 700 }}>از صفحه پورتفوی من</Link>.
            </div>
          )}

          {/* فرم ساخت هشدار */}
          <div style={{
            background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12,
            padding: '16px 18px', marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([['stock', 'سهم'], ['fund', 'صندوق'], ['market', 'حباب بازار']] as [AssetType, string][]).map(([v, lbl]) => (
                <button key={v} onClick={() => { setAssetType(v); setSymbol('') }} style={{
                  fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                  background: assetType === v ? t.brand : 'transparent',
                  color: assetType === v ? '#fff' : t.muted,
                  border: `1px solid ${assetType === v ? t.brand : t.border}`,
                }}>{lbl}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {assetType === 'stock' && (
                <>
                  <input list="stock-symbols" value={symbol} onChange={e => setSymbol(e.target.value)}
                    placeholder="نماد سهم (مثلاً فولاد)"
                    aria-label="نماد سهم"
                    style={{ flex: '1 1 180px', padding: '9px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13 }} />
                  <datalist id="stock-symbols">
                    {stockSymbols.map(s => <option key={s.symbol} value={s.symbol}>{s.name}</option>)}
                  </datalist>
                </>
              )}
              {assetType === 'fund' && (
                <select value={symbol} onChange={e => setSymbol(e.target.value)}
                  aria-label="انتخاب صندوق"
                  style={{ flex: '1 1 180px', padding: '9px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13 }}>
                  <option value="">انتخاب صندوق…</option>
                  {funds.map(f => <option key={f.slug} value={f.slug}>{f.name} ({f.category})</option>)}
                </select>
              )}
              {assetType === 'market' && (
                <select value={symbol} onChange={e => setSymbol(e.target.value)}
                  aria-label="انتخاب نوع حباب"
                  style={{ flex: '1 1 180px', padding: '9px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13 }}>
                  <option value="">انتخاب نوع حباب…</option>
                  {BUBBLE_TARGETS.map(b => <option key={b.symbol} value={b.symbol}>{b.label}</option>)}
                </select>
              )}

              <select value={direction} onChange={e => setDirection(e.target.value as Direction)}
                aria-label="جهت هشدار"
                style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13 }}>
                <option value="above">رسید به یا بالاتر رفت از</option>
                <option value="below">رسید به یا پایین‌تر رفت از</option>
              </select>

              <input type="number" value={target} onChange={e => setTarget(e.target.value)}
                placeholder={assetType === 'market' ? 'هدف حباب (٪)' : 'قیمت هدف (تومان)'}
                aria-label={assetType === 'market' ? 'هدف حباب' : 'قیمت هدف'}
                style={{ width: 160, padding: '9px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, fontSize: 13 }} />

              <button onClick={submit} disabled={saving} style={{
                padding: '9px 18px', borderRadius: 8, border: 'none', cursor: saving ? 'default' : 'pointer',
                background: t.brand, color: '#fff', fontWeight: 700, fontSize: 13, opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'در حال ثبت…' : '+ ساخت هشدار'}
              </button>
            </div>
            {error && <div style={{ fontSize: 12.5, color: t.red }}>{error}</div>}
          </div>

          {/* لیست هشدارها */}
          {loading ? (
            <div style={{ color: t.muted, fontSize: 13, textAlign: 'center', padding: '40px 0' }}>در حال بارگذاری…</div>
          ) : alerts.length === 0 ? (
            // آنبوردینگ اولین هشدار — به‌جای پیام خشک، سه قدم + دکمهٔ پرکردن نمونه
            <div style={{
              background: t.panel, border: `1px dashed ${t.borderStrong}`, borderRadius: 12,
              padding: isMobile ? '20px 16px' : '24px 28px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }} aria-hidden>🔔</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>اولین هشدارت را بساز</div>
              <ol style={{ listStyle: 'none', padding: 0, margin: '0 auto 18px', maxWidth: 380, textAlign: 'right' }}>
                {[
                  linked === false ? 'بات تلگرام را از صفحه پورتفوی وصل کن' : 'بات تلگرام وصل است ✓',
                  'سهم، صندوق یا حباب بازار را انتخاب کن',
                  'قیمت یا درصد هدف را تعیین کن — بقیه‌اش با ما',
                ].map((s, i) => (
                  <li key={i} style={{ fontSize: 13, lineHeight: 2.3, color: t.text }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 22, height: 22, borderRadius: '50%', marginLeft: 8,
                      background: t.brand, color: '#0A0805', fontSize: 12, fontWeight: 800,
                    }}>{fa(i + 1)}</span>
                    {s}
                  </li>
                ))}
              </ol>
              <button
                onClick={() => {
                  setAssetType('market'); setSymbol('coin'); setDirection('above'); setTarget('5'); setError('')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                style={{
                  fontSize: 13, fontWeight: 700, padding: '11px 24px', borderRadius: 10, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #d9b45b, #f4d795)', color: '#0A0805', border: 'none',
                  fontFamily: 'inherit', minHeight: 44,
                }}>
                امتحان با یک نمونه: حباب سکه بالای ۵٪
              </button>
              <div style={{ fontSize: 11, color: t.muted, marginTop: 10 }}>
                فرم بالا با مقدارهای نمونه پر می‌شود — قبل از ثبت هرطور خواستی عوضش کن.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  background: t.panel, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 14px',
                }}>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                    color: statusColor[a.status], background: `${statusColor[a.status]}1c`,
                  }}>{statusLabel[a.status]}</span>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{a.label || a.symbol}</span>
                  <span style={{ fontSize: 12.5, color: t.muted }}>
                    {a.direction === 'above' ? '≥' : '≤'} {fa(a.target_value, a.kind === 'bubble' ? 1 : 0)}{a.kind === 'bubble' ? '٪' : ' تومان'}
                  </span>
                  {a.status === 'triggered' && a.triggered_value != null && (
                    <span style={{ fontSize: 12, color: t.green }}>
                      اجرا شد در {fa(a.triggered_value, a.kind === 'bubble' ? 1 : 0)}{a.kind === 'bubble' ? '٪' : ' تومان'}
                    </span>
                  )}
                  {a.status === 'active' && (
                    <button onClick={() => cancelAlert(a.id)} style={{
                      marginInlineStart: 'auto', fontSize: 12, color: t.red, cursor: 'pointer',
                      background: 'transparent', border: `1px solid ${t.red}44`, borderRadius: 7, padding: '5px 10px',
                    }}>لغو</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </AuthGate>
  )
}
