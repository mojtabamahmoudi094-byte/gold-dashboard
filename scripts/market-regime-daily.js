#!/usr/bin/env node
/**
 * market-regime-daily.js — Regime Engine ساده برای بازار سهام (فاز ۳ نقشه راه).
 * از آخرین تیک هر روز تهرانی در market_watch (cat='stocks') یک برچسب روزانه می‌سازد:
 *   صعودی/نزولی: breadth و میانگین تغییر قیمت و جریان پول هر سه هم‌جهت و قوی
 *   تجمیع/توزیع: جریان پول قوی ولی breadth ضعیف (پول وارد می‌شود ولی اکثریت نمادها هنوز منفی‌اند یا برعکس)
 *   نوسانی: هیچ‌کدام از شرایط بالا برقرار نیست
 *
 * فقط از Supabase (market_watch) می‌خواند — تماس زنده با BrsApi ندارد، هر سروری قابل اجراست.
 *
 * usage:
 *   node scripts/market-regime-daily.js            # فقط آخرین روز
 *   node scripts/market-regime-daily.js --backfill  # کل تاریخچه موجود در market_watch
 *
 * crontab (UTC! نه تهران) — ۱۲:۴۰ تهران (۱۰ دقیقه بعد بسته‌شدن بازار سهام ۱۲:۳۰)، شنبه–چهارشنبه:
 *   10 9 * * 0-4 node scripts/market-regime-daily.js >> /var/log/market-regime-daily.log 2>&1
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
let wsTransport
try { wsTransport = require('ws') } catch { /* Node 22+ */ }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, wsTransport ? { realtime: { transport: wsTransport } } : {})

const BACKFILL = process.argv.includes('--backfill')

const tehranDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })

// شمسی برای ذخیره (مطابق فرمت trade_date_shamsi بقیه جدول‌ها)
function toShamsi(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`)
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran',
  }).formatToParts(d)
  const g = (t) => parts.find(p => p.type === t).value
  return `${g('year')}/${g('month')}/${g('day')}`
}

function classify(breadthPct, avgChangePct, netFlow) {
  const strongUp = breadthPct >= 60 && avgChangePct >= 0.5 && netFlow > 0
  const strongDown = breadthPct <= 40 && avgChangePct <= -0.5 && netFlow < 0
  if (strongUp) return 'صعودی'
  if (strongDown) return 'نزولی'
  // پول قوی ولی breadth هم‌جهت نیست
  if (netFlow > 0 && breadthPct < 55) return 'تجمیع'
  if (netFlow < 0 && breadthPct > 45) return 'توزیع'
  return 'نوسانی'
}

async function main() {
  const { data: rows, error } = await sb.from('market_watch')
    .select('ts, d').eq('cat', 'stocks').order('ts', { ascending: true })
  if (error) { console.error('[market-regime] market_watch:', error.message); return }
  if (!rows || rows.length === 0) { console.log('[market-regime] داده‌ای نیست'); return }

  // آخرین تیک هر روز تهرانی
  const lastByDay = new Map()
  for (const r of rows) lastByDay.set(tehranDay(r.ts), r)

  let days = [...lastByDay.keys()].sort()
  if (!BACKFILL) days = days.slice(-1) // فقط امروز/آخرین روز

  const upserts = []
  for (const day of days) {
    const row = lastByDay.get(day)
    const d = row.d || {}
    const symPos = Number(d.sym_pos) || 0
    const symNeg = Number(d.sym_neg) || 0
    const total = symPos + symNeg
    if (total === 0) continue
    const breadthPct = (symPos / total) * 100
    const avgChangePct = Number(d.avg_plp) || 0
    const netFlow = Number(d.money_in) || 0
    const regime = classify(breadthPct, avgChangePct, netFlow)
    upserts.push({
      trade_date_shamsi: toShamsi(day), regime,
      breadth_pct: Math.round(breadthPct * 10) / 10,
      avg_change_pct: Math.round(avgChangePct * 100) / 100,
      net_flow: Math.round(netFlow),
      updated: new Date().toISOString(),
    })
  }

  if (upserts.length === 0) { console.log('[market-regime] چیزی برای ذخیره نبود'); return }
  const { error: upErr } = await sb.from('market_regime_daily').upsert(upserts, { onConflict: 'trade_date_shamsi' })
  if (upErr) { console.error('[market-regime] upsert:', upErr.message); return }
  console.log(`✅ ${upserts.length} روز ذخیره شد — آخرین: ${upserts[upserts.length - 1].regime} (${upserts[upserts.length - 1].trade_date_shamsi})`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
