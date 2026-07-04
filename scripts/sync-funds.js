#!/usr/bin/env node
/**
 * sync-funds.js
 *
 * بورس سنج — بروزرسانی صندوق‌های کالایی از BrsAPI
 * روی سرور ایرانی اجرا شود (نیاز به IP ایران)
 *
 * راه‌اندازی:
 *   1. npm install @supabase/supabase-js node-fetch   (فقط یک بار)
 *   2. متغیرهای محیطی را در .env.sync تنظیم کنید
 *   3. اول با --probe اجرا کنید تا فرمت API را ببینید
 *      node sync-funds.js --probe
 *   4. crontab -e  و خط زیر را اضافه کنید:
 *      TZ=Asia/Tehran
 *      * /10 12-17 * * 6,0-3 /usr/bin/node /path/to/sync-funds.js >> /var/log/sync-funds.log 2>&1
 *      (روزهای 6,0-3 = شنبه تا چهارشنبه؛ در cron عدد 0 یعنی یکشنبه و 6 یعنی شنبه)
 *
 * متغیرهای لازم (.env.sync):
 *   BRSAPI_KEY=BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_KEY=eyJ...   (service_role یا anon با دسترسی write)
 */

'use strict'

const path = require('path')
const fs   = require('fs')

// ── env loader ──────────────────────────────────────────────────────────────
function loadEnv(file) {
  const p = path.resolve(__dirname, file)
  if (!fs.existsSync(p)) return
  fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] = m[2].trim()
  })
}
loadEnv('../.env.local')   // Next.js env (fallback)
loadEnv('.env.sync')        // script-specific env (priority)

const BRSAPI_KEY    = process.env.BRSAPI_KEY    || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const SUPABASE_URL  = process.env.SUPABASE_URL  || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_KEY  || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[sync-funds] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
  process.exit(1)
}

const FUND_URL      = `https://api.brsapi.ir/IME/Fund.php?key=${BRSAPI_KEY}`
const GOLD_PRO_URL  = `https://Api.BrsApi.ir/Market/Gold_Currency_Pro.php?key=${BRSAPI_KEY}&section=gold,currency,cryptocurrency`
const COMMODITY_URL = `https://api.brsapi.ir/Market/Commodity.php?key=${BRSAPI_KEY}`
const IME_CERT_URL  = `https://Api.BrsApi.ir/IME/Certificate.php?key=${BRSAPI_KEY}`
const PROBE     = process.argv.includes('--probe')
const PROBE_IME = process.argv.includes('--probe-ime')
const FORCE     = process.argv.includes('--force')   // اجرا خارج از ساعت بازار

// ── Supabase client (lazy require for compatibility) ────────────────────────
let _sb = null
function sb() {
  if (_sb) return _sb

  let createClient
  try {
    createClient = require('@supabase/supabase-js').createClient
  } catch (e) {
    console.error('[sync-funds] پکیج @supabase/supabase-js نصب نیست:', e.message)
    process.exit(1)
  }

  if (!SUPABASE_URL || !SUPABASE_URL.startsWith('http')) {
    console.error(`[sync-funds] SUPABASE_URL نامعتبر: "${SUPABASE_URL}"`)
    process.exit(1)
  }
  if (!SUPABASE_KEY || SUPABASE_KEY.length < 20) {
    console.error(`[sync-funds] SUPABASE_KEY نامعتبر (طول: ${SUPABASE_KEY?.length ?? 0})`)
    process.exit(1)
  }

  // Node.js < 22 lacks native WebSocket — pass ws package explicitly
  let wsTransport
  try { wsTransport = require('ws') } catch { /* Node 22+ fine without it */ }

  try {
    const opts = wsTransport ? { realtime: { transport: wsTransport } } : {}
    _sb = createClient(SUPABASE_URL, SUPABASE_KEY, opts)
    return _sb
  } catch (e) {
    console.error('[sync-funds] خطا در ایجاد Supabase client:', e.message)
    console.error('[sync-funds] URL:', SUPABASE_URL)
    console.error('[sync-funds] KEY طول:', SUPABASE_KEY.length)
    process.exit(1)
  }
}

