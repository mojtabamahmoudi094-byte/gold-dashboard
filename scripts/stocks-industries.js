#!/usr/bin/env node
/**
 * stocks-industries.js
 *
 * بورس سنج — استخراج سهام بازار به تفکیک صنعت از BrsAPI AllSymbols.php
 * (فیلد cs = نام صنعت، cs_id = کد صنعت — طبقه‌بندی رسمی TSETMC)
 *
 * روی سرور ایرانی (BrsAPI فقط IP ایران):
 *   node stocks-industries.js            → stocks-industries.json کنار اسکریپت
 *   node stocks-industries.js --probe    → فقط فهرست صنایع و تعداد نماد هر کدام
 *
 * خروجی به جدول stock_industries در Supabase هم upsert می‌شود (سایت از /api/stocks-industries می‌خواند)
 * cron: هر ۵ دقیقه، شنبه–چهارشنبه — سهام ۹:۰۰–۱۲:۳۰، صندوق‌های کالایی ۱۲:۰۰–۱۸:۰۰ (گارد ساعت داخل خود اسکریپت است، --force برای رد کردن)
 *
 * fallback دستی از مک:
 *   scp root@45.94.215.115:/opt/stocks-industries.json public/stocks/industries.json
 */

'use strict'

const path = require('path')
const fs   = require('fs')

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

const KEY = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PROBE = process.argv.includes('--probe')
const FORCE = process.argv.includes('--force')

