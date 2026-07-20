#!/usr/bin/env node
/**
 * candles-adjusted.js
 *
 * بورس سنج — قیمت‌های تعدیل‌شده (افزایش سرمایه/سود نقدی) برای stock_candles، به ۵ روش:
 *   ۱) خام (ستون‌های open/high/low/close — بدون تغییر)
 *   ۲) نسبی/درصدی ترکیبی (adj_open/high/low/close — از tsetmc A=1، هر دو رویداد با هم)
 *   ۳) جمعی/نقطه‌ای ترکیبی (raw − offset_combined — هر دو رویداد، جمعی نه ضربی)
 *   ۴) فقط افزایش سرمایه، نسبی (raw × coef_capital)
 *   ۵) فقط سود نقدی، نسبی (raw × coef_dividend)
 * روش ۲ مستقیماً محصول tsetmc است؛ روش‌های ۳-۵ با تشخیص رویداد خودمان از تاریخچهٔ خام (A=0)
 * + تاریخچهٔ تغییرات تعداد سهام (TseClient2.aspx?t=InstrumentAndShare) ساخته می‌شوند —
 * الگوریتم برگرفته از m-ahmadi/tse-client (تابع adjust()، MIT).
 * روی سرور ایرانی اجرا شود (tsetmc فقط به IP ایران جواب می‌دهد)
 *
 * منبع: tsetmc InstTradeHistory.aspx با A=1 (تعدیل‌شده) — بدون key و بدون بودجه BrsApi.
 * BrsApi History.php تعدیل ندارد (type فقط 0=قیمت و 1=حقیقی‌حقوقی است — probe شد ۱۴۰۵/۰۴/۲۰).
 *
 * insCode نمادها از متن خام AllSymbols با regex درمی‌آید — id بزرگ‌تر از
 * Number.MAX_SAFE_INTEGER است و JSON.parse در Node رقم‌های آخر را خراب می‌کند.
 * نمادهای متوقف (مثل فولاد) در AllSymbols نیستند → کش .candles-inscode-cache.json
 * نگه‌شان می‌دارد تا وقتی فعال بودند یک‌بار دیده شده باشند.
 *
 *   node candles-adjusted.js --probe --symbol=خودرو   → فرمت خام + تأیید ترتیب فیلدها
 *   node candles-adjusted.js --symbols=فولاد,خودرو     → فقط این نمادها
 *   node candles-adjusted.js --limit=50                → حداکثر ۵۰ نماد (تست)
 *   node candles-adjusted.js                           → همه نمادهای stock_candles
 *
 * ایمنی: قبل از هر نوشتن، ترتیب فیلدها با مقایسه خروجی A=0 و کندل‌های خام DB
 * راستی‌آزمایی می‌شود؛ و برای هر نماد آخرین کندل تعدیل‌شده باید با خام یکی باشد
 * (ضریب تعدیل روی آخرین روز = ۱). ناسازگار → skip، نه نوشتن غلط.
 */

'use strict'

const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const {
  tehranToday,
  clean, num, mapLimit,
} = require('./candles-lib')

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

const BRSAPI_KEY   = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

const PROBE = process.argv.includes('--probe')
const ARG_SYMBOL  = (process.argv.find(x => x.startsWith('--symbol=')) || '').split('=')[1] || 'خودرو'
const ARG_SYMBOLS = (process.argv.find(x => x.startsWith('--symbols=')) || '').split('=')[1] || ''
const LIMIT = (() => {
  const a = process.argv.find(x => x.startsWith('--limit='))
  return a ? parseInt(a.split('=')[1], 10) : Infinity
})()

const YEARS = 6
const CACHE_FILE = path.resolve(__dirname, '.candles-inscode-cache.json')

if (!PROBE && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('[candles-adjusted] SUPABASE_URL و SUPABASE_KEY (service-role) تنظیم نشده‌اند')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ بدون ws هم کار می‌کند */ }
const sb = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})
  : null

// ───────────────────────── fetch متنی (JSON نه) با فالبک curl ─────────────────────────

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }

function curlText(url, timeout = 60_000) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-s', '--max-time', String(Math.ceil(timeout / 1000)), '--fail', '-A', UA['User-Agent'], url],
      { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(new Error(`curl: ${err.message}`))
        else resolve(stdout)
      })
  })
}

