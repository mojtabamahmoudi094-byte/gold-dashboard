#!/usr/bin/env node
/**
 * monthly-report-card.js
 *
 * بورس سنج — کارت عکسی گزارش فعالیت ماهانه (فرم تولیدی، «نام محصول»).
 * از رو تاریخچهٔ months استخراج‌شده در reports-out/<نماد>.json (توسط codal-company-reports.js)
 * دو نمودار + جدول محصولات (داخلی/صادراتی) می‌سازد.
 *
 *   const { buildMonthlyReportData, renderMonthlyReportCardHtml, screenshotMonthlyReportCard } = require('./monthly-report-card')
 *   const data = buildMonthlyReportData(payload, companyName)
 *   if (data) { const html = renderMonthlyReportCardHtml(data); const buf = await screenshotMonthlyReportCard(browser, html) }
 */

'use strict'

const { SITE_URL, TELEGRAM_CHANNEL, LOGO_DATA_URI } = require('./brand-assets')

const CREAM = '#ddd5bd'
const MUTED = '#a99f88'
const GOLD = '#caa66a'
const BLUE = '#6ea8d8'
const YEAR_PREV = '#2f8fff' // آبی پررنگ — عمداً متضاد با طلایی سال جاری، برای تفکیک واضح دو سال مالی
const UP = '#3ddc84'
const BG = '#0b0d12'
const PANEL = '#161a22'
const PANEL2 = '#1c212b'
const BORDER = '#2a2f3a'
const HILITE = 'rgba(202,166,106,0.12)'

