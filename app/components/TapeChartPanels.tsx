'use client'

// پنل‌های نمودار تابلوخوانی — کپی دقیق ظاهر نمودارهای صفحه صندوق طلا (FundPageClient)
// + لینک «آرشیو» در گوشه هر پنل. در صفحه /stock/[symbol]/tape و آرشیو آن استفاده می‌شود.

import Link from 'next/link'
import { darkTheme } from '../../lib/theme'

const creamOf = (t: any) => t === darkTheme ? '#ddd5bd' : '#6B5A3A'

// لینک کوچک آرشیو گوشه پنل
function ArchiveLink({ href, color }: { href?: string; color: string }) {
  if (!href) return null
  return (
    <Link href={href} aria-label="آرشیو کامل این نمودار" style={{
      fontSize: 10, fontWeight: 700, color, textDecoration: 'none',
      padding: '3px 9px', borderRadius: 7, flexShrink: 0,
      background: `${color}12`, border: `0.5px solid ${color}38`,
    }}>
      آرشیو
    </Link>
  )
}

// انیمیشن‌های میله/خط — یک‌بار در صفحه رندر شود
export function TapeChartStyles() {
  return (
    <style>{`
      @keyframes barGrow {
        from { transform: scaleY(0); opacity: 0; }
        to   { transform: scaleY(1); opacity: 1; }
      }
      .chart-bar {
        transform-origin: bottom;
        animation: barGrow 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      @keyframes lineFade {
        from { opacity: 0; transform: scaleY(0.85); }
        to   { opacity: 1; transform: scaleY(1); }
      }
      .chart-line-path, .chart-line-area {
        transform-origin: bottom;
        animation: lineFade 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      @media (prefers-reduced-motion: reduce) {
        .chart-bar, .chart-line-path, .chart-line-area { animation: none !important; }
      }
    `}</style>
  )
}