// ساعت بازار تهران — سهام/صندوق‌های بورسی ۹:۰۰–۱۲:۳۰، صندوق‌های کالایی (طلا/نقره/زعفران) ۱۲:۰۰–۱۸:۰۰
function tehranClock() {
  const tehran = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  return { day: tehran.getDay(), mins: tehran.getHours() * 60 + tehran.getMinutes() } // 0=یکشنبه … 6=شنبه
}
// تاریخ امروز به وقت تهران، برای کلید ردیف روزانه سرانه (YYYY-MM-DD)
function tehranDateStr() {
  const tehran = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  return `${tehran.getFullYear()}-${String(tehran.getMonth() + 1).padStart(2, '0')}-${String(tehran.getDate()).padStart(2, '0')}`
}
const STOCKS_OPEN  = 9 * 60
const STOCKS_CLOSE = 12 * 60 + 30
const FUNDS_OPEN   = 12 * 60
const FUNDS_CLOSE  = 18 * 60
const isMarketDay = (day) => [6, 0, 1, 2, 3].includes(day) // شنبه تا چهارشنبه

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// نام‌ها را از ي/ك عربی، ZWNJ و کاراکترهای کنترلی RTL پاک می‌کند
const clean = (s) => String(s || '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[‌‎‏‪-‮]/g, ' ')
  .replace(/\s+/g, ' ').trim()

// صنایعی که سهم نیستند — صندوق، اوراق بدهی، تسهیلات مسکن و…
const NOT_STOCK_CS = /صندوق|اوراق|تسهیلات|صکوک|اسناد|اختیار|آتی|سپرده|امتیاز|مشارکت|اجاره|مرابحه|خزانه/

// صندوق‌های مبتنی بر سهام (سهامی/اهرمی/بخشی) — در سنجه‌های «رصد لحظه‌ای» کنار سهام حساب می‌شوند
const { BOURSE_SYMBOLS } = require('./bourse-symbols')
const { marketFromIsin } = require('./candles-lib')
const EQUITY_FUND_NAMES = new Set(
  ['سهامی', 'اهرمی', 'بخشی'].flatMap(cat => BOURSE_SYMBOLS[cat] || []).map(clean)
)
// صندوق‌های درآمد ثابت — برای نمودار «تفکیک ارزش معاملات» رصد لحظه‌ای (کنار سهام/فرابورس/آپشن/صندوق‌ها حساب می‌شوند، نه در watchItems)
const FIXED_INCOME_FUND_NAMES = new Set((BOURSE_SYMBOLS['درآمد ثابت'] || []).map(clean))
// اختیار معامله/آتی — از cs (نام صنعت) تشخیص داده می‌شود
const OPTION_CS = /اختیار|آتی/

async function main() {
  const { day, mins } = tehranClock()
  const inWindow = isMarketDay(day) && mins >= STOCKS_OPEN && mins <= FUNDS_CLOSE
  if (!FORCE && !PROBE && !inWindow) {
    console.log('[stocks-industries] خارج از ساعت بازار (شنبه–چهارشنبه ۹:۰۰–۱۸:۰۰ تهران) — رد شد. با --force اجباری کنید.')
    return
  }
  // سهام/بورسی ۹:۰۰–۱۲:۳۰ — کالایی‌ها ۱۲:۳۰–۱۸:۰۰
  const stocksOpen = FORCE || (mins >= STOCKS_OPEN && mins <= STOCKS_CLOSE)
  const fundsOpen  = FORCE || (mins >= FUNDS_OPEN && mins <= FUNDS_CLOSE)
  const url = `https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${KEY}`
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const arr = Array.isArray(data) ? data : (data?.symbols ?? data?.data ?? [])
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('پاسخ AllSymbols خالی است')
  console.log(`${arr.length} نماد دریافت شد`)

  // مجموعه همه نمادها برای تشخیص حق تقدم (فولادح ← فولاد موجود است)
  const allL18 = new Set(arr.map(it => clean(it.l18)))

  const isStock = (it) => {
    const cs  = clean(it.cs)
    const l18 = clean(it.l18)
    const l30 = clean(it.l30)
    // cs خالی حذف نمی‌شود — نماد متوقف/بدون طبقه‌بندی (مثل فولاد در برخی روزها) به «سایر» می‌رود
    if (!l18) return false
    if (cs && NOT_STOCK_CS.test(cs)) return false
    if (/[0-9۰-۹]/.test(l18)) return false                       // اوراق با پسوند عددی
    if (/حق تقدم|حق‌تقدم/.test(l30)) return false                // حق تقدم
    if (l18.endsWith('ح') && allL18.has(l18.slice(0, -1))) return false
    return true
  }

  // دامنه «رصد لحظه‌ای»: سهام + صندوق‌های مبتنی بر سهام (سهامی/اهرمی/بخشی)
  const watchItems = []
  // فقط برای نمودار توزیع محدوده قیمتی کارت «سهام»: حق تقدم هم اضافه می‌شود (در watchItems اصلی نیست)
  const rightsItems = []
  const byIndustry = new Map()
  // گروه‌های مصنوعی «نقشه بازار» — جدا از byIndustry نگه داشته می‌شوند تا روی
  // ورودی‌های money-flow/per-capita/snapshot که روی industries اصلی حساب می‌شوند اثر نگذارند
  const fundSymbols = []
  const rightSymbols = []
  const symOf = (it) => ({
    l18: clean(it.l18),
    l30: clean(it.l30),
    pl: num(it.pl),   plp: num(it.plp),   // آخرین معامله + درصد
    pc: num(it.pc),   pcp: num(it.pcp),   // قیمت پایانی + درصد
    tval: num(it.tval),                    // ارزش معاملات (ریال)
    tvol: num(it.tvol),
    mv: num(it.mv),                        // ارزش بازار (ریال)
    pe: num(it.pe),
    bi: num(it.Buy_I_Volume), si: num(it.Sell_I_Volume),   // حجم خرید/فروش حقیقی — برای badge خرید/فروش
    bci: num(it.Buy_CountI), sci: num(it.Sell_CountI),     // تعداد کد خریدار/فروشنده حقیقی — برای سرانه (anomaly-watch «کد کلان»)
    bn: num(it.Buy_N_Volume), sn: num(it.Sell_N_Volume),   // حجم خرید/فروش حقوقی
    board: marketFromIsin(it.isin),                        // 'bourse' | 'fara-bourse' | 'other' — برای فیلتر «بازار» نقشه بازار
  })
  for (const it of arr) {
    if (!isStock(it)) {
      const l18c = clean(it.l18)
      if (EQUITY_FUND_NAMES.has(l18c)) { watchItems.push(it); fundSymbols.push(symOf(it)) }
      // صندوق درآمد ثابت — فقط برای نقشه بازار، در «رصد لحظه‌ای» (watchItems) حساب نمی‌شود
      else if (FIXED_INCOME_FUND_NAMES.has(l18c)) fundSymbols.push(symOf(it))
      // حق تقدم: نمادی که با «ح» تمام می‌شود و نماد پایه‌اش هم در فهرست هست (مثل کگهرح ← کگهر)
      else if (l18c.endsWith('ح') && allL18.has(l18c.slice(0, -1))) rightSymbols.push(symOf(it))
      else if (/حق تقدم|حق‌تقدم/.test(clean(it.l30))) rightsItems.push(it)
      continue
    }
    watchItems.push(it)
    const key = clean(it.cs) ? (num(it.cs_id) ?? clean(it.cs)) : 'سایر'
    if (!byIndustry.has(key)) byIndustry.set(key, { id: num(it.cs_id), name: clean(it.cs) || 'سایر', symbols: [] })
    byIndustry.get(key).symbols.push(symOf(it))
  }

  // گروه صنعت‌مانند برای صندوق سرمایه‌گذاری قابل معامله / حق تقدم — فقط برای نقشه بازار
  function buildExtraGroup(id, name, kind, symbols) {
    symbols.sort((a, b) => (b.tval ?? 0) - (a.tval ?? 0))
    const tval = symbols.reduce((s, x) => s + (x.tval ?? 0), 0)
    const mv   = symbols.reduce((s, x) => s + (x.mv ?? 0), 0)
    const up   = symbols.filter(x => (x.pcp ?? 0) > 0).length
    const down = symbols.filter(x => (x.pcp ?? 0) < 0).length
    return { id, name, kind, count: symbols.length, tval, mv, up, down, symbols }
  }
  const extraGroups = []
  if (fundSymbols.length) extraGroups.push(buildExtraGroup(-10, 'صندوق سرمایه‌گذاری قابل معامله', 'fund', fundSymbols))
  if (rightSymbols.length) extraGroups.push(buildExtraGroup(-11, 'حق تقدم', 'right', rightSymbols))

  const industries = [...byIndustry.values()]
    .map(ind => {
      ind.symbols.sort((a, b) => (b.tval ?? 0) - (a.tval ?? 0))
      const tval = ind.symbols.reduce((s, x) => s + (x.tval ?? 0), 0)
      const mv   = ind.symbols.reduce((s, x) => s + (x.mv ?? 0), 0)
      const up   = ind.symbols.filter(x => (x.pcp ?? 0) > 0).length
      const down = ind.symbols.filter(x => (x.pcp ?? 0) < 0).length
      // خالص ورود پول حقیقی صنعت (ریال، + یعنی ورود) — برای فیلتر «ورود/خروج پول» (/vip/money-flow)
      const moneyIn = ind.symbols.reduce((s, x) => s + ((x.bi ?? 0) - (x.si ?? 0)) * (x.pc ?? 0), 0)
      return { ...ind, count: ind.symbols.length, tval, mv, up, down, moneyIn }
    })
    .sort((a, b) => b.tval - a.tval)

  console.log(`\n═══ ${industries.length} صنعت ═══`)
  industries.forEach((ind, i) => {
    console.log(`${String(i + 1).padStart(2)}) [${ind.id ?? '—'}] ${ind.name} — ${ind.count} نماد — ${(ind.tval / 1e13).toFixed(1)} همت`)
  })

  if (PROBE) return

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[stocks-industries] SUPABASE_URL/KEY تنظیم نشده — خروجی Supabase رد شد')
    return
  }
  const { createClient } = require('@supabase/supabase-js')
  // Node < 22 بدون WebSocket بومی — پکیج ws را صریح پاس می‌دهیم (مثل sync-bourse.js)
  let wsTransport
  try { wsTransport = require('ws') } catch { /* Node 22+ نیازی ندارد */ }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY,
    wsTransport ? { realtime: { transport: wsTransport } } : {})

  // فهرست نمادهای صندوق کالایی (طلا/نقره/زعفران) از جدول assets — هم برای گروه «صندوق کالایی» نقشه بازار
  // و هم برای دسته‌بندی cat جدا در market_watch و نمودار «تفکیک ارزش معاملات» زیر استفاده می‌شود
  let commodityNames = new Set()
  const CAT_MAP = { 'طلا': 'gold', 'نقره': 'silver', 'زعفران': 'saffron' }
  const commoditySets = { gold: new Set(), silver: new Set(), saffron: new Set() }

  // ── فیلترهای VIP (همان منطق app/vip/filters/page.tsx + lib/vipFiltersShared.tsx) — برای هشدار «نماد پورتفو وارد فیلتر شد» ──
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
    'biggest-real-buy': 'بزرگترین خریدهای حقیقی', 'biggest-real-sell': 'بزرگترین فروش‌های حقیقی',
    'near-buy-queue': 'در آستانه صف خرید', 'near-sell-queue': 'در آستانه صف فروش',
    'pc-1-5': 'افزایش سرانه خرید روزانه به ۵ روزه', 'pc-3-10': 'افزایش سرانه خرید ۳ به ۱۰ روزه',
    'pc-5-20': 'افزایش سرانه خرید ۵ به ۲۰ روزه',
  }
  function computeVipFilters(items, volMap, floatMap) {
    const hasVol = volMap.size > 0
    const top = (rows, by, n = 30) => [...rows].sort((a, b) => by(b) - by(a)).slice(0, n)
    const hotVol = (r, k) => (hasVol && r.ratioM != null ? r.ratioM >= k : r.tval >= 1e10)

    const ms = []
    for (const it of items) {
      const sym = clean(it.l18)
      const pl = num(it.pl) ?? 0, pc = num(it.pc) ?? 0
      const tvol = num(it.tvol) ?? 0, tval = num(it.tval) ?? 0
      if (!sym || !pl || !pc || tvol <= 0) continue
      const bI = num(it.Buy_I_Volume) ?? 0, sI = num(it.Sell_I_Volume) ?? 0
      const bN = num(it.Buy_N_Volume) ?? 0, sN = num(it.Sell_N_Volume) ?? 0
      const bCI = num(it.Buy_CountI) ?? 0, sCI = num(it.Sell_CountI) ?? 0
      const perCapB = bCI > 0 ? (bI * pc) / bCI : null
      const perCapS = sCI > 0 ? (sI * pc) / sCI : null
      const bp = (perCapB != null && perCapS != null && perCapS > 0) ? perCapB / perCapS : null
      let dVal = 0, oVal = 0
      for (let i = 1; i <= 5; i++) {
        const qd = num(it['qd' + i]) ?? 0, pd = num(it['pd' + i]) ?? 0
        const qo = num(it['qo' + i]) ?? 0, po = num(it['po' + i]) ?? 0
        if (qd > 0 && pd > 0) dVal += qd * pd
        if (qo > 0 && po > 0) oVal += qo * po
      }
      const pd1 = num(it.pd1), po1 = num(it.po1)
      const spreadPct = (pd1 && po1 && pd1 > 0 && po1 > 0) ? ((po1 - pd1) / pd1) * 100 : null
      const tmax = num(it.tmax), tmin = num(it.tmin)
      const qd1 = num(it.qd1) ?? 0, qo1 = num(it.qo1) ?? 0
      const buyQueue = !!(tmax && pd1 != null && pd1 >= tmax && qd1 > 0)
      const sellQueue = !!(tmin && po1 != null && po1 <= tmin && qo1 > 0)
      const v = volMap.get(sym)
      const fl = floatMap.get(sym)
      const floatShares = fl?.ff != null && fl?.z != null ? fl.z * (fl.ff / 100) : null
      ms.push({
        sym, pl, plp: num(it.plp) ?? 0, pc, pcp: num(it.pcp) ?? 0, tvol, tval,
        bp, perCapB, perCapS,
        buyIVal: bI * pc, sellIVal: sI * pc,
        buyNPct: tvol > 0 ? (bN / tvol) * 100 : null,
        sellNPct: tvol > 0 ? (sN / tvol) * 100 : null,
        dVal, oVal, spreadPct,
        ratioW: v?.w ? tvol / v.w : null,
        ratioM: v?.m ? tvol / v.m : null,
        buyQueue, sellQueue, tmax, tmin,
        mv: num(it.mv) ?? 0, floatShares,
        buyCountI: bCI, sellCountI: sCI,
      })
    }

    const withPower = ms.filter(r => r.bp != null && r.bp > 0 && (r.buyCountI > 0 || r.sellCountI > 0))
    const withFloat = ms.filter(r => r.floatShares != null && r.floatShares > 0)
    const withCounts = ms.filter(r => r.buyCountI > 0 || r.sellCountI > 0)
    const nearBuy = ms.filter(r => !r.buyQueue && r.tmax != null && r.pl >= 0.994 * r.tmax)
    const nearSell = ms.filter(r => !r.sellQueue && r.tmin != null && r.pl <= 1.006 * r.tmin)
    const lists = {
      'smart-in': ms.filter(r => r.plp > 0 && (r.bp ?? 0) >= 2 && hotVol(r, 1.5)),
      'smart-out': ms.filter(r => r.plp < 0 && r.bp != null && r.bp > 0 && r.bp <= 0.5 && hotVol(r, 1.5)),
      'c2c-to-legal': ms.filter(r => (r.buyNPct ?? 0) >= 50 && (100 - (r.sellNPct ?? 0)) >= 50 && hotVol(r, 1.25)),
      'c2c-to-real': ms.filter(r => (r.sellNPct ?? 0) >= 50 && (100 - (r.buyNPct ?? 0)) >= 50 && (r.bp ?? 0) >= 1 && r.pl >= r.pc && r.plp > 0 && hotVol(r, 1.25)),
      'heavy-buy': ms.filter(r => r.dVal >= 3e10 && r.dVal >= 2 * r.oVal && !r.buyQueue),
      'heavy-sell': ms.filter(r => r.oVal >= 3e10 && r.oVal >= 2 * r.dVal && !r.sellQueue),
      'susp-week': hasVol ? ms.filter(r => (r.ratioW ?? 0) >= 3) : [],
      'susp-month': hasVol ? ms.filter(r => (r.ratioM ?? 0) >= 2) : [],
      'susp-heavy': hasVol ? ms.filter(r => (r.ratioM ?? 0) >= 5) : [],
      'legal-buy': top(ms.filter(r => r.tval >= 1e9 && (r.buyNPct ?? 0) > 0), r => r.buyNPct ?? 0, 20),
      'tick-up': ms.filter(r => r.pl > r.pc && r.plp > 0 && r.pcp > 0 && (r.bp ?? 0) > 1),
      'tick-down': ms.filter(r => r.pl < r.pc && r.plp < 0 && r.pcp < 0 && r.bp != null && r.bp > 0 && r.bp < 1),
      'swing-reversal': ms.filter(r => r.pcp < -3 && r.plp > -3),
      'spread': top(ms.filter(r => r.tval >= 5e8 && r.spreadPct != null && r.spreadPct > 0), r => r.spreadPct ?? 0, 20),
      'golden': ms.filter(r => r.plp > 0 && (r.bp ?? 0) >= 2 && (r.perCapB ?? 0) >= 3e8 && (r.sellNPct ?? 0) >= 30 && hotVol(r, 1.5)),
      'most-buy-power': top(withPower, r => r.bp ?? 0, 30),
      'most-sell-power': top(withPower, r => (r.bp && r.bp > 0 ? 1 / r.bp : 0), 30),
      'vol-float': top(withFloat, r => r.tvol / r.floatShares, 30),
      'val-mv': top(ms.filter(r => r.mv > 0), r => r.tval / r.mv, 30),
      'val-float': top(withFloat, r => r.tval / (r.floatShares * r.pc), 30),
      'most-buyers': top(withCounts, r => r.buyCountI, 30),
      'most-sellers': top(withCounts, r => r.sellCountI, 30),
      'biggest-real-buy': top(ms.filter(r => r.buyCountI > 0), r => r.buyIVal, 30),
      'biggest-real-sell': top(ms.filter(r => r.sellCountI > 0), r => r.sellIVal, 30),
      'near-buy-queue': top(nearBuy, r => -(((r.tmax - r.pl) / r.tmax) * 100), 30),
      'near-sell-queue': top(nearSell, r => -(((r.pl - r.tmin) / r.tmin) * 100), 30),
    }

    const bySymbol = new Map()
    for (const [id, rows] of Object.entries(lists)) {
      for (const r of rows) {
        if (!bySymbol.has(r.sym)) bySymbol.set(r.sym, [])
        bySymbol.get(r.sym).push(id)
      }
    }
    return bySymbol
  }

  // ── افزایش سرانه خریدار (همان منطق app/vip/useful-filters/page.tsx) — تاریخچه ۳۰ روزه stock_per_capita_daily ──
  async function computePerCapFilters(sb) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const raw = []
    for (let off = 0; off < 50_000; off += 1000) {
      const { data, error } = await sb.from('stock_per_capita_daily')
        .select('symbol, trade_date, per_capita_buy')
        .gte('trade_date', cutoff)
        .order('trade_date', { ascending: false }).order('symbol', { ascending: true })
        .range(off, off + 999)
      if (error || !data?.length) break
      raw.push(...data)
      if (data.length < 1000) break
    }
    const bySym = new Map()
    for (const r of raw) {
      if (r.per_capita_buy == null) continue
      if (!bySym.has(r.symbol)) bySym.set(r.symbol, [])
      bySym.get(r.symbol).push(r.per_capita_buy) // ترتیب نزولی تاریخ حفظ می‌شود
    }
    const avgN = (arr, n) => { const s = arr.slice(0, n); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null }
    const rows = []
    for (const [sym, arr] of bySym) {
      if (!arr.length) continue
      rows.push({ sym, today: arr[0], avg3: avgN(arr, 3), avg5: avgN(arr, 5), avg10: avgN(arr, 10), avg20: avgN(arr, 20) })
    }
    const top30ByDiff = (shortKey, longKey) => rows
      .map(r => (r[shortKey] != null && r[longKey] != null && r[longKey] > 0) ? { sym: r.sym, diff: (r[shortKey] - r[longKey]) / r[longKey] } : null)
      .filter(x => x && x.diff > 0)
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 30)

    const bySymbol = new Map()
    const lists = {
      'pc-1-5': top30ByDiff('today', 'avg5'),
      'pc-3-10': top30ByDiff('avg3', 'avg10'),
      'pc-5-20': top30ByDiff('avg5', 'avg20'),
    }
    for (const [id, list] of Object.entries(lists)) {
      for (const x of list) {
        if (!bySymbol.has(x.sym)) bySymbol.set(x.sym, [])
        bySymbol.get(x.sym).push(id)
      }
    }
    return bySymbol
  }

  // ── «رصد لحظه‌ای پورتفو»: فقط نمادهای داخل تراکنش‌های پورتفوی کاربران تاریخچه ۵دقیقه‌ای می‌گیرند ──
  const { data: txRows, error: txErr } = await sb.from('portfolio_transactions').select('symbol, name, asset_type')
  if (txErr) console.error(`[stocks-industries] portfolio_transactions: ${txErr.message}`)
  // صندوق‌ها گاهی با کد ISIN وارد شده‌اند (symbol) نه با تیکر بورسی؛ name همیشه همان تیکر واقعی است
  const watchSymbols = new Set((txRows ?? []).map(r => clean(r.asset_type === 'fund' ? (r.name || r.symbol) : r.symbol)))
  const symbolWatchRows = []
  const BIG_MONEY_PORTFOLIO_RIAL = 2_000_000_000 // آستانه «پول درشت» رصد پورتفو: ۲۰۰ میلیون تومان سرانه
  function buildSymbolWatchRow(it, cat) {
    const pc = num(it.pc) ?? 0
    const bIVol = num(it.Buy_I_Volume) ?? 0, sIVol = num(it.Sell_I_Volume) ?? 0
    const bICount = num(it.Buy_CountI) ?? 0, sICount = num(it.Sell_CountI) ?? 0
    const bNVol = num(it.Buy_N_Volume) ?? 0, sNVol = num(it.Sell_N_Volume) ?? 0
    const bNCount = num(it.Buy_CountN) ?? 0, sNCount = num(it.Sell_CountN) ?? 0
    const buyVal = bIVol * pc, sellVal = sIVol * pc
    const buyValN = bNVol * pc, sellValN = sNVol * pc
    const buyPcI = bICount ? Math.round(buyVal / bICount) : 0
    const sellPcI = sICount ? Math.round(sellVal / sICount) : 0
    // صف خرید/فروش: بهترین سفارش روی سقف/کف دامنه قیمت (همان منطق computeMarketWatch)
    const pd1 = num(it.pd1), qd1 = num(it.qd1), tmax = num(it.tmax)
    const po1 = num(it.po1), qo1 = num(it.qo1), tmin = num(it.tmin)
    const buyQueueVol = (tmax && pd1 >= tmax && qd1 > 0) ? qd1 : 0
    const sellQueueVol = (tmin && po1 <= tmin && qo1 > 0) ? qo1 : 0
    return {
      symbol: clean(it.l18), cat,
      tval: num(it.tval) ?? 0,
      buy_pc_i: buyPcI, sell_pc_i: sellPcI,
      buy_pc_n: bNCount ? Math.round(buyValN / bNCount) : 0,
      sell_pc_n: sNCount ? Math.round(sellValN / sNCount) : 0,
      money_in: Math.round(buyVal - sellVal),
      big_buy: (bICount && buyPcI >= BIG_MONEY_PORTFOLIO_RIAL) ? Math.round(buyVal) : 0,
      big_sell: (sICount && sellPcI >= BIG_MONEY_PORTFOLIO_RIAL) ? Math.round(sellVal) : 0,
      buy_queue_vol: buyQueueVol, sell_queue_vol: sellQueueVol,
      last_price: num(it.pl) ?? 0, last_price_pct: num(it.plp) ?? 0,
    }
  }

  const { data: assets, error: aErr } = await sb.from('assets').select('name, category')
  if (aErr) {
    console.error(`[stocks-industries] assets: ${aErr.message}`)
  } else {
    for (const a of assets) {
      const c = CAT_MAP[a.category]
      if (c) { commoditySets[c].add(clean(a.name)); commodityNames.add(clean(a.name)) }
    }
  }
  if (commodityNames.size) {
    const commoditySymbols = arr.filter(it => commodityNames.has(clean(it.l18))).map(symOf)
    if (commoditySymbols.length) extraGroups.push(buildExtraGroup(-12, 'صندوق کالایی', 'commodity', commoditySymbols))
  }

  // ── خروجی‌های مخصوص سهام — فقط تا ۱۲:۳۵ (بعدش قیمت سهام ثابت است) ──
  if (stocksOpen) {
    const out = {
      updated: new Date().toISOString(),
      industries,
      extraGroups, // صندوق سرمایه‌گذاری قابل معامله + حق تقدم — فقط مصرف نقشه بازار
    }

    // ارزش دلاری (mv_usd/usdRate) را sync-usd-market-value.js جدا و روزی یک‌بار می‌نویسد؛
    // این‌جا فقط قیمت/ارزش ریالی بازسازی می‌شود — بدون merge، هر تیک ۵ دقیقه‌ای آن مقادیر را پاک می‌کرد
    try {
      const { data: prevRow } = await sb.from('stock_industries').select('data').eq('id', 1).single()
      const prevInd = prevRow?.data?.industries
      if (prevRow?.data?.usdRate != null && Array.isArray(prevInd)) {
        const prevByL18 = new Map()
        for (const ind of prevInd) for (const s of ind.symbols) if (s.mv_usd != null) prevByL18.set(s.l18, s.mv_usd)
        for (const ind of industries) {
          let mvUsdSum = 0
          for (const s of ind.symbols) {
            const carried = prevByL18.get(s.l18)
            if (carried != null) { s.mv_usd = carried; mvUsdSum += carried }
          }
          if (mvUsdSum > 0) ind.mv_usd = mvUsdSum
        }
        out.usdRate = prevRow.data.usdRate
        out.usdUpdated = prevRow.data.usdUpdated
      }
    } catch (e) {
      console.warn('[stocks-industries] carry-forward mv_usd ناموفق:', e.message)
    }

    const file = path.join(__dirname, 'stocks-industries.json')
    fs.writeFileSync(file, JSON.stringify(out))
    console.log(`\n✅ ذخیره شد: ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`)
    const { error } = await sb.from('stock_industries').upsert({ id: 1, data: out, updated: out.updated })
    if (error) throw new Error(`Supabase upsert: ${error.message}`)
    console.log('✅ Supabase (stock_industries) بروز شد')

    // ── سرانه خرید حقیقی امروز هر نماد — برای فیلترهای «افزایش سرانه خریدار» (/vip/filters) ──
    const today = tehranDateStr()

    // ── آرشیو روزانه اسنپ‌شات کل بازار — یک ردیف به‌ازای هر روز، آخرین ران آن روز جایگزین می‌شود ──
    const { error: histErr } = await sb.from('stock_industries_history')
      .upsert({ trade_date: today, data: out, updated: out.updated }, { onConflict: 'trade_date' })
    if (histErr) console.error(`[stocks-industries] stock_industries_history: ${histErr.message}`)
    else console.log('✅ stock_industries_history بروز شد')
    const perCapRows = []
    for (const it of watchItems) {
      const sym = clean(it.l18)
      const pc = num(it.pc)
      const bI = num(it.Buy_I_Volume), bCI = num(it.Buy_CountI)
      const sI = num(it.Sell_I_Volume), sCI = num(it.Sell_CountI)
      if (!sym || !pc) continue
      const perCapBuy = (bI && bCI > 0) ? Math.round((bI * pc) / bCI / 10) : null   // ریال → تومان
      const perCapSell = (sI && sCI > 0) ? Math.round((sI * pc) / sCI / 10) : null  // برای «قدرت خرید» = سرانه خرید ÷ سرانه فروش
      if (perCapBuy == null && perCapSell == null) continue
      perCapRows.push({ symbol: sym, trade_date: today, per_capita_buy: perCapBuy, per_capita_sell: perCapSell, updated: out.updated })
    }
    if (perCapRows.length > 0) {
      const { error: pcErr } = await sb.from('stock_per_capita_daily').upsert(perCapRows, { onConflict: 'symbol,trade_date' })
      if (pcErr) console.error(`[stocks-industries] stock_per_capita_daily: ${pcErr.message}`)
      else console.log(`✅ stock_per_capita_daily بروز شد (${perCapRows.length} نماد)`)
    }

    // ── اسنپ‌شات روزانه کارت‌های صفحه نماد (قیمت/حجم/ارزش‌بازار/P.E) — برای نمودار تاریخچه کارت‌ها ──
    const { gregorianToShamsi } = require('./candles-lib')
    const todayShamsi = gregorianToShamsi(today)
    const snapRows = []
    for (const ind of industries) {
      for (const s of ind.symbols) {
        if (!s.l18) continue
        snapRows.push({
          symbol: s.l18, trade_date: today, trade_date_shamsi: todayShamsi,
          pc: s.pc, pcp: s.pcp, pl: s.pl, plp: s.plp,
          tval: s.tval, tvol: s.tvol, mv: s.mv, mv_usd: s.mv_usd ?? null, pe: s.pe,
          updated: out.updated,
        })
      }
    }
    if (snapRows.length > 0) {
      const { error: snapErr } = await sb.from('stock_snapshot_daily').upsert(snapRows, { onConflict: 'symbol,trade_date' })
      if (snapErr) console.error(`[stocks-industries] stock_snapshot_daily: ${snapErr.message}`)
      else console.log(`✅ stock_snapshot_daily بروز شد (${snapRows.length} نماد)`)
    }

    // ── خالص ورود پول حقیقی هر صنعت امروز — برای فیلترهای «ورود/خروج پول» (/vip/money-flow) ──
    const flowRows = industries.map(ind => ({
      industry_key: String(ind.id ?? ind.name),
      industry_name: ind.name,
      trade_date: today,
      money_in: Math.round(ind.moneyIn / 10), // ریال → تومان
      updated: out.updated,
    }))
    if (flowRows.length > 0) {
      const { error: flowErr } = await sb.from('industry_moneyflow_daily').upsert(flowRows, { onConflict: 'industry_key,trade_date' })
      if (flowErr) console.error(`[stocks-industries] industry_moneyflow_daily: ${flowErr.message}`)
      else console.log(`✅ industry_moneyflow_daily بروز شد (${flowRows.length} صنعت)`)
    }

    // ── خالص ورود پول حقیقی هر نماد امروز — برای «بیشترین ورود پول حقیقی» (/vip/money-flow) ──
    const symFlowRows = []
    for (const it of watchItems) {
      const sym = clean(it.l18)
      const pc = num(it.pc), bI = num(it.Buy_I_Volume), sI = num(it.Sell_I_Volume)
      if (!sym || !pc) continue
      const moneyInToman = ((bI ?? 0) - (sI ?? 0)) * pc / 10 // ریال → تومان
      symFlowRows.push({ symbol: sym, trade_date: today, money_in: Math.round(moneyInToman), updated: out.updated })
    }
    if (symFlowRows.length > 0) {
      const { error: symFlowErr } = await sb.from('stock_moneyflow_daily').upsert(symFlowRows, { onConflict: 'symbol,trade_date' })
      if (symFlowErr) console.error(`[stocks-industries] stock_moneyflow_daily: ${symFlowErr.message}`)
      else console.log(`✅ stock_moneyflow_daily بروز شد (${symFlowRows.length} نماد)`)
    }

    // ── خالص ورود پول حقوقی هر نماد امروز — برای «بیشترین ورود/خروج حقوقی» (/vip/money-flow) ──
    const symLegalRows = []
    for (const it of watchItems) {
      const sym = clean(it.l18)
      const pc = num(it.pc), bN = num(it.Buy_N_Volume), sN = num(it.Sell_N_Volume)
      if (!sym || !pc) continue
      const legalInToman = ((bN ?? 0) - (sN ?? 0)) * pc / 10 // ریال → تومان
      symLegalRows.push({ symbol: sym, trade_date: today, money_in: Math.round(legalInToman), updated: out.updated })
    }
    if (symLegalRows.length > 0) {
      const { error: symLegalErr } = await sb.from('stock_legalflow_daily').upsert(symLegalRows, { onConflict: 'symbol,trade_date' })
      if (symLegalErr) console.error(`[stocks-industries] stock_legalflow_daily: ${symLegalErr.message}`)
      else console.log(`✅ stock_legalflow_daily بروز شد (${symLegalRows.length} نماد)`)
    }

    // ── «رصد لحظه‌ای پورتفو»: تاریخچه ۵دقیقه‌ای فقط برای نمادهای پورتفوی کاربران ──
    if (watchSymbols.size > 0) {
      for (const it of watchItems) {
        const sym = clean(it.l18)
        if (!watchSymbols.has(sym)) continue
        const cat = EQUITY_FUND_NAMES.has(sym) ? 'bourse-funds' : 'stocks'
        symbolWatchRows.push(buildSymbolWatchRow(it, cat))
      }
    }

    // ── فیلترهای VIP: عضویت فعلی نمادهای پورتفو در ۲۷ فیلتر (filters + useful-filters + queue-filters) ──
    if (watchSymbols.size > 0) {
      let volMap = new Map()
      try {
        const { data: volRows } = await sb.from('stock_vol_avgs').select('symbol, avg_vol_w, avg_vol_m')
        for (const r of volRows ?? []) volMap.set(clean(r.symbol), { w: num(r.avg_vol_w), m: num(r.avg_vol_m) })
      } catch (e) { console.warn('[stocks-industries] stock_vol_avgs در دسترس نیست:', e.message) }

      let floatMap = new Map()
      try {
        const { data: floatRows } = await sb.from('stock_float').select('symbol, free_float_pct, shares_outstanding')
        for (const r of floatRows ?? []) floatMap.set(clean(r.symbol), { ff: num(r.free_float_pct), z: num(r.shares_outstanding) })
      } catch (e) { console.warn('[stocks-industries] stock_float در دسترس نیست:', e.message) }

      const filterMap = computeVipFilters(watchItems, volMap, floatMap)
      const perCapMap = await computePerCapFilters(sb)
      for (const [sym, ids] of perCapMap) {
        if (!filterMap.has(sym)) filterMap.set(sym, [])
        filterMap.get(sym).push(...ids)
      }

      const filterRows = [...watchSymbols].map(sym => ({
        symbol: sym, filters: filterMap.get(sym) || [], updated_at: new Date().toISOString(),
      }))
      const { error: filterErr } = await sb.from('symbol_filter_membership').upsert(filterRows, { onConflict: 'symbol' })
      if (filterErr) console.error(`[stocks-industries] symbol_filter_membership: ${filterErr.message}`)
      else console.log(`✅ symbol_filter_membership بروز شد (${filterRows.length} نماد پورتفو)`)
    }
  }

  // ── رصد لحظه‌ای بازار: هر دسته یک اسنپ‌شات ۵ دقیقه‌ای در market_watch ──
  const cats = []
  if (stocksOpen) {
    // نمودار توزیع محدوده قیمتی کارت سهام: سهام + ص.سهامی (watchItems) + حق تقدم
    cats.push(['stocks', watchItems, watchItems.concat(rightsItems)])
    cats.push(['bourse-funds', arr.filter(it => EQUITY_FUND_NAMES.has(clean(it.l18)))])
  }

  // صندوق‌های کالایی (طلا/نقره/زعفران) به‌عنوان cat جدا فقط در بازار ۱۲:۳۰–۱۸:۰۰ ثبت می‌شود
  if (fundsOpen) {
    for (const [cat, set] of Object.entries(commoditySets)) {
      const items = arr.filter(it => set.has(clean(it.l18)))
      cats.push([cat, items])
      if (watchSymbols.size > 0) {
        for (const it of items) {
          const sym = clean(it.l18)
          if (watchSymbols.has(sym)) symbolWatchRows.push(buildSymbolWatchRow(it, cat))
        }
      }
    }
  }

  if (symbolWatchRows.length > 0) {
    const { error: watchErr } = await sb.from('stock_watch_5m').insert(symbolWatchRows)
    if (watchErr) console.error(`[stocks-industries] stock_watch_5m: ${watchErr.message}`)
    else console.log(`✅ stock_watch_5m ثبت شد (${symbolWatchRows.length} نماد پورتفو)`)
  }

  // تفکیک ارزش معاملات بورس/فرابورس/آپشن/صندوق سهامی/درآمدثابت/کالایی — برای نمودار دایره‌ای «تفکیک ارزش معاملات» رصد لحظه‌ای
  function computeSegments() {
    const seg = { bourse: 0, fara_bourse: 0, option: 0, fund_equity: 0, fund_fixed_income: 0, fund_commodity: 0 }
    for (const it of arr) {
      const tval = num(it.tval) ?? 0
      if (!tval) continue
      const l18 = clean(it.l18)
      const cs = clean(it.cs)
      if (EQUITY_FUND_NAMES.has(l18)) { seg.fund_equity += tval; continue }
      if (FIXED_INCOME_FUND_NAMES.has(l18)) { seg.fund_fixed_income += tval; continue }
      if (commodityNames.has(l18)) { seg.fund_commodity += tval; continue }
      if (cs && OPTION_CS.test(cs)) { seg.option += tval; continue }
      if (isStock(it)) {
        const m = marketFromIsin(it.isin)
        if (m === 'bourse') seg.bourse += tval
        else if (m === 'fara-bourse') seg.fara_bourse += tval
      }
    }
    for (const k of Object.keys(seg)) seg[k] = Math.round(seg[k])
    return seg
  }
  const segments = stocksOpen ? computeSegments() : null

  for (const [cat, items, distItems] of cats) {
    if (items.length === 0) { console.log(`[stocks-industries] ${cat}: نمادی پیدا نشد — رد شد`); continue }
    const watch = computeMarketWatch(items, distItems)
    if (cat === 'stocks' && segments) watch.tval_by_segment = segments
    const { error: mwErr } = await sb.from('market_watch').insert({ cat, d: watch })
    if (mwErr) console.error(`[stocks-industries] market_watch(${cat}): ${mwErr.message}`)
    else console.log(`✅ market_watch(${cat}) ثبت شد (${watch.t} — ${watch.count} نماد، هیجان ${watch.excitement})`)
  }
}

