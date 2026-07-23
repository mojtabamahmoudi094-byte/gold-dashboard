#!/usr/bin/env node
/**
 * seed-halted-symbols.js — تزریق یک‌بارهٔ نمادهای متوقفِ قدیمی به snapshot صنایع.
 *
 * مشکل: BrsApi AllSymbols فقط نمادهای بازگشایی‌شده را می‌دهد؛ نمادی که پیش از شروع
 * پایپلاین متوقف شده (فولاد، فخوز) هیچ‌جا نیست — نه کندل، نه snapshot، نه آرشیو ۹۰روزه.
 * carry-forward در stocks-industries.js فقط چیزی را نگه می‌دارد که یک‌بار دیده باشد.
 *
 * این اسکریپت از tsetmc (که متوقف‌ها را می‌شناسد) insCode و آخرین قیمت را می‌گیرد و
 * نماد را با halted:true به صنعت «سایر» در stock_industries id=1 اضافه می‌کند.
 * از آن به بعد carry-forward خودش نگهش می‌دارد. اجرا روی سرور ایران:
 *
 *   node seed-halted-symbols.js فولاد فخوز
 */

'use strict'

const path = require('path')
const fs = require('fs')

function loadEnv(file) {
  const p = path.resolve(__dirname, file)
  if (!fs.existsSync(p)) return
  fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  })
}
loadEnv('../.env.local')
loadEnv('.env.sync')
loadEnv('.env')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const HOSTS = ['http://old.tsetmc.com', 'http://www.tsetmc.com', 'http://service.tsetmc.com']
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }

async function fetchText(pathname) {
  let lastErr = null
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + pathname, { headers: UA, signal: AbortSignal.timeout(60_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

// search.aspx: هر ردیف «l18,l30,insCode,...» — دقیق‌ترین تطبیق l18
async function findInstrument(symbol) {
  const text = await fetchText(`/tsev2/data/search.aspx?skey=${encodeURIComponent(symbol)}`)
  for (const row of text.split(';')) {
    const f = row.split(',')
    if ((f[0] ?? '').trim() === symbol) return { l18: f[0].trim(), l30: (f[1] ?? '').trim(), insCode: (f[2] ?? '').trim() }
  }
  return null
}

// آخرین کندل خام — date@high@low@close@last@first@yesterday@value@volume@count
async function lastClose(insCode) {
  const text = await fetchText(`/tsev2/data/InstTradeHistory.aspx?i=${insCode}&Top=30&A=0`)
  for (const row of text.split(';')) {
    const f = row.split('@')
    if (f.length < 9) continue
    const close = Number(f[3])
    const date = String(f[0]).slice(0, 8)
    if (Number.isFinite(close) && close > 0) return { close, date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` }
  }
  return null
}

async function main() {
  const symbols = process.argv.slice(2).filter(s => !s.startsWith('-'))
  if (!symbols.length) { console.error('استفاده: node seed-halted-symbols.js <نماد> [نماد…]'); process.exit(1) }
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE_URL/KEY نیست'); process.exit(1) }

  const { createClient } = require('@supabase/supabase-js')
  let wsTransport
  try { wsTransport = require('ws') } catch { /* Node 22+ */ }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY,
    wsTransport ? { realtime: { transport: wsTransport } } : {})

  const { data: row, error } = await sb.from('stock_industries').select('data, updated').eq('id', 1).single()
  if (error || !row?.data?.industries) { console.error('stock_industries خوانده نشد:', error?.message); process.exit(1) }
  const industries = row.data.industries
  const existing = new Set(industries.flatMap(i => (i.symbols ?? []).map(s => s.l18)))

  let sayer = industries.find(i => i.name === 'سایر')
  let added = 0
  for (const symbol of symbols) {
    if (existing.has(symbol)) { console.log(`⏭️ ${symbol} از قبل هست`); continue }
    const inst = await findInstrument(symbol)
    if (!inst) { console.log(`❌ ${symbol}: در tsetmc پیدا نشد`); continue }
    const lc = await lastClose(inst.insCode)
    if (!lc) { console.log(`❌ ${symbol}: تاریخچه قیمت خالی (insCode=${inst.insCode})`); continue }
    if (!sayer) {
      sayer = { id: null, name: 'سایر', symbols: [], count: 0, tval: 0, mv: 0, up: 0, down: 0, moneyIn: 0 }
      industries.push(sayer)
    }
    // هم‌شکل symOf در stocks-industries.js؛ قیمت = آخرین close پیش از توقف
    sayer.symbols.push({
      l18: inst.l18, l30: inst.l30,
      pl: lc.close, plp: null, pc: lc.close, pcp: null,
      tval: null, tvol: null, mv: null, pe: null,
      bi: null, si: null, bci: null, sci: null, bn: null, sn: null,
      board: 'other', halted: true, haltedLastDate: lc.date,
    })
    sayer.count++
    existing.add(symbol)
    added++
    console.log(`✅ ${symbol} (${inst.l30}) — آخرین قیمت ${lc.close} در ${lc.date}`)
  }

  if (!added) { console.log('چیزی برای افزودن نبود'); return }
  const { error: upErr } = await sb.from('stock_industries').upsert({ id: 1, data: row.data, updated: row.updated })
  if (upErr) { console.error('upsert:', upErr.message); process.exit(1) }
  console.log(`✅ ${added} نماد متوقف تزریق شد — carry-forward از این به بعد نگهشان می‌دارد`)
}

main().catch(e => { console.error(e); process.exit(1) })
