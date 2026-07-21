#!/usr/bin/env node
/**
 * codal-portfolio-notify.js
 *
 * بورس سنج — برای هر کاربر متصل به بات تلگرام پورتفو، اطلاعیه‌های تازه‌ی کدال روی نمادهای
 * پورتفوی خودش را پیدا می‌کند و لینک + نوع اطلاعیه (افشا/ماهانه/فصلی/...) را برایش می‌فرستد.
 *
 * باید روی سرور ایرانی اجرا شود (کرون، مثل codal-watch.js) — چون search.codal.ir از IP
 * غیرایرانی جواب نمی‌دهد. برخلاف codal-watch.js که به Supabase می‌نویسد، این اسکریپت مستقیم
 * تلگرام صدا نمی‌زند (api.telegram.org هم از ایران فیلتر است) — به‌جایش از رله‌ی سایت
 * (app/api/telegram-relay-portfolio، خارج از ایران روی Render) عبور می‌کند.
 *
 * اجرا | usage:
 *   node codal-portfolio-notify.js            # اطلاعیه‌های ۳۶ ساعت اخیر
 *   node codal-portfolio-notify.js --dry       # فقط گزارش کن، چیزی نفرست
 *
 * کرون واقعی (/etc/cron.d/codal-portfolio-notify) — تهران ۰۶:۰۰ تا ۲۳:۳۰ هر ۳۰ دقیقه، همه‌ی روزها
 * (کدال پنجشنبه/جمعه هم اطلاعیه می‌دهد، پس بر خلاف codal-watch.js روزها محدود به بازار نیست):
 *   30 2-19 * * * root /usr/bin/node /opt/bourssanj/scripts/codal-portfolio-notify.js >> /var/log/codal-portfolio-notify.log 2>&1
 *   0 3-20 * * * root /usr/bin/node /opt/bourssanj/scripts/codal-portfolio-notify.js >> /var/log/codal-portfolio-notify.log 2>&1
 *   (دو خط چون آفست تهران نیم‌ساعته است؛ زمان‌ها UTC — تهران = UTC+3:30)
 *
 * متغیرهای لازم (.env.sync یا .env.local):
 *   TELEGRAM_PORTFOLIO_BOT_TOKEN   همان توکن بات پورتفو — رله با همین توکن احراز می‌کند
 *   SITE_URL                      (پیش‌فرض https://bourssanj.ir)
 *   SUPABASE_URL, SUPABASE_KEY (service role)
 *
 * وضعیت در codal-portfolio-notify-state.json — اجرای اول فقط seed می‌کند، اسپم نمی‌فرستد.
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
const DRY = process.argv.includes('--dry')
const hoursIdx = process.argv.indexOf('--hours')
const HOURS = hoursIdx !== -1 ? Number(process.argv[hoursIdx + 1]) : 36
const MAX_PAGES = 10

if (!TOKEN) { console.error('[codal-portfolio-notify] TELEGRAM_PORTFOLIO_BOT_TOKEN تنظیم نشده'); process.exit(1) }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('[codal-portfolio-notify] SUPABASE_URL/SUPABASE_KEY تنظیم نشده'); process.exit(1) }

const { createClient } = require('@supabase/supabase-js')
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})

const { computeHoldings } = require('../lib/portfolioValuation')

const STATE_FILE = path.join(__dirname, 'codal-portfolio-notify-state.json')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// همان نرمال‌سازی codal-watch.js (ي/ی، ك/ک، ة/ه، کاراکترهای کنترلی جهت‌دهی)
const norm = (s) => String(s || '')
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/ۀ|ة/g, 'ه')
  .replace(/[‌‎‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim()

const toLatin = (s) => String(s || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
const pdt = (s) => toLatin(s).replace(/\s+/g, ' ').trim()
function jNow(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Tehran',
  }).formatToParts(d)
  const g = (t) => p.find((x) => x.type === t).value
  return `${g('year')}/${g('month')}/${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`
}

// نوع اطلاعیه از روی عنوان — ترتیب مهم است (اولین تطبیق برنده)
const LETTER_TYPES = [
  [/فعالیت ماهانه|فعالیت ماهیانه/, 'گزارش فعالیت ماهانه'],
  [/افشای اطلاعات بااهمیت/, 'افشای اطلاعات بااهمیت'],
  [/شفاف ?سازی/, 'شفاف‌سازی'],
  [/میاندوره|میان دوره/, 'گزارش فصلی (میاندوره‌ای)'],
  [/صورت وضعیت پرتفوی/, 'صورت وضعیت پرتفوی'],
  [/صورت های مالی|صورت‌های مالی/, 'صورت‌های مالی'],
  [/تفسیری/, 'گزارش تفسیری مدیریت'],
  [/آگهی دعوت|مجمع/, 'مجمع'],
  [/گزارش حسابرس|بازرس قانونی/, 'گزارش حسابرس'],
  [/تقسیم سود|سود نقدی/, 'سود نقدی'],
  [/افزایش سرمایه/, 'افزایش سرمایه'],
]
const classifyLetter = (title) => {
  const t = norm(title)
  for (const [re, label] of LETTER_TYPES) if (re.test(t)) return label
  return 'اطلاعیه'
}

// همان الگوی fromCodal در codal-watch.js — API عمومی کدال، بدون auth، صفحه‌بندی تا cutoff
async function fetchCodalRecent(since) {
  const out = []
  for (let p = 1; p <= MAX_PAGES; p++) {
    const url = 'https://search.codal.ir/api/search/v2/q'
      + '?Audited=true&AuditorRef=-1&Category=-1&Childs=false&CompanyState=-1&CompanyType=-1'
      + '&Consolidatable=true&IsNotAudited=false&Length=-1&LetterType=-1&Mains=true'
      + '&NotAudited=true&NotConsolidatable=true&Publisher=false&TracingNo=-1&search=true'
      + `&PageNumber=${p}`
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const letters = (await res.json())?.Letters ?? []
    if (!letters.length) break
    let reachedCutoff = false
    for (const l of letters) {
      const publish = pdt(l.PublishDateTime ?? l.SentDateTime)
      if (publish && publish < since) { reachedCutoff = true; continue }
      out.push({
        symbol: l.Symbol,
        title: l.Title,
        publish,
        url: l.Url ? `https://codal.ir${l.Url}` : null,
        key: String(l.TracingNo ?? `${l.Symbol}|${l.Title}|${publish}`),
      })
    }
    if (reachedCutoff) break
    await sleep(1200)
  }
  return out
}

const loadState = () => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }
  catch { return null }
}
const saveState = (st) => fs.writeFileSync(STATE_FILE, JSON.stringify(st))

// نمادهای پورتفوی هر کاربر متصل — سهم با نماد (l18 = Symbol کدال)، صندوق با نام (تیکر کدال)
async function fetchWatchedSymbols() {
  const { data: links, error: linkErr } = await sb.from('telegram_links').select('user_id, telegram_chat_id')
  if (linkErr) throw new Error(linkErr.message)
  if (!links?.length) return []

  const userIds = links.map((l) => l.user_id)
  const { data: txs, error: txErr } = await sb
    .from('portfolio_transactions')
    .select('user_id, symbol, name, asset_type, side, quantity, price, commission')
    .in('user_id', userIds)
  if (txErr) throw new Error(txErr.message)

  const byUser = new Map()
  for (const tx of txs ?? []) {
    if (!byUser.has(tx.user_id)) byUser.set(tx.user_id, [])
    byUser.get(tx.user_id).push(tx)
  }
  const watchers = []
  for (const link of links) {
    const holdings = computeHoldings(byUser.get(link.user_id) ?? []).filter((h) => h.qty > 0)
    if (!holdings.length) continue
    const keys = new Set()
    for (const h of holdings) keys.add(norm(h.assetType === 'fund' ? h.name : h.symbol))
    watchers.push({ chatId: link.telegram_chat_id, keys })
  }
  return watchers
}

async function relaySend(chatId, text) {
  const res = await fetch(`${SITE}/api/telegram-relay-portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, chat_id: chatId, text }),
  })
  const data = await res.json().catch(() => null)
  if (!data?.ok) throw new Error(data?.error || `HTTP ${res.status}`)
}

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function main() {
  const watchers = await fetchWatchedSymbols()
  if (!watchers.length) { console.log('[codal-portfolio-notify] هیچ کاربر متصلی با پورتفوی غیرخالی نیست'); return }

  const since = jNow(new Date(Date.now() - HOURS * 3_600_000))
  const anns = await fetchCodalRecent(since)
  console.log(`[codal-portfolio-notify] ${anns.length} اطلاعیه در ${HOURS} ساعت اخیر — ${watchers.length} کاربر متصل`)

  let state = loadState()
  if (!state) {
    // اجرای اول: فقط seed — چیزی نمی‌فرستیم تا سیل اطلاعیه‌های قدیمی راه نیفتد
    state = { seen: {} }
    for (const a of anns) state.seen[a.key] = Date.now()
    saveState(state)
    console.log(`[codal-portfolio-notify] seed اولیه: ${anns.length} اطلاعیه علامت خورد`)
    return
  }

  let sent = 0
  for (const a of anns) {
    if (state.seen[a.key]) continue
    state.seen[a.key] = Date.now()
    if (!a.symbol) continue
    const symKey = norm(a.symbol)
    const matched = watchers.filter((w) => w.keys.has(symKey))
    if (!matched.length) continue

    const text = [
      `📢 <b>اطلاعیه جدید کدال — #${esc(norm(a.symbol))}</b>`,
      `نوع: ${classifyLetter(a.title)}`,
      esc(a.title),
      a.url ? `🔗 <a href="${a.url}">مشاهده در کدال</a>` : '',
    ].filter(Boolean).join('\n')

    if (DRY) { console.log(`  [dry] → ${matched.length} کاربر: ${a.symbol} — ${a.title}`); continue }

    for (const w of matched) {
      try { await relaySend(w.chatId, text); sent++ }
      catch (e) { console.error(`[codal-portfolio-notify] ارسال به ${w.chatId} ناموفق: ${e.message}`) }
      await sleep(300) // رعایت rate limit تلگرام
    }
    saveState(state) // فوری ذخیره کن — کرش وسط حلقه نباید باعث ارسال دوباره شود
  }

  // هرس ورودی‌های قدیمی‌تر از ۷ روز تا state بی‌نهایت بزرگ نشود
  const cutoff = Date.now() - 7 * 86_400_000
  for (const [k, ts] of Object.entries(state.seen)) if (ts < cutoff) delete state.seen[k]
  if (!DRY) saveState(state)
  console.log(`[codal-portfolio-notify] ${sent} پیام ارسال شد`)
}

main().catch((e) => { console.error('[codal-portfolio-notify] fatal:', e.message); process.exit(1) })
