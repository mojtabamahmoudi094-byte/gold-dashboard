#!/usr/bin/env node
/**
 * stock-float.js
 *
 * بورس سنج — درصد شناوری (ff) و کل سهام (z) هر نماد از BrsAPI Symbol.php
 * برخلاف stocks-industries.js (یک فچ کل بازار)، این داده فقط با فراخوانی جداگانه هر نماد به دست می‌آید
 * — به همین دلیل روزانه یک‌بار اجرا می‌شود، نه هر ۵ دقیقه (شناوری هم به‌ندرت تغییر می‌کند)
 *
 * روی سرور ایرانی (BrsAPI فقط IP ایران):
 *   node stock-float.js
 *
 * خروجی به جدول stock_float در Supabase upsert می‌شود (سایت /vip/filters «حجم به شناوری و مارکت» از آن می‌خواند)
 * cron: روزانه یک‌بار، ساعتی بعد از بسته شدن بازار (نصب در scripts/install-cron.sh — زمان UTC)
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

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const clean = (s) => String(s || '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[‌‎‏‪-‮]/g, ' ')
  .replace(/\s+/g, ' ').trim()

// همان تشخیص سهم در scripts/stocks-industries.js
const NOT_STOCK_CS = /صندوق|اوراق|تسهیلات|صکوک|اسناد|اختیار|آتی|سپرده|امتیاز|مشارکت|اجاره|مرابحه|خزانه/
function isStock(it, allL18) {
  const cs = clean(it.cs), l18 = clean(it.l18), l30 = clean(it.l30)
  if (!l18) return false
  if (cs && NOT_STOCK_CS.test(cs)) return false
  if (/[0-9۰-۹]/.test(l18)) return false
  if (/حق تقدم|حق‌تقدم/.test(l30)) return false
  if (l18.endsWith('ح') && allL18.has(l18.slice(0, -1))) return false
  return true
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const listUrl = `https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${KEY}`
  const listRes = await fetch(listUrl, { signal: AbortSignal.timeout(120_000) })
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} (AllSymbols)`)
  const listData = await listRes.json()
  const arr = Array.isArray(listData) ? listData : (listData?.symbols ?? listData?.data ?? [])
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('پاسخ AllSymbols خالی است')

  const allL18 = new Set(arr.map((it) => clean(it.l18)))
  const symbols = [...new Set(arr.filter((it) => isStock(it, allL18)).map((it) => clean(it.l18)))]
  console.log(`${symbols.length} نماد سهم — دریافت شناوری یکی‌یکی…`)

  const rows = []
  for (const sym of symbols) {
    try {
      const url = `https://Api.BrsApi.ir/Tsetmc/Symbol.php?key=${KEY}&l18=${encodeURIComponent(sym)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      if (!res.ok) { console.error(`  ${sym}: HTTP ${res.status}`); continue }
      const d = await res.json()
      const ff = num(d?.ff), z = num(d?.z)
      if (ff == null && z == null) { console.error(`  ${sym}: ff/z خالی`); continue }
      rows.push({ symbol: sym, free_float_pct: ff, shares_outstanding: z, updated: new Date().toISOString() })
    } catch (e) {
      console.error(`  ${sym}: ${e.message}`)
    }
    await sleep(200) // ملایم روی API — فراخوانی تک‌به‌تک است
  }
  console.log(`${rows.length}/${symbols.length} نماد با موفقیت دریافت شد`)

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[stock-float] SUPABASE_URL/KEY تنظیم نشده — خروجی Supabase رد شد')
    return
  }
  const { createClient } = require('@supabase/supabase-js')
  let wsTransport
  try { wsTransport = require('ws') } catch { /* Node 22+ نیازی ندارد */ }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY,
    wsTransport ? { realtime: { transport: wsTransport } } : {})

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await sb.from('stock_float').upsert(chunk, { onConflict: 'symbol' })
    if (error) throw new Error(`Supabase upsert: ${error.message}`)
  }
  console.log('✅ Supabase (stock_float) بروز شد')
}

main().catch((e) => { console.error(e); process.exit(1) })
