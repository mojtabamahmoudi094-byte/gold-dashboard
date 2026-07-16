#!/usr/bin/env node
/**
 * telegram-portfolio-bot.js
 *
 * بورس سنج — ربات تلگرامی پورتفوی شخصی. کاربر از داشبورد وب یک کد ۶ رقمی می‌گیرد،
 * با /start <code> به بات می‌فرستد، بات اکانتش را به chat_id تلگرام لینک می‌کند و از آن به بعد
 * با /portfolio خلاصه‌ی ارزش/سود-زیان/لیست سهام خودش را می‌بیند.
 *
 * برخلاف سایر اسکریپت‌های تلگرام این ریپو (telegram-report.js, anomaly-watch.js) که یک‌بار اجرا
 * می‌شوند و از cron صدا زده می‌شوند، این یک پروسه‌ی دائمی long-polling است — باید با pm2/systemd
 * روی سرور بالا نگه داشته شود، نه cron.
 *
 * اجرا | usage:
 *   node scripts/telegram-portfolio-bot.js
 *
 * متغیرهای محیطی (از .env.sync یا .env.local خوانده می‌شود):
 *   TELEGRAM_PORTFOLIO_BOT_TOKEN   توکن جدا از بات گزارش‌دهی محتوا (TELEGRAM_BOT_TOKEN) — این یکی interactive و per-user است
 *   SITE_URL                      (پیش‌فرض https://bourssanj.ir) — قیمت لحظه‌ای سهام/صندوق/فیزیکی
 *   SUPABASE_URL یا NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_KEY (یا SUPABASE_SERVICE_ROLE_KEY) — باید service_role باشد؛ باید تراکنش‌های هر کاربر
 *                                 بدون توکن session او خوانده شود (RLS را service-role دور می‌زند)
 *
 * سرور این بات باید بیرون از فیلترینگ ایران باشد (مثلاً 168.222.43.75) — چون long-polling مستقیماً
 * به api.telegram.org وصل می‌شود و از relay داخلی (app/api/telegram-relay) استفاده نمی‌کند.
 */

'use strict'

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

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

if (!TOKEN) {
  console.error('[telegram-portfolio-bot] TELEGRAM_PORTFOLIO_BOT_TOKEN تنظیم نشده')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[telegram-portfolio-bot] SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY تنظیم نشده‌اند')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})

const { computePortfolioSummary, fetchStockMarketData, fetchFundMarketData } = require('../lib/portfolioValuation')

const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date()) // YYYY-MM-DD برای ستون trade_date (date)

// سرانه خرید/فروش امروز هر نماد — از stock_per_capita_daily (پر می‌شود توسط scripts/stocks-industries.js)
async function fetchPerCapitaMap(symbols) {
  const map = new Map()
  if (symbols.length === 0) return map
  const { data, error } = await sb
    .from('stock_per_capita_daily')
    .select('symbol, per_capita_buy, per_capita_sell')
    .eq('trade_date', todayISO())
    .in('symbol', symbols)
  if (error) { console.error('[telegram-portfolio-bot] fetchPerCapitaMap failed:', error.message); return map }
  for (const row of data ?? []) map.set(row.symbol, row)
  return map
}

const API = `https://api.telegram.org/bot${TOKEN}`

async function tg(method, params) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => null)
  if (!data || !data.ok) {
    console.error(`[telegram-portfolio-bot] ${method} failed:`, data)
  }
  return data
}

const BTN_PORTFOLIO = '📊 پورتفوی من'
const BTN_CONNECT = '🔗 اتصال حساب'
const KEYBOARD = { keyboard: [[BTN_PORTFOLIO], [BTN_CONNECT]], resize_keyboard: true }

const sendMessage = (chatId, text) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: KEYBOARD })

// چت‌هایی که منتظر ارسال کدند (بعد از زدن دکمه «اتصال حساب») — در حافظه، برای همین پروسه کافی است
const awaitingCode = new Set()

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

