'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const BRSAPI_KEY = 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const BRSAPI_URL = `https://api.brsapi.ir/IME/Fund.php?key=${BRSAPI_KEY}`

function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_no = 365 * gy + Math.floor((gy + 3) / 4) - Math.floor((gy + 99) / 100) + Math.floor((gy + 399) / 400)
  const g_days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (gy % 4 === 0 && (gy % 100 !== 0 || gy % 400 === 0)) g_days[2] = 29
  let g_d_no2 = g_d_no
  for (let i = 1; i < gm; i++) g_d_no2 += g_days[i]
  g_d_no2 += gd - 1
  let j_d_no = g_d_no2 - 79
  const j_np = Math.floor(j_d_no / 12053)
  j_d_no %= 12053
  let jy = 979 + 33 * j_np + 4 * Math.floor(j_d_no / 1461)
  j_d_no %= 1461
  if (j_d_no >= 366) {
    jy += Math.floor((j_d_no - 1) / 365)
    j_d_no = (j_d_no - 1) % 365
  }
  const j_days = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29]
  let jm = 0
  for (; jm < 11; jm++) {
    if (j_d_no < j_days[jm]) break
    j_d_no -= j_days[jm]
  }
  return [jy, jm + 1, j_d_no + 1]
}

function todayShamsi(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }))
  const [y, m, d] = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v !== '') return v
    if (typeof v === 'number') return String(v)
  }
  return null
}

function pickNum(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v)
      if (!isNaN(n)) return n
    }
  }
  return null
}

async function runSync(addLog: (msg: string) => void): Promise<void> {
  addLog('دریافت داده از BrsAPI...')
  const res = await fetch(BRSAPI_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.json()

  const items: Record<string, unknown>[] = Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.fund) ? raw.fund
    : Array.isArray(raw) ? raw
    : (Object.values(raw || {}).find(Array.isArray) as Record<string, unknown>[] | undefined) ?? []

  addLog(`${items.length} رکورد از API`)
  if (items.length === 0) { addLog('❌ پاسخ خالی'); return }
  if (items[0]) addLog(`کلیدهای API: ${Object.keys(items[0]).join(', ')}`)

  const { data: assets, error: assetErr } = await supabase
    .from('assets').select('id, slug, name').neq('slug', 'gold')
  if (assetErr || !assets?.length) { addLog('❌ assets خالی یا خطا'); return }

  const isinMap: Record<string, number> = {}
  assets.forEach((a: { id: number; slug: string; name: string }) => { isinMap[a.slug] = a.id })
  addLog(`${assets.length} صندوق در assets یافت شد`)

  const date = todayShamsi()
  addLog(`تاریخ شمسی: ${date}`)

  const rows: Record<string, unknown>[] = []
  const unmatched: string[] = []

  for (const item of items) {
    // روش اول: اسکن تمام مقادیر string برای پیدا کردن ISIN در isinMap
    let assetId: number | undefined
    for (const val of Object.values(item)) {
      if (typeof val === 'string' && isinMap[val]) {
        assetId = isinMap[val]
        break
      }
    }
    // روش دوم: کلیدهای شناخته‌شده ISIN
    if (!assetId) {
      const isin = pickStr(item, 'nsc_code', 'isin', 'ins_code', 'fund_id', 'id')
      if (isin && isinMap[isin]) assetId = isinMap[isin]
    }

    if (!assetId) {
      unmatched.push(pickStr(item, 'nsc_code', 'symbol', 'l18', 'name') ?? '?')
      continue
    }

    const dateFromApi = pickStr(item, 'date_shamsi', 'trade_date', 'jdate', 'j_date', 'date')
    rows.push({
      asset_id:          assetId,
      trade_date_shamsi: dateFromApi || date,
      price_close:       pickNum(item, 'close_price', 'final_price', 'price_close', 'close', 'pc', 'pf'),
      price_last:        pickNum(item, 'last_price', 'price_last', 'last', 'pl'),
      price_change_pct:  pickNum(item, 'change_percent', 'price_change_pct', 'pct_change', 'pcp', 'change_pct'),
      trade_value:       pickNum(item, 'trade_value', 'value', 'turnover', 'trade_val', 'tv') ?? 0,
      volume:            pickNum(item, 'volume', 'trade_volume', 'qty', 'quantity', 'vol'),
      market_value:      pickNum(item, 'market_cap', 'market_value', 'mkt_cap', 'bvol'),
      buy_i_volume:      pickNum(item, 'buy_individual_volume', 'buy_i_volume', 'i_buy_vol', 'real_buy_vol'),
      sell_i_volume:     pickNum(item, 'sell_individual_volume', 'sell_i_volume', 'i_sell_vol', 'real_sell_vol'),
      buy_count_i:       pickNum(item, 'buy_individual_count', 'buy_count_i', 'i_buy_count', 'real_buy_count'),
      sell_count_i:      pickNum(item, 'sell_individual_count', 'sell_count_i', 'i_sell_count', 'real_sell_count'),
    })
  }

  if (unmatched.length > 0) addLog(`⚠️ ${unmatched.length} نماد match نشد: ${unmatched.slice(0, 6).join(', ')}`)
  if (rows.length === 0) { addLog('❌ هیچ ردیفی match نشد — ISIN در API پیدا نشد'); return }
  addLog(`${rows.length} ردیف آماده برای درج`)

  const assetIds = [...new Set(rows.map(r => r.asset_id as number))]
  const { error: delErr } = await supabase.from('gold_funds')
    .delete().eq('trade_date_shamsi', date).in('asset_id', assetIds)
  if (delErr) addLog(`⚠️ حذف: ${delErr.message}`)
  else addLog(`داده قدیمی ${date} پاک شد`)

  const BATCH = 20
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error: insErr } = await supabase.from('gold_funds').insert(rows.slice(i, i + BATCH))
    if (insErr) addLog(`❌ دسته ${Math.floor(i / BATCH) + 1}: ${insErr.message}`)
    else inserted += Math.min(BATCH, rows.length - i)
  }

  addLog(`✅ ${inserted}/${rows.length} رکورد ذخیره شد (${date})`)

  // ── sync gold prices → Supabase (for gold-analysis fallback) ──────────────
  addLog('دریافت قیمت طلا و ارز از BrsAPI...')
  try {
    const [proRes, commodRes] = await Promise.all([
      fetch(`https://Api.BrsApi.ir/Market/Gold_Currency_Pro.php?key=${BRSAPI_KEY}&section=gold,currency,cryptocurrency`, { cache: 'no-store' }),
      fetch(`https://api.brsapi.ir/Market/Commodity.php?key=${BRSAPI_KEY}`, { cache: 'no-store' }),
    ])
    if (!proRes.ok || !commodRes.ok) throw new Error(`HTTP ${proRes.status}/${commodRes.status}`)
    const raw_pro       = await proRes.json()
    const raw_commodity = await commodRes.json()

    // delete old cache row + insert fresh
    await supabase.from('signals').delete().eq('signal_type', '_gold_cache')
    const { error: cErr } = await supabase.from('signals').insert({
      signal_type:        '_gold_cache',
      signal_date_shamsi: date,
      market_value:       0,
      note:               JSON.stringify({ raw_pro, raw_commodity }),
    })
    if (cErr) addLog(`⚠️ ذخیره قیمت طلا: ${cErr.message}`)
    else addLog('✅ قیمت طلا و ارز هم ذخیره شد')
  } catch (e: unknown) {
    addLog(`⚠️ قیمت طلا دریافت نشد: ${(e as Error).message}`)
  }
}