const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const faNum = (v, dec = 0) => v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('fa-IR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const pct = (v) => v == null ? '—' : `${faNum(v, 1)}٪`
// میلیون ریال → میلیارد تومان
const toman = (v) => faNum((v || 0) / 1e4, Math.abs((v || 0) / 1e4) < 10 ? 1 : 0)

function periodParts(p) {
  const m = String(p || '').match(/^(\d{4})\/(\d{2})/)
  return m ? { y: +m[1], mo: +m[2] } : null
}

// اولین ماه سال مالی: تجمعی ≈ خودِ ماه (همان سیگنالی که codal-watch.js:monthYoY استفاده می‌کند)
function isFiscalStart(entry) {
  return entry.cum != null && entry.month != null && Math.abs(entry.cum - entry.month) <= Math.abs(entry.cum) * 0.005
}

function prevCalendarPeriod(months, cur) {
  const c = periodParts(cur.period)
  if (!c) return null
  const want = c.mo === 1 ? { y: c.y - 1, mo: 12 } : { y: c.y, mo: c.mo - 1 }
  return months.find(m => { const p = periodParts(m.period); return p && p.y === want.y && p.mo === want.mo }) || null
}

const MAX_ROWS_PER_GROUP = 6

// payload = محتوای reports-out/<نماد>.json (شامل months با channel تگ‌شده — نیازمند PARSER_VERSION ≥ 5)
function buildMonthlyReportData(payload) {
  const months = (payload.months || []).filter(m => m.kind === 'production' && periodParts(m.period))
  if (!months.length) return null
  months.sort((a, b) => a.period.localeCompare(b.period))
  const latest = months[months.length - 1]
  const latestParts = periodParts(latest.period)

  // ── سری شرکتی: مبلغ فروش امسال/پارسال بر حسب ماه شمسی ۱..۱۲ (مقایسهٔ دو سال مالی) ──
  const thisYearSeries = Array(12).fill(null)
  const lastYearSeries = Array(12).fill(null)
  for (const m of months) {
    const p = periodParts(m.period)
    if (!p) continue
    if (p.y === latestParts.y) thisYearSeries[p.mo - 1] = m.month ?? null
    else if (p.y === latestParts.y - 1) lastYearSeries[p.mo - 1] = m.month ?? null
  }

  // ── جدول محصولات: کلید name+channel در طول کل تاریخچهٔ نماد ──
  const key = (x) => `${x.channel}||${x.name}`
  const productInfo = new Map()
  for (const m of months) for (const x of (m.products || [])) if (x.channel) productInfo.set(key(x), { name: x.name, channel: x.channel })

  const last12 = months.slice(-12)
  const prevEntry = prevCalendarPeriod(months, latest)
  let fiscalStartIdx = 0
  for (let i = months.length - 1; i >= 0; i--) if (isFiscalStart(months[i])) { fiscalStartIdx = i; break }
  const ytdMonths = months.slice(fiscalStartIdx)

  // ── سری تولید/فروش/نرخ: همون آخرین ۱۲ دورهٔ واقعیِ گزارش‌شده (نه slot ثابت سال مالی) تا همیشه پر باشه ──
  const volumeLabels = last12.map(m => {
    const p = periodParts(m.period)
    return p.y === latestParts.y ? J_MONTHS[p.mo - 1] : `${J_MONTHS[p.mo - 1]} ${String(p.y).slice(-2)}`
  })
  const prodSeries = last12.map(m => (m.products || []).reduce((s, x) => s + (x.prod_m || 0), 0))
  const qtySeries = last12.map(m => (m.products || []).reduce((s, x) => s + (x.qty_m || 0), 0))

  // نرخ فروش هر محصول جدا (واحدها متفاوته — دستگاه/عدد/…، جمع‌زدنشون بی‌معنیه)
  // از rate_m خودِ اکسل می‌خونیم (ستون «نرخ فروش»)، نه محاسبهٔ دستی
  // شرکت‌های چندمحصولی: فقط پرتأثیرترین‌ها رو نشون بده (بر اساس مبلغ فروش ۱۲ماهه)، نه همهٔ محصولات
  const amountOfKey = (m, k) => { const x = (m.products || []).find(p => key(p) === k); return x ? (x.amount_m || 0) : 0 }
  const MAX_RATE_LINES = 4
  const rateLines = [...productInfo.entries()]
    .map(([k, info]) => {
      const values = last12.map(m => { const x = (m.products || []).find(p => key(p) === k); return x && x.rate_m != null && x.rate_m > 0 ? x.rate_m : null })
      const sales12 = last12.reduce((s, m) => s + amountOfKey(m, k), 0)
      return { key: k, name: info.name, channel: info.channel, values, sales12 }
    })
    .filter(l => l.values.some(v => v != null))
    .sort((a, b) => b.sales12 - a.sales12)
    .slice(0, MAX_RATE_LINES)

  // مخرج سهم‌ها: مجموع ناخالص محصولات (پیش از تخفیف/برگشت) — تا سهم‌ها دقیقاً ۱۰۰٪ جمع بزنند
  const periodProductSum = (m) => (m.products || []).filter(x => x.channel).reduce((s, x) => s + (x.amount_m || 0), 0)
  const totalThisMonth = periodProductSum(latest)
  const totalLastMonth = prevEntry ? periodProductSum(prevEntry) : 0
  const total12moSum = last12.reduce((s, m) => s + periodProductSum(m), 0)

  const amountOf = (m, k) => { const x = (m.products || []).find(p => key(p) === k); return x ? (x.amount_m || 0) : 0 }

  let rows = [...productInfo.entries()].map(([k, info]) => {
    const thisMonth = amountOf(latest, k)
    const lastMonth = prevEntry ? amountOf(prevEntry, k) : 0
    const sum12 = last12.reduce((s, m) => s + amountOf(m, k), 0)
    const sumYtd = ytdMonths.reduce((s, m) => s + amountOf(m, k), 0)
    return {
      name: info.name, channel: info.channel,
      avg12mo: last12.length ? sum12 / last12.length : 0,
      share12mo: total12moSum > 0 ? (sum12 / total12moSum) * 100 : 0,
      avgYtd: ytdMonths.length ? sumYtd / ytdMonths.length : 0,
      shareThisMonth: totalThisMonth > 0 ? (thisMonth / totalThisMonth) * 100 : 0,
      shareLastMonth: totalLastMonth > 0 ? (lastMonth / totalLastMonth) * 100 : 0,
    }
  }).filter(r => r.avg12mo > 0 || r.shareThisMonth > 0)

  const sumRows = (list) => list.reduce((a, r) => ({
    avg12mo: a.avg12mo + r.avg12mo, share12mo: a.share12mo + r.share12mo,
    avgYtd: a.avgYtd + r.avgYtd, shareThisMonth: a.shareThisMonth + r.shareThisMonth, shareLastMonth: a.shareLastMonth + r.shareLastMonth,
  }), { avg12mo: 0, share12mo: 0, avgYtd: 0, shareThisMonth: 0, shareLastMonth: 0 })

  const groups = ['domestic', 'export'].map(channel => {
    let list = rows.filter(r => r.channel === channel).sort((a, b) => b.shareThisMonth - a.shareThisMonth)
    if (list.length > MAX_ROWS_PER_GROUP) {
      const head = list.slice(0, MAX_ROWS_PER_GROUP - 1)
      const restTotal = sumRows(list.slice(MAX_ROWS_PER_GROUP - 1))
      list = [...head, { name: 'سایر', channel, ...restTotal }]
    }
    return { channel, label: channel === 'domestic' ? 'فروش داخلی' : 'فروش صادراتی', rows: list, subtotal: sumRows(list) }
  }).filter(g => g.rows.length)

  const grandTotal = sumRows(groups.map(g => g.subtotal))

  return {
    symbol: payload.symbol,
    period: latest.period,
    fiscalYear: latestParts.y,
    companyChart: { labels: J_MONTHS, thisYear: thisYearSeries, lastYear: lastYearSeries },
    volumeChart: { labels: volumeLabels, prod: prodSeries, qty: qtySeries },
    rateChart: { labels: volumeLabels, lines: rateLines },
    table: { groups, grandTotal },
  }
}

// ═══ SVG ═══
function groupedBarChart({ width, height, labels, seriesA, seriesB, colorA, colorB }) {
  const padL = 66, padR = 16, padT = 16, padB = 34
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const maxVal = Math.max(1, ...seriesA.map(v => v || 0), ...seriesB.map(v => v || 0))
  const n = labels.length
  const groupW = plotW / n
  const barW = groupW * 0.32
  const gap = groupW * 0.06
  let bars = '', axisLabels = ''
  for (let i = 0; i < n; i++) {
    const a = seriesA[i] || 0, b = seriesB[i] || 0
    const gx = padL + i * groupW
    const ah = (a / maxVal) * plotH, bh = (b / maxVal) * plotH
    const ax = gx + groupW / 2 - barW - gap / 2
    const bx = gx + groupW / 2 + gap / 2
    bars += `<rect x="${bx.toFixed(1)}" y="${(padT + plotH - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" fill="${colorB}" rx="2"/>`
    bars += `<rect x="${ax.toFixed(1)}" y="${(padT + plotH - ah).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, ah).toFixed(1)}" fill="${colorA}" rx="2"/>`
    axisLabels += `<text x="${(gx + groupW / 2).toFixed(1)}" y="${height - 12}" font-size="14" fill="${MUTED}" text-anchor="middle">${labels[i]}</text>`
  }
  let grid = ''
  for (let g = 0; g <= 4; g++) {
    const y = padT + plotH - (g / 4) * plotH
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="${BORDER}" stroke-width="1"/>`
    grid += `<text x="${padL - 10}" y="${(y + 4).toFixed(1)}" font-size="12" fill="${MUTED}" text-anchor="end">${toman((g / 4) * maxVal)}</text>`
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${grid}${bars}${axisLabels}</svg>`
}

function comboChart({ width, height, labels, prod, qty }) {
  const padL = 66, padR = 16, padT = 16, padB = 34
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const maxQ = Math.max(1, ...prod.map(v => v || 0), ...qty.map(v => v || 0))
  const n = labels.length
  const groupW = plotW / n
  const barW = groupW * 0.3
  const gap = groupW * 0.06
  let bars = '', axisLabels = ''
  for (let i = 0; i < n; i++) {
    const p = prod[i] || 0, q = qty[i] || 0
    const gx = padL + i * groupW
    const ph = (p / maxQ) * plotH, qh = (q / maxQ) * plotH
    const px = gx + groupW / 2 - barW - gap / 2
    const qx = gx + groupW / 2 + gap / 2
    bars += `<rect x="${px.toFixed(1)}" y="${(padT + plotH - ph).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, ph).toFixed(1)}" fill="${BLUE}" rx="2"/>`
    bars += `<rect x="${qx.toFixed(1)}" y="${(padT + plotH - qh).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, qh).toFixed(1)}" fill="${GOLD}" rx="2"/>`
    axisLabels += `<text x="${(gx + groupW / 2).toFixed(1)}" y="${height - 12}" font-size="14" fill="${MUTED}" text-anchor="middle">${labels[i]}</text>`
  }
  let grid = ''
  for (let g = 0; g <= 4; g++) {
    const y = padT + plotH - (g / 4) * plotH
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="${BORDER}" stroke-width="1"/>`
    grid += `<text x="${padL - 10}" y="${(y + 4).toFixed(1)}" font-size="12" fill="${MUTED}" text-anchor="end">${faNum((g / 4) * maxQ)}</text>`
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${grid}${bars}${axisLabels}</svg>`
}

const LINE_COLORS = [GOLD, YEAR_PREV, UP, '#e0787a', '#c58fe8']

// چند خط نرخ فروش هم‌زمان — هر محصول رنگ خودش، محور مشترک (چون خیلی وقت‌ها واحدها فرق دارن، مقیاس یکی از خط‌ها ممکنه کوچیک دیده بشه — طبیعیه نه باگ)
function multiLineChart({ width, height, labels, lines }) {
  const padL = 78, padR = 16, padT = 16, padB = 34
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const allVals = lines.flatMap(l => l.values.filter(v => v != null))
  const maxVal = Math.max(1, ...allVals)
  const n = labels.length
  const groupW = plotW / n
  let axisLabels = ''
  for (let i = 0; i < n; i++) {
    const gx = padL + i * groupW + groupW / 2
    axisLabels += `<text x="${gx.toFixed(1)}" y="${height - 12}" font-size="14" fill="${MUTED}" text-anchor="middle">${labels[i]}</text>`
  }
  let grid = ''
  for (let g = 0; g <= 4; g++) {
    const y = padT + plotH - (g / 4) * plotH
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="${BORDER}" stroke-width="1"/>`
    grid += `<text x="${padL - 10}" y="${(y + 4).toFixed(1)}" font-size="12" fill="${MUTED}" text-anchor="end">${faNum((g / 4) * maxVal)}</text>`
  }
  let paths = ''
  lines.forEach((l, li) => {
    const color = LINE_COLORS[li % LINE_COLORS.length]
    const pts = []
    let lastPt = null
    for (let i = 0; i < n; i++) {
      const v = l.values[i]
      if (v == null) continue
      const gx = padL + i * groupW + groupW / 2
      const gy = padT + plotH - (v / maxVal) * plotH
      pts.push(`${gx.toFixed(1)},${gy.toFixed(1)}`)
      lastPt = { x: gx, y: gy, v }
    }
    if (pts.length > 1) paths += `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>`
    paths += pts.map(pt => { const [x, y] = pt.split(','); return `<circle cx="${x}" cy="${y}" r="3" fill="${color}"/>` }).join('')
    if (lastPt) paths += `<text x="${(lastPt.x + 8).toFixed(1)}" y="${(lastPt.y - 6).toFixed(1)}" font-size="12" fill="${color}" text-anchor="start">${faNum(lastPt.v)}</text>`
  })
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${grid}${paths}${axisLabels}</svg>`
}

function legend(items) {
  return `<div class="legend">${items.map(it => `<span class="legendItem"><span class="dot" style="background:${it.color}"></span>${esc(it.label)}</span>`).join('')}</div>`
}

function tableRowHtml(r, tone) {
  return `<div class="trow${tone ? ' hilite' : ''}">
    <span class="tname">${esc(r.name)}</span>
    <span class="tval">${pct(r.shareLastMonth)}</span>
    <span class="tval">${pct(r.shareThisMonth)}</span>
    <span class="tval">${toman(r.avgYtd)}</span>
    <span class="tval">${toman(r.avg12mo)}</span>
    <span class="tval">${pct(r.share12mo)}</span>
  </div>`
}

function renderMonthlyReportCardHtml(data, companyName) {
  const chart1 = groupedBarChart({ width: 900, height: 190, labels: data.companyChart.labels, seriesA: data.companyChart.thisYear, seriesB: data.companyChart.lastYear, colorA: GOLD, colorB: YEAR_PREV })
  const chart2 = comboChart({ width: 900, height: 190, labels: data.volumeChart.labels, prod: data.volumeChart.prod, qty: data.volumeChart.qty })
  const chart3 = multiLineChart({ width: 900, height: 190, labels: data.rateChart.labels, lines: data.rateChart.lines })
  const rateLegendItems = data.rateChart.lines.map((l, i) => ({ color: LINE_COLORS[i % LINE_COLORS.length], label: `${l.name} (${l.channel === 'domestic' ? 'داخلی' : 'صادراتی'})` }))

  const groupsHtml = data.table.groups.map(g => `
    <div class="tgroupLabel">${esc(g.label)}</div>
    ${g.rows.map(r => tableRowHtml(r, r.name === 'سایر')).join('')}
    ${tableRowHtml({ name: `جمع ${g.label}`, ...g.subtotal }, true)}
  `).join('')

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 1600px; height: 1040px; background: ${BG}; }
  body { font-family: 'Vazirmatn', 'Noto Color Emoji', Tahoma, sans-serif; }
  .brand, .title, .tgroupLabel { font-family: 'Vazirmatn SemiBold', 'Vazirmatn', Tahoma, sans-serif; }
  .card { width: 1560px; height: 1000px; margin: 20px; background: linear-gradient(160deg, ${PANEL} 0%, ${BG} 100%);
    border: 1px solid ${BORDER}; border-radius: 24px; padding: 32px 40px; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .card::after { content: ''; position: absolute; top: 0; right: 0; left: 0; height: 4px; background: linear-gradient(90deg, ${GOLD}, transparent 70%); }
  .head { display: flex; align-items: center; justify-content: space-between; z-index: 1; margin-bottom: 8px; }
  .title { color: ${CREAM}; font-size: 30px; font-weight: 700; }
  .subtitle { color: ${MUTED}; font-size: 18px; margin-top: 4px; }
  .brand { color: ${GOLD}; font-size: 22px; display: flex; align-items: center; gap: 10px; }
  .brand img { width: 40px; height: 40px; border-radius: 50%; }
  .body { display: flex; flex: 1; gap: 28px; z-index: 1; min-height: 0; }
  .left { flex: 0 0 920px; display: flex; flex-direction: column; gap: 14px; }
  .panel { background: ${PANEL2}; border: 1px solid ${BORDER}; border-radius: 16px; padding: 10px 16px 2px; }
  .panelTitle { color: ${CREAM}; font-size: 16px; font-weight: 600; margin-bottom: 2px; }
  .legend { display: flex; gap: 16px; margin-bottom: 2px; }
  .legendItem { color: ${MUTED}; font-size: 13px; display: flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .right { flex: 1; background: ${PANEL2}; border: 1px solid ${BORDER}; border-radius: 16px; padding: 16px 18px; overflow: hidden; display: flex; flex-direction: column; }
  .theadRow { display: flex; align-items: center; gap: 6px; padding-bottom: 8px; border-bottom: 1px solid ${BORDER}; margin-bottom: 4px; }
  .theadRow span { color: ${MUTED}; font-size: 12px; text-align: center; }
  .tgroupLabel { color: ${GOLD}; font-size: 14px; margin-top: 10px; margin-bottom: 2px; }
  .trow { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .trow.hilite { background: ${HILITE}; border-radius: 8px; font-weight: 700; }
  .tname { flex: 1.5; color: ${CREAM}; font-size: 13px; display: flex; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .tval { flex: 1; color: ${CREAM}; font-size: 13px; text-align: center; direction: ltr; }
  .footer { z-index: 1; margin-top: 14px; color: ${MUTED}; font-size: 15px; text-align: center; }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div>
        <div class="title">${esc(companyName || data.symbol)} — گزارش فعالیت ماهانه</div>
        <div class="subtitle">دورهٔ منتهی به ${esc(data.period)}</div>
      </div>
      <div class="brand"><span>بورس سنج</span><img src="${LOGO_DATA_URI}" alt=""></div>
    </div>
    <div class="body">
      <div class="left">
        <div class="panel">
          <div class="panelTitle">مبلغ فروش ماهانه — میلیارد تومان</div>
          ${legend([{ color: GOLD, label: `سال مالی ${data.fiscalYear}` }, { color: YEAR_PREV, label: `سال مالی ${data.fiscalYear - 1}` }])}
          ${chart1}
        </div>
        <div class="panel">
          <div class="panelTitle">تولید/فروش (تعداد)</div>
          ${legend([{ color: BLUE, label: 'تولید' }, { color: GOLD, label: 'فروش' }])}
          ${chart2}
        </div>
        <div class="panel">
          <div class="panelTitle">نرخ فروش محصولات — ریال</div>
          ${legend(rateLegendItems)}
          ${chart3}
        </div>
      </div>
      <div class="right">
        <div class="panelTitle">سهم محصولات از فروش ناخالص (پیش از تخفیف/برگشت)</div>
        <div class="theadRow">
          <span style="flex:1.5;text-align:right">محصول</span>
          <span style="flex:1">سهم ماه قبل</span>
          <span style="flex:1">سهم این ماه</span>
          <span style="flex:1">میانگین سال مالی</span>
          <span style="flex:1">میانگین ۱۲ ماه</span>
          <span style="flex:1">سهم ۱۲ ماه</span>
        </div>
        ${groupsHtml}
      </div>
    </div>
    <div class="footer">⚠️ صرفاً اطلاع‌رسانی است، توصیه مالی نیست. — ${esc(SITE_URL)} — ${esc(TELEGRAM_CHANNEL)}</div>
  </div>
</body>
</html>`
}

async function screenshotMonthlyReportCard(browser, html) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1040, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  const buf = await page.screenshot({ type: 'jpeg', quality: 90 })
  await page.close()
  return buf
}

module.exports = { buildMonthlyReportData, renderMonthlyReportCardHtml, screenshotMonthlyReportCard }