async function fetchText(url, { retries = 2, timeout = 60_000 } = {}) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: UA })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e) {
      try { return await curlText(url, timeout) } catch { /* خطای اصلی گزارش شود */ }
      if (i === retries) throw e
      await new Promise(r => setTimeout(r, 1500 * (i + 1)))
    }
  }
}

// ───────────────────────── insCode ها ─────────────────────────

const allSymbolsUrl = () => `https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${BRSAPI_KEY}`

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) } catch { return {} }
}

/** l18 → insCode (string) — از متن خام؛ JSON.parse اعداد ۱۷ رقمی را گرد می‌کند */
async function fetchInsCodes() {
  const raw = await fetchText(allSymbolsUrl(), { timeout: 120_000 })
  const map = loadCache()
  let fresh = 0
  // "l18":"فولاد" … "id":46348559193224090 — در یک آبجکت، ترتیب ثابت پاسخ BrsApi
  const re = /"l18"\s*:\s*"([^"]+)"[^{}]*?"id"\s*:\s*(\d{5,20})/g
  let m
  while ((m = re.exec(raw)) !== null) {
    const l18 = clean(m[1])
    if (l18) { map[l18] = m[2]; fresh++ }
  }
  if (fresh === 0) throw new Error('هیچ insCode ای از AllSymbols درنیامد — فرمت پاسخ عوض شده؟')
  fs.writeFileSync(CACHE_FILE, JSON.stringify(map))
  console.log(`[candles-adjusted] insCode: ${fresh} نماد تازه، ${Object.keys(map).length} در کش (متوقف‌ها هم می‌مانند)`)
  return map
}

// ───────────────────────── تاریخچه tsetmc ─────────────────────────

// چند میزبان — old.tsetmc گاهی قطع است
const HISTORY_HOSTS = [
  'http://old.tsetmc.com',
  'http://www.tsetmc.com',
  'http://tsetmc.com',
]
const historyUrl = (host, insCode, adjusted) =>
  `${host}/tsev2/data/InstTradeHistory.aspx?i=${insCode}&Top=999999&A=${adjusted ? 1 : 0}`

/**
 * ترتیب فیلدهای هر ردیف (جدا با @؛ ردیف‌ها با ;) — منبع: pytse-client
 * با sanity-check مقابل کندل‌های خام DB راستی‌آزمایی می‌شود؛ ناسازگار = توقف.
 */
const F = { date: 0, high: 1, low: 2, close: 3, last: 4, first: 5, yesterday: 6, value: 7, volume: 8, count: 9 }

function parseHistory(text) {
  const out = []
  for (const rowStr of String(text ?? '').split(';')) {
    const f = rowStr.split('@')
    if (f.length < 9) continue
    const d = String(f[F.date] ?? '').trim()
    const m = d.match(/^(\d{4})(\d{2})(\d{2})/)
    if (!m) continue
    const volume = num(f[F.volume])
    if (volume === null || volume === 0) continue // روز بدون معامله
    out.push({
      trade_date: `${m[1]}-${m[2]}-${m[3]}`,
      open: num(f[F.first]),
      high: num(f[F.high]),
      low: num(f[F.low]),
      close: num(f[F.close]),
      yesterday: num(f[F.yesterday]),
    })
  }
  return out
}

async function fetchHistory(insCode, adjusted) {
  let lastErr = null
  for (const host of HISTORY_HOSTS) {
    try {
      const text = await fetchText(historyUrl(host, insCode, adjusted), { retries: 1, timeout: 90_000 })
      const rows = parseHistory(text)
      if (rows.length > 0) return rows
      lastErr = new Error(`${host}: پاسخ خالی/غیرقابل‌پارس`)
    } catch (e) { lastErr = e }
  }
  throw lastErr ?? new Error('همه میزبان‌های tsetmc ناموفق')
}

