/**
 * futures-lib.js — ابزارهای مشترک اسکریپت‌های آتی پیوسته
 * (global-futures-backfill.js + global-futures-daily.js)
 */

'use strict'

const { fetchJson } = require('./candles-lib')

/** نمادهای آتی پیوسته Yahoo Finance که رصد می‌کنیم */
const GLOBAL_FUTURES_SYMBOLS = {
  'GC=F': 'طلا (کامکس)',
  'SI=F': 'نقره (کامکس)',
  'CL=F': 'نفت خام WTI',
  'BZ=F': 'نفت خام برنت',
  'HG=F': 'مس',
  'NG=F': 'گاز طبیعی',
}

const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }

/**
 * کندل روزانه یک نماد آتی پیوسته از Yahoo Finance chart API (رایگان، بدون کلید).
 * range: مثل '10y' برای بک‌فیل یا '5d' برای کرون روزانه.
 * تاریخ بر پایهٔ UTC ساعت timestamp — کافی برای بازارهای آمریکایی/جهانی (روز معاملاتی عوض نمی‌شود).
 */
async function fetchYahooCandles(symbol, range, { gregorianToShamsi } = {}) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`
  const data = await fetchJson(url, { timeout: 30_000, headers: YAHOO_HEADERS, retries: 2 })
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error(data?.chart?.error?.description ?? 'پاسخ Yahoo Finance خالی/نامعتبر است')
  const ts = result.timestamp ?? []
  const q = result.indicators?.quote?.[0] ?? {}
  const out = []
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i]
    if (close == null) continue // روز بدون معامله (تعطیلی بازار)
    const gregorian = new Date(ts[i] * 1000).toISOString().slice(0, 10)
    out.push({
      trade_date: gregorian,
      trade_date_shamsi: gregorianToShamsi ? gregorianToShamsi(gregorian) : null,
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close,
      volume: q.volume?.[i] ?? null,
    })
  }
  return out
}

async function upsertBatches(sb, table, rows, conflict, tag) {
  const BATCH = 500
  let ok = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await sb.from(table).upsert(batch, { onConflict: conflict })
    if (error) console.error(`[${tag}] خطا در batch ${table} #${i / BATCH + 1}:`, error.message)
    else ok += batch.length
  }
  return ok
}

module.exports = { GLOBAL_FUTURES_SYMBOLS, fetchYahooCandles, upsertBatches }