// نمودار میله‌ای مثبت/منفی (ورود/خروج پول) — همان نمودار بزرگ صفحه صندوق
export function FlowBarsPanel({ t, title, unit, flows, archiveHref }: {
  t: any; title: string; unit: string
  flows: { date: string; net: number }[]
  archiveHref?: string
}) {
  const cream = creamOf(t)
  if (flows.length === 0) return null
  const maxAbs = Math.max(...flows.map(f => Math.abs(f.net)), 1)
  const barMaxH = 100
  return (
    <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em' }}>
          {title}
          <span style={{ fontSize: 10, color: cream, marginRight: 8 }}>{unit}</span>
        </div>
        <ArchiveLink href={archiveHref} color={t.accent ?? '#00E5A0'} />
      </div>
      <div style={{ overflowX: 'auto', direction: 'ltr' }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: flows.length * 50, height: barMaxH * 2 + 50, position: 'relative', direction: 'ltr', paddingTop: 25 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: barMaxH + 35, height: 1, background: `${t.muted}33` }} />
          {flows.map((f, i) => {
            const isPos = f.net >= 0
            const h = Math.max((Math.abs(f.net) / maxAbs) * barMaxH, 3)
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', height: '100%' }}>
                <div style={{
                  position: 'absolute',
                  top: isPos ? barMaxH + 35 - h - 20 : barMaxH + 35 + h + 4,
                  fontSize: 9, fontWeight: 800,
                  color: isPos ? '#00E5A0' : '#FF4D6A',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}>
                  {isPos ? '+' : ''}{f.net.toLocaleString('fa-IR')}
                </div>
                <div style={{
                  position: 'absolute',
                  top: isPos ? barMaxH + 35 - h : barMaxH + 36,
                  width: '60%', maxWidth: 30,
                  height: h,
                  borderRadius: isPos ? '3px 3px 0 0' : '0 0 3px 3px',
                  background: isPos
                    ? 'linear-gradient(0deg, rgba(0,229,160,0.4), rgba(0,229,160,0.8))'
                    : 'linear-gradient(180deg, rgba(255,77,106,0.4), rgba(255,77,106,0.8))',
                }}
                  title={`${f.date}: ${isPos ? '+' : ''}${f.net} ${unit}`}
                />
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', minWidth: flows.length * 50, marginTop: 4 }}>
          {flows.map((f, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: t.muted }}>
              {f.date.slice(5)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// نمودار خطی نرم (قدرت خریدار) — همان LineChartPanel صندوق
export function LineChartPanel({ t, title, subtitle, rows, getValue, colorAbove, colorBelow, threshold, archiveHref }: {
  t: any, title: string, subtitle?: string,
  rows: any[], getValue: (r: any) => number,
  colorAbove?: string, colorBelow?: string, threshold?: number,
  archiveHref?: string,
}) {
  const cream = creamOf(t)
  if (!rows || rows.length < 2) return null

  const above = colorAbove ?? '#00E5A0'
  const below = colorBelow ?? '#FF4D6A'
  const th = threshold ?? 1

  const vals = rows.map(r => { const v = getValue(r); return isFinite(v) ? v : 0 })
  const minV = Math.min(...vals, th * 0.8)
  const maxV = Math.max(...vals, th * 1.2)
  const range = Math.max(maxV - minV, 0.01)

  const W = 420, H = 90, PX = 18, PY = 26
  const chartH = H - PY - 8

  const xOf = (i: number) => PX + (i / (vals.length - 1)) * (W - 2 * PX)
  const yOf = (v: number) => PY + (1 - (v - minV) / range) * chartH

  const pts = vals.map((v, i) => ({ x: xOf(i), y: yOf(v), v }))

  const linePath = pts.reduce((acc, pt, i) => {
    if (i === 0) return `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
    const prev = pts[i - 1]
    const mx = ((pt.x + prev.x) / 2).toFixed(1)
    return `${acc} C${mx},${prev.y.toFixed(1)} ${mx},${pt.y.toFixed(1)} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
  }, '')

  const bottomY = PY + chartH
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${bottomY} L${pts[0].x},${bottomY} Z`
  const thY = yOf(th)

  return (
    <div style={{
      background: t.panel, border: `0.5px solid ${t.border}`,
      borderTop: `2px solid ${above}55`, borderRadius: 14,
      padding: '14px 16px', backdropFilter: 'blur(12px)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 6 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.muted }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: cream, marginTop: 3 }}>{subtitle}</div>}
        </div>
        <ArchiveLink href={archiveHref} color={above} />
      </div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} style={{ width: '100%', overflow: 'visible', display: 'block' }} direction="ltr">
        <defs>
          <linearGradient id="lgLine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={above} stopOpacity="0.28" />
            <stop offset="100%" stopColor={above} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.33, 0.66, 1].map(f => {
          const gy = PY + f * chartH
          return <line key={f} x1={PX} y1={gy} x2={W - PX} y2={gy} stroke={t.border} strokeWidth={0.5} opacity={0.6} />
        })}
        {thY >= PY && thY <= bottomY && (
          <>
            <line x1={PX} y1={thY} x2={W - PX} y2={thY}
              stroke={t.muted} strokeWidth={1} strokeDasharray="5 3" opacity={0.6} />
            <rect x={W - PX - 14} y={thY - 8} width={14} height={12} rx={2} fill={t.panel} />
            <text x={W - PX - 7} y={thY + 2} textAnchor="middle" fontSize={8}
              fill={cream} fontFamily="system-ui, sans-serif">۱</text>
          </>
        )}
        <path d={areaPath} fill="url(#lgLine)" className="chart-line-area" />
        <path d={linePath} fill="none" stroke={above} strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" className="chart-line-path" />
        {pts.map((pt, i) => {
          const col = pt.v >= th ? above : below
          const label = pt.v.toLocaleString('fa-IR', { maximumFractionDigits: 2 })
          const lw = label.length * 5.6 + 10
          const lx = Math.min(Math.max(pt.x - lw / 2, PX), W - PX - lw)
          const ly = Math.max(pt.y - 20, 2)
          return (
            <g key={i}>
              <rect x={lx} y={ly} width={lw} height={14} rx={3} fill="rgba(0,0,0,0.84)" />
              <rect x={lx} y={ly} width={lw} height={14} rx={3}
                fill="none" stroke={col} strokeWidth={0.5} opacity={0.8} />
              <text x={lx + lw / 2} y={ly + 10} textAnchor="middle"
                fontSize={8} fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
                {label}
              </text>
              <circle cx={pt.x} cy={pt.y} r={4} fill={col} />
              <circle cx={pt.x} cy={pt.y} r={7} fill={col} fillOpacity="0.18" />
            </g>
          )
        })}
        {rows.map((r, i) => (
          <text key={i} x={xOf(i)} y={H + 16} textAnchor="middle"
            fontSize={9} fill={cream} fontFamily="Vazirmatn, Arial, sans-serif">
            {r.trade_date_shamsi?.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  )
}

// نمودار میله‌ای (تکی یا جفتی) — همان BarChartPanel صندوق
export function BarChartPanel({ t, title, subtitle, rows, getA, getB, labelA, labelB, colorA, colorB, getColorA, archiveHref }: {
  t: any, title: string, subtitle?: string, rows: any[],
  getA: (r: any) => number, getB?: (r: any) => number,
  labelA: string, labelB?: string,
  colorA: string, colorB?: string,
  getColorA?: (r: any) => string,
  archiveHref?: string,
}) {
  const cream = creamOf(t)
  if (!rows || rows.length === 0) return null

  const fmt = (v: number) => {
    if (!isFinite(v) || isNaN(v)) return '۰'
    if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}م`
    if (v >= 1_000) return `${(v / 1_000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}ه`
    return v.toLocaleString('fa-IR', { maximumFractionDigits: 2 })
  }

  const isPaired = !!getB
  const allVals = rows.flatMap(r => isPaired ? [getA(r), getB!(r)] : [getA(r)]).filter(v => isFinite(v) && !isNaN(v))
  const maxVal = Math.max(...allVals, 0.001)
  const barMaxH = 80
  const barW = isPaired ? 14 : 22
  const colW = isPaired ? 58 : 40

  return (
    <div style={{
      background: t.panel,
      border: `0.5px solid ${t.border}`,
      borderTop: `2px solid ${colorA}55`,
      borderRadius: 14,
      padding: '14px 16px',
      backdropFilter: 'blur(12px)',
      boxShadow: `0 4px 24px rgba(0,0,0,0.14)`,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.muted }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 10, color: cream, marginTop: 3, direction: 'rtl' }}>
              {subtitle}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          {isPaired && (
            <div style={{ display: 'flex', gap: 10, fontSize: 10 }}>
              <span style={{ color: colorA }}>● {labelA}</span>
              <span style={{ color: colorB }}>● {labelB}</span>
            </div>
          )}
          <ArchiveLink href={archiveHref} color={colorA} />
        </div>
      </div>

      <div style={{ overflowX: 'auto', direction: 'ltr' }}>
        <div style={{ display: 'flex', minWidth: rows.length * colW, height: barMaxH + 52, alignItems: 'flex-end', paddingBottom: 20 }}>
          {rows.map((r, i) => {
            const vA = getA(r)
            const vB = isPaired ? getB!(r) : null
            const hA = Math.max((vA / maxVal) * barMaxH, 2)
            const hB = vB !== null ? Math.max((vB / maxVal) * barMaxH, 2) : 0
            const barColorA = getColorA ? getColorA(r) : colorA
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 3, height: 22, width: '100%', justifyContent: 'center', alignItems: 'flex-end', marginBottom: 3 }}>
                  <div style={{
                    fontSize: 8, fontWeight: 800, color: '#fff',
                    background: 'rgba(0,0,0,0.82)',
                    border: `0.5px solid ${barColorA}70`,
                    borderRadius: 3, padding: '1px 4px',
                    fontFamily: 'system-ui, sans-serif',
                    whiteSpace: 'nowrap', lineHeight: 1.4,
                  }}>{fmt(vA)}</div>
                  {isPaired && vB !== null && (
                    <div style={{
                      fontSize: 8, fontWeight: 800, color: '#fff',
                      background: 'rgba(0,0,0,0.82)',
                      border: `0.5px solid ${colorB}70`,
                      borderRadius: 3, padding: '1px 4px',
                      fontFamily: 'system-ui, sans-serif',
                      whiteSpace: 'nowrap', lineHeight: 1.4,
                      alignSelf: 'flex-start',
                    }}>{fmt(vB)}</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                  <div
                    title={`${labelA}: ${fmt(vA)}`}
                    className="chart-bar"
                    style={{
                      width: barW, height: hA,
                      borderRadius: '4px 4px 0 0',
                      background: `linear-gradient(0deg, ${barColorA}40, ${barColorA}e0)`,
                      boxShadow: `0 0 8px ${barColorA}35`,
                      animationDelay: `${i * 0.045}s`,
                    }}
                  />
                  {isPaired && vB !== null && (
                    <div
                      title={`${labelB}: ${fmt(vB)}`}
                      className="chart-bar"
                      style={{
                        width: barW, height: hB,
                        borderRadius: '4px 4px 0 0',
                        background: `linear-gradient(0deg, ${colorB}40, ${colorB}e0)`,
                        boxShadow: `0 0 8px ${colorB}35`,
                        animationDelay: `${i * 0.045 + 0.022}s`,
                      }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', minWidth: rows.length * colW }}>
          {rows.map((r, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: cream }}>
              {r.trade_date_shamsi?.slice(5)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
