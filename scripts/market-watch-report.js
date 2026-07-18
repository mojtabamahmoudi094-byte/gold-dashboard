#!/usr/bin/env node
/**
 * بورس سنج — گزارش رصد لحظه‌ای بازارها هر ۳۰ دقیقه به تلگرام (نسخهٔ سرور)
 *
 * جایگزین job قبلی Hermes روی مک — مک می‌خوابید و گزارش‌ها از دست می‌رفت.
 * روی سرور ایران اجرا می‌شود؛ چون api.telegram.org از ایران فیلتر است،
 * اول مستقیم و بعد از راه رلهٔ سایت (/api/telegram-relay) می‌فرستد.
 *
 * بدون LLM: اعداد مستقیم از bourssanj.ir/api/market-watch — هیچ عدد ساختگی.
 * خارج از ساعت بازار یا با دادهٔ کهنه: ساکت (هیچ پیامی نمی‌فرستد).
 *
 * cron (UTC): 30 5 * * 6,0-3  و  0,30 6-14 * * 6,0-3   ← ۹:۰۰ تا ۱۸:۰۰ تهران
 */

'use strict'

const path = require('path')
const fs = require('fs')

// همان الگوی بقیه اسکریپت‌ها — cron هیچ env نمی‌دهد
function loadEnv(file) {
  const p = path.resolve(__dirname, file)
  if (!fs.existsSync(p)) return
  fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
  })
}
loadEnv('.env')
loadEnv('.env.sync')

const SITE = (process.env.SITE_URL || 'https://bourssanj.ir').replace(/\/$/, '')
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

// (برچسب، ایموجی، cat، مسیر مانیتور، از، تا) — ساعت تهران
const WINDOWS = [
  ['رصد لحظه‌ای بازار سهام', '📊', 'stocks', '/monitor/stocks', '09:00', '12:35'],
  ['رصد لحظه‌ای صندوق‌های طلا', '🥇', 'gold', '/monitor/gold', '12:30', '18:05'],
  ['رصد لحظه‌ای صندوق‌های نقره', '🥈', 'silver', '/monitor/silver', '12:30', '18:05'],
  ['رصد لحظه‌ای صندوق‌های زعفران', '🌸', 'saffron', '/monitor/saffron', '12:30', '18:05'],
]

const faNum = (v, dec = 0) =>
  v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('fa-IR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

// ساعت/تاریخ تهران — TZ سیستم سرور UTC است، صریح تبدیل می‌کنیم
const tehranHM = () =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
const tehranDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
const faDigits = (s) => String(s).replace(/[0-9]/g, d => FA_DIGITS[+d])

async function fetchCat(cat) {
  try {
    const res = await fetch(`${SITE}/api/market-watch?cat=${encodeURIComponent(cat)}`, {
      headers: { 'cache-control': 'no-store' },
      signal: AbortSignal.timeout(90_000), // کلد-استارت Render
    })
    if (!res.ok) return {}
    return await res.json()
  } catch { return {} }
}

function buildBlock(label, emoji, mpath, row) {
  const lines = [`${emoji} ${label}`]
  if (row.money_in != null) {
    const flow = row.money_in / 1e10
    lines.push(`${flow >= 0 ? '💚' : '❤️'} ${flow >= 0 ? 'ورود' : 'خروج'} پول حقیقی: ${faNum(Math.abs(flow), 1)} میلیارد تومان`)
  }
  if (row.buyq != null || row.sellq != null)
    lines.push(`🟢 صف خرید: ${faNum(row.buyq)}   🔴 صف فروش: ${faNum(row.sellq)}`)
  if (row.sym_pos != null || row.sym_neg != null)
    lines.push(`📈 نماد مثبت: ${faNum(row.sym_pos)}   📉 منفی: ${faNum(row.sym_neg)}`)
  if (row.tval_total != null)
    lines.push(`💰 ارزش کل معاملات: ${faNum(row.tval_total / 1e10)} میلیارد تومان`)
  if (row.ind_buy_pc != null || row.ind_sell_pc != null) {
    const b = row.ind_buy_pc != null ? faNum(row.ind_buy_pc / 1e7, 1) : '—'
    const s = row.ind_sell_pc != null ? faNum(row.ind_sell_pc / 1e7, 1) : '—'
    lines.push(`👤 سرانه خرید/فروش حقیقی: ${b} / ${s} م.ت`)
  }
  lines.push(`${SITE}${mpath}`)
  return lines.join('\n')
}

async function sendTelegram(text) {
  if (!TOKEN || !CHAT_ID) { console.error('TELEGRAM_BOT_TOKEN/CHAT_ID تنظیم نشده'); process.exit(1) }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
      signal: AbortSignal.timeout(20_000),
    })
    const data = await res.json()
    if (data.ok) return true
    console.error(`مستقیم ناموفق: ${data.description}`)
  } catch (e) { console.error(`مستقیم خطا: ${e.message} — رله`) }
  try {
    const res = await fetch(`${SITE}/api/telegram-relay`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, chat_id: CHAT_ID, text }),
      signal: AbortSignal.timeout(90_000),
    })
    const data = await res.json()
    if (data.ok) return true
    console.error(`رله ناموفق: ${data.error}`)
  } catch (e) { console.error(`رله خطا: ${e.message}`) }
  return false
}

async function main() {
  const nowHM = tehranHM()
  const today = tehranDay()

  const active = WINDOWS.filter(([, , , , from, to]) => from <= nowHM && nowHM <= to)
  if (!active.length) { console.log(`بازار بسته (${nowHM} تهران) — ساکت`); return }

  const blocks = []
  for (const [label, emoji, cat, mpath] of active) {
    const data = await fetchCat(cat)
    const rows = Array.isArray(data.rows) ? data.rows : []
    if (data.date !== today || !rows.length) { console.log(`${cat}: دادهٔ امروز نیست — رد`); continue }
    blocks.push(buildBlock(label, emoji, mpath, rows[rows.length - 1]))
  }
  if (!blocks.length) { console.log('هیچ دادهٔ تازه‌ای نیست — ساکت'); return }

  const header = `📈 رصد لحظه‌ای بازارها — بورس سنج\n🕐 ساعت ${faDigits(nowHM)} (تهران)`
  const footer = '⚠️ صرفاً اطلاع‌رسانی است، توصیه مالی نیست.'
  const ok = await sendTelegram([header, ...blocks, footer].join('\n\n'))
  console.log(ok ? `✅ ارسال شد (${blocks.length} بازار)` : '⛔ ارسال ناموفق')
  if (!ok) process.exit(1)
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
