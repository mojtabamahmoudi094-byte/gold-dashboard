#!/usr/bin/env node
/**
 * market-story-daily.js — Market Story خودکار روزانه (فاز ۳ نقشه راه).
 * از خروجی Regime Engine (market_regime_daily) + حباب طلا/نقره (fund_bubble_daily) یک روایت
 * کوتاه فارسی می‌سازد («چرا بازار امروز این‌طور بود») و در market_story_daily ذخیره می‌کند؛
 * سپس همان متن را به کانال تلگرام پست می‌کند.
 *
 * فقط از Supabase می‌خواند و یک تماس Gemini (از راه API خود سایت، نه مستقیم) دارد —
 * تماس زنده با BrsApi ندارد.
 *
 * usage:
 *   node scripts/market-story-daily.js
 *
 * crontab (UTC! نه تهران) — ۱۲:۵۰ تهران (بعد از market-regime-daily)، شنبه–چهارشنبه:
 *   20 9 * * 6,0-3 node scripts/market-story-daily.js >> /var/log/market-story-daily.log 2>&1
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

const { createClient } = require('@supabase/supabase-js')
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ SUPABASE_URL/SUPABASE_KEY تنظیم نشده'); process.exit(1) }
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})

const SITE = (process.env.SITE_URL || 'https://bourssanj.ir').replace(/\/$/, '')
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID

const num = (v, dec = 1) => (v == null || Number.isNaN(Number(v)) ? null : Number(v).toFixed(dec))

async function claimSend(key) {
  const { error } = await sb.from('telegram_alert_sent').insert({ key })
  if (!error) return true
  if (error.code === '23505') { console.log(`[market-story] قبلاً پست شده — رد شد: ${key}`); return false }
  console.error(`[market-story] claimSend خطا داد (${error.message}) — برای امنیت رد شد: ${key}`)
  return false
}

async function releaseClaim(key) {
  // اگر ارسال ناموفق بود کلید dedupe را پس بگیر تا اجرای بعدی cron دوباره تلاش کند
  const { error } = await sb.from('telegram_alert_sent').delete().eq('key', key)
  if (error) console.error(`[market-story] releaseClaim خطا داد: ${error.message}`)
}

// دکمهٔ شیشه‌ای زیر پست — لینک با UTM تا ترافیک کانال قابل سنجش باشد
const CTA_MARKUP = {
  inline_keyboard: [[{
    text: '📊 داشبورد کامل بازار در بورس سنج',
    url: `${SITE}/?utm_source=telegram&utm_medium=channel&utm_campaign=market_story`,
  }]],
}

// true اگر واقعاً ارسال شد (مستقیم یا رله)، false اگر هر دو مسیر شکست خوردند
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) { console.log('⚠️ TELEGRAM_BOT_TOKEN/CHAT_ID تنظیم نشده — پست تلگرام رد شد'); return false }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, reply_markup: CTA_MARKUP }),
      signal: AbortSignal.timeout(20_000),
    })
    const data = await res.json()
    if (data.ok) return true
    console.error(`⚠️ ارسال مستقیم تلگرام ناموفق: ${data.description || 'نامشخص'} — تلاش از راه رله`)
  } catch (e) { console.error(`⚠️ ارسال مستقیم تلگرام خطا داد (${e.message}) — تلاش از راه رله`) }

  try {
    const res = await fetch(`${SITE}/api/telegram-relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TELEGRAM_BOT_TOKEN, chat_id: TELEGRAM_CHAT_ID, text, reply_markup: CTA_MARKUP }),
      signal: AbortSignal.timeout(90_000),
    })
    const data = await res.json()
    if (data.ok) return true
    console.error(`⚠️ رله تلگرام هم ناموفق: ${data.error || res.status}`)
  } catch (e) { console.error(`⚠️ رله تلگرام هم خطا داد: ${e.message}`) }
  return false
}

async function avgBubble(date, category) {
  const { data: assets } = await sb.from('assets').select('name').eq('category', category)
  const names = new Set((assets || []).map(a => a.name))
  if (names.size === 0) return null
  const { data: rows } = await sb.from('fund_bubble_daily').select('fund_name, bubble_vaqei, bubble_asmi').eq('trade_date', date)
  const vals = (rows || [])
    .filter(r => names.has(r.fund_name))
    .map(r => r.bubble_vaqei ?? r.bubble_asmi)
    .filter(v => v != null)
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

// شمسی امروز به وقت تهران — دقیقاً همان فرمت market-regime-daily (YYYY/MM/DD)
function todayShamsiTehran() {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran',
  }).formatToParts(new Date())
  const g = (t) => parts.find(p => p.type === t).value
  return `${g('year')}/${g('month')}/${g('day')}`
}

async function main() {
  const { data: regimeRows, error: regErr } = await sb.from('market_regime_daily')
    .select('*').order('trade_date_shamsi', { ascending: false }).limit(2)
  if (regErr) { console.error('[market-story] market_regime_daily:', regErr.message); return }
  if (!regimeRows || regimeRows.length === 0) { console.log('[market-story] هنوز داده‌ای در Regime Engine نیست'); return }

  // ردیف امروز را با تاریخ صریح انتخاب می‌کنیم، نه «آخرین ردیف». اگر Regime Engine
  // امروز اجرا نشده باشد، آخرین ردیف مربوط به دیروز است و نباید دیروز را دوباره
  // به‌عنوان «روایت امروز» پردازش و overwrite کنیم (کلاس باگ انتخاب‌بر اساس آخرین ردیف).
  const todayShamsi = todayShamsiTehran()
  if (regimeRows[0].trade_date_shamsi !== todayShamsi) {
    console.log(`[market-story] ردیف Regime امروز (${todayShamsi}) نیست — آخرین: ${regimeRows[0].trade_date_shamsi}؛ رد شد`)
    return
  }

  const today = regimeRows[0]
  const yesterday = regimeRows[1] || null

  const [goldBubble, silverBubble] = await Promise.all([
    avgBubble(today.trade_date_shamsi, 'طلا'),
    avgBubble(today.trade_date_shamsi, 'نقره'),
  ])

  const factLines = [
    `تاریخ: ${today.trade_date_shamsi}`,
    `برچسب بازار سهام امروز (از موتور قاعده‌محور): ${today.regime}`,
    `درصد نمادهای مثبت از کل مثبت+منفی: ${num(today.breadth_pct)}٪`,
    `میانگین درصد تغییر قیمت: ${num(today.avg_change_pct, 2)}٪`,
    `جریان خالص پول حقیقی: ${today.net_flow > 0 ? 'ورود پول' : today.net_flow < 0 ? 'خروج پول' : 'خنثی'} (${num(today.net_flow / 1e10, 1)} میلیارد تومان)`,
    yesterday ? `برچسب بازار روز کاری قبل: ${yesterday.regime}` : null,
    goldBubble != null ? `میانگین حباب واقعی صندوق‌های طلا: ${num(goldBubble)}٪` : null,
    silverBubble != null ? `میانگین حباب واقعی صندوق‌های نقره: ${num(silverBubble)}٪` : null,
  ].filter(Boolean).join('\n')

  console.log('facts:\n' + factLines)

  let headline, storyBody
  try {
    const res = await fetch(`${SITE}/api/market-story-narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: factLines }),
      signal: AbortSignal.timeout(90_000), // کلد-استارت Render
    })
    const data = await res.json()
    if (!data.ok) { console.error('[market-story] narrate:', data.error); return }
    headline = data.headline
    storyBody = data.body
  } catch (e) { console.error('[market-story] narrate fetch:', e.message); return }

  const { error: upErr } = await sb.from('market_story_daily').upsert({
    trade_date_shamsi: today.trade_date_shamsi,
    regime: today.regime,
    headline, body: storyBody,
    updated: new Date().toISOString(),
  }, { onConflict: 'trade_date_shamsi' })
  if (upErr) { console.error('[market-story] upsert:', upErr.message); return }
  console.log(`✅ ذخیره شد: ${headline}`)

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) { console.log('⚠️ TELEGRAM_BOT_TOKEN/CHAT_ID تنظیم نشده — پست تلگرام رد شد'); return }
  const key = `market_story|${today.trade_date_shamsi}`
  if (await claimSend(key)) {
    const text = `📰 ${headline}\n\n${storyBody}\n\n⚠️ صرفاً اطلاع‌رسانی است، توصیه مالی نیست.\n\n@bourssanjj\n${SITE}`
    const sent = await sendTelegram(text)
    if (sent) {
      console.log('✅ به تلگرام پست شد')
    } else {
      // ارسال شکست خورد: claim را پس بگیر تا فردا/اجرای بعدی دوباره تلاش کند و
      // با خروج غیرصفر، run-with-alert.sh هشدار بدهد (قبلاً پیام گم می‌شد ولی «موفق» لاگ می‌شد)
      await releaseClaim(key)
      console.error('❌ ارسال تلگرام ناموفق بود — claim پس گرفته شد')
      process.exit(1)
    }
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
