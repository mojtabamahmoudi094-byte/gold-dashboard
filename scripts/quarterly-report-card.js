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
// رنگ هر سال مالی در نمودارهای فصلی — قدیم به جدید، سال جاری همیشه طلایی (هم‌راستا با پالت کارت)
const YEAR_PALETTE = ['#2bbfa0', '#e0575c', '#3a5fc4', GOLD]

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

// تجمعی هر سال مالی → مقدار فصل مجزا، سطربندی‌شده بر اساس سال+فصل (نه زنجیرهٔ زمانی خطی).
// فقط گام‌های واقعاً ۳ماهه معتبرند (months - prevMonths === 3)؛ اگر فصلی جا افتاده باشه (مثلاً از ۳
// مستقیم به ۹)، اون فصل خالی می‌مونه نه اینکه چند فصل با هم به یک ستون فروخته بشه.
function seasonalFromQuarters(quarters) {
  const seasonNames = ['بهار', 'تابستان', 'پاییز', 'زمستان']
  const byYear = new Map()
  for (const q of quarters) {
    const p = periodParts(q.period)
    if (!p) continue
    if (!byYear.has(p.y)) byYear.set(p.y, [])
    byYear.get(p.y).push(q)
  }
  const metrics = ['net', 'gross', 'op']
  const seasonal = { net: [{}, {}, {}, {}], gross: [{}, {}, {}, {}], op: [{}, {}, {}, {}] }

  for (const [year, arr] of byYear) {
    arr.sort((a, b) => a.months - b.months)
    let prev = null
    for (const q of arr) {
      const seasonIdx = q.months / 3 - 1
      if (Number.isInteger(seasonIdx) && seasonIdx >= 0 && seasonIdx <= 3) {
        let vals = null
        if (prev == null) {
          if (q.months === 3) vals = { net: q.net, gross: q.gross, op: q.op }
        } else if (q.months - prev.months === 3) {
          const diff = (a, b) => (a != null && b != null) ? a - b : null
          vals = { net: diff(q.net, prev.net), gross: diff(q.gross, prev.gross), op: diff(q.op, prev.op) }
        }
        if (vals) for (const m of metrics) if (vals[m] != null) seasonal[m][seasonIdx][year] = vals[m]
      }
      prev = q
    }
  }
  const years = [...byYear.keys()].sort((a, b) => a - b).slice(-4)
  return { seasonNames, years, seasonal }
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
  const seasonal = seasonalFromQuarters(quarters)

  return {
    symbol: payload.symbol,
    period: latest.period,
    months: latest.months,
    audited: !!latest.audited,
    epsChart, profitChart, seasonal,
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

// نمودار میله‌ای گروهی: محور افقی = فصل (بهار..زمستان)، هر گروه یه میله به‌ازای هر سالی که مقدار داره.
// سال جاری بر اساس علامت مقدار رنگ می‌شه (سبز=سود، قرمز=زیان)؛ سال‌های قبل‌تر آبی (YEAR_PREV) — یه رنگ
// کاملاً جدا تا «داده‌ی سال قبل» با نگاه اول از «سود/زیان امسال» تفکیک بشه، نه فقط با شفافیت.
// عدد هر میله همیشه تو یه ردیف ثابتِ زیر محور می‌شینه (نه بالای میله/رو صفر) که تو خط چارت گم نشه.
function seasonalBarChart({ width, height, seasonNames, years, values }) {
  const padL = 10, padR = 10, padT = 22, padB = 54
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const n = seasonNames.length
  const allVals = []
  for (let s = 0; s < n; s++) for (const y of years) { const v = values[s]?.[y]; if (v != null) allVals.push(v) }
  const maxVal = Math.max(1, ...allVals, 0)
  const minVal = Math.min(0, ...allVals)
  const range = (maxVal - minVal) || 1
  const groupW = plotW / n
  const zeroY = padT + plotH - ((0 - minVal) / range) * plotH
  const latestYear = years[years.length - 1]
  const opacityForPrior = (idx, total) => total <= 1 ? 1 : 0.55 + (idx / (total - 1)) * 0.45

  let grid = `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${width - padR}" y2="${zeroY.toFixed(1)}" stroke="${BORDER}" stroke-width="1"/>`

  let bars = '', axisLabels = ''
  for (let s = 0; s < n; s++) {
    const presentYears = years.filter(y => values[s]?.[y] != null)
    const priorYears = presentYears.filter(y => y !== latestYear)
    const bw = presentYears.length ? Math.min(30, (groupW - 10) / presentYears.length) : 0
    const totalW = bw * presentYears.length
    let bx = padL + s * groupW + (groupW - totalW) / 2
    presentYears.forEach((y) => {
      const v = values[s][y]
      const isLatest = y === latestYear
      const barH = Math.max(Math.abs(v) / range * plotH, v === 0 ? 0 : 1.5)
      const by = v >= 0 ? zeroY - barH : zeroY
      const color = isLatest ? (v >= 0 ? UP : DOWN) : YEAR_PREV
      const op = isLatest ? 1 : opacityForPrior(priorYears.indexOf(y), priorYears.length)
      bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}" fill-opacity="${op.toFixed(2)}" rx="3"/>`
      bars += `<text x="${(bx + (bw - 3) / 2).toFixed(1)}" y="${(height - 40).toFixed(1)}" font-size="10.5" fill="${CREAM}" text-anchor="middle">${toman(v)}</text>`
      // فقط وقتی چند سال کنار هم توی یه فصل نشستن سال زیر عدد می‌آد — تک‌سال یعنی تکراریه، شلوغی الکی
      if (presentYears.length > 1) {
        bars += `<text x="${(bx + (bw - 3) / 2).toFixed(1)}" y="${(height - 26).toFixed(1)}" font-size="9.5" fill="${MUTED}" text-anchor="middle">${y}</text>`
      }
      bx += bw
    })
    const gx = padL + s * groupW + groupW / 2
    axisLabels += `<text x="${gx.toFixed(1)}" y="${height - 6}" font-size="12" fill="${CREAM}" text-anchor="middle">${seasonNames[s]}</text>`
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${grid}${bars}${axisLabels}</svg>`
}

function legend(items) {
  return `<div class="legend">${items.map(it => `<span class="legendItem"><span class="dot" style="background:${it.color}"></span>${esc(it.label)}</span>`).join('')}</div>`
}

function statRow(label, value, tone) {
  return `<div class="srow"><span class="slabel">${esc(label)}</span><span class="svalue" style="color:${tone === 'up' ? UP : tone === 'down' ? DOWN : CREAM}">${esc(value)}</span></div>`
}

function renderQuarterlyReportCardHtml(data, companyName) {
  const chart1 = multiLineChart({
    width: 900, height: 215, labels: data.epsChart.labels,
    series: [
      { values: data.epsChart.quarterly, color: YEAR_PREV },
    ],
    labelAllPoints: true,
  })
  const { seasonNames, years, seasonal } = data.seasonal
  const seasonalChartOpts = { width: 276, height: 172, seasonNames, years }
  const grossSeasonChart = seasonalBarChart({ ...seasonalChartOpts, values: seasonal.gross })
  const opSeasonChart = seasonalBarChart({ ...seasonalChartOpts, values: seasonal.op })
  const netSeasonChart = seasonalBarChart({ ...seasonalChartOpts, values: seasonal.net })

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
  .panel { background: ${PANEL2}; border: 1px solid ${BORDER}; border-radius: 16px; padding: 16px 18px 10px; }
  .panelTitle { color: ${CREAM}; font-size: 17px; font-weight: 600; margin-bottom: 8px; }
  .legend { display: flex; gap: 16px; margin-bottom: 10px; flex-wrap: wrap; }
  .legendItem { color: ${MUTED}; font-size: 13px; display: flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .seasonalRow { display: flex; gap: 18px; }
  .seasonalCol { flex: 1; min-width: 0; background: ${PANEL}; border-radius: 12px; padding: 6px 4px 0; }
  .seasonalColTitle { color: ${CREAM}; font-size: 13px; font-weight: 600; text-align: center; margin-bottom: 2px; }
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
          <div class="panelTitle">سود فصلی به تفکیک سال — میلیارد تومان</div>
          ${legend([{ color: UP, label: 'سود (سال جاری)' }, { color: DOWN, label: 'زیان (سال جاری)' }, { color: YEAR_PREV, label: 'سال‌های قبل' }])}
          <div class="seasonalRow">
            <div class="seasonalCol"><div class="seasonalColTitle">ناخالص</div>${grossSeasonChart}</div>
            <div class="seasonalCol"><div class="seasonalColTitle">عملیاتی</div>${opSeasonChart}</div>
            <div class="seasonalCol"><div class="seasonalColTitle">خالص</div>${netSeasonChart}</div>
          </div>
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
