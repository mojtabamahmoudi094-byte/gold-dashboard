#!/usr/bin/env node
/**
 * technical-narrate-test.js — تست دستی پایپ‌لاین P2 (LLM چارت‌بین)
 *
 * می‌سازد: آخرین ۶۰ کندل نماد از stock_candles → عکس چارت (technical-chart-card.js)
 * → POST به /api/chart-narrative (Gemini با ورودی تصویری) → چاپ تفسیر فارسی
 * فایل عکس را هم برای بازبینی چشمی می‌نویسد: scripts/chart-test-<نماد>.jpg
 *
 *   node technical-narrate-test.js شپدیس
 */

'use strict'

const path = require('path')
const fs = require('fs')

function loadEnv(file) {
  const p = path.resolve(__dirname, file)
  if (!fs.existsSync(p)) return
  fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] = m[2].trim()
  })
}
loadEnv('../.env.local')
loadEnv('.env.sync')
loadEnv('.env')

const { sbClient } = require('./codal-company-reports.js')
const { buildTechnicalChartData, renderTechnicalChartCardHtml, screenshotTechnicalChartCard } = require('./technical-chart-card.js')

const SITE = process.env.SITE_URL || 'https://bourssanj.ir'
const SYMBOL = process.argv[2]
if (!SYMBOL) { console.log('استفاده: node technical-narrate-test.js <نماد>'); process.exit(1) }

async function main() {
  const sb = sbClient()
  if (!sb) throw new Error('SUPABASE_URL/SUPABASE_KEY تنظیم نشده')

  const { data, error } = await sb
    .from('stock_candles')
    .select('trade_date, trade_date_shamsi, open, high, low, close, volume, adj_open, adj_high, adj_low, adj_close')
    .eq('symbol', SYMBOL)
    .order('trade_date', { ascending: true })
    .limit(400)
  if (error) throw new Error(`stock_candles select: ${error.message}`)

  // قیمت تعدیل‌شده را ترجیح می‌دهیم — خام با افزایش سرمایه/تقسیم سود پرش کاذب نشان می‌دهد
  const adjusted = data
    .filter(r => r.close != null && r.close > 0)
    .map(r => {
      const c = (r.adj_close != null && r.adj_close > 0) ? r.adj_close : r.close
      return {
        trade_date: r.trade_date, trade_date_shamsi: r.trade_date_shamsi,
        open: r.adj_open ?? r.open ?? c, high: r.adj_high ?? r.high ?? c, low: r.adj_low ?? r.low ?? c,
        close: c, volume: r.volume ?? 0,
      }
    })

  const chartData = buildTechnicalChartData(adjusted)
  if (!chartData) throw new Error('کندل کافی برای این نماد نیست')
  console.log('آمار چارت:', chartData.stats)

  const html = renderTechnicalChartCardHtml(chartData, SYMBOL)
  const puppeteer = require('puppeteer')
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  const buf = await screenshotTechnicalChartCard(browser, html)
  await browser.close()

  const outFile = path.join(__dirname, `chart-test-${SYMBOL.replace(/\s+/g, '-')}.jpg`)
  fs.writeFileSync(outFile, buf)
  console.log(`🖼  عکس نوشته شد: ${outFile} (برای بازبینی چشمی دانلودش کن)`)

  const res = await fetch(`${SITE}/api/chart-narrative`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol: SYMBOL,
      imageBase64: buf.toString('base64'),
      mimeType: 'image/jpeg',
      stats: chartData.stats,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  const json = await res.json()
  console.log('\nپاسخ Gemini:', JSON.stringify(json, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
