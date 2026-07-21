#!/usr/bin/env node
/**
 * portfolio-industry-alert.js — Portfolio Intelligence ساده (فاز ۳ نقشه راه، آیتم ۳).
 * برای هر کاربر لینک‌شده به بات پورتفوی تلگرام: وزن هر صنعت در پرتفوی سهامش را با وزن همان صنعت
 * در کل بازار (بر پایه ارزش بازار/mv از stock_industries) مقایسه می‌کند. اگر وزن پرتفوی حداقل
 * ۲برابر وزن بازار باشد و خودش حداقل ۲۰٪ کل ارزش سهامش را تشکیل بدهد، یک هشدار تلگرام می‌فرستد.
 *
 * فقط قاعده‌محور است — بدون تماس Gemini/API خارجی جدید؛ روی همان زیرساخت computePortfolioSummary
 * (lib/portfolioValuation.js، همان که بات تلگرام/optimize و snapshot روزانه استفاده می‌کنند) ساخته شده.
 *
 * env: TELEGRAM_PORTFOLIO_BOT_TOKEN, SUPABASE_URL/SUPABASE_KEY (service role), SITE_URL (اختیاری)
 *
 * usage: node scripts/portfolio-industry-alert.js
 *
 * crontab (UTC! نه تهران) — یک‌بار روزانه، ۱۳:۰۰ تهران (بعد بسته‌شدن بازار + آماده‌شدن stock_industries)، شنبه–چهارشنبه:
 *   30 9 * * 6,0-3 node scripts/portfolio-industry-alert.js >> /var/log/portfolio-industry-alert.log 2>&1
 */

'use strict'

const path = require('path')
const fs = require('fs')

function loadEnv(file) {
  const p = path.resolve(__dirname, file)
  if (!fs.existsSync(p)) return
  fs.readFileSync(p, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  })
}
loadEnv('../.env.local')
loadEnv('.env.sync')

const SITE = (process.env.SITE_URL || 'https://bourssanj.ir').replace(/\/$/, '')
const TOKEN = process.env.TELEGRAM_PORTFOLIO_BOT_TOKEN
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!TOKEN) { console.error('[portfolio-industry-alert] TELEGRAM_PORTFOLIO_BOT_TOKEN تنظیم نشده'); process.exit(1) }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('[portfolio-industry-alert] SUPABASE_URL/SUPABASE_KEY تنظیم نشده'); process.exit(1) }

const { createClient } = require('@supabase/supabase-js')
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})

const { computePortfolioSummary } = require('../lib/portfolioValuation')

const CONCENTRATION_RATIO = 2      // آستانه: حداقل ۲برابر وزن بازار
const MIN_PORTFOLIO_WEIGHT = 20    // آستانه: حداقل ۲۰٪ کل ارزش سهام پرتفوی
const MIN_STOCK_VALUE = 5_000_000  // زیر این مبلغ (تومان) تحلیل تمرکز بی‌معنی است

const fa = (v, d = 0) => Number(v || 0).toLocaleString('fa-IR', { maximumFractionDigits: d })
const tehranDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return res.json()
}

async function claimSend(key) {
  const { error } = await sb.from('telegram_alert_sent').insert({ key })
  if (!error) return true
  if (error.code === '23505') return false
  console.error(`[portfolio-industry-alert] claimSend خطا داد (${error.message}) — برای امنیت رد شد: ${key}`)
  return false
}

// symbol (l18) → نام صنعت + mv هر صنعت → وزن بازار
async function loadIndustryMap() {
  const res = await fetch(`${SITE}/api/stocks-industries`, { signal: AbortSignal.timeout(30_000) })
  const data = await res.json()
  const industries = Array.isArray(data.industries) ? data.industries : []
  const symbolToIndustry = new Map()
  let totalMv = 0
  const mvByIndustry = new Map()
  for (const ind of industries) {
    const mv = Number(ind.mv) || 0
    mvByIndustry.set(ind.name, mv)
    totalMv += mv
    for (const s of ind.symbols ?? []) symbolToIndustry.set(s.l18, ind.name)
  }
  const marketWeightPct = new Map()
  for (const [name, mv] of mvByIndustry) marketWeightPct.set(name, totalMv > 0 ? (mv / totalMv) * 100 : 0)
  return { symbolToIndustry, marketWeightPct }
}

async function main() {
  const { symbolToIndustry, marketWeightPct } = await loadIndustryMap()
  if (symbolToIndustry.size === 0) { console.log('[portfolio-industry-alert] stock_industries خالی است'); return }

  const { data: links, error } = await sb.from('telegram_links').select('user_id, telegram_chat_id')
  if (error) { console.error('[portfolio-industry-alert] telegram_links:', error.message); return }
  if (!links || links.length === 0) { console.log('[portfolio-industry-alert] کاربر لینک‌شده‌ای نیست'); return }

  const today = tehranDay()
  let alertsSent = 0

  for (const link of links) {
    let summary
    try {
      summary = await computePortfolioSummary(sb, link.user_id, SITE)
    } catch (e) {
      console.error(`[portfolio-industry-alert] summary failed (${link.user_id}):`, e.message)
      continue
    }

    const stockHoldings = summary.holdings.filter(h => h.assetType === 'stock' && h.value != null && h.value > 0)
    const stockTotal = stockHoldings.reduce((s, h) => s + h.value, 0)
    if (stockTotal < MIN_STOCK_VALUE) continue

    const valueByIndustry = new Map()
    for (const h of stockHoldings) {
      const industry = symbolToIndustry.get(h.symbol)
      if (!industry) continue
      valueByIndustry.set(industry, (valueByIndustry.get(industry) || 0) + h.value)
    }

    for (const [industry, value] of valueByIndustry) {
      const portfolioWeightPct = (value / stockTotal) * 100
      const marketPct = marketWeightPct.get(industry) || 0
      if (portfolioWeightPct < MIN_PORTFOLIO_WEIGHT) continue
      if (marketPct <= 0 || portfolioWeightPct < marketPct * CONCENTRATION_RATIO) continue

      const key = `portfolio_conc|${link.user_id}|${industry}|${today}`
      if (!(await claimSend(key))) continue

      const text = [
        `⚖️ هشدار تمرکز صنعتی پرتفوی`,
        ``,
        `صنعت «${industry}» ${fa(portfolioWeightPct, 1)}٪ از ارزش سهام پرتفوی شما را تشکیل می‌دهد،`,
        `در حالی‌که وزن همین صنعت در کل بازار حدود ${fa(marketPct, 1)}٪ است.`,
        ``,
        `این پیام صرفاً اطلاع‌رسانی درباره سطح تمرکز/ریسک است و توصیه خرید یا فروش نیست.`,
      ].join('\n')

      const r = await tg('sendMessage', { chat_id: link.telegram_chat_id, text })
      if (!r.ok) console.error(`[portfolio-industry-alert] ارسال ناموفق (${link.user_id} → ${industry}):`, r.description)
      else alertsSent++
    }
  }

  console.log(`✅ ${alertsSent} هشدار تمرکز صنعتی ارسال شد`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
