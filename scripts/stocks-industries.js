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
 * سپس از مک:
 *   scp root@45.94.215.115:/opt/stocks-industries.json public/stocks/industries.json
 */

'use strict'

const path = require('path')
const fs   = require('fs')

const KEY = process.env.BRSAPI_KEY || 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const PROBE = process.argv.includes('--probe')

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

async function main() {
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
    if (!cs || !l18) return false
    if (NOT_STOCK_CS.test(cs)) return false
    if (/[0-9۰-۹]/.test(l18)) return false                       // اوراق با پسوند عددی
    if (/حق تقدم|حق‌تقدم/.test(l30)) return false                // حق تقدم
    if (l18.endsWith('ح') && allL18.has(l18.slice(0, -1))) return false
    return true
  }

  const byIndustry = new Map()
  for (const it of arr) {
    if (!isStock(it)) continue
    const key = num(it.cs_id) ?? clean(it.cs)
    if (!byIndustry.has(key)) byIndustry.set(key, { id: num(it.cs_id), name: clean(it.cs), symbols: [] })
    byIndustry.get(key).symbols.push({
      l18: clean(it.l18),
      l30: clean(it.l30),
      pl: num(it.pl),   plp: num(it.plp),   // آخرین معامله + درصد
      pc: num(it.pc),   pcp: num(it.pcp),   // قیمت پایانی + درصد
      tval: num(it.tval),                    // ارزش معاملات (ریال)
      tvol: num(it.tvol),
      mv: num(it.mv),                        // ارزش بازار (ریال)
      pe: num(it.pe),
    })
  }

  const industries = [...byIndustry.values()]
    .map(ind => {
      ind.symbols.sort((a, b) => (b.tval ?? 0) - (a.tval ?? 0))
      const tval = ind.symbols.reduce((s, x) => s + (x.tval ?? 0), 0)
      const mv   = ind.symbols.reduce((s, x) => s + (x.mv ?? 0), 0)
      const up   = ind.symbols.filter(x => (x.pcp ?? 0) > 0).length
      const down = ind.symbols.filter(x => (x.pcp ?? 0) < 0).length
      return { ...ind, count: ind.symbols.length, tval, mv, up, down }
    })
    .sort((a, b) => b.tval - a.tval)

  console.log(`\n═══ ${industries.length} صنعت ═══`)
  industries.forEach((ind, i) => {
    console.log(`${String(i + 1).padStart(2)}) [${ind.id ?? '—'}] ${ind.name} — ${ind.count} نماد — ${(ind.tval / 1e13).toFixed(1)} همت`)
  })

  if (PROBE) return

  const out = {
    updated: new Date().toISOString(),
    industries,
  }
  const file = path.join(__dirname, 'stocks-industries.json')
  fs.writeFileSync(file, JSON.stringify(out))
  console.log(`\n✅ ذخیره شد: ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`)
}

main().catch(e => { console.error(e); process.exit(1) })