export default function AdminPage() {
  const [session, setSession]   = useState<unknown>(null)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [log, setLog]           = useState<string[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  const addLog = (msg: string) =>
    setLog(prev => [`[${new Date().toLocaleTimeString('fa-IR')}] ${msg}`, ...prev])

  const login = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) alert(error.message)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setLog([])
  }

  const syncFunds = async () => {
    setSyncing(true)
    setLog([])
    try {
      await runSync(addLog)
    } catch (e: unknown) {
      addLog(`❌ خطا: ${(e as Error).message}`)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-slate-500 text-sm">...</div>
    </main>
  )

  if (!session) return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center" dir="rtl">
      <div className="bg-slate-900 p-8 rounded-3xl w-full max-w-md border border-slate-800">
        <h1 className="text-2xl font-bold text-center mb-8">ورود مدیر</h1>
        <div className="space-y-4">
          <input
            type="email"
            placeholder="ایمیل"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            className="w-full bg-slate-800 p-3 rounded-xl outline-none focus:ring-2 focus:ring-yellow-500"
          />
          <input
            type="password"
            placeholder="رمز عبور"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            className="w-full bg-slate-800 p-3 rounded-xl outline-none focus:ring-2 focus:ring-yellow-500"
          />
          <button
            type="button"
            onClick={login}
            disabled={loading}
            className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold py-3 rounded-xl transition-colors"
          >
            {loading ? 'در حال ورود...' : 'ورود'}
          </button>
        </div>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6" dir="rtl">
      <div className="max-w-2xl mx-auto">

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-xl font-bold text-white">پنل مدیریت بورسنج</h1>
          <button type="button" onClick={logout} className="text-slate-500 hover:text-white text-sm transition-colors">
            خروج
          </button>
        </div>

        {/* Sync card */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-white mb-1">بروزرسانی صندوق‌های کالایی</h2>
              <p className="text-slate-400 text-sm">
                دریافت از BrsAPI و ذخیره در Supabase.
                باید از IP ایران اجرا شود.
              </p>
            </div>
            <button
              onClick={syncFunds}
              disabled={syncing}
              type="button"
              className="shrink-0 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-5 py-2 rounded-xl text-sm transition-colors"
            >
              {syncing ? '⏳ در حال sync...' : 'Sync Now'}
            </button>
          </div>
        </div>

        {/* Log output */}
        {log.length > 0 && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs space-y-1 max-h-96 overflow-y-auto">
            {log.map((line, i) => (
              <div
                key={i}
                className={
                  line.includes('❌') ? 'text-red-400' :
                  line.includes('✅') ? 'text-green-400' :
                  line.includes('⚠️') ? 'text-yellow-400' :
                  'text-slate-400'
                }
              >
                {line}
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  )
}
