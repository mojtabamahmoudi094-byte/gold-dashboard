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
 * cron: هر ۵ دقیقه، شنبه–چهارشنبه — سهام ۹:۰۰–۱۲:۳۰، صندوق‌های کالایی ۱۲:۳۰–۱۸:۰۰ (گارد ساعت داخل خود اسکریپت است، --force برای رد کردن)
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

// ساعت بازار تهران — سهام/صندوق‌های بورسی ۹:۰۰–۱۲:۳۰، صندوق‌های کالایی (طلا/نقره/زعفران) ۱۲:۳۰–۱۸:۰۰
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
const FUNDS_OPEN   = 12 * 60 + 30
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
const EQUITY_FUND_NAMES = new Set(
  ['سهامی', 'اهرمی', 'بخشی'].flatMap(cat => BOURSE_SYMBOLS[cat] || []).map(clean)
)

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
  for (const it of arr) {
    if (!isStock(it)) {
      if (EQUITY_FUND_NAMES.has(clean(it.l18))) watchItems.push(it)
      else if (/حق تقدم|حق‌تقدم/.test(clean(it.l30))) rightsItems.push(it)
      continue
    }
    watchItems.push(it)
    const key = clean(it.cs) ? (num(it.cs_id) ?? clean(it.cs)) : 'سایر'
    if (!byIndustry.has(key)) byIndustry.set(key, { id: num(it.cs_id), name: clean(it.cs) || 'سایر', symbols: [] })
    byIndustry.get(key).symbols.push({
      l18: clean(it.l18),
      l30: clean(it.l30),
      pl: num(it.pl),   plp: num(it.plp),   // آخرین معامله + درصد
      pc: num(it.pc),   pcp: num(it.pcp),   // قیمت پایانی + درصد
      tval: num(it.tval),                    // ارزش معاملات (ریال)
      tvol: num(it.tvol),
      mv: num(it.mv),                        // ارزش بازار (ریال)
      pe: num(it.pe),
      bi: num(it.Buy_I_Volume), si: num(it.Sell_I_Volume),   // حجم خرید/فروش حقیقی — برای badge خرید/فروش
      bn: num(it.Buy_N_Volume), sn: num(it.Sell_N_Volume),   // حجم خرید/فروش حقوقی
    })
  }

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

  // ── خروجی‌های مخصوص سهام — فقط تا ۱۲:۳۵ (بعدش قیمت سهام ثابت است) ──
  if (stocksOpen) {
    const out = {
      updated: new Date().toISOString(),
      industries,
    }
    const file = path.join(__dirname, 'stocks-industries.json')
    fs.writeFileSync(file, JSON.stringify(out))
    console.log(`\n✅ ذخیره شد: ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`)
    const { error } = await sb.from('stock_industries').upsert({ id: 1, data: out, updated: out.updated })
    if (error) throw new Error(`Supabase upsert: ${error.message}`)
    console.log('✅ Supabase (stock_industries) بروز شد')

    // ── سرانه خرید حقیقی امروز هر نماد — برای فیلترهای «افزایش سرانه خریدار» (/vip/filters) ──
    const today = tehranDateStr()
    const perCapRows = []
    for (const it of watchItems) {
      const sym = clean(it.l18)
      const pc = num(it.pc), bI = num(it.Buy_I_Volume), bCI = num(it.Buy_CountI)
      if (!sym || !pc || !bI || !bCI || bCI <= 0) continue
      const perCapBuyToman = (bI * pc) / bCI / 10 // ریال → تومان
      perCapRows.push({ symbol: sym, trade_date: today, per_capita_buy: Math.round(perCapBuyToman), updated: out.updated })
    }
    if (perCapRows.length > 0) {
      const { error: pcErr } = await sb.from('stock_per_capita_daily').upsert(perCapRows, { onConflict: 'symbol,trade_date' })
      if (pcErr) console.error(`[stocks-industries] stock_per_capita_daily: ${pcErr.message}`)
      else console.log(`✅ stock_per_capita_daily بروز شد (${perCapRows.length} نماد)`)
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
  }

  // ── رصد لحظه‌ای بازار: هر دسته یک اسنپ‌شات ۵ دقیقه‌ای در market_watch ──
  const cats = []
  if (stocksOpen) {
    // نمودار توزیع محدوده قیمتی کارت سهام: سهام + ص.سهامی (watchItems) + حق تقدم
    cats.push(['stocks', watchItems, watchItems.concat(rightsItems)])
    cats.push(['bourse-funds', arr.filter(it => EQUITY_FUND_NAMES.has(clean(it.l18)))])
  }

  // صندوق‌های کالایی (طلا/نقره/زعفران) — فهرست نمادها از جدول assets — بازار ۱۲:۳۰–۱۸:۰۰
  if (fundsOpen) {
    const { data: assets, error: aErr } = await sb.from('assets').select('name, category')
    if (aErr) {
      console.error(`[stocks-industries] assets: ${aErr.message}`)
    } else {
      const CAT_MAP = { 'طلا': 'gold', 'نقره': 'silver', 'زعفران': 'saffron' }
      const sets = { gold: new Set(), silver: new Set(), saffron: new Set() }
      for (const a of assets) {
        const c = CAT_MAP[a.category]
        if (c) sets[c].add(clean(a.name))
      }
      for (const [cat, set] of Object.entries(sets)) {
        cats.push([cat, arr.filter(it => set.has(clean(it.l18)))])
      }
    }
  }

  for (const [cat, items, distItems] of cats) {
    if (items.length === 0) { console.log(`[stocks-industries] ${cat}: نمادی پیدا نشد — رد شد`); continue }
    const watch = computeMarketWatch(items, distItems)
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