// کد حقیقی با سرانه خرید/فروش بالای این آستانه «پول درشت» تلقی می‌شود (۵ میلیارد ریال = ۵۰۰ میلیون تومان)
const BIG_MONEY_PC_RIAL = 5_000_000_000

// باکت‌بندی درصد آخرین معامله (plp) برای نمودار «محدوده قیمتی آخرین معاملات» — ۱۲ باکت
const PLP_BUCKETS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5] // مرزهای باکت؛ n مرز → n+1 باکت
function plpDist(items) {
  const dist = new Array(PLP_BUCKETS.length + 1).fill(0)
  for (const it of items) {
    const plp = num(it.plp) ?? 0
    let i = 0
    while (i < PLP_BUCKETS.length && plp >= PLP_BUCKETS[i]) i++
    dist[i]++
  }
  return dist
}

// سنجه‌های تجمیعی کل بازار سهام برای نمودارهای «رصد لحظه‌ای» — همه ارزش‌ها به ریال
// distItems: مجموعه نمادهای مخصوص نمودار توزیع محدوده قیمتی (اگر نده، همان items استفاده می‌شود)
function computeMarketWatch(items, distItems) {
  let mov_pos = 0, mov_neg = 0   // تحرک: درصد «آخرین» مثبت/منفی
  let sym_pos = 0, sym_neg = 0   // نمادها: درصد «پایانی» مثبت/منفی
  let buyq = 0, sellq = 0        // صف خرید/فروش: بهترین سفارش روی سقف/کف دامنه
  let tval_total = 0, sPlp = 0, sPcp = 0, n = 0
  let biVal = 0, siVal = 0, biC = 0, siC = 0   // حقیقی
  let bnVal = 0, snVal = 0, bnC = 0, snC = 0   // حقوقی
  let money_in = 0
  let bigBuyVal = 0, bigSellVal = 0   // پول درشت: فقط کدهای حقیقی با سرانه بالای آستانه
  let ord_demand = 0, ord_supply = 0     // ارزش کل سفارشات
  let ordx_demand = 0, ordx_supply = 0   // بدون سطح‌های داخل صف

  for (const it of items) {
    const plp = num(it.plp) ?? 0, pcp = num(it.pcp) ?? 0
    const pc  = num(it.pc) ?? 0
    if (plp > 0) mov_pos++; else if (plp < 0) mov_neg++
    if (pcp > 0) sym_pos++; else if (pcp < 0) sym_neg++
    tval_total += num(it.tval) ?? 0
    sPlp += plp; sPcp += pcp; n++

    const tmax = num(it.tmax), tmin = num(it.tmin)
    if (tmax && (num(it.pd1) ?? 0) >= tmax && (num(it.qd1) ?? 0) > 0) buyq++
    if (tmin && (num(it.po1) ?? Infinity) <= tmin && (num(it.qo1) ?? 0) > 0) sellq++

    biVal += (num(it.Buy_I_Volume) ?? 0) * pc;  biC += num(it.Buy_CountI) ?? 0
    siVal += (num(it.Sell_I_Volume) ?? 0) * pc; siC += num(it.Sell_CountI) ?? 0
    bnVal += (num(it.Buy_N_Volume) ?? 0) * pc;  bnC += num(it.Buy_CountN) ?? 0
    snVal += (num(it.Sell_N_Volume) ?? 0) * pc; snC += num(it.Sell_CountN) ?? 0
    money_in += ((num(it.Buy_I_Volume) ?? 0) - (num(it.Sell_I_Volume) ?? 0)) * pc

    // پول درشت: سرانه خرید/فروش حقیقی این نماد را جدا از میانگین بازار می‌سنجیم
    const symBuyCI = num(it.Buy_CountI) ?? 0, symSellCI = num(it.Sell_CountI) ?? 0
    const symBuyVal = (num(it.Buy_I_Volume) ?? 0) * pc, symSellVal = (num(it.Sell_I_Volume) ?? 0) * pc
    if (symBuyCI && symBuyVal / symBuyCI >= BIG_MONEY_PC_RIAL) bigBuyVal += symBuyVal
    if (symSellCI && symSellVal / symSellCI >= BIG_MONEY_PC_RIAL) bigSellVal += symSellVal

    for (let i = 1; i <= 5; i++) {
      const qd = num(it['qd' + i]) ?? 0, pd = num(it['pd' + i]) ?? 0
      const qo = num(it['qo' + i]) ?? 0, po = num(it['po' + i]) ?? 0
      if (qd > 0 && pd > 0) { ord_demand += qd * pd; if (!(tmax && pd >= tmax)) ordx_demand += qd * pd }
      if (qo > 0 && po > 0) { ord_supply += qo * po; if (!(tmin && po <= tmin)) ordx_supply += qo * po }
    }
  }

  const tehran = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  const t = `${String(tehran.getHours()).padStart(2, '0')}:${String(tehran.getMinutes()).padStart(2, '0')}`
  const r = (v) => Math.round(v)
  return {
    t, count: n,
    mov_pos, mov_neg, excitement: mov_pos - mov_neg,
    sym_pos, sym_neg,
    buyq, sellq,
    tval_total: r(tval_total),
    avg_plp: n ? +(sPlp / n).toFixed(3) : 0,
    avg_pcp: n ? +(sPcp / n).toFixed(3) : 0,
    ind_buy_pc: biC ? r(biVal / biC) : 0, ind_sell_pc: siC ? r(siVal / siC) : 0,
    leg_buy_pc: bnC ? r(bnVal / bnC) : 0, leg_sell_pc: snC ? r(snVal / snC) : 0,
    ord_demand: r(ord_demand), ord_supply: r(ord_supply),
    ordx_demand: r(ordx_demand), ordx_supply: r(ordx_supply),
    money_in: r(money_in),
    plp_dist: plpDist(distItems ?? items),
    big_buy: r(bigBuyVal), big_sell: r(bigSellVal),
  }
}

main().catch(e => { console.error(e); process.exit(1) })
