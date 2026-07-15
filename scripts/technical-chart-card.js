#!/usr/bin/env node
/**
 * technical-chart-card.js
 *
 * بورس سنج — کارت عکسی نمودار کندلی روزانه (از stock_candles) + پنل آمار
 * برای دو مصرف: ۱) پست تلگرام (مثل monthly/quarterly-report-card.js) ۲) ورودی تصویری Gemini
 * در /api/chart-narrative (Gemini چارت را می‌بیند و تفسیر فنی فارسی می‌نویسد — الگوی AI-Kline)
 *
 *   const { buildTechnicalChartData, renderTechnicalChartCardHtml, screenshotTechnicalChartCard } = require('./technical-chart-card')
 *   const data = buildTechnicalChartData(candles) // candles: ردیف‌های stock_candles، مرتب بر اساس trade_date صعودی
 *   if (data) { const html = renderTechnicalChartCardHtml(data, companyName); const buf = await screenshotTechnicalChartCard(browser, html) }
 */

'use strict'

const { SITE_URL, TELEGRAM_CHANNEL, LOGO_DATA_URI } = require('./brand-assets')

const CREAM = '#ddd5bd'
const MUTED = '#a99f88'
const GOLD = '#caa66a'
const UP = '#3ddc84'
const DOWN = '#ff5c5c'
const BG = '#0b0d12'
const PANEL = '#161a22'
const PANEL2 = '#1c212b'
const BORDER = '#2a2f3a'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const faNum = (v, dec = 0) => v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('fa-IR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const pct = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${faNum(v, 1)}٪`

const N_DEFAULT = 60

// آخرین N کندل + آمار پایه — برای نمودار و پنل کنار آن
function buildTechnicalChartData(candles, n = N_DEFAULT) {
  const rows = (candles || []).filter(c => c.open != null && c.high != null && c.low != null && c.close != null).slice(-n)
  if (rows.length < 5) return null

  const first = rows[0]
  const last = rows[rows.length - 1]
  const periodHigh = Math.max(...rows.map(r => r.high))
  const periodLow = Math.min(...rows.map(r => r.low))
  const changePct = first.close ? ((last.close - first.close) / first.close) * 100 : null
  const volumes = rows.map(r => r.volume ?? 0)
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / (volumes.length || 1)
  const recentAvgVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, volumes.length)

  return {
    candles: rows,
    stats: {
      lastClose: last.close,
      changePct,
      periodHigh,
      periodLow,
      avgVolume,
      recentAvgVolume,
      fromDate: first.trade_date_shamsi ?? first.trade_date,
      toDate: last.trade_date_shamsi ?? last.trade_date,
    },
  }
}