// ── Tehran market hours check ────────────────────────────────────────────────
// IME: شنبه–چهارشنبه، ۱۲:۰۰–۱۷:۰۵ به وقت تهران
function isMarketOpen() {
  const now = new Date()
  // تبدیل به وقت تهران (UTC+3:30)
  const tehran = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  const day  = tehran.getDay()   // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat=شنبه
  const hour = tehran.getHours()
  const min  = tehran.getMinutes()
  const timeMin = hour * 60 + min  // دقیقه از ۰۰:۰۰

  // شنبه تا چهارشنبه ایرانی = Sat(6) و Sun(0) تا Wed(3) در JS weekday
  const isWorkday = day === 6 || day <= 3
  const inWindow  = timeMin >= 12 * 60 && timeMin <= 17 * 60 + 5   // 12:00 تا 17:05

  return isWorkday && inWindow
}

// ── Jalali date ──────────────────────────────────────────────────────────────
// محاسبه ساده بدون کتابخانه خارجی
function toJalali(gy, gm, gd) {
  const g_y = gy - 1600
  const g_m = gm - 1
  const g_d = gd - 1
  const isLeap = g_y % 4 === 0 && (g_y % 100 !== 0 || g_y % 400 === 0)
  const g_days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let g_day_no = 365 * g_y + Math.floor((g_y + 3) / 4) - Math.floor((g_y + 99) / 100) + Math.floor((g_y + 399) / 400)
  for (let i = 0; i < g_m; i++) g_day_no += g_days[i]
  g_day_no += g_d
  let j_day_no = g_day_no - 79
  const j_np = Math.floor(j_day_no / 12053)
  j_day_no %= 12053
  let jy = 979 + 33 * j_np + 4 * Math.floor(j_day_no / 1461)
  j_day_no %= 1461
  if (j_day_no >= 366) {
    jy += Math.floor((j_day_no - 1) / 365)
    j_day_no = (j_day_no - 1) % 365
  }
  const j_days = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29]
  let jm = 0
  for (jm = 0; jm < 11; jm++) {
    if (j_day_no < j_days[jm]) break
    j_day_no -= j_days[jm]
  }
  return [jy, jm + 1, j_day_no + 1]
}