// ───────────────────────── رویدادهای شرکتی (افزایش سرمایه) ─────────────────────────
//
// روش‌های تعدیل «فقط افزایش سرمایه» و «فقط سود نقدی» نیاز به تفکیک این دو نوع رویداد دارند —
// tsetmc در InstTradeHistory فقط ترکیبی می‌دهد. تفکیک با مقایسهٔ close هر روز با yesterday
// روز بعد انجام می‌شود: اگر ناخوان بودند رویداد رخ داده؛ اگر رکورد تغییر تعداد سهام (از
// TseClient2.aspx?t=InstrumentAndShare) برای آن تاریخ/insCode موجود بود ⇒ افزایش سرمایه،
// وگرنه ⇒ سود نقدی. الگوریتم برگرفته از tse-client (m-ahmadi/tse-client، تابع adjust()).

const SHARES_CACHE_FILE = path.resolve(__dirname, '.candles-shares-cache.json')
const SHARE_HOSTS = ['http://service.tsetmc.com', 'http://www.tsetmc.com', 'http://old.tsetmc.com']

function loadSharesCache() {
  try { return JSON.parse(fs.readFileSync(SHARES_CACHE_FILE, 'utf8')) } catch { return { lastId: 0, rows: [] } }
}

function parseSharesBlob(text) {
  const out = []
  for (const rowStr of String(text ?? '').split(';')) {
    const f = rowStr.split(',')
    if (f.length < 5) continue
    const idn = num(f[0])
    const insCode = String(f[1] ?? '').trim()
    const deven = String(f[2] ?? '').trim()
    const newShares = num(f[3])
    const oldShares = num(f[4])
    if (idn === null || !insCode || !deven || newShares === null || oldShares === null) continue
    out.push({ idn, insCode, deven, newShares, oldShares })
  }
  return out
}

/** تاریخچهٔ کامل تغییرات تعداد سهام (همهٔ نمادها) — کش افزایشی با a2=lastId */
async function fetchShares() {
  const cache = loadSharesCache()
  const todayDeven = tehranToday().gregorian.replace(/-/g, '')
  let lastErr = null
  for (const host of SHARE_HOSTS) {
    try {
      const url = `${host}/tsev2/data/TseClient2.aspx?t=InstrumentAndShare&a=${todayDeven}&a2=${cache.lastId || 0}`
      const text = await fetchText(url, { retries: 1, timeout: 90_000 })
      const blob = String(text ?? '').split('@')[1] ?? ''
      const fresh = parseSharesBlob(blob)
      const merged = cache.lastId ? [...cache.rows, ...fresh] : (fresh.length ? fresh : cache.rows)
      const maxId = merged.reduce((m, r) => Math.max(m, r.idn), cache.lastId || 0)
      fs.writeFileSync(SHARES_CACHE_FILE, JSON.stringify({ lastId: maxId, rows: merged }))
      console.log(`[candles-adjusted] رویدادهای افزایش سرمایه: ${fresh.length} تازه، ${merged.length} کل`)
      return merged
    } catch (e) { lastErr = e }
  }
  if (cache.rows.length) {
    console.warn(`[candles-adjusted] fetchShares ناموفق (${lastErr?.message}) — ${cache.rows.length} رکورد کش قبلی استفاده شد`)
    return cache.rows
  }
  console.warn(`[candles-adjusted] fetchShares ناموفق (${lastErr?.message}) — روش‌های افزایش‌سرمایه/سود نقدی محاسبه نمی‌شوند`)
  return []
}

/**
 * ضرایب/افست سه روش تعدیل را برای یک نماد از تاریخچهٔ خام (صعودی به تاریخ) می‌سازد.
 * coef_capital/coef_dividend نسبی‌اند (raw × coef)، offset_combined جمعی است (raw − offset).
 * روز آخر همیشه ۱/۱/۰ است (بدون تعدیل) — تعدیل بازگشتی (back-adjustment) مثل adj_close خودِ tsetmc.
 */
