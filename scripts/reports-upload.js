#!/usr/bin/env node
/**
 * reports-upload.js
 *
 * بورس سنج — بارگذاری یک‌بارهٔ گزارش‌های موجود روی جدول stock_reports.
 * بعد از این، codal-watch.js جدول را زنده نگه می‌دارد و این اسکریپت لازم نیست.
 *
 *   SUPABASE_URL=… SUPABASE_KEY=… node reports-upload.js [پوشه]
 *
 * پوشه پیش‌فرض: ./reports-out (روی سرور) — روی مک: node scripts/reports-upload.js public/reports
 */

'use strict'

const path = require('path')
const fs   = require('fs')

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('SUPABASE_URL و SUPABASE_KEY (service-role) لازم است'); process.exit(1) }

const DIR = process.argv[2] || path.join(__dirname, 'reports-out')
const BATCH = 25

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

async function main() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json'))
  console.log(`${files.length} فایل در ${DIR}`)

  const rows = []
  for (const f of files) {
    let d
    try { d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) }
    catch (e) { console.log(`⚠️ ${f}: JSON خراب — ${e.message}`); continue }
    const symbol = d.symbol || f.replace(/\.json$/, '').replace(/-/g, ' ')
    const months = d.months?.length ?? 0
    const quarters = d.quarters?.length ?? 0
    if (!months && !quarters) { console.log(`⚠️ ${symbol}: خالی — رد شد`); continue }
    rows.push({ symbol, data: d, months, quarters, updated: d.updated || new Date().toISOString() })
  }

  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await sb.from('stock_reports').upsert(chunk, { onConflict: 'symbol' })
    if (error) { console.error(`❌ دسته ${i}: ${error.message}`); process.exit(1) }
    done += chunk.length
    console.log(`  ${done}/${rows.length}`)
  }

  const totM = rows.reduce((a, r) => a + r.months, 0)
  const totQ = rows.reduce((a, r) => a + r.quarters, 0)
  console.log(`✔ ${done} نماد | ${totM} ماه | ${totQ} دوره`)
}

main().catch(e => { console.error(e); process.exit(1) })