function todayShamsi() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  const [y, m, d] = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`
}

// ── Field mapper ─────────────────────────────────────────────────────────────
// BrsAPI ممکنه نام‌های مختلف داشته باشه — تمام احتمالات پوشش داده شده
function pick(...keys) {
  return function(obj) {
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]
    }
    return null
  }
}

const FIELD = {
  symbol:        pick('isin', 'symbol', 'nsc_code', 'ticker', 'fund_code'),
  price_close:   pick('pf', 'pc', 'close_price', 'final_price', 'price_close', 'close'),
  price_last:    pick('pl', 'last_price', 'price_last', 'last'),
  change_pct:    pick('pcp', 'change_percent', 'price_change_pct', 'change_pct', 'pct_change'),
  trade_value:   pick('tval', 'trade_value', 'value', 'turnover', 'trade_val'),
  volume:        pick('tvol', 'volume', 'trade_volume', 'qty', 'quantity'),
  market_value:  pick('mv', 'market_cap', 'market_value', 'mkt_cap', 'bvol'),
  buy_i_vol:     pick('Buy_I_Volume', 'buy_individual_volume', 'buy_i_volume', 'i_buy_vol', 'real_buy_vol'),
  sell_i_vol:    pick('Sell_I_Volume', 'sell_individual_volume', 'sell_i_volume', 'i_sell_vol', 'real_sell_vol'),
  buy_i_count:   pick('Buy_CountI', 'buy_individual_count', 'buy_count_i', 'i_buy_count', 'real_buy_count'),
  sell_i_count:  pick('Sell_CountI', 'sell_individual_count', 'sell_count_i', 'i_sell_count', 'real_sell_count'),
  date_shamsi:   pick('date_shamsi', 'trade_date', 'jdate', 'j_date', 'date'),
}

function mapFundRow(item, assetId, shamsiDate) {
  const d = FIELD.date_shamsi(item) || shamsiDate
  return {
    asset_id:         assetId,
    trade_date_shamsi: d,
    price_close:      FIELD.price_close(item),
    price_last:       FIELD.price_last(item),
    price_change_pct: FIELD.change_pct(item),
    trade_value:      FIELD.trade_value(item) ?? 0,  // NOT NULL column
    volume:           FIELD.volume(item),
    market_value:     FIELD.market_value(item),
    buy_i_volume:     FIELD.buy_i_vol(item),
    sell_i_volume:    FIELD.sell_i_vol(item),
    buy_count_i:      FIELD.buy_i_count(item),
    sell_count_i:     FIELD.sell_i_count(item),
  }
}

// ── NAV sync (حباب اسمی) ─────────────────────────────────────────────────────
async function syncNavPrices(date) {
  console.log('[sync-nav] دریافت NAV صندوق‌های طلا از BrsAPI...')
  try {
    const { data: fundAssets } = await sb()
      .from('assets')
      .select('name, slug')
      .neq('slug', 'gold')
      .like('slug', 'IRTK%')

    const names = (fundAssets ?? []).map(a => a.name)
    if (names.length === 0) { console.warn('[sync-nav] هیچ صندوقی پیدا نشد'); return }

    const results = await Promise.all(names.map(async name => {
      try {
        const url = `https://Api.BrsApi.ir/Tsetmc/Nav.php?key=${BRSAPI_KEY}&l18=${encodeURIComponent(name)}`
        const data = await fetchJson(url, 2)
        const val = parseFloat(String(data?.predtran ?? '').replace(/,/g, ''))
        return { name, nav: isNaN(val) || val === 0 ? null : val }
      } catch {
        return { name, nav: null }
      }
    }))

    const navs = {}
    for (const { name, nav } of results) navs[name] = nav
    const gotCount = results.filter(r => r.nav !== null).length
    console.log(`[sync-nav] ${gotCount}/${names.length} صندوق NAV دریافت شد`)

    // upsert به signals
    await sb().from('signals').delete()
      .eq('signal_type', '_nav_cache').eq('signal_date_shamsi', date)
    const { error } = await sb().from('signals').insert({
      signal_type:        '_nav_cache',
      signal_date_shamsi: date,
      market_value:       0,
      note:               JSON.stringify({ navs }),
    })
    if (error) console.error('[sync-nav] خطا در ذخیره:', error.message)
    else       console.log('[sync-nav] ✅ NAV صندوق‌ها ذخیره شد')
  } catch (e) {
    console.warn('[sync-nav] ⚠️ ناموفق:', e.message)
  }
}

// ── IME Certificate (بورس کالا) sync ─────────────────────────────────────────
async function syncImePrices(date) {
  console.log('[sync-ime] دریافت قیمت بورس کالا از BrsAPI...')
  try {
    const raw = await fetchJson(IME_CERT_URL, 2)

    // log structure so we can map fields
    if (Array.isArray(raw)) {
      console.log(`[sync-ime] آرایه با ${raw.length} رکورد`)
      if (raw[0]) console.log('[sync-ime] کلیدها:', Object.keys(raw[0]).join(', '))
      if (raw[0]) console.log('[sync-ime] نمونه اول:', JSON.stringify(raw[0]).slice(0, 400))
    } else if (raw && typeof raw === 'object') {
      console.log('[sync-ime] کلیدهای اصلی:', Object.keys(raw).join(', '))
      console.log('[sync-ime] داده خام:', JSON.stringify(raw).slice(0, 400))
    }

    await sb().from('signals').delete()
      .eq('signal_type', '_ime_cache').eq('signal_date_shamsi', date)
    const { error } = await sb().from('signals').insert({
      signal_type:        '_ime_cache',
      signal_date_shamsi: date,
      market_value:       0,
      note:               JSON.stringify({ raw }),
    })
    if (error) console.error('[sync-ime] خطا در ذخیره:', error.message)
    else       console.log('[sync-ime] ✅ قیمت بورس کالا ذخیره شد')
  } catch (e) {
    console.warn('[sync-ime] ⚠️ ناموفق:', e.message)
  }
}

