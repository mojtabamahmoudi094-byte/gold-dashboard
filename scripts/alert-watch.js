#!/usr/bin/env node
/**
 * alert-watch.js — چک هشدارهای فعال کاربران (جدول alerts) و ارسال پیام تلگرام هنگام رسیدن به هدف.
 *
 * price: از همان API داخلی که app/portfolio/page.tsx استفاده می‌کند (lib/portfolioValuation.fetchPriceMap)
 *        می‌خواند — مصرف BrsApi اضافه ندارد. باید ساعت بازار هر چند دقیقه اجرا شود.
 * bubble: با --bubble یک‌بار /api/gold-analysis را صدا می‌زند (خودش کش ۶۰ ثانیه‌ای سرور دارد) —
 *        طبق تایید کاربر هر ۱۵ دقیقه یک‌بار با این فلگ اجرا شود، نه بیشتر.
 *
 * env (از .env.local یا .env.sync خوانده می‌شود):
 *   SITE_URL                      پیش‌فرض https://bourssanj.ir
 *   TELEGRAM_PORTFOLIO_BOT_TOKEN  همان بات پورتفوی (scripts/telegram-portfolio-bot.js) — پیام per-user
 *   SUPABASE_URL / SUPABASE_KEY   باید service_role باشد (برای دیدن alerts همه کاربران، دور زدن RLS)
 *
 * usage:
 *   node scripts/alert-watch.js            → فقط price alerts
 *   node scripts/alert-watch.js --bubble    → price + bubble alerts
 *
 * crontab (UTC! نه تهران — فرق ۳:۳۰ ساعت):
 *   (هر ۵ دقیقه) 5-9 (هر روز) (هر ماه) 0-4   node scripts/alert-watch.js            # ساعت بازار تهران ۸:۳۰-۱۲:۳۰
 *   (هر ۱۵ دقیقه) (هر ساعت) (هر روز) (هر ماه) (هر روز هفته)   node scripts/alert-watch.js --bubble
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

if (!TOKEN) { console.error('[alert-watch] TELEGRAM_PORTFOLIO_BOT_TOKEN تنظیم نشده'); process.exit(1) }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('[alert-watch] SUPABASE_URL/SUPABASE_KEY تنظیم نشده'); process.exit(1) }

const { createClient } = require('@supabase/supabase-js')
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})
const { fetchPriceMap } = require('../lib/portfolioValuation')

const includeBubble = process.argv.includes('--bubble')

const fa = (v, d = 0) => Number(v).toLocaleString('fa-IR', { maximumFractionDigits: d })

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return res.json()
}

async function notify(userId, text) {
  const { data: link } = await sb.from('telegram_links').select('telegram_chat_id').eq('user_id', userId).maybeSingle()
  if (!link) { console.warn('[alert-watch] کاربر تلگرام وصل نکرده، هشدار بی‌صدا رد شد:', userId); return }
  const r = await tg('sendMessage', { chat_id: link.telegram_chat_id, text, parse_mode: 'HTML' })
  if (!r.ok) console.error('[alert-watch] ارسال تلگرام ناموفق:', r.description)
}

async function checkPriceAlerts() {
  const { data: alerts, error } = await sb.from('alerts').select('*').eq('status', 'active').eq('kind', 'price')
  if (error) { console.error('[alert-watch] خواندن price alerts ناموفق:', error.message); return }
  if (!alerts?.length) return

  const priceMap = await fetchPriceMap(SITE) // ریال
  for (const a of alerts) {
    const priceRial = priceMap.get(a.symbol)
    if (priceRial == null) continue
    const priceToman = priceRial / 10
    const hit = a.direction === 'above' ? priceToman >= a.target_value : priceToman <= a.target_value
    if (!hit) continue

    await sb.from('alerts').update({
      status: 'triggered', triggered_at: new Date().toISOString(), triggered_value: priceToman,
    }).eq('id', a.id)

    const dirLabel = a.direction === 'above' ? 'به هدف رسید یا از آن بالاتر رفت' : 'به هدف رسید یا از آن پایین‌تر رفت'
    await notify(a.user_id,
      `🔔 <b>هشدار قیمت</b>\n${a.label || a.symbol} با قیمت ${fa(priceToman)} تومان ${dirLabel}.\nهدف شما: ${fa(a.target_value)} تومان`)
  }
}

async function checkBubbleAlerts() {
  const { data: alerts, error } = await sb.from('alerts').select('*').eq('status', 'active').eq('kind', 'bubble')
  if (error) { console.error('[alert-watch] خواندن bubble alerts ناموفق:', error.message); return }
  if (!alerts?.length) return

  const res = await fetch(`${SITE}/api/gold-analysis`)
  const data = await res.json()
  const ime = data?.ime
  if (!ime) { console.warn('[alert-watch] پاسخ gold-analysis بدون ime'); return }

  const bubblePct = (market, fair) => (market != null && fair != null && fair !== 0) ? ((market - fair) / fair) * 100 : null
  const values = {
    bullion: bubblePct(ime.goldBarT, ime.fairBullion),
    coin: bubblePct(ime.goldCoinT, ime.fairCoinCert),
    silver: bubblePct(ime.silverBarT, ime.fairSilverGram),
  }
  const labels = { bullion: 'حباب شمش طلا', coin: 'حباب سکه', silver: 'حباب شمش نقره' }

  for (const a of alerts) {
    const v = values[a.symbol]
    if (v == null) continue
    const hit = a.direction === 'above' ? v >= a.target_value : v <= a.target_value
    if (!hit) continue

    await sb.from('alerts').update({
      status: 'triggered', triggered_at: new Date().toISOString(), triggered_value: v,
    }).eq('id', a.id)

    await notify(a.user_id,
      `🔔 <b>هشدار حباب</b>\n${labels[a.symbol] || a.symbol} به ${v.toFixed(1)}٪ رسید.\nهدف شما: ${a.direction === 'above' ? '≥' : '≤'} ${a.target_value}٪`)
  }
}

async function main() {
  await checkPriceAlerts()
  if (includeBubble) await checkBubbleAlerts()
}

main().catch((e) => { console.error('[alert-watch] fatal:', e); process.exit(1) })