function computeMethodCoefs(ascRows, sharesByDEven) {
  const n = ascRows.length
  const out = new Array(n)
  if (n === 0) return out
  out[n - 1] = { trade_date: ascRows[n - 1].trade_date, coef_capital: 1, coef_dividend: 1, offset_combined: 0 }
  let coefCapital = 1, coefDividend = 1, offsetCombined = 0
  for (let i = n - 2; i >= 0; i -= 1) {
    const curr = ascRows[i]
    const next = ascRows[i + 1]
    const gap = curr.close != null && next.yesterday != null && Math.abs(curr.close - next.yesterday) > 0.01
    if (gap) {
      const deven = curr.trade_date === next.trade_date ? '' : next.trade_date.replace(/-/g, '')
      const share = sharesByDEven.get(deven)
      if (share && share.oldShares > 0 && share.newShares > 0) {
        coefCapital *= share.oldShares / share.newShares
      } else if (curr.close > 0) {
        coefDividend *= next.yesterday / curr.close
      }
      offsetCombined += curr.close - next.yesterday
    }
    out[i] = { trade_date: curr.trade_date, coef_capital: coefCapital, coef_dividend: coefDividend, offset_combined: offsetCombined }
  }
  return out
}

// ───────────────────────── سانیتی: ترتیب فیلدها درست است؟ ─────────────────────────

/**
 * خروجی A=0 (خام tsetmc) باید با کندل‌های خام DB (BrsApi) یکی باشد.
 * پنج تاریخ مشترک آخر مقایسه می‌شود — close/high/low/open.
 * رد شدن یعنی ترتیب F غلط است → هیچ نوشتنی انجام نمی‌شود.
 */
async function verifyFieldOrder(symbol, insCode) {
  const { data: dbRows, error } = await sb
    .from('stock_candles')
    .select('trade_date, open, high, low, close')
    .eq('symbol', symbol)
    .order('trade_date', { ascending: false })
    .limit(30)
  if (error || !dbRows?.length) throw new Error(`کندل خام «${symbol}» در DB نیست`)

  const raw = await fetchHistory(insCode, false)
  const byDate = new Map(raw.map(r => [r.trade_date, r]))
  let checked = 0
  for (const db of dbRows) {
    const ts = byDate.get(db.trade_date)
    if (!ts) continue
    const close = Math.abs(ts.close - db.close) / db.close
    const high  = db.high ? Math.abs(ts.high - db.high) / db.high : 0
    const low   = db.low ? Math.abs(ts.low - db.low) / db.low : 0
    if (close > 0.001 || high > 0.001 || low > 0.001) {
      throw new Error(
        `ترتیب فیلدهای InstTradeHistory با انتظار نمی‌خواند (نماد ${symbol}، تاریخ ${db.trade_date}: ` +
        `tsetmc close=${ts.close} vs DB=${db.close}) — خروجی --probe را بررسی کن`
      )
    }
    if (++checked >= 5) break
  }
  if (checked === 0) throw new Error(`تاریخ مشترکی بین tsetmc و DB برای «${symbol}» نبود`)
  console.log(`[candles-adjusted] ✅ ترتیب فیلدها تأیید شد (${checked} کندل «${symbol}» مطابق DB)`)
}

// ───────────────────────── به‌روزرسانی یک نماد ─────────────────────────

// «2026-07-10» → «2023-07-10»
function gregCutoff() {
  const { gregorian } = tehranToday()
  return `${+gregorian.slice(0, 4) - YEARS}${gregorian.slice(4)}`
}

