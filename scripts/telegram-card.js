#!/usr/bin/env node
/**
 * telegram-card.js
 *
 * بورس سنج — کارت آماری برای پست‌های تلگرام. به‌جای اسکرین‌شات از صفحهٔ سایت،
 * از رو اعداد خودمون یک کارت گرافیکی می‌سازیم (فونت وزیرمتن، تم تیره سایت).
 *
 * استفاده:
 *   const { renderCardHtml, screenshotCard } = require('./telegram-card')
 *   const html = renderCardHtml({ emoji, title, subtitle, bigStat, rows, footer })
 *   const buf = await screenshotCard(browser, html)
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
const BORDER = '#2a2f3a'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const toneColor = (tone) => (tone === 'up' ? UP : tone === 'down' ? DOWN : CREAM)

function renderCardHtml({ emoji = '📊', title, subtitle, bigStat, rows = [], footer }) {
  const rowsHtml = rows.map(r => `
    <div class="row">
      <span class="label">${esc(r.label)}</span>
      <span class="value" style="color:${toneColor(r.tone)}">${esc(r.value)}</span>
    </div>`).join('')

  const bigHtml = bigStat ? `
    <div class="big">
      <span class="bigValue" style="color:${toneColor(bigStat.tone)}">${esc(bigStat.value)}</span>
      <span class="bigLabel">${esc(bigStat.label)}</span>
    </div>` : ''

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 1080px; height: 760px; background: ${BG}; }
  body {
    font-family: 'Vazirmatn', 'Noto Color Emoji', Tahoma, sans-serif;
    display: flex; align-items: center; justify-content: center;
    height: 100%;
  }
  /* وزیرمتن روی سرور به‌صورت چند فونت جدا (هر وزن، یک نام) نصب است — با اسم دقیق صداش می‌زنیم تا واقعاً بولد شود، نه بولد جعلی مرورگر */
  .brand, .title { font-family: 'Vazirmatn SemiBold', 'Vazirmatn', Tahoma, sans-serif; }
  .bigValue { font-family: 'Vazirmatn Black', 'Vazirmatn', Tahoma, sans-serif; }
  .value { font-family: 'Vazirmatn Medium', 'Vazirmatn', Tahoma, sans-serif; }
  .card {
    width: 1000px; height: 680px;
    background: linear-gradient(160deg, ${PANEL} 0%, ${BG} 100%);
    border: 1px solid ${BORDER};
    border-radius: 28px;
    padding: 48px 56px;
    display: flex; flex-direction: column;
    position: relative;
    overflow: hidden;
    box-shadow: 0 30px 80px rgba(0,0,0,0.45);
  }
  .card::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(circle at 85% 10%, rgba(202,166,106,0.14), transparent 55%);
  }
  .card::after {
    content: ''; position: absolute; top: 0; right: 0; left: 0; height: 5px;
    background: linear-gradient(90deg, ${GOLD}, transparent 70%);
  }
  .brand { color: ${GOLD}; font-size: 26px; font-weight: 700; display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
  .brand img { width: 44px; height: 44px; border-radius: 50%; }
  .brandFooter { z-index: 1; margin-top: 10px; color: ${MUTED}; font-size: 15px; text-align: center; }
  .head { display: flex; align-items: center; justify-content: space-between; z-index: 1; }
  .head .emoji { font-size: 40px; }
  .title { color: ${CREAM}; font-size: 34px; font-weight: 700; margin-top: 6px; }
  .subtitle { color: ${MUTED}; font-size: 22px; margin-top: 4px; }
  .big { z-index: 1; margin: 28px 0; display: flex; flex-direction: column; align-items: center; }
  .bigValue { font-size: 88px; font-weight: 800; direction: ltr; }
  .bigLabel { color: ${MUTED}; font-size: 22px; margin-top: 6px; }
  .rows { z-index: 1; display: flex; flex-direction: column; gap: 14px; margin-top: auto; }
  .row { display: flex; align-items: center; justify-content: space-between; font-size: 24px;
    border-top: 1px solid ${BORDER}; padding-top: 14px; }
  .label { color: ${MUTED}; }
  .value { color: ${CREAM}; font-weight: 700; direction: ltr; }
  .footer { z-index: 1; margin-top: 24px; color: ${MUTED}; font-size: 18px; text-align: center; }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div>
        <div class="title">${esc(title)}</div>
        ${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
      </div>
      <div>
        <div class="brand"><span>بورس سنج</span><img src="${LOGO_DATA_URI}" alt=""></div>
        <div class="emoji" style="text-align:left">${esc(emoji)}</div>
      </div>
    </div>
    ${bigHtml}
    <div class="rows">${rowsHtml}</div>
    ${footer ? `<div class="footer">${esc(footer)}</div>` : ''}
    <div class="brandFooter">${esc(SITE_URL)} — ${esc(TELEGRAM_CHANNEL)}</div>
  </div>
</body>
</html>`
}

async function screenshotCard(browser, html) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1080, height: 760, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  const buf = await page.screenshot({ type: 'jpeg', quality: 90 })
  await page.close()
  return buf
}

// ── کارت «رصد لحظه‌ای بازار» با چارت (نه اعداد متنی) ─────────────────
// همهٔ svg سرور-ساخته (بدون <script> مرورگری) تا اسکرین‌شات puppeteer
// وابسته به تایمینگ اجرای جاوااسکریپت نباشد.

const CHART_W = 940 // عرض منطقی viewBox — با width:100% به عرض واقعی باکس کشیده می‌شود
const BIG_H = 78
const MINI_W = 600
const MINI_H = 44

const fmtSigned = (v, dec = 1) => `${v >= 0 ? '+' : ''}${Number(v).toLocaleString('fa-IR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`
const fmtNum = (v, dec = 0) => Number(v).toLocaleString('fa-IR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

function linePathStr(data, w, h, min, max, padY = 8) {
  const n = data.length
  const x = (i) => (i / (n - 1)) * w
  const y = (v) => h - padY - ((v - min) / (max - min || 1)) * (h - padY * 2)
  return data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
}
function areaPathStr(data, w, h, min, max, padY = 8) {
  const n = data.length
  const x = (i) => (i / (n - 1)) * w
  const y = (v) => h - padY - ((v - min) / (max - min || 1)) * (h - padY * 2)
  const zeroY = y(Math.max(min, Math.min(max, 0)))
  let d = `M 0 ${zeroY.toFixed(1)} `
  data.forEach((v, i) => (d += `L ${x(i).toFixed(1)} ${y(v).toFixed(1)} `))
  d += `L ${x(n - 1).toFixed(1)} ${zeroY.toFixed(1)} Z`
  return d
}

// چارت خطی «علامت‌دار»: بالای صفر سبز، زیر صفر قرمز — حتی وسط چارت هم علامت عوض شود رنگ عوض می‌شود
// روی هر نقطه، عدد همان لحظه نوشته می‌شود (نه فقط آخرین نقطه)
function signedChartSvg(id, data, w, h) {
  if (!data.length) return ''
  const min = Math.min(...data, 0)
  const max = Math.max(...data, 0)
  const padY = 18 // فضای اضافه برای برچسب عددی بالا/پایین هر نقطه
  const y = (v) => h - padY - ((v - min) / (max - min || 1)) * (h - padY * 2)
  const zeroY = y(0)
  const areaD = areaPathStr(data, w, h, min, max, padY)
  const lineD = linePathStr(data, w, h, min, max, padY)
  const n = data.length
  const dots = data.map((v, i) => {
    const x = (i / (n - 1)) * w
    const c = v >= 0 ? UP : DOWN
    const last = i === n - 1
    return `<circle cx="${x.toFixed(1)}" cy="${y(v).toFixed(1)}" r="${last ? 4.5 : 2.5}" fill="${last ? c : BG}" stroke="${c}" stroke-width="2"/>`
  }).join('')
  const labels = data.map((v, i) => {
    const x = (i / (n - 1)) * w
    const c = v >= 0 ? UP : DOWN
    const ly = v >= 0 ? y(v) - 7 : y(v) + 13
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
    return `<text x="${x.toFixed(1)}" y="${ly.toFixed(1)}" font-size="10.5" font-weight="700" fill="${c}" text-anchor="${anchor}">${fmtSigned(v)}</text>`
  }).join('')
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="chartSvg">
    <defs>
      <clipPath id="${id}Up"><rect x="0" y="0" width="${w}" height="${zeroY.toFixed(1)}"/></clipPath>
      <clipPath id="${id}Down"><rect x="0" y="${zeroY.toFixed(1)}" width="${w}" height="${(h - zeroY).toFixed(1)}"/></clipPath>
    </defs>
    <line x1="0" y1="${zeroY.toFixed(1)}" x2="${w}" y2="${zeroY.toFixed(1)}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="4 4"/>
    <path d="${areaD}" fill="${UP}" fill-opacity="0.16" clip-path="url(#${id}Up)"/>
    <path d="${areaD}" fill="${DOWN}" fill-opacity="0.16" clip-path="url(#${id}Down)"/>
    <path d="${lineD}" fill="none" stroke="${UP}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${id}Up)"/>
    <path d="${lineD}" fill="none" stroke="${DOWN}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${id}Down)"/>
    ${dots}
    ${labels}
  </svg>`
}

// چارت خطی خنثی (بدون معنی مثبت/منفی) — مثلاً ارزش کل معاملات، همیشه یک رنگ
function neutralChartSvg(data, w, h, color) {
  if (!data.length) return ''
  const min = Math.min(...data)
  const max = Math.max(...data)
  const padY = 8
  const n = data.length
  const x = (i) => (i / (n - 1)) * w
  const y = (v) => h - padY - ((v - min) / (max - min || 1)) * (h - padY * 2)
  let area = `M 0 ${h} `
  data.forEach((v, i) => (area += `L ${x(i).toFixed(1)} ${y(v).toFixed(1)} `))
  area += `L ${x(n - 1).toFixed(1)} ${h} Z`
  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const dots = data.map((v, i) => {
    const last = i === n - 1
    return `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${last ? 4.5 : 2.5}" fill="${last ? color : BG}" stroke="${color}" stroke-width="2"/>`
  }).join('')
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="chartSvg">
    <path d="${area}" fill="${color}" fill-opacity="0.14"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </svg>`
}

// چارت خطی دوگانه (سبز/قرمز) بدون پرشدگی — برای سرانه خرید/فروش
function dualLineChartSvg(up, down, w, h) {
  if (!up.length) return ''
  const all = [...up, ...down]
  const min = Math.min(...all)
  const max = Math.max(...all)
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="chartSvg">
    <path d="${linePathStr(down, w, h, min, max, 6)}" fill="none" stroke="${DOWN}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>
    <path d="${linePathStr(up, w, h, min, max, 6)}" fill="none" stroke="${UP}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`
}

// چارت میله‌ای جفتی — برای صف خرید/فروش، تعداد نماد مثبت/منفی
function barChartSvg(up, down, w, h) {
  if (!up.length) return ''
  const n = up.length
  const maxVal = Math.max(...up, ...down, 1)
  const groupW = w / n
  const barW = groupW * 0.3
  const gap = groupW * 0.08
  let bars = `<line x1="0" y1="${h - 0.5}" x2="${w}" y2="${h - 0.5}" stroke="${BORDER}" stroke-width="1"/>`
  for (let i = 0; i < n; i++) {
    const gx = i * groupW + groupW / 2
    const upH = (up[i] / maxVal) * (h - 10)
    const downH = (down[i] / maxVal) * (h - 10)
    bars += `<rect x="${(gx - barW - gap / 2).toFixed(1)}" y="${(h - upH).toFixed(1)}" width="${barW.toFixed(1)}" height="${upH.toFixed(1)}" rx="2" fill="${UP}"/>`
    bars += `<rect x="${(gx + gap / 2).toFixed(1)}" y="${(h - downH).toFixed(1)}" width="${barW.toFixed(1)}" height="${downH.toFixed(1)}" rx="2" fill="${DOWN}"/>`
  }
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="chartSvg">${bars}</svg>`
}

// { emoji, title, subtitle, times: string[], flow: number[], tval: number[],
//   queue: {buy:number[], sell:number[]}, sym: {pos:number[], neg:number[]}, pc: {buy:number[], sell:number[]}, footer }
function renderMarketCardHtml({ emoji = '📊', title, subtitle, times = [], flow = [], tval = [], queue, sym, pc, footer }) {
  const axisHtml = (arr) => arr.map((t) => `<span>${esc(t)}</span>`).join('')
  const lastFlow = flow.length ? flow[flow.length - 1] : null
  const lastTval = tval.length ? tval[tval.length - 1] : null

  const miniRow = (label, chartSvg, legendUp, legendDown) => `
    <div class="miniRow">
      <span class="rLabel">${esc(label)}</span>
      <span class="rChart">${chartSvg}</span>
      <span class="rLegend">
        <span class="legendItem" style="color:${UP}">${esc(legendUp)}</span>
        <span class="legendItem" style="color:${DOWN}">${esc(legendDown)}</span>
      </span>
    </div>`

  const queueHtml = queue ? miniRow(
    'صف خرید / فروش',
    barChartSvg(queue.buy, queue.sell, MINI_W, MINI_H),
    `${fmtNum(queue.buy.at(-1) ?? 0)} خرید`,
    `${fmtNum(queue.sell.at(-1) ?? 0)} فروش`,
  ) : ''

  const symHtml = sym ? miniRow(
    'نماد مثبت / منفی',
    barChartSvg(sym.pos, sym.neg, MINI_W, MINI_H),
    `${fmtNum(sym.pos.at(-1) ?? 0)} مثبت`,
    `${fmtNum(sym.neg.at(-1) ?? 0)} منفی`,
  ) : ''

  const pcHtml = pc ? miniRow(
    'سرانه خرید/فروش حقیقی (م.ت)',
    dualLineChartSvg(pc.buy, pc.sell, MINI_W, MINI_H),
    `${fmtNum(pc.buy.at(-1) ?? 0, 1)} خرید`,
    `${fmtNum(pc.sell.at(-1) ?? 0, 1)} فروش`,
  ) : ''

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 1080px; height: 760px; background: ${BG}; }
  body {
    font-family: 'Vazirmatn', 'Noto Color Emoji', Tahoma, sans-serif;
    display: flex; align-items: center; justify-content: center;
    height: 100%;
  }
  .brand, .title { font-family: 'Vazirmatn SemiBold', 'Vazirmatn', Tahoma, sans-serif; }
  .chartValue { font-family: 'Vazirmatn Black', 'Vazirmatn', Tahoma, sans-serif; }
  .card {
    width: 1000px; height: 680px;
    background: linear-gradient(160deg, ${PANEL} 0%, ${BG} 100%);
    border: 1px solid ${BORDER};
    border-radius: 28px;
    padding: 40px 52px;
    display: flex; flex-direction: column;
    position: relative;
    overflow: hidden;
    box-shadow: 0 30px 80px rgba(0,0,0,0.45);
  }
  .card::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(circle at 85% 10%, rgba(202,166,106,0.14), transparent 55%);
  }
  .card::after {
    content: ''; position: absolute; top: 0; right: 0; left: 0; height: 5px;
    background: linear-gradient(90deg, ${GOLD}, transparent 70%);
  }
  .brand { color: ${GOLD}; font-size: 24px; font-weight: 700; display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
  .brand img { width: 40px; height: 40px; border-radius: 50%; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; z-index: 1; }
  .head .emoji { font-size: 36px; text-align: left; margin-top: 4px; }
  .title { color: ${CREAM}; font-size: 30px; font-weight: 700; margin-top: 4px; }
  .subtitle { color: ${MUTED}; font-size: 18px; margin-top: 2px; }

  .charts { z-index: 1; margin-top: 12px; display: flex; flex-direction: column; gap: 9px; }

  .mainChart { border: 1px solid ${BORDER}; border-radius: 14px; background: rgba(255,255,255,0.015); padding: 12px 18px 6px; overflow: hidden; }
  .chartHead { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 2px; }
  .chartLabel { color: ${MUTED}; font-size: 15px; }
  .chartValue { font-size: 24px; font-weight: 800; direction: ltr; }
  .chartValue.up { color: ${UP}; }
  .chartValue.down { color: ${DOWN}; }
  .chartValue.neutral { color: ${CREAM}; }
  .chartBody { direction: ltr; width: 100%; }
  .chartSvg { display: block; width: 100%; height: ${BIG_H}px; }
  .miniRow .chartSvg { height: ${MINI_H}px; }
  .axis { display: flex; justify-content: space-between; margin-top: 1px; direction: ltr; }
  .axis span { color: #6b6455; font-size: 11px; }

  .miniRow { border-top: 1px solid ${BORDER}; padding-top: 7px; display: flex; align-items: center; gap: 16px; }
  .miniRow .rLabel { width: 190px; flex-shrink: 0; color: ${MUTED}; font-size: 15px; }
  .miniRow .rChart { flex: 1; direction: ltr; min-width: 0; display: block; }
  .miniRow .rLegend { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; width: 140px; flex-shrink: 0; }
  .legendItem { font-size: 13px; font-weight: 700; direction: ltr; }

  .footer { z-index: 1; margin-top: auto; padding-top: 8px; color: ${MUTED}; font-size: 14px; text-align: center; }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div>
        <div class="title">${esc(title)}</div>
        ${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
      </div>
      <div>
        <div class="brand"><span>بورس سنج</span><img src="${LOGO_DATA_URI}" alt=""></div>
        <div class="emoji">${esc(emoji)}</div>
      </div>
    </div>

    <div class="charts">
      <div class="mainChart">
        <div class="chartHead">
          <span class="chartLabel">ورود / خروج پول حقیقی (میلیارد تومان)</span>
          ${lastFlow != null ? `<span class="chartValue ${lastFlow >= 0 ? 'up' : 'down'}">${fmtSigned(lastFlow)}</span>` : ''}
        </div>
        <div class="chartBody">${signedChartSvg('flow', flow, CHART_W, BIG_H)}</div>
        <div class="axis">${axisHtml(times)}</div>
      </div>

      <div class="mainChart">
        <div class="chartHead">
          <span class="chartLabel">ارزش کل معاملات (میلیارد تومان)</span>
          ${lastTval != null ? `<span class="chartValue neutral">${fmtNum(lastTval)}</span>` : ''}
        </div>
        <div class="chartBody">${neutralChartSvg(tval, CHART_W, BIG_H, CREAM)}</div>
        <div class="axis">${axisHtml(times)}</div>
      </div>

      ${queueHtml}
      ${symHtml}
      ${pcHtml}
    </div>

    <div class="footer">${esc(footer)} — ${esc(SITE_URL)} — ${esc(TELEGRAM_CHANNEL)}</div>
  </div>
</body>
</html>`
}

module.exports = { renderCardHtml, renderMarketCardHtml, screenshotCard }
