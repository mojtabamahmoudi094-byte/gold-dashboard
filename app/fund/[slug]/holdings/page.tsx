'use client'

// ترکیب دارایی صندوق — نمایش دایره‌ای (دونات) مثل پورتفوی کاربر
// طلا: سکه/شمش/نقد · نقره: گواهی نقره/سایر

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabase'
import { darkTheme, lightTheme, shouldUseDark } from '../../../../lib/theme'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { FUND_WEIGHTS, SILVER_FUND_WEIGHTS } from '../../../../lib/goldBubbles'
import { SubPageHeader, cream } from '../fundShared'

type Slice = { name: string; value: number; color: string; hint?: string }

// پالت قاچ‌های صندوق‌های زعفران (تفکیک برند گواهی) — هماهنگ با پالت دونات پورتفوی
const SAFFRON_COLORS = [
  'oklch(0.74 0.19 40)', 'oklch(0.82 0.15 70)', 'oklch(0.72 0.19 25)',
  'oklch(0.78 0.13 300)', 'oklch(0.76 0.14 210)', 'oklch(0.75 0.17 150)',
  'oklch(0.8 0.1 330)', 'oklch(0.84 0.03 240)',
]

export default function FundHoldingsPage() {
  const params = useParams()
  const slug = decodeURIComponent((params?.slug as string) || '')
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [asset, setAsset] = useState<any>(null)
  const [goldW, setGoldW] = useState(FUND_WEIGHTS)
  const [silverW, setSilverW] = useState(SILVER_FUND_WEIGHTS)
  const [saffronW, setSaffronW] = useState<Record<string, { parts: { name: string; pct: number }[] }>>({})
  const [hi, setHi] = useState<number | null>(null)

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    if (!slug) return
    supabase.from('assets').select('*').or(`slug.eq."${slug}",name.eq."${slug}"`).limit(1).maybeSingle().then(({ data: a }) => {
      setAsset(a ?? null)
      if (a?.category === 'طلا') fetch('/fund-weights/gold.json').then(r => r.ok ? r.json() : null).then(j => { if (j?.weights) setGoldW(w => ({ ...w, ...j.weights })) }).catch(() => {})
      else if (a?.category === 'نقره') fetch('/fund-weights/silver.json').then(r => r.ok ? r.json() : null).then(j => { if (j?.weights) setSilverW(w => ({ ...w, ...j.weights })) }).catch(() => {})
      else if (a?.category === 'زعفران') fetch('/fund-weights/saffron.json').then(r => r.ok ? r.json() : null).then(j => { if (j?.weights) setSaffronW(j.weights) }).catch(() => {})
    })
  }, [slug])

  const t: any = isDark ? darkTheme : lightTheme
  const cr = cream(t)

  let slices: Slice[] = []
  if (asset?.category === 'طلا') {
    const w = goldW[asset.name]
    if (w) slices = [
      { name: 'سکه طلا', value: w.coin, color: '#FACC15' },
      { name: 'شمش طلا', value: w.bar, color: '#F59E0B' },
      { name: 'نقد و سایر', value: w.liq, color: '#94A3B8' },
    ]
  } else if (asset?.category === 'نقره') {
    const w = silverW[asset.name]
    if (w) slices = [
      { name: 'گواهی نقره', value: w.silver, color: '#C0C8D8' },
      { name: 'سایر دارایی‌ها', value: w.other, color: '#94A3B8' },
    ]
  } else if (asset?.category === 'زعفران') {
    // ستون درصدِ گزارش این صندوق‌ها ناهم‌تراز است؛ سهم هر قلم از ارزش روز حساب شده
    const w = saffronW[asset.name]
    if (w?.parts?.length) slices = w.parts.map((p, i) => ({
      name: p.name, value: p.pct, color: SAFFRON_COLORS[i % SAFFRON_COLORS.length],
    }))
  }
  slices = slices.filter(s => s.value > 0)
  const total = slices.reduce((s, x) => s + x.value, 0) || 1

  // مسیرهای دونات
  const R = 82, r = 50, CX = 100, CY = 100
  let angle = -Math.PI / 2
  const paths = slices.map(s => {
    const frac = s.value / total
    const a0 = angle, a1 = angle + frac * Math.PI * 2
    angle = a1
    const large = a1 - a0 > Math.PI ? 1 : 0
    const mid = (a0 + a1) / 2
    const p = (a: number, rad: number) => `${(CX + rad * Math.cos(a)).toFixed(2)},${(CY + rad * Math.sin(a)).toFixed(2)}`
    return { ...s, frac, mid, d: `M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large} 0 ${p(a0, r)} Z` }
  })
  const hovered = hi !== null ? paths[hi] : null
  const pctFa = (f: number) => (f * 100).toLocaleString('fa-IR', { maximumFractionDigits: 1 })

  return (
    <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SubPageHeader t={t} slug={slug} assetName={asset?.name ?? slug} crumb="ترکیب دارایی صندوق" />

        {asset && slices.length === 0 && (
          <div style={{ color: t.muted, fontSize: 13, padding: 40, textAlign: 'center' }}>
            ترکیب دارایی برای این صندوق در دسترس نیست.
          </div>
        )}

        {slices.length > 0 && (
          <div style={{
            background: t.panel, border: `0.5px solid ${t.border}`, borderTop: `2px solid ${t.accent}55`,
            borderRadius: 16, padding: '20px 22px', backdropFilter: 'blur(12px)', boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.textBright, marginBottom: 4 }}>ترکیب دارایی صندوق {asset.name}</div>
            <div style={{ fontSize: 10.5, color: cr, marginBottom: 16 }}>
              {asset.category === 'زعفران'
                ? 'سهم هر قلم از سبد گواهی‌های صندوق (بر پایهٔ ارزش روز) — منبع آخرین گزارش پورتفوی کدال'
                : 'وزن تقریبی هر دارایی — منبع آخرین گزارش کدال'}
            </div>

            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: isMobile ? 16 : 32 }}>
              <svg viewBox="0 0 200 200" style={{ width: isMobile ? 220 : 250, flexShrink: 0, overflow: 'visible' }} onMouseLeave={() => setHi(null)}>
                {paths.map((s, i) => {
                  const active = hi === i
                  const dx = active ? Math.cos(s.mid) * 4 : 0
                  const dy = active ? Math.sin(s.mid) * 4 : 0
                  return (
                    <path key={i} d={s.d} fill={s.color}
                      opacity={hi === null ? 0.92 : active ? 1 : 0.35}
                      stroke={t.bg} strokeWidth={1.5} transform={`translate(${dx} ${dy})`}
                      style={{ transition: 'opacity 0.2s, transform 0.2s', cursor: 'pointer' }}
                      onMouseEnter={() => setHi(i)}>
                      <title>{`${s.name}: ${pctFa(s.frac)}٪`}</title>
                    </path>
                  )
                })}
                {paths.map((s, i) => s.frac >= 0.06 ? (
                  <text key={`l${i}`} x={CX + Math.cos(s.mid) * (R + r) / 2} y={CY + Math.sin(s.mid) * (R + r) / 2 + 3}
                    textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff"
                    style={{ pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }} fontFamily="system-ui, sans-serif">
                    {pctFa(s.frac)}٪
                  </text>
                ) : null)}
                {hovered ? (
                  <>
                    <text x={CX} y={CY - 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={t.textBright} fontFamily="Vazirmatn, Arial, sans-serif">{hovered.name}</text>
                    <text x={CX} y={CY + 14} textAnchor="middle" fontSize="14" fontWeight="800" fill={hovered.color} fontFamily="system-ui, sans-serif">{pctFa(hovered.frac)}٪</text>
                  </>
                ) : (
                  <>
                    <text x={CX} y={CY - 3} textAnchor="middle" fontSize="15" fontWeight="800" fill={t.textBright} fontFamily="Vazirmatn, Arial, sans-serif">{asset.name}</text>
                    <text x={CX} y={CY + 14} textAnchor="middle" fontSize="8" fill={t.muted} fontFamily="Vazirmatn, Arial, sans-serif">ترکیب دارایی</text>
                  </>
                )}
              </svg>

              <div style={{ flex: 1, minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {paths.map((s, i) => (
                  <div key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                      padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                      background: hi === i ? 'rgba(255,255,255,0.05)' : 'transparent', transition: 'background 0.2s',
                    }}>
                    <span style={{ width: 12, height: 12, borderRadius: 4, background: s.color, flexShrink: 0 }} />
                    <span style={{ color: t.text, flex: 1 }}>{s.name}</span>
                    <span style={{ flex: 1, minWidth: 30, height: 5, borderRadius: 3, background: `${t.muted}22`, overflow: 'hidden' }}>
                      <span style={{ display: 'block', width: `${s.frac * 100}%`, height: '100%', borderRadius: 3, background: s.color, opacity: 0.8 }} />
                    </span>
                    <span style={{ color: t.textBright, fontWeight: 700, fontFamily: 'system-ui, sans-serif', minWidth: 48, textAlign: 'left' }}>{pctFa(s.frac)}٪</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 6 }}>
          <Link href={`/fund/${encodeURIComponent(slug)}`} style={{ color: t.accent, fontSize: 13, textDecoration: 'none' }}>← بازگشت به صفحهٔ صندوق</Link>
        </div>
      </div>
    </main>
  )
}
