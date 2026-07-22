#!/usr/bin/env node
/**
 * option-chain.js
 *
 * بورس سنج — استخراج قراردادهای اختیار معامله (آپشن) از BrsAPI Tsetmc/Option.php
 * برای گروه «آپشن» در نقشه بازار (/market-map)
 *
 * روی سرور ایرانی (BrsAPI فقط IP ایران):
 *   node option-chain.js            → خروجی به جدول option_chain در Supabase
 *   node option-chain.js --probe    → فقط شمارش/چاپ، بدون نوشتن در Supabase
 *
 * cron: هر ۱۵ دقیقه، شنبه–چهارشنبه ۹:۰۰–۱۲:۳۰ تهران (گارد ساعت داخل خود اسکریپت، --force برای رد کردن)
 * بودجه BrsApi ۱۰۰۰ درخواست/روز مشترک بین همه اسکریپت‌هاست — همین برای همین کاهش تناوب به ۱۵ دقیقه انتخاب شد.
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

const KEY = process.env.BRSAPI_KEY
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PROBE = process.argv.includes('--probe')
const FORCE = process.argv.includes('--force')

function tehranClock() {
  const tehran = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  return { day: tehran.getDay(), mins: tehran.getHours() * 60 + tehran.getMinutes() }
}
const MARKET_OPEN  = 9 * 60
const MARKET_CLOSE = 12 * 60 + 30
const isMarketDay = (day) => [6, 0, 1, 2, 3].includes(day) // شنبه تا چهارشنبه

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const clean = (s) => String(s || '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[‌‎‏‪-‮]/g, ' ')
  .replace(/\s+/g, ' ').trim()

async function main() {
  const { day, mins } = tehranClock()
  const inWindow = isMarketDay(day) && mins >= MARKET_OPEN && mins <= MARKET_CLOSE
  if (!FORCE && !PROBE && !inWindow) {
    console.log('[option-chain] خارج از ساعت بازار (شنبه–چهارشنبه ۹:۰۰–۱۲:۳۰ تهران) — رد شد. با --force اجباری کنید.')
    return
  }

  const url = `https://Api.BrsApi.ir/Tsetmc/Option.php?key=${KEY}`
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const arr = await res.json()
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('پاسخ Option.php خالی است')
  console.log(`${arr.length} قرارداد اختیار معامله دریافت شد`)

  const symbols = arr.map(it => ({
    l18: clean(it.l18),
    l30: clean(it.l30),
    pl: num(it.pl),   plp: num(it.plp),
    pc: num(it.pc),   pcp: num(it.pcp),
    tval: num(it.tval),
    tvol: num(it.tvol),
    mv: null,
    pe: null,
    base_l18: clean(it.base_l18),        // نماد پایه
    option_type: it.type,                 // call / put
    price_strike: num(it.price_strike),
    day_remain: num(it.day_remain),
  })).filter(s => s.l18)

  symbols.sort((a, b) => (b.tval ?? 0) - (a.tval ?? 0))
  const tval = symbols.reduce((s, x) => s + (x.tval ?? 0), 0)
  const up   = symbols.filter(x => (x.pcp ?? 0) > 0).length
  const down = symbols.filter(x => (x.pcp ?? 0) < 0).length

  const group = { id: -20, name: 'آپشن', kind: 'option', count: symbols.length, tval, mv: 0, up, down, symbols }
  console.log(`═══ آپشن: ${group.count} قرارداد — ${(tval / 1e13).toFixed(2)} همت ═══`)

  if (PROBE) return

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[option-chain] SUPABASE_URL/KEY تنظیم نشده — خروجی Supabase رد شد')
    return
  }
  const { createClient } = require('@supabase/supabase-js')
  let wsTransport
  try { wsTransport = require('ws') } catch { /* Node 22+ نیازی ندارد */ }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY,
    wsTransport ? { realtime: { transport: wsTransport } } : {})

  const out = { updated: new Date().toISOString(), group }
  const { error } = await sb.from('option_chain').upsert({ id: 1, data: out, updated: out.updated })
  if (error) throw new Error(`Supabase upsert: ${error.message}`)
  console.log('✅ Supabase (option_chain) بروز شد')
}

main().catch(e => { console.error(e); process.exit(1) })
