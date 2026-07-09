'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { todayShamsi } from '../../lib/format'
// supabase used only for auth (login/session), NOT for data queries (those go via /api/*)

const BRSAPI_KEY = 'BYQlFNWUXNFWNHvNnuCETT5TdJKn3WDj'
const BRSAPI_URL = `https://api.brsapi.ir/IME/Fund.php?key=${BRSAPI_KEY}`

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
  // ── Step 1: fetch fund data from BrsAPI (browser, Iranian IP) ────────────
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

  // ── Step 2: fetch assets list via server route (Render → Supabase) ───────
  addLog('دریافت لیست صندوق‌ها از سرور...')
  const assetsRes = await fetch('/api/funds', { cache: 'no-store' })
  if (!assetsRes.ok) { addLog('❌ دریافت assets از سرور شکست'); return }
  const { assets } = await assetsRes.json() as { assets: { id: number; slug: string; name: string }[] }
  if (!assets?.length) { addLog('❌ assets خالی'); return }

  const isinMap: Record<string, number> = {}
  assets.forEach((a: { id: number; slug: string }) => { isinMap[a.slug] = a.id })
  addLog(`${assets.length} صندوق در assets یافت شد`)

  const date = todayShamsi()
  addLog(`تاریخ شمسی: ${date}`)

  // ── Step 3: map API items to rows ─────────────────────────────────────────
  const rows: Record<string, unknown>[] = []
  const unmatched: string[] = []

  for (const item of items) {
    let assetId: number | undefined
    for (const val of Object.values(item)) {
      if (typeof val === 'string' && isinMap[val]) {
        assetId = isinMap[val]
        break
      }
    }
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
      price_close:       pickNum(item, 'pf', 'pc', 'close_price', 'final_price', 'price_close'),
      price_last:        pickNum(item, 'pl', 'last_price', 'price_last', 'last'),
      price_change_pct:  pickNum(item, 'pcp', 'change_percent', 'price_change_pct', 'pct_change'),
      trade_value:       pickNum(item, 'tval', 'trade_value', 'value', 'turnover') ?? 0,
      volume:            pickNum(item, 'tvol', 'volume', 'trade_volume', 'qty'),
      market_value:      pickNum(item, 'mv', 'market_cap', 'market_value', 'bvol'),
      buy_i_volume:      pickNum(item, 'Buy_I_Volume', 'buy_individual_volume', 'buy_i_volume'),
      sell_i_volume:     pickNum(item, 'Sell_I_Volume', 'sell_individual_volume', 'sell_i_volume'),
      buy_count_i:       pickNum(item, 'Buy_CountI', 'buy_individual_count', 'buy_count_i'),
      sell_count_i:      pickNum(item, 'Sell_CountI', 'sell_individual_count', 'sell_count_i'),
    })
  }

  if (unmatched.length > 0) addLog(`⚠️ ${unmatched.length} نماد match نشد: ${unmatched.slice(0, 6).join(', ')}`)
  if (rows.length === 0) { addLog('❌ هیچ ردیفی match نشد — ISIN در API پیدا نشد'); return }
  addLog(`${rows.length} ردیف آماده برای ارسال به سرور`)

  // ── Step 4: fetch gold cache data (browser, Iranian IP) ──────────────────
  addLog('دریافت قیمت طلا و ارز از BrsAPI...')
  let goldCache: { raw_pro: unknown; raw_commodity: unknown } | undefined
  try {
    const [proRes, commodRes] = await Promise.all([
      fetch(`https://Api.BrsApi.ir/Market/Gold_Currency_Pro.php?key=${BRSAPI_KEY}&section=gold,currency,cryptocurrency`, { cache: 'no-store' }),
      fetch(`https://api.brsapi.ir/Market/Commodity.php?key=${BRSAPI_KEY}`, { cache: 'no-store' }),
    ])
    if (proRes.ok && commodRes.ok) {
      goldCache = { raw_pro: await proRes.json(), raw_commodity: await commodRes.json() }
      addLog('قیمت طلا دریافت شد')
    } else {
      addLog(`⚠️ قیمت طلا HTTP ${proRes.status}/${commodRes.status}`)
    }
  } catch (e: unknown) {
    addLog(`⚠️ قیمت طلا دریافت نشد: ${(e as Error).message}`)
  }

  // ── Step 5: POST everything to server route (Render → Supabase) ──────────
  addLog('ارسال به سرور برای ذخیره در دیتابیس...')
  const { data: { session } } = await supabase.auth.getSession()
  const saveRes = await fetch('/api/save-funds', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ rows, date, goldCache }),
  })
  const result = await saveRes.json()
  if (!saveRes.ok) {
    addLog(`❌ خطای سرور: ${result.error}`)
    return
  }
  if (result.errors?.length) {
    result.errors.forEach((e: string) => addLog(`⚠️ ${e}`))
  }
  addLog(`✅ ${result.inserted}/${result.total} رکورد ذخیره شد (${date})`)
  if (goldCache) addLog('✅ قیمت طلا و ارز هم ذخیره شد')
}

export default function AdminPage() {
  const [session, setSession]   = useState<unknown>(null)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [log, setLog]           = useState<string[]>([])
  const [autoSync, setAutoSync] = useState(false)
  const syncingRef              = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    syncingRef.current = syncing
  }, [syncing])

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
    if (syncingRef.current) return
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

  useEffect(() => {
    if (!autoSync || !session) return
    addLog('⏱ بروزرسانی خودکار هر ۱۵ دقیقه فعال شد')
    const id = setInterval(() => {
      addLog('⏱ بروزرسانی خودکار...')
      syncFunds()
    }, 15 * 60 * 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync, session])

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
          <h1 className="text-xl font-bold text-white">پنل مدیریت بورس سنج</h1>
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
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setAutoSync(v => !v)}
                type="button"
                className={`text-xs px-3 py-2 rounded-xl border transition-colors font-medium ${
                  autoSync
                    ? 'bg-green-500/20 border-green-500/50 text-green-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {autoSync ? '⏱ خودکار روشن' : '⏱ خودکار'}
              </button>
              <button
                onClick={syncFunds}
                disabled={syncing}
                type="button"
                className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-5 py-2 rounded-xl text-sm transition-colors"
              >
                {syncing ? '⏳ در حال sync...' : 'Sync Now'}
              </button>
            </div>
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
