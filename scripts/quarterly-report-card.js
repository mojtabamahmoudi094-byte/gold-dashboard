#!/usr/bin/env node
/**
 * quarterly-report-card.js
 *
 * بورس سنج — کارت عکسی صورت‌های مالی میاندوره‌ای/سالانه.
 * از رو تاریخچهٔ quarters در reports-out/<نماد>.json (توسط codal-company-reports.js، تجمعی از ابتدای سال مالی)
 * دو نمودار روند (سود هر سهم، سود ناخالص/عملیاتی/خالص فصلی) + پنل آمار می‌سازد.
 *
 *   const { buildQuarterlyReportData, renderQuarterlyReportCardHtml, screenshotQuarterlyReportCard } = require('./quarterly-report-card')
 *   const data = buildQuarterlyReportData(payload, marketInfo) // marketInfo: {pe, groupPe, mv, shares} یا null
 *   if (data) { const html = renderQuarterlyReportCardHtml(data, companyName); const buf = await screenshotQuarterlyReportCard(browser, html) }
 */

'use strict'

const { SITE_URL, TELEGRAM_CHANNEL, LOGO_DATA_URI } = require('./brand-assets')

const CREAM = '#ddd5bd'
const MUTED = '#a99f88'
const GOLD = '#caa66a'
const YEAR_PREV = '#2f8fff'
const UP = '#3ddc84'
const DOWN = '#ff5c5c'
const BG = '#0b0d12'
const PANEL = '#161a22'
const PANEL2 = '#1c212b'
const BORDER = '#2a2f3a'
const HILITE = 'rgba(202,166,106,0.12)'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const faNum = (v, dec = 0) => v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('fa-IR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const pct = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${faNum(v, 0)}٪`
// میلیون ریال → میلیارد تومان
const toman = (v) => v == null ? '—' : faNum(v / 1e4, Math.abs(v / 1e4) < 10 ? 1 : 0)
// ریال خام (فید بازار، نه هزارتومانی گزارش‌ها) → میلیارد تومان
const tomanFromRial = (v) => v == null ? '—' : faNum(v / 1e10, Math.abs(v / 1e10) < 10 ? 1 : 0)

const pctChange = (cur, prev) => (cur == null || prev == null || prev === 0) ? null : ((cur - prev) / Math.abs(prev)) * 100

function periodParts(p) {
  const m = String(p || '').match(/^(\d{4})\/(\d{2})/)
  return m ? { y: +m[1], mo: +m[2] } : null
}
const shortLabel = (period) => { const p = periodParts(period); return p ? `${p.y}/${String(p.mo).padStart(2, '0')}` : period }
const durLabel = (m) => ({ 3: '۳ماهه', 6: '۶ماهه', 9: '۹ماهه', 12: '۱۲ماهه' }[m] || `${faNum(m)}ماهه`)

// تجمعی (از ابتدای سال مالی) → فصل مجزا: تفاضل با تجمعیِ ماقبلِ همون سال مالی.
// وقتی months نسبت به رکورد قبلی افزایش پیدا نکرد یعنی سال مالی عوض شده — دورهٔ اول خودش مستقله.
function toDiscreteQuarters(quarters) {
  const out = []
  let prevCum = null, prevMonths = 0
  for (const q of quarters) {
    if (q.months <= prevMonths) { prevCum = null; prevMonths = 0 }
    const diff = (a, b) => (a != null && b != null) ? a - b : (prevCum ? null : a)
    out.push({
      period: q.period, months: q.months, audited: q.audited,
      netQ:     prevCum ? diff(q.net, prevCum.net)     : q.net,
      grossQ:   prevCum ? diff(q.gross, prevCum.gross) : q.gross,
      opQ:      prevCum ? diff(q.op, prevCum.op)       : q.op,
      epsQ:     prevCum ? diff(q.eps, prevCum.eps)     : q.eps,
      revenueQ: prevCum ? diff(q.revenue, prevCum.revenue) : q.revenue,
    })
    prevCum = q; prevMonths = q.months
  }
  return out
}

// payload = محتوای reports-out/<نماد>.json (شامل quarters)
// marketInfo (اختیاری): {pe, groupPe, mv (ریال), shares} از فید لحظه‌ای بازار
function buildQuarterlyReportData(payload, marketInfo) {
  const quarters = (payload.quarters || []).filter(q => periodParts(q.period))
  if (!quarters.length) return null
  quarters.sort((a, b) => (a.period + a.months).localeCompare(b.period + b.months))
  const latest = quarters[quarters.length - 1]
  const discrete = toDiscreteQuarters(quarters)
  const latestQ = discrete[discrete.length - 1]

  const withNetQ = discrete.filter(d => d.netQ != null)
  const priorNetQ = withNetQ.slice(0, -1).map(d => d.netQ)
  const isRecord = withNetQ.length >= 2 && latestQ.netQ != null && priorNetQ.length > 0 && latestQ.netQ >= Math.max(...priorNetQ)

  const epsChart = {
    labels: discrete.map(d => shortLabel(d.period)),
    quarterly: discrete.map(d => d.epsQ),
  }
  const profitChart = {
    labels: discrete.map(d => shortLabel(d.period)),
    gross: discrete.map(d => d.grossQ),
    op: discrete.map(d => d.opQ),
    net: discrete.map(d => d.netQ),
  }

  const yoy = pctChange(latest.net, latest.net_ly)

  return {
    symbol: payload.symbol,
    period: latest.period,
    months: latest.months,
    audited: !!latest.audited,
    epsChart, profitChart,
    stats: {
      net: latest.net, yoy, isRecord,
      eps: latest.eps, revenue: latest.revenue,
      pe: marketInfo?.pe ?? null,
      groupPe: marketInfo?.groupPe ?? null,
      mv: marketInfo?.mv ?? null,
      shares: marketInfo?.shares ?? null,
    },
  }
}

// ═══ SVG ═══
function multiLineChart({ width, height, labels, series, labelAllPoints }) {
  const padL = 78, padR = 16, padT = 16, padB = 34
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const allVals = series.flatMap(l => l.values.filter(v => v != null))
  const maxVal = Math.max(1, ...allVals, 0)
  const minVal = Math.min(0, ...allVals)
  const range = (maxVal - minVal) || 1
  const n = labels.length
  const groupW = n > 1 ? plotW / n : plotW
  const zeroY = padT + plotH - ((0 - minVal) / range) * plotH

  let axisLabels = ''
  for (let i = 0; i < n; i++) {
    const gx = padL + i * groupW + groupW / 2
    axisLabels += `<text x="${gx.toFixed(1)}" y="${height - 12}" font-size="14" fill="${MUTED}" text-anchor="middle">${labels[i]}</text>`
  }
  let grid = ''
  for (let g = 0; g <= 4; g++) {
    const val = minVal + (g / 4) * range
    const y = padT + plotH - (g / 4) * plotH
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="${BORDER}" stroke-width="1"/>`
    grid += `<text x="${padL - 10}" y="${(y + 4).toFixed(1)}" font-size="12" fill="${MUTED}" text-anchor="end">${faNum(val)}</text>`
  }
  if (minVal < 0) grid += `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${width - padR}" y2="${zeroY.toFixed(1)}" stroke="${MUTED}" stroke-width="1" stroke-dasharray="4 3"/>`

  let paths = ''
  series.forEach(l => {
    const pts = []
    for (let i = 0; i < n; i++) {
      const v = l.values[i]
      if (v == null) continue
      const gx = padL + i * groupW + groupW / 2
      const gy = padT + plotH - ((v - minVal) / range) * plotH
      pts.push({ x: gx, y: gy, v })
    }
    if (pts.length > 1) paths += `<polyline points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${l.color}" stroke-width="2.5"/>`
    paths += pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${l.color}"/>`).join('')
    if (labelAllPoints) {
      paths += pts.map(p => {
        const below = p.y + 20 <= height - padB - 4
        const ly = below ? p.y + 20 : p.y - 10
        return `<text x="${p.x.toFixed(1)}" y="${ly.toFixed(1)}" font-size="13" fill="${l.color}" text-anchor="middle">${faNum(p.v)}</text>`
      }).join('')
    } else if (pts.length) {
      const last = pts[pts.length - 1]
      paths += `<text x="${(last.x + 8).toFixed(1)}" y="${(last.y - 6).toFixed(1)}" font-size="12" fill="${l.color}" text-anchor="start">${faNum(last.v)}</text>`
    }
  })
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${grid}${paths}${axisLabels}</svg>`
}

function legend(items) {
  return `<div class="legend">${items.map(it => `<span class="legendItem"><span class="dot" style="background:${it.color}"></span>${esc(it.label)}</span>`).join('')}</div>`
}

function statRow(label, value, tone) {
  return `<div class="srow"><span class="slabel">${esc(label)}</span><span class="svalue" style="color:${tone === 'up' ? UP : tone === 'down' ? DOWN : CREAM}">${esc(value)}</span></div>`
}

function renderQuarterlyReportCardHtml(data, companyName) {
  const chart1 = multiLineChart({
    width: 900, height: 250, labels: data.epsChart.labels,
    series: [
      { values: data.epsChart.quarterly, color: GOLD },
    ],
    labelAllPoints: true,
  })
  const chart2 = multiLineChart({
    width: 900, height: 250, labels: data.profitChart.labels,
    series: [
      { values: data.profitChart.gross, color: DOWN },
      { values: data.profitChart.op, color: YEAR_PREV },
      { values: data.profitChart.net, color: GOLD },
    ],
  })

  const st = data.stats
  const statsHtml = [
    statRow(`سود خالص ${durLabel(data.months)}`, `${toman(st.net)} م.ت`, st.net >= 0 ? 'up' : 'down'),
    st.yoy != null ? statRow('رشد نسبت به دورهٔ مشابه', pct(st.yoy), st.yoy >= 0 ? 'up' : 'down') : '',
    st.isRecord ? statRow('وضعیت', '🔥 رکورد سود فصلی') : '',
    statRow('سود هر سهم دوره', `${faNum(st.eps)} ریال`),
    st.pe != null ? statRow('P/E ttm', faNum(st.pe, 1)) : '',
    st.groupPe != null ? statRow('P/E میانگین صنعت', faNum(st.groupPe, 1)) : '',
    st.mv != null ? statRow('ارزش بازار', `${tomanFromRial(st.mv)} میلیارد تومان`) : '',
  ].filter(Boolean).join('')

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 1600px; height: 900px; background: ${BG}; }
  body { font-family: 'Vazirmatn', 'Noto Color Emoji', Tahoma, sans-serif; }
  .brand, .title, .panelTitle { font-family: 'Vazirmatn SemiBold', 'Vazirmatn', Tahoma, sans-serif; }
  .card { width: 1560px; height: 860px; margin: 20px; background: linear-gradient(160deg, ${PANEL} 0%, ${BG} 100%);
    border: 1px solid ${BORDER}; border-radius: 24px; padding: 32px 40px; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .card::after { content: ''; position: absolute; top: 0; right: 0; left: 0; height: 4px; background: linear-gradient(90deg, ${GOLD}, transparent 70%); }
  .head { display: flex; align-items: center; justify-content: space-between; z-index: 1; margin-bottom: 10px; }
  .title { color: ${CREAM}; font-size: 30px; font-weight: 700; }
  .subtitle { color: ${MUTED}; font-size: 18px; margin-top: 4px; }
  .brand { color: ${GOLD}; font-size: 22px; display: flex; align-items: center; gap: 10px; }
  .brand img { width: 40px; height: 40px; border-radius: 50%; }
  .body { display: flex; flex: 1; gap: 28px; z-index: 1; min-height: 0; }
  .left { flex: 0 0 920px; display: flex; flex-direction: column; gap: 18px; }
  .panel { background: ${PANEL2}; border: 1px solid ${BORDER}; border-radius: 16px; padding: 14px 16px 4px; }
  .panelTitle { color: ${CREAM}; font-size: 17px; font-weight: 600; margin-bottom: 4px; }
  .legend { display: flex; gap: 16px; margin-bottom: 4px; flex-wrap: wrap; }
  .legendItem { color: ${MUTED}; font-size: 13px; display: flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .right { flex: 1; background: ${PANEL2}; border: 1px solid ${BORDER}; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
  .srow { display: flex; align-items: center; justify-content: space-between; padding: 16px 4px; border-top: 1px solid ${BORDER}; font-size: 22px; }
  .srow:first-child { border-top: none; }
  .slabel { color: ${MUTED}; }
  .svalue { font-weight: 700; direction: ltr; }
  .footer { z-index: 1; margin-top: 14px; color: ${MUTED}; font-size: 15px; text-align: center; }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div>
        <div class="title">${esc(companyName || data.symbol)} — صورت‌های مالی ${durLabel(data.months)}</div>
        <div class="subtitle">دورهٔ منتهی به ${esc(data.period)} ${data.audited ? '(حسابرسی‌شده)' : '(حسابرسی‌نشده)'}</div>
      </div>
      <div class="brand"><span>بورس سنج</span><img src="${LOGO_DATA_URI}" alt=""></div>
    </div>
    <div class="body">
      <div class="left">
        <div class="panel">
          <div class="panelTitle">سود هر سهم فصلی — ریال</div>
          ${legend([{ color: GOLD, label: 'سود هر سهم این فصل' }])}
          ${chart1}
        </div>
        <div class="panel">
          <div class="panelTitle">سود ناخالص/عملیاتی/خالص فصلی — میلیون ریال</div>
          ${legend([{ color: DOWN, label: 'ناخالص' }, { color: YEAR_PREV, label: 'عملیاتی' }, { color: GOLD, label: 'خالص' }])}
          ${chart2}
        </div>
      </div>
      <div class="right">${statsHtml}</div>
    </div>
    <div class="footer">⚠️ صرفاً اطلاع‌رسانی است، توصیه مالی نیست. — ${esc(SITE_URL)} — ${esc(TELEGRAM_CHANNEL)}</div>
  </div>
</body>
</html>`
}

async function screenshotQuarterlyReportCard(browser, html) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  const buf = await page.screenshot({ type: 'jpeg', quality: 90 })
  await page.close()
  return buf
}

module.exports = { buildQuarterlyReportData, renderQuarterlyReportCardHtml, screenshotQuarterlyReportCard }