async function updateSymbol(symbol, insCode, cutoff, sharesByInsCode) {
  const adj = await fetchHistory(insCode, true)
  if (adj.length === 0) return { symbol, rows: 0, note: 'تاریخچه تعدیل خالی' }

  // تاریخ‌های موجود همین نماد در DB — فقط همان‌ها آپدیت می‌شوند (upsert ردیف ناقص نسازد)
  // trade_date_shamsi هم می‌آید چون NOT NULL است و باید در payload upsert باشد
  const { data: existing, error } = await sb
    .from('stock_candles')
    .select('trade_date, trade_date_shamsi, close')
    .eq('symbol', symbol)
    .gte('trade_date', cutoff)
  if (error) throw new Error(`select: ${error.message}`)
  if (!existing?.length) return { symbol, rows: 0, note: 'کندل خام ندارد' }
  const dbDates = new Map(existing.map(r => [r.trade_date, r]))

  // ضریب تعدیل روی آخرین روزِ مشترک باید ۱ باشد — وگرنه چیزی غلط است
  const adjSorted = adj.filter(r => dbDates.has(r.trade_date)).sort((a, b) => a.trade_date < b.trade_date ? 1 : -1)
  if (adjSorted.length === 0) return { symbol, rows: 0, note: 'تاریخ مشترک ندارد' }
  const newest = adjSorted[0]
  const rawClose = dbDates.get(newest.trade_date)?.close
  if (rawClose && Math.abs(newest.close - rawClose) / rawClose > 0.01) {
    return { symbol, rows: 0, note: `آخرین کندل تعدیلی (${newest.close}) با خام (${rawClose}) نمی‌خواند — skip` }
  }

  // روش‌های «فقط افزایش سرمایه» / «فقط سود نقدی» / «جمعی» — از تاریخچهٔ خام (A=0) به‌طور جدا محاسبه می‌شود
  let methodsByDate = new Map()
  if (sharesByInsCode) {
    try {
      const raw = await fetchHistory(insCode, false)
      const ascRaw = [...raw].sort((a, b) => a.trade_date < b.trade_date ? -1 : 1)
      const sharesByDEven = new Map(
        (sharesByInsCode.get(insCode) ?? []).map(s => [s.deven, s])
      )
      const coefs = computeMethodCoefs(ascRaw, sharesByDEven)
      methodsByDate = new Map(coefs.map(c => [c.trade_date, c]))
    } catch (e) {
      console.warn(`[candles-adjusted] روش‌های اضافی «${symbol}» ناموفق: ${e.message}`)
    }
  }

  const rows = adjSorted.map(r => {
    const m = methodsByDate.get(r.trade_date)
    return {
      symbol,
      trade_date: r.trade_date,
      trade_date_shamsi: dbDates.get(r.trade_date).trade_date_shamsi,
      adj_open: r.open,
      adj_high: r.high,
      adj_low: r.low,
      adj_close: r.close,
      ...(m ? { coef_capital: m.coef_capital, coef_dividend: m.coef_dividend, offset_combined: m.offset_combined } : {}),
    }
  })

  const BATCH = 500
  let ok = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error: upErr } = await sb.from('stock_candles').upsert(batch, { onConflict: 'symbol,trade_date' })
    if (upErr) console.error(`[candles-adjusted] خطای batch «${symbol}»: ${upErr.message}`)
    else ok += batch.length
  }
  return { symbol, rows: ok }
}

// ───────────────────────── main ─────────────────────────