// ── gold price sync ───────────────────────────────────────────────────────────
async function syncGoldPrices(date) {
  console.log('[sync-gold] دریافت قیمت طلا، ارز و کامودیتی...')
  try {
    const [rawPro, rawCommodity] = await Promise.all([
      fetchJson(GOLD_PRO_URL),
      fetchJson(COMMODITY_URL),
    ])
    const { error: delErr } = await sb().from('signals').delete()
      .eq('signal_type', '_gold_cache').eq('signal_date_shamsi', date)
    if (delErr) console.warn('[sync-gold] حذف قدیمی:', delErr.message)
    const { error: insErr } = await sb().from('signals').insert({
      signal_type:        '_gold_cache',
      signal_date_shamsi: date,
      market_value:       0,
      note:               JSON.stringify({ raw_pro: rawPro, raw_commodity: rawCommodity }),
    })
    if (insErr) console.error('[sync-gold] خطا در ذخیره:', insErr.message)
    else        console.log('[sync-gold] ✅ قیمت طلا و ارز ذخیره شد')
  } catch (e) {
    console.warn('[sync-gold] ⚠️ ناموفق (ادامه می‌دهیم):', e.message)
  }
}

// ── fetch with retry ──────────────────────────────────────────────────────────
async function fetchJson(url, retries = 3) {
  let fetchFn
  try {
    fetchFn = fetch  // Node 18+
  } catch {
    fetchFn = require('node-fetch')
  }

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchFn(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BourssanjSync/1.0)' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      console.warn(`[sync-funds] تلاش ${i+1}/${retries} ناموفق:`, e.message)
      if (i < retries - 1) await new Promise(r => setTimeout(r, 3000 * (i + 1)))
    }
  }
  throw new Error('همه تلاش‌ها ناموفق بود')
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const ts = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })
  console.log(`\n[${ts}] sync-funds شروع شد`)

  // حالت probe-ime — فقط ساختار Certificate API نمایش داده می‌شود
  if (PROBE_IME) {
    console.log('\n═══ IME Certificate API (probe-ime mode) ═══')
    const raw = await fetchJson(IME_CERT_URL, 2)
    console.log(JSON.stringify(Array.isArray(raw) ? raw.slice(0, 3) : raw, null, 2))
    return
  }

  // بررسی ساعت بازار
  if (!FORCE && !PROBE && !isMarketOpen()) {
    console.log('[sync-funds] خارج از ساعت بازار — پایان (--force برای اجرای اجباری)')
    return
  }

  // دریافت از API
  console.log('[sync-funds] دریافت داده از BrsAPI...')
  const raw = await fetchJson(FUND_URL)

  // حالت probe — فقط نمایش ساختار
  if (PROBE) {
    console.log('\n═══ RAW API RESPONSE (probe mode) ═══')
    const sample = Array.isArray(raw?.data) ? raw.data.slice(0, 2)
                 : Array.isArray(raw)        ? raw.slice(0, 2)
                 : raw
    console.log(JSON.stringify(sample, null, 2))
    console.log('\n═══ همه کلیدهای اولین رکورد ═══')
    const first = Array.isArray(raw?.data) ? raw.data[0] : Array.isArray(raw) ? raw[0] : raw
    if (first) console.log(Object.keys(first).join(', '))
    console.log('\n✅ ساختار را بررسی کنید و در صورت نیاز FIELD در اسکریپت را تنظیم کنید')
    return
  }

  // استخراج آرایه صندوق‌ها
  const items = Array.isArray(raw?.data) ? raw.data
              : Array.isArray(raw?.fund)  ? raw.fund
              : Array.isArray(raw)         ? raw
              : Object.values(raw || {}).find(Array.isArray) || []

  if (items.length === 0) {
    console.warn('[sync-funds] هیچ داده‌ای در پاسخ API نبود:', JSON.stringify(raw).slice(0, 200))
    return
  }
  console.log(`[sync-funds] ${items.length} رکورد دریافت شد`)

  // بارگذاری نقشه slug → asset_id از Supabase
  const { data: assets, error: assetErr } = await sb().from('assets').select('id, slug')
  if (assetErr) { console.error('[sync-funds] خطا در دریافت assets:', assetErr.message); return }
  // کلید map = ISIN (slug در assets مثل IRTKMOFD0001)
  const isinMap = {}
  assets?.forEach(a => { isinMap[a.slug] = a.id })

  const date = todayShamsi()
  console.log(`[sync-funds] تاریخ امروز (شمسی): ${date}`)

  // ساخت ردیف‌های آماده برای insert
  const rows = []
  const unknownSymbols = []

  for (const item of items) {
    // روش اول: اسکن همه مقادیر string رکورد برای ISIN (قوی‌ترین روش)
    let assetId
    for (const val of Object.values(item)) {
      if (typeof val === 'string' && isinMap[val]) {
        assetId = isinMap[val]
        break
      }
    }
    // روش دوم: کلیدهای شناخته‌شده ISIN
    if (!assetId) {
      const isin = FIELD.symbol(item)
      if (isin && isinMap[isin]) assetId = isinMap[isin]
    }

    if (!assetId) { unknownSymbols.push(FIELD.symbol(item) || '?'); continue }
    rows.push(mapFundRow(item, assetId, date))
  }

  if (unknownSymbols.length > 0) {
    console.warn(`[sync-funds] ${unknownSymbols.length} نماد match نشد:`, unknownSymbols.slice(0,10).join(', '))
  }

  if (rows.length === 0) {
    console.warn('[sync-funds] 0 ردیف — ISIN در پاسخ API پیدا نشد')
    console.warn('نمونه ISIN از assets:', Object.keys(isinMap).slice(0,5).join(', '))
    if (items[0]) console.warn('همه کلیدهای اولین رکورد:', Object.keys(items[0]).join(', '))
    if (items[0]) console.warn('همه مقادیر رکورد اول:', JSON.stringify(items[0]).slice(0, 300))
    return
  }

  // حذف داده‌های همین روز و درج دوباره (به جای upsert که نیاز به unique constraint دارد)
  const { error: delErr } = await sb()
    .from('gold_funds')
    .delete()
    .eq('trade_date_shamsi', date)
    .in('asset_id', rows.map(r => r.asset_id))

  if (delErr) {
    console.warn('[sync-funds] خطا در حذف داده قدیمی (ادامه می‌دهیم):', delErr.message)
  }

  // درج دسته‌ای (batched insert)
  const BATCH = 20
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error: insErr } = await sb().from('gold_funds').insert(batch)
    if (insErr) {
      console.error(`[sync-funds] خطا در درج دسته ${i/BATCH + 1}:`, insErr.message)
    } else {
      inserted += batch.length
    }
  }

  console.log(`[sync-funds] ✅ ${inserted}/${rows.length} رکورد با موفقیت ذخیره شد (تاریخ: ${date})`)

  // ── مجموع ارزش معاملات → asset طلا (برای صفحه dashboard) ─────────────────
  // trade_value از BrsAPI به ریال است — ÷10^10 = میلیارد تومان (همان واحد ورودی دستی)
  const goldAsset = assets?.find(a => a.slug === 'gold')
  if (goldAsset && rows.length > 0) {
    const totalTval = rows.reduce((s, r) => s + (r.trade_value || 0), 0)
    const totalBT   = Math.round(totalTval / 1e10 * 100) / 100  // میلیارد تومان
    await sb().from('gold_funds').delete()
      .eq('trade_date_shamsi', date).eq('asset_id', goldAsset.id)
    const { error: aggErr } = await sb().from('gold_funds').insert({
      asset_id:          goldAsset.id,
      trade_date_shamsi: date,
      trade_value:       totalBT,
    })
    if (aggErr) console.error('[sync-funds] خطا در ذخیره مجموع طلا:', aggErr.message)
    else        console.log(`[sync-funds] ✅ مجموع طلا: ${totalBT} میلیارد تومان → dashboard`)
  }

  // ── قیمت طلا، ارز، NAV صندوق‌ها و بورس کالا ─────────────────────────────
  await Promise.all([
    syncGoldPrices(date),
    syncNavPrices(date),
    syncImePrices(date),
  ])
}

main().catch(e => {
  console.error('[sync-funds] خطای بحرانی:', e.message)
  process.exit(1)
})
