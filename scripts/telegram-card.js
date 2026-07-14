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

module.exports = { renderCardHtml, screenshotCard }