// نمودار کندلی + میله‌های حجم — بدون هیچ کتابخانه‌ای، فقط SVG خام (مثل multiLineChart در گزارش‌های دیگر)
function candleChartSvg({ width, height, candles }) {
  const padL = 70, padR = 16, padT = 16, padB = 30
  const volH = 70
  const priceH = height - padT - padB - volH - 10
  const plotW = width - padL - padR
  const n = candles.length

  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)
  const maxP = Math.max(...highs)
  const minP = Math.min(...lows)
  const range = (maxP - minP) || 1
  const maxV = Math.max(1, ...candles.map(c => c.volume ?? 0))

  const slotW = plotW / n
  const bodyW = Math.max(1, slotW * 0.62)
  const yOf = (p) => padT + priceH - ((p - minP) / range) * priceH
  const volTop = padT + priceH + 10

  let grid = ''
  for (let g = 0; g <= 4; g++) {
    const val = minP + (g / 4) * range
    const y = padT + priceH - (g / 4) * priceH
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="${BORDER}" stroke-width="1"/>`
    grid += `<text x="${padL - 10}" y="${(y + 4).toFixed(1)}" font-size="12" fill="${MUTED}" text-anchor="end">${faNum(val)}</text>`
  }

  let bars = '', vols = '', axisLabels = ''
  const labelEvery = Math.max(1, Math.round(n / 8))
  candles.forEach((c, i) => {
    const cx = padL + i * slotW + slotW / 2
    const up = c.close >= c.open
    const color = up ? UP : DOWN
    const yHigh = yOf(c.high), yLow = yOf(c.low)
    const yOpen = yOf(c.open), yClose = yOf(c.close)
    const bodyTop = Math.min(yOpen, yClose)
    const bodyH = Math.max(1, Math.abs(yClose - yOpen))
    bars += `<line x1="${cx.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yLow.toFixed(1)}" stroke="${color}" stroke-width="1.5"/>`
    bars += `<rect x="${(cx - bodyW / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${bodyW.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${color}"/>`

    const vH = ((c.volume ?? 0) / maxV) * volH
    vols += `<rect x="${(cx - bodyW / 2).toFixed(1)}" y="${(volTop + volH - vH).toFixed(1)}" width="${bodyW.toFixed(1)}" height="${vH.toFixed(1)}" fill="${color}" opacity="0.55"/>`

    if (i % labelEvery === 0 || i === n - 1) {
      axisLabels += `<text x="${cx.toFixed(1)}" y="${height - 8}" font-size="12" fill="${MUTED}" text-anchor="middle">${esc(c.trade_date_shamsi ?? c.trade_date ?? '')}</text>`
    }
  })

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${grid}${bars}${vols}${axisLabels}</svg>`
}

function statRow(label, value, tone) {
  return `<div class="srow"><span class="slabel">${esc(label)}</span><span class="svalue" style="color:${tone === 'up' ? UP : tone === 'down' ? DOWN : CREAM}">${esc(value)}</span></div>`
}

function renderTechnicalChartCardHtml(data, companyName) {
  const chart = candleChartSvg({ width: 1200, height: 460, candles: data.candles })
  const st = data.stats

  const statsHtml = [
    statRow('قیمت پایانی', `${faNum(st.lastClose)} ریال`),
    st.changePct != null ? statRow(`تغییر ${data.candles.length} کندل اخیر`, pct(st.changePct), st.changePct >= 0 ? 'up' : 'down') : '',
    statRow('سقف دوره', `${faNum(st.periodHigh)} ریال`),
    statRow('کف دوره', `${faNum(st.periodLow)} ریال`),
    statRow('میانگین حجم ۵ روز اخیر', faNum(st.recentAvgVolume)),
    statRow('میانگین حجم دوره', faNum(st.avgVolume)),
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
  .left { flex: 0 0 1240px; display: flex; flex-direction: column; }
  .panel { background: ${PANEL2}; border: 1px solid ${BORDER}; border-radius: 16px; padding: 14px 16px 4px; flex: 1; }
  .right { flex: 1; background: ${PANEL2}; border: 1px solid ${BORDER}; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
  .srow { display: flex; align-items: center; justify-content: space-between; padding: 16px 4px; border-top: 1px solid ${BORDER}; font-size: 20px; }
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
        <div class="title">${esc(companyName || data.symbol)} — نمودار کندلی روزانه</div>
        <div class="subtitle">از ${esc(st.fromDate)} تا ${esc(st.toDate)}</div>
      </div>
      <div class="brand"><span>بورس سنج</span><img src="${LOGO_DATA_URI}" alt=""></div>
    </div>
    <div class="body">
      <div class="left"><div class="panel">${chart}</div></div>
      <div class="right">${statsHtml}</div>
    </div>
    <div class="footer">⚠️ صرفاً اطلاع‌رسانی است، توصیه مالی نیست. — ${esc(SITE_URL)} — ${esc(TELEGRAM_CHANNEL)}</div>
  </div>
</body>
</html>`
}

async function screenshotTechnicalChartCard(browser, html) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  const buf = await page.screenshot({ type: 'jpeg', quality: 90 })
  await page.close()
  return buf
}

module.exports = { buildTechnicalChartData, candleChartSvg, renderTechnicalChartCardHtml, screenshotTechnicalChartCard }
