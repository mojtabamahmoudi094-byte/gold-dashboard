#!/usr/bin/env node
/**
 * portfolio-live-alert.js — هشدار لحظه‌ای تلگرام برای نمادهای داخل پورتفوی کاربران:
 *   ۱) خرید/فروش درشت (سرانه بالای ۲۰۰ میلیون تومان) — big_buy/big_sell در stock_watch_5m
 *   ۲) کم‌شدن صف خرید/فروش — عبور از ۷۰٪ و ۳۰٪ حجم اولیه صف (symbol_queue_state)
 *
 * فقط روی داده‌ی stock_watch_5m کار می‌کند (که هر ۵ دقیقه توسط scripts/stocks-industries.js
 * روی سرور دیتا نوشته می‌شود) — این اسکریپت خودش BrsApi صدا نمی‌زند، پس باید روی سروری اجرا شود
 * که به api.telegram.org دسترسی دارد (نه سرور ایرانی BrsApi) — طبق تایید کاربر: 168.222.43.75.
 *
 * env (از .env.local یا .env.sync خوانده می‌شود):
 *   TELEGRAM_PORTFOLIO_BOT_TOKEN  همان بات پورتفوی (scripts/telegram-portfolio-bot.js)
 *   SUPABASE_URL / SUPABASE_KEY   باید service_role باشد
 *
 * usage: node scripts/portfolio-live-alert.js
 *
 * crontab (UTC! نه تهران — فرق ۳:۳۰ ساعت) — ۲ دقیقه بعد از هر تیک stocks-industries.js:
 *   2,7,12,17,22,27,32,37,42,47,52,57 5-14 * * 0-4   node scripts/portfolio-live-alert.js
 *   (ساعت بازار تهران ۹:۰۰–۱۸:۰۰ → UTC ۵:۳۰–۱۴:۳۰، شنبه–چهارشنبه)
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

const TOKEN = process.env.TELEGRAM_PORTFOLIO_BOT_TOKEN
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!TOKEN) { console.error('[portfolio-live-alert] TELEGRAM_PORTFOLIO_BOT_TOKEN تنظیم نشده'); process.exit(1) }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('[portfolio-live-alert] SUPABASE_URL/SUPABASE_KEY تنظیم نشده'); process.exit(1) }

const { createClient } = require('@supabase/supabase-js')
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})

const QUEUE_HIGH_PCT = 70 // اولین هشدار: صف به ۷۰٪ حجم اولیه رسید
const QUEUE_LOW_PCT = 30  // دومین هشدار: صف به ۳۰٪ حجم اولیه رسید

const clean = (s) => String(s || '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[‌‎‏‪-‮]/g, ' ')
  .replace(/\s+/g, ' ').trim()

const fa = (v, d = 0) => Number(v || 0).toLocaleString('fa-IR', { maximumFractionDigits: d })

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return res.json()
}

// نمادها → کاربرانی که هم‌اکنون در پورتفویشان نگه داشته‌اند (مقدار خالص > ۰)
async function loadHolders() {
  const { data: txs, error } = await sb.from('portfolio_transactions').select('user_id, symbol, name, asset_type, side, quantity')
  if (error) { console.error('[portfolio-live-alert] portfolio_transactions:', error.message); return new Map() }

  const byUser = new Map() // user_id -> Map(symbol -> qty)
  for (const tx of txs ?? []) {
    const sym = clean(tx.asset_type === 'fund' ? (tx.name || tx.symbol) : tx.symbol)
    if (!sym) continue
    let m = byUser.get(tx.user_id)
    if (!m) { m = new Map(); byUser.set(tx.user_id, m) }
    const q = Number(tx.quantity) || 0
    m.set(sym, (m.get(sym) || 0) + (tx.side === 'buy' ? q : -q))
  }

  const holders = new Map() // symbol -> Set(user_id)
  for (const [userId, symMap] of byUser) {
    for (const [sym, qty] of symMap) {
      if (qty <= 0) continue
      if (!holders.has(sym)) holders.set(sym, new Set())
      holders.get(sym).add(userId)
    }
  }
  return holders
}

async function notifyHolders(holders, symbol, text) {
  const userIds = holders.get(symbol)
  if (!userIds || userIds.size === 0) return
  for (const userId of userIds) {
    const { data: link } = await sb.from('telegram_links').select('telegram_chat_id').eq('user_id', userId).maybeSingle()
    if (!link) continue
    const r = await tg('sendMessage', { chat_id: link.telegram_chat_id, text, parse_mode: 'HTML' })
    if (!r.ok) console.error(`[portfolio-live-alert] ارسال ناموفق (${symbol} → ${userId}):`, r.description)
  }
}

// آخرین ۲ تیک هر نماد در ۲۰ دقیقه اخیر
async function loadRecentTicks() {
  const since = new Date(Date.now() - 20 * 60 * 1000).toISOString()
  const { data, error } = await sb.from('stock_watch_5m').select('*').gte('ts', since).order('ts', { ascending: false })
  if (error) { console.error('[portfolio-live-alert] stock_watch_5m:', error.message); return new Map() }
  const bySymbol = new Map()
  for (const row of data ?? []) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, [])
    const arr = bySymbol.get(row.symbol)
    if (arr.length < 2) arr.push(row)
  }
  return bySymbol
}

async function checkBigTrades(bySymbol, holders) {
  for (const [symbol, ticks] of bySymbol) {
    const [cur, prev] = ticks
    const price = Math.round((cur.last_price || 0) / 10) // ریال → تومان
    const pct = cur.last_price_pct ?? 0

    if (cur.big_buy > 0 && !(prev?.big_buy > 0)) {
      const shares = price > 0 ? Math.round((cur.big_buy / 10) / price) : 0
      await notifyHolders(holders, symbol,
        `🟢 <b>خرید درشت</b> ${symbol}\nقیمت: ${fa(price)} تومان (${fa(pct, 1)}٪)\nارزش: ${fa(Math.round(cur.big_buy / 10))} تومان\nحجم: ${fa(shares)} سهم`)
    }
    if (cur.big_sell > 0 && !(prev?.big_sell > 0)) {
      const shares = price > 0 ? Math.round((cur.big_sell / 10) / price) : 0
      await notifyHolders(holders, symbol,
        `🔴 <b>فروش درشت</b> ${symbol}\nقیمت: ${fa(price)} تومان (${fa(pct, 1)}٪)\nارزش: ${fa(Math.round(cur.big_sell / 10))} تومان\nحجم: ${fa(shares)} سهم`)
    }
  }
}

async function checkQueueShrink(bySymbol, holders) {
  for (const [symbol, ticks] of bySymbol) {
    const [cur] = ticks
    const buyVol = cur.buy_queue_vol || 0
    const sellVol = cur.sell_queue_vol || 0
    const side = buyVol > 0 ? 'buy' : (sellVol > 0 ? 'sell' : null)
    const vol = side === 'buy' ? buyVol : sellVol

    const { data: state } = await sb.from('symbol_queue_state').select('*').eq('symbol', symbol).maybeSingle()

    if (!side) {
      // صف تمام شده — وضعیت پاک شود
      if (state) await sb.from('symbol_queue_state').delete().eq('symbol', symbol)
      continue
    }

    if (!state || state.queue_side !== side) {
      // صف تازه شروع شده یا جهتش عوض شده — پایه‌ی جدید
      await sb.from('symbol_queue_state').upsert({
        symbol, queue_side: side, initial_vol: vol, last_vol: vol, last_alert_pct: 100, updated_at: new Date().toISOString(),
      })
      continue
    }

    if (vol > state.initial_vol) {
      // صف پر شد (حجم جدید بیشتر از اولیه) — پایه‌ی جدید
      await sb.from('symbol_queue_state').update({
        initial_vol: vol, last_vol: vol, last_alert_pct: 100, updated_at: new Date().toISOString(),
      }).eq('symbol', symbol)
      continue
    }

    const pct = state.initial_vol > 0 ? (vol / state.initial_vol) * 100 : 100
    let alertPct = null
    if (pct <= QUEUE_LOW_PCT && state.last_alert_pct > QUEUE_LOW_PCT) alertPct = QUEUE_LOW_PCT
    else if (pct <= QUEUE_HIGH_PCT && state.last_alert_pct > QUEUE_HIGH_PCT) alertPct = QUEUE_HIGH_PCT

    if (alertPct != null) {
      const label = side === 'buy' ? 'کاهش صف خرید' : 'کاهش صف فروش'
      await notifyHolders(holders, symbol,
        `🔔 <b>${label}</b> ${symbol}\nحجم قبل: ${fa(state.last_vol)}\nحجم جدید: ${fa(vol)}`)
      await sb.from('symbol_queue_state').update({
        last_vol: vol, last_alert_pct: alertPct, updated_at: new Date().toISOString(),
      }).eq('symbol', symbol)
    } else if (vol !== state.last_vol) {
      await sb.from('symbol_queue_state').update({ last_vol: vol, updated_at: new Date().toISOString() }).eq('symbol', symbol)
    }
  }
}

// همان عناوین فیلترهای VIP (scripts/stocks-industries.js → computeVipFilters)
const VIP_FILTER_TITLES = {
  'smart-in': 'ورود پول هوشمند', 'smart-out': 'خروج پول هوشمند',
  'c2c-to-legal': 'کد به کد حقیقی به حقوقی', 'c2c-to-real': 'کد به کد حقوقی به حقیقی',
  'heavy-buy': 'اردرهای حمایتی و سنگین خرید', 'heavy-sell': 'اردرهای ترس و سنگین فروش',
  'susp-week': 'حجم مشکوک هفته', 'susp-month': 'حجم مشکوک ماه', 'susp-heavy': 'حجم خیلی مشکوک',
  'legal-buy': 'بیشترین درصد حجم خرید حقوقی', 'tick-up': 'فیلتر الگوی تیک صعودی', 'tick-down': 'فیلتر الگوی تیک نزولی',
  'swing-reversal': 'فیلتر نوسان‌گیری', 'spread': 'بیشترین درصد اختلاف عرضه و تقاضا', 'golden': 'فیلتر طلایی بورس سنج',
  'most-buy-power': 'بیشترین قدرت خریدار حقیقی', 'most-sell-power': 'بیشترین قدرت فروشنده حقیقی',
  'vol-float': 'بیشترین درصد حجم نسبت به شناوری', 'val-mv': 'بیشترین ارزش معاملات نسبت به مارکت شرکت',
  'val-float': 'بیشترین ارزش معاملات نسبت به شناوری',
  'most-buyers': 'بیشترین تعداد کد خریدار حقیقی', 'most-sellers': 'بیشترین تعداد کد فروشنده حقیقی',
  'near-buy-queue': 'در آستانه صف خرید', 'near-sell-queue': 'در آستانه صف فروش',
  'pc-1-5': 'افزایش سرانه خرید روزانه به ۵ روزه', 'pc-3-10': 'افزایش سرانه خرید ۳ به ۱۰ روزه',
  'pc-5-20': 'افزایش سرانه خرید ۵ به ۲۰ روزه',
}

async function checkFilterEntries(holders) {
  const { data: rows, error } = await sb.from('symbol_filter_membership').select('symbol, filters')
  if (error) { console.error('[portfolio-live-alert] symbol_filter_membership:', error.message); return }
  for (const row of rows ?? []) {
    const current = row.filters || []
    const { data: seen } = await sb.from('symbol_filter_seen').select('filters').eq('symbol', row.symbol).maybeSingle()
    const seenSet = new Set(seen?.filters || [])
    const newOnes = current.filter((id) => !seenSet.has(id))

    for (const id of newOnes) {
      const title = VIP_FILTER_TITLES[id] || id
      await notifyHolders(holders, row.symbol,
        `🎯 <b>${row.symbol}</b> وارد فیلتر VIP شد\nفیلتر: ${title}`)
    }

    const changed = current.length !== seenSet.size || newOnes.length > 0
    if (changed) {
      await sb.from('symbol_filter_seen').upsert({ symbol: row.symbol, filters: current, updated_at: new Date().toISOString() })
    }
  }
}

async function main() {
  const [bySymbol, holders] = await Promise.all([loadRecentTicks(), loadHolders()])
  if (bySymbol.size > 0) {
    await checkBigTrades(bySymbol, holders)
    await checkQueueShrink(bySymbol, holders)
  } else {
    console.log('[portfolio-live-alert] تیک تازه‌ای در ۲۰ دقیقه اخیر نیست')
  }
  await checkFilterEntries(holders)
}

main().catch((e) => { console.error('[portfolio-live-alert] fatal:', e); process.exit(1) })