async function main() {
  if (PROBE) {
    console.log(`═══ probe تعدیل‌شده برای «${ARG_SYMBOL}» ═══`)
    const codes = await fetchInsCodes()
    const insCode = codes[clean(ARG_SYMBOL)]
    if (!insCode) { console.error(`insCode «${ARG_SYMBOL}» پیدا نشد (متوقف و خارج از کش؟)`); process.exit(1) }
    console.log(`insCode: ${insCode}`)
    for (const A of [0, 1]) {
      const rows = await fetchHistory(insCode, A === 1)
      console.log(`\n─── A=${A} (${A ? 'تعدیل‌شده' : 'خام'}) — ${rows.length} ردیف، ۳ ردیف آخر:`)
      console.log(JSON.stringify(rows.slice(0, 3), null, 2))
    }
    console.log('\nترتیب فیلدهای فرض‌شده: date@high@low@close@last@first@yesterday@value@volume@count')
    console.log('close ردیف‌های A=0 را با ستون close جدول stock_candles همان تاریخ مقایسه کن — باید یکی باشد.')
    if (sb) {
      try { await verifyFieldOrder(clean(ARG_SYMBOL), insCode) } catch (e) { console.error(`sanity: ${e.message}`) }
    }

    console.log('\n═══ probe رویدادها (افزایش سرمایه/سود نقدی) ═══')
    const allShares = await fetchShares().catch(e => { console.warn(`fetchShares: ${e.message}`); return [] })
    const sharesByDEven = new Map(
      allShares.filter(s => s.insCode === insCode).map(s => [s.deven, s])
    )
    console.log(`رکوردهای افزایش سرمایه همین نماد: ${sharesByDEven.size}`)
    const raw0 = await fetchHistory(insCode, false)
    const ascRaw = [...raw0].sort((a, b) => (a.trade_date < b.trade_date ? -1 : 1))
    const coefs = computeMethodCoefs(ascRaw, sharesByDEven)
    const events = []
    for (let i = 1; i < ascRaw.length; i++) {
      const prev = coefs[i - 1], curr = coefs[i]
      if (prev.coef_capital !== curr.coef_capital || prev.coef_dividend !== curr.coef_dividend || prev.offset_combined !== curr.offset_combined) {
        events.push({ date: ascRaw[i].trade_date, coef_capital: curr.coef_capital, coef_dividend: curr.coef_dividend, offset_combined: curr.offset_combined })
      }
    }
    console.log(`${events.length} رویداد تشخیص داده شد:`)
    console.log(JSON.stringify(events, null, 2))
    console.log('\nمقایسه دستی: coef_capital در روز ۱۴۰۵/۰۴/۲۰ باید با نسبت سهم قدیم/جدید افزایش سرمایه واقعی این نماد یکی باشد.')
    return
  }

  const codes = await fetchInsCodes()

  // فهرست نمادها: --symbols یا همه نمادهای stock_candles (paged — بیش از ۱۰۰۰ نماد)
  let symbols
  if (ARG_SYMBOLS) {
    symbols = ARG_SYMBOLS.split(',').map(clean).filter(Boolean)
  } else {
    const found = new Set()
    for (let fromId = 0; ; fromId += 1000) {
      const { data, error } = await sb
        .from('stock_candles')
        .select('symbol')
        .order('symbol', { ascending: true })
        .range(fromId, fromId + 999)
      if (error) throw new Error(`فهرست نمادها: ${error.message}`)
      if (!data?.length) break
      for (const r of data) found.add(r.symbol)
      if (data.length < 1000) break
    }
    symbols = [...found]
  }

  const noCode = symbols.filter(s => !codes[s])
  symbols = symbols.filter(s => codes[s]).slice(0, LIMIT)
  console.log(`[candles-adjusted] ${symbols.length} نماد در این اجرا${noCode.length ? `، ${noCode.length} بدون insCode (متوقفِ خارج از کش)` : ''}`)
  if (noCode.length) console.log('  بدون insCode:', noCode.slice(0, 10).join('، '), noCode.length > 10 ? '…' : '')
  if (symbols.length === 0) { console.log('چیزی برای انجام نیست'); return }

  // دروازه ایمنی — یک نماد اول، ترتیب فیلدها مقابل DB
  await verifyFieldOrder(symbols[0], codes[symbols[0]])

  // تاریخچهٔ تغییرات تعداد سهام (افزایش سرمایه) همهٔ نمادها — یک‌بار در کل اجرا
  const allShares = await fetchShares().catch(e => { console.warn(`[candles-adjusted] fetchShares: ${e.message}`); return [] })
  const sharesByInsCode = new Map()
  for (const s of allShares) {
    if (!sharesByInsCode.has(s.insCode)) sharesByInsCode.set(s.insCode, [])
    sharesByInsCode.get(s.insCode).push(s)
  }

  const cutoff = gregCutoff()
  let total = 0
  const notes = []
  const failed = []

  await mapLimit(symbols, 3, async (symbol, i) => {
    try {
      const r = await updateSymbol(symbol, codes[symbol], cutoff, sharesByInsCode)
      total += r.rows
      if (r.note) notes.push(`${symbol}: ${r.note}`)
      if ((i + 1) % 50 === 0) console.log(`[candles-adjusted] ${i + 1}/${symbols.length}… (${total} ردیف)`)
    } catch (e) {
      failed.push(`${symbol} (${e.message})`)
    }
  })

  if (notes.length) console.warn(`[candles-adjusted] ${notes.length} نماد نکته داشت:`, notes.slice(0, 8).join(' | '))
  if (failed.length) console.warn(`[candles-adjusted] ${failed.length} نماد ناموفق:`, failed.slice(0, 8).join('، '))
  console.log(`[candles-adjusted] ✅ ${total} ردیف adj_* به‌روز شد (${symbols.length} نماد)`)
  if (total === 0) process.exit(1) // برای run-with-alert
}

main().catch(e => { console.error(e); process.exit(1) })
