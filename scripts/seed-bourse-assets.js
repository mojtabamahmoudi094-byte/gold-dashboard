#!/usr/bin/env node
/**
 * seed-bourse-assets.js
 *
 * بورس سنج — ثبت یک‌باره صندوق‌های بورسی (اهرمی/بخشی/سهامی) در جدول assets
 * از هر جایی قابل اجراست (فقط به Supabase وصل می‌شود، نه BrsAPI)
 *
 *   node scripts/seed-bourse-assets.js           → درج نمادهای جدید
 *   node scripts/seed-bourse-assets.js --dry-run → فقط نمایش، بدون درج
 */

'use strict'

const path = require('path')
const fs   = require('fs')
const { BOURSE_SYMBOLS } = require('./bourse-symbols')

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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[seed-bourse] SUPABASE_URL و SUPABASE_KEY تنظیم نشده‌اند')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// slug یکتا و URL-پسند از روی نام فارسی (فاصله → خط تیره)
function toSlug(name) {
  return name.trim().replace(/\s+/g, '-')
}

async function main() {
  const { data: existing, error } = await sb.from('assets').select('name, slug')
  if (error) {
    console.error('[seed-bourse] خطا در خواندن assets:', error.message)
    process.exit(1)
  }
  const existingNames = new Set((existing ?? []).map(a => a.name))
  const existingSlugs = new Set((existing ?? []).map(a => a.slug))

  const rows = []
  for (const [category, symbols] of Object.entries(BOURSE_SYMBOLS)) {
    for (const name of symbols) {
      if (existingNames.has(name)) { console.log(`⏭  ${name} (${category}) — از قبل موجود`); continue }
      const slug = toSlug(name)
      if (existingSlugs.has(slug)) { console.warn(`⚠️  slug تکراری: ${slug} — رد شد`); continue }
      rows.push({ name, slug, category })
    }
  }

  console.log(`\n[seed-bourse] ${rows.length} نماد جدید برای درج`)
  if (rows.length === 0) return

  if (DRY_RUN) {
    console.log(JSON.stringify(rows, null, 2))
    console.log('\n(dry-run — چیزی درج نشد)')
    return
  }

  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error: insErr } = await sb.from('assets').insert(batch)
    if (insErr) {
      console.error(`[seed-bourse] خطا در batch ${i / BATCH + 1}:`, insErr.message)
    } else {
      inserted += batch.length
    }
  }
  console.log(`[seed-bourse] ✅ ${inserted}/${rows.length} نماد ثبت شد`)
}

main().catch(e => { console.error(e); process.exit(1) })
