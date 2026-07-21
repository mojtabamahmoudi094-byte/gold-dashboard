#!/usr/bin/env node
/**
 * fund-bubble-daily.js — تاریخچه روزانه حباب صندوق‌های طلا/نقره (اسمی/ذاتی/واقعی)
 *
 * فقط از کش‌های موجود در جدول signals می‌خواند (_gold_cache, _ime_cache, _nav_cache —
 * که هر روز توسط scripts/sync-funds.js و app/api/gold-analysis پر می‌شوند) + قیمت پایانی
 * از gold_funds — پس نیازی به تماس زنده با BrsApi ندارد و روی هر سروری قابل اجراست
 * (نه فقط سرور ایرانی).
 *
 * فرمول‌ها دقیقاً همان app/api/gold-analysis/route.ts است (fairBullion/fairCoinCert/
 * fairSilverGram) — تا نتیجه با /analysis/gold و /analysis/silver یکی باشد.
 *
 * usage:
 *   node scripts/fund-bubble-daily.js            # فقط آخرین روز موجود در کش‌ها
 *   node scripts/fund-bubble-daily.js --backfill # همه روزهای موجود در _nav_cache
 *
 * crontab (UTC! نه تهران) — ۱۹:۳۰ تهران، بعد از sync-funds.js و sync-nav، شنبه–چهارشنبه:
 *   0 16 * * 0-4 node scripts/fund-bubble-daily.js >> /var/log/fund-bubble-daily.log 2>&1
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
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

const BACKFILL = process.argv.includes('--backfill')

// وزن ترکیب دارایی — همان جدول lib/goldBubbles.ts (کپی، چون آن فایل TS با import اجرا می‌شود نه require ساده)
const FUND_WEIGHTS = require('./fund-weights.json').gold
const SILVER_FUND_WEIGHTS = require('./fund-weights.json').silver

function n(v) {
  const x = parseFloat(String(v ?? '').replace(/,/g, ''))
  return isNaN(x) || x === 0 ? null : x
}
function bySymbol(arr, sym) { return (arr || []).find(x => x.symbol === sym) ?? null }

// همان extractPrices/فرمول fairBullion در app/api/gold-analysis/route.ts
function computeFairValues(rawPro, rawCommodity) {
  const goldOunce = rawPro?.gold?.ounce ?? []
  const freeCurr = rawPro?.currency?.free ?? []
  const metals = rawCommodity?.metal_precious ?? []
  const goldUsd = n(goldOunce[0]?.price)
  const silverUsd = n(bySymbol(metals, 'XAGUSD')?.price)
  const dollarRial = n(bySymbol(freeCurr, 'USD')?.price)
  const dirhamRial = n(bySymbol(freeCurr, 'AED')?.price)
  const dollarT = dollarRial ? dollarRial / 10 : null
  const dirhamT = dirhamRial ? dirhamRial / 10 : null
  const AED_PER_USD = 3.6732
  const gramsPerOz = 31.103431
  const fullCoinW = 8.13
  const dollarViaDirham = dirhamT ? dirhamT * AED_PER_USD : null
  const fairBullion = goldUsd && dollarViaDirham
    ? (1000 / gramsPerOz) * (995 / 999.9) * goldUsd * dollarViaDirham : null
  const fairCoinCert = goldUsd && dollarViaDirham
    ? (fullCoinW / gramsPerOz) * (22 / 24) * goldUsd * dollarViaDirham : null
  const fairSilverGram = silverUsd && dollarViaDirham
    ? (silverUsd * dollarViaDirham) / gramsPerOz : null
  return { fairBullion, fairCoinCert, fairSilverGram }
}

function imeFromCache(note) {
  try {
    const arr = JSON.parse(note)?.raw?.data ?? []
    const goldBar = arr.find(x => x.contract_code === 'GoldBar')
    const goldCoin = arr.find(x => x.contract_code === 'GoldCoin')
    const silverBar = arr.find(x => x.contract_code === 'SilverBar')
    return {
      goldBarT: goldBar?.pf != null ? Number(goldBar.pf) / 10 : null,
      goldCoinT: goldCoin?.pf != null ? Number(goldCoin.pf) / 10 : null,
      silverBarT: silverBar?.pf != null ? Number(silverBar.pf) / 10 : null,
    }
  } catch { return { goldBarT: null, goldCoinT: null, silverBarT: null } }
}

async function fetchCacheByDate(signalType) {
  const { data, error } = await sb.from('signals').select('signal_date_shamsi, note')
    .eq('signal_type', signalType).order('id', { ascending: true })
  if (error) throw error
  const byDate = new Map()
  for (const row of data || []) if (row.note) byDate.set(row.signal_date_shamsi, row.note)
  return byDate
}

async function main() {
  const [navByDate, goldByDate, imeByDate] = await Promise.all([
    fetchCacheByDate('_nav_cache'),
    fetchCacheByDate('_gold_cache'),
    fetchCacheByDate('_ime_cache'),
  ])

  const dates = BACKFILL
    ? [...navByDate.keys()].filter(d => goldByDate.has(d) && imeByDate.has(d)).sort()
    : [[...navByDate.keys()].sort().pop()].filter(Boolean)

  if (dates.length === 0) { console.log('هیچ روزی برای پردازش پیدا نشد'); return }
  console.log(`پردازش ${dates.length} روز: ${dates[0]} تا ${dates[dates.length - 1]}`)

  const { data: assets } = await sb.from('assets').select('id, name, category')
    .in('category', ['طلا', 'نقره'])
  const assetsByName = new Map((assets || []).map(a => [a.name, a]))

  const rows = []
  for (const date of dates) {
    let navs = {}
    try { navs = JSON.parse(navByDate.get(date))?.navs ?? {} } catch { /* skip */ }
    const { fairBullion, fairCoinCert, fairSilverGram } = computeFairValues(
      (() => { try { return JSON.parse(goldByDate.get(date))?.raw_pro } catch { return null } })(),
      (() => { try { return JSON.parse(goldByDate.get(date))?.raw_commodity } catch { return null } })(),
    )
    const ime = imeFromCache(imeByDate.get(date))
    // مقیاس‌بندی دقیقاً مثل app/analysis/gold/page.tsx: fairBullion برای شمش ۱۰۰۰گرمی
    // محاسبه شده و باید /1000 شود، تابلوی IME هم ×10 — این دو معیار واحد متفاوت دارند
    // و بدون این تبدیل، حباب شمش به اشتباه چیزی حدود -99٪ درمی‌آید.
    const fairBullionK = fairBullion != null ? fairBullion / 1000 : null
    const tabloBullionK = ime.goldBarT != null ? ime.goldBarT * 10 : null
    const marketBubbleBullion = fairBullionK != null && tabloBullionK != null
      ? ((tabloBullionK - fairBullionK) / fairBullionK) * 100 : null
    const marketBubbleCoin = fairCoinCert != null && ime.goldCoinT != null
      ? ((ime.goldCoinT - fairCoinCert) / fairCoinCert) * 100 : null
    const silverBubble = fairSilverGram != null && ime.silverBarT != null
      ? ((ime.silverBarT - fairSilverGram) / fairSilverGram) * 100 : null

    // قیمت پایانی هر صندوق در همان تاریخ (برای حباب اسمی)
    const { data: priceRows } = await sb.from('gold_funds')
      .select('asset_id, price_close, trade_value').eq('trade_date_shamsi', date)
    const priceByAssetId = new Map((priceRows || []).map(r => [r.asset_id, r]))

    for (const [name, asset] of assetsByName) {
      const nav = navs[name]
      const priceRow = priceByAssetId.get(asset.id)
      if (!priceRow || !priceRow.price_close) continue
      const bubbleAsmi = nav ? ((priceRow.price_close - nav) / nav) * 100 : null

      let bubbleZati = null
      if (asset.category === 'طلا') {
        const w = FUND_WEIGHTS[name]
        if (w && marketBubbleBullion != null && marketBubbleCoin != null) {
          bubbleZati = (w.coin / 100) * marketBubbleCoin + (w.bar / 100) * marketBubbleBullion
        }
      } else if (asset.category === 'نقره') {
        const w = SILVER_FUND_WEIGHTS[name]
        if (w && silverBubble != null) bubbleZati = (w.silver / 100) * silverBubble
      }
      const bubbleVaqei = bubbleAsmi != null && bubbleZati != null ? bubbleAsmi + bubbleZati : null
      if (bubbleAsmi == null && bubbleZati == null) continue

      rows.push({
        fund_name: name, trade_date: date,
        bubble_asmi: bubbleAsmi, bubble_zati: bubbleZati, bubble_vaqei: bubbleVaqei,
        updated: new Date().toISOString(),
      })
    }
  }

  if (rows.length === 0) { console.log('هیچ ردیفی برای ذخیره ساخته نشد'); return }
  const { error } = await sb.from('fund_bubble_daily').upsert(rows, { onConflict: 'fund_name,trade_date' })
  if (error) { console.error('❌ upsert شکست خورد:', error.message); process.exit(1) }
  console.log(`✅ ${rows.length} ردیف در fund_bubble_daily ذخیره شد`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
