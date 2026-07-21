#!/usr/bin/env node
/**
 * comment-notify.js — به محض ثبت کامنت جدید (زیر نماد سهم/صندوق)، فقط به ادمین
 * (جدول admins، از طریق telegram_links همون ربات پورتفوی) پیام تلگرام بده تا چک کنه.
 *
 * از الگوی claimSend (جدول مشترک telegram_alert_sent) استفاده می‌کنه تا اگه cron
 * چندبار پشت‌سرهم روی یه کامنت اجرا شد، پیام دوباره نره.
 *
 * env: TELEGRAM_PORTFOLIO_BOT_TOKEN, SUPABASE_URL/SUPABASE_KEY (service role)
 * usage: node scripts/comment-notify.js
 * crontab (UTC! نه تهران) — هر ۲ دقیقه:
 *   (هر ۲ دقیقه) node scripts/comment-notify.js >> /var/log/comment-notify.log 2>&1
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

const SITE = (process.env.SITE_URL || 'https://bourssanj.ir').replace(/\/$/, '')
const TOKEN = process.env.TELEGRAM_PORTFOLIO_BOT_TOKEN
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!TOKEN) { console.error('[comment-notify] TELEGRAM_PORTFOLIO_BOT_TOKEN تنظیم نشده'); process.exit(1) }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('[comment-notify] SUPABASE_URL/SUPABASE_KEY تنظیم نشده'); process.exit(1) }

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

async function tg(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  return res.json()
}

async function claimSend(key) {
  const { error } = await sb.from('telegram_alert_sent').insert({ key })
  if (!error) return true
  if (error.code === '23505') return false
  console.error(`[comment-notify] claimSend خطا داد (${error.message}) — برای امنیت رد شد: ${key}`)
  return false
}

async function main() {
  const { data: admins, error: adminErr } = await sb.from('admins').select('id')
  if (adminErr) { console.error('[comment-notify] admins:', adminErr.message); return }
  if (!admins || admins.length === 0) { console.log('[comment-notify] ادمینی ثبت نشده'); return }

  const { data: links } = await sb.from('telegram_links').select('user_id, telegram_chat_id')
    .in('user_id', admins.map(a => a.id))
  const chatIds = (links || []).map(l => l.telegram_chat_id).filter(Boolean)
  if (chatIds.length === 0) { console.log('[comment-notify] هیچ ادمینی تلگرامش لینک نشده'); return }

  // فقط کامنت‌های ۱ ساعت اخیر را چک کن — کافیه و از اسکن کل تاریخچه جلوگیری می‌کند
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: comments, error } = await sb.from('comments')
    .select('id, target_type, target_key, display_name, body, created_at')
    .gte('created_at', since).order('created_at', { ascending: true })
  if (error) { console.error('[comment-notify] comments:', error.message); return }

  let sent = 0
  for (const c of comments || []) {
    if (!(await claimSend(`comment|${c.id}`))) continue
    const link = c.target_type === 'stock' ? `${SITE}/stock/${encodeURIComponent(c.target_key)}` : `${SITE}/fund/${encodeURIComponent(c.target_key)}`
    const text = `💬 <b>کامنت جدید</b> — ${c.target_type === 'stock' ? 'سهم' : 'صندوق'} ${c.target_key}\n` +
      `از: ${c.display_name}\n\n${c.body}\n\n${link}`
    for (const chatId of chatIds) await tg(chatId, text)
    sent++
  }
  console.log(sent > 0 ? `✅ ${sent} کامنت جدید اطلاع داده شد` : 'کامنت جدیدی نبود')
}

main().catch(e => { console.error('[comment-notify]', e.message); process.exit(1) })