const fa = (n, decimals = 0) => Number(n || 0).toLocaleString('fa-IR', { maximumFractionDigits: decimals })
const faPct = (n) => {
  if (n == null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${fa(n, 2)}٪`
}
// همه‌ی مبالغ داخلی به ریال محاسبه می‌شوند؛ نمایش به کاربر مثل داشبورد وب بر حسب تومان است
const toToman = (n) => fa(Number(n || 0) / 10)
const pnlDot = (v) => v == null ? '⚪' : v > 0 ? '🟢' : v < 0 ? '🔴' : '⚪'

async function handleStart(chatId, from, code) {
  if (!code) {
    awaitingCode.add(chatId)
    await sendMessage(chatId,
      `به ربات پورتفوی بورس سنج خوش آمدید${from?.first_name ? ' ' + from.first_name : ''} 👋\n` +
      'برای اتصال، از داشبورد بورس سنج (بخش پورتفو) کد اتصال بگیرید و همین‌جا بفرستید.'
    )
    return
  }

  const { data: row, error } = await sb
    .from('telegram_link_codes')
    .select('id, user_id, code_hash, expires_at, attempts, used_at')
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  const match = !error && row
    ? row.find((r) => r.code_hash === hashCode(code) && r.attempts < 5)
    : null

  if (!match) {
    await sendMessage(chatId, 'کد نامعتبر یا استفاده‌شده است. از داشبورد کد جدید بگیرید.')
    return
  }
  if (new Date(match.expires_at).getTime() < Date.now()) {
    await sendMessage(chatId, 'کد منقضی شده. از داشبورد کد جدید بگیرید.')
    return
  }

  awaitingCode.delete(chatId)
  await sb.from('telegram_link_codes').update({ used_at: new Date().toISOString() }).eq('id', match.id)
  await sb.from('telegram_links').upsert({
    user_id: match.user_id,
    telegram_chat_id: chatId,
    telegram_username: from?.username ?? null,
    linked_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  await sendMessage(chatId, `اتصال با موفقیت انجام شد ✅\nبرای دیدن پورتفو، «${BTN_PORTFOLIO}» را بزنید.`)
}

async function handlePortfolio(chatId) {
  const { data: link } = await sb
    .from('telegram_links')
    .select('user_id')
    .eq('telegram_chat_id', chatId)
    .maybeSingle()

  if (!link) {
    await sendMessage(chatId, `ابتدا حساب خود را وصل کنید — روی «${BTN_CONNECT}» بزنید.`)
    return
  }

  let summary
  try {
    summary = await computePortfolioSummary(sb, link.user_id, SITE)
  } catch (e) {
    console.error('[telegram-portfolio-bot] computePortfolioSummary failed:', e.message)
    await sendMessage(chatId, 'خطا در محاسبه پورتفو. کمی بعد دوباره تلاش کنید.')
    return
  }

  if (summary.holdings.length === 0) {
    await sendMessage(chatId, 'پورتفوی شما در داشبورد خالی است.')
    return
  }

  const header = [
    `${pnlDot(summary.pnl)} <b>خلاصه پورتفوی شما</b>`,
    `ارزش روز: ${toToman(summary.totalValue)} تومان`,
    `سود/زیان: ${toToman(summary.pnl)} تومان (${faPct(summary.pnlPct)})`,
    summary.priced ? '' : '⚠️ قیمت برخی نمادها در دسترس نبود — ارقام ناقص است',
  ].filter(Boolean).join('\n')

  const stockSymbols = summary.holdings.filter((h) => h.assetType === 'stock').map((h) => h.symbol)
  const [marketData, perCapMap, fundData] = await Promise.all([
    fetchStockMarketData(SITE),
    fetchPerCapitaMap(stockSymbols),
    fetchFundMarketData(SITE),
  ])

  const rows = summary.holdings.map((h) => {
    const lines = [
      `${pnlDot(h.pnlPct)} <b>#${h.assetType === 'stock' ? h.symbol : h.name}</b>`,
      `تعداد ${fa(h.qty)}  |  ارزش ${h.value != null ? toToman(h.value) + ' ت' : '—'}  |  ${faPct(h.pnlPct)}`,
    ]
    if (h.assetType === 'stock') {
      const md = marketData.get(h.symbol)
      const pcRow = perCapMap.get(h.symbol)
      if (md) {
        lines.push(`آخرین: ${fa(md.pl / 10)} ت (${faPct(md.plp)})  |  پایانی: ${fa(md.pc / 10)} ت (${faPct(md.pcp)})`)
        lines.push(`حجم معاملات: ${fa(md.tvol)}`)
      }
      if (pcRow?.per_capita_buy != null) {
        const bp = pcRow.per_capita_sell > 0 ? pcRow.per_capita_buy / pcRow.per_capita_sell : null
        lines.push(`سرانه خرید: ${fa(pcRow.per_capita_buy)} ت${bp != null ? `  |  قدرت خرید: ${fa(bp, 2)}` : ''}`)
      }
    } else if (h.assetType === 'fund') {
      const fd = fundData.get(h.symbol)
      if (fd) {
        lines.push(`آخرین: ${fa(fd.priceLast / 10)} ت  |  پایانی: ${fa(fd.priceClose / 10)} ت (${faPct(fd.priceChangePct)})`)
        lines.push(`حجم معاملات: ${fa(fd.volume)}`)
        if (fd.perCapitaBuy != null) {
          const bp = fd.perCapitaSell > 0 ? fd.perCapitaBuy / fd.perCapitaSell : null
          lines.push(`سرانه خرید: ${toToman(fd.perCapitaBuy)} ت${bp != null ? `  |  قدرت خرید: ${fa(bp, 2)}` : ''}`)
        }
      }
    }
    return lines.join('\n')
  })

  // پیام تلگرام حداکثر ۴۰۹۶ کاراکتر می‌پذیرد — پورتفوی بزرگ را به چند پیام تقسیم می‌کنیم
  const MAX = 3800
  let chunk = header
  const chunks = []
  for (const row of rows) {
    if ((chunk + '\n\n' + row).length > MAX) { chunks.push(chunk); chunk = row }
    else chunk += '\n\n' + row
  }
  chunks.push(chunk)
  for (const c of chunks) await sendMessage(chatId, c)
}

async function handleUpdate(update) {
  const msg = update.message
  if (!msg || !msg.text) return
  const chatId = msg.chat.id
  const text = msg.text.trim()

  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1]
    await handleStart(chatId, msg.from, code)
  } else if (text.startsWith('/portfolio') || text === BTN_PORTFOLIO) {
    await handlePortfolio(chatId)
  } else if (text === BTN_CONNECT) {
    await handleStart(chatId, msg.from, null)
  } else if (/^\d{4,8}$/.test(text) && awaitingCode.has(chatId)) {
    await handleStart(chatId, msg.from, text)
  } else {
    await sendMessage(chatId, `از دکمه‌های پایین صفحه استفاده کنید: «${BTN_PORTFOLIO}» یا «${BTN_CONNECT}»`)
  }
}

async function pollLoop() {
  let offset = 0
  console.log('[telegram-portfolio-bot] شروع long-polling...')
  for (;;) {
    try {
      const res = await tg('getUpdates', { offset, timeout: 30 })
      for (const update of res?.result ?? []) {
        offset = update.update_id + 1
        await handleUpdate(update).catch((e) => console.error('[telegram-portfolio-bot] handleUpdate error:', e.message))
      }
    } catch (e) {
      console.error('[telegram-portfolio-bot] poll error:', e.message)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}

pollLoop()
