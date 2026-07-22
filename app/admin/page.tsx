'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { todayShamsi } from '../../lib/format'
import { darkTheme as t } from '../../lib/theme'
// supabase used only for auth (login/session), NOT for data queries (those go via /api/*)

const fa = (n: number) => n.toLocaleString('fa-IR')

const BRSAPI_URL = `/api/brs-proxy?endpoint=ime-fund`

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
      fetch(`/api/brs-proxy?endpoint=gold-currency&section=${encodeURIComponent('gold,currency,cryptocurrency')}`, { cache: 'no-store' }),
      fetch(`/api/brs-proxy?endpoint=commodity`, { cache: 'no-store' }),
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
  type Stats = {
    usersCount: number
    signupsToday: number
    signups7d: number
    signups30d: number
    activeUsers7d: number
    viewsToday: number
    viewsYesterday: number
    views30d: number
    uniqueToday: number
    unique30d: number
    onlineNow: number
    viewsByDay: { date: string; count: number; visitors: number }[]
    signupsByDay: { date: string; count: number }[]
    topPages: { path: string; views: number; visitors: number }[]
    referrers: { host: string; count: number }[]
    devices: Record<string, number>
  }
  type AdminUser = { id: string; email: string; created_at: string; last_sign_in_at: string | null }
  const [stats, setStats]       = useState<Stats | null>(null)
  const [users, setUsers]       = useState<AdminUser[] | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    const s = session as { access_token: string }
    fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${s.access_token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
    fetch('/api/admin/users', { headers: { Authorization: `Bearer ${s.access_token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setUsers(d?.users ?? null))
  }, [session])

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
    <main className="min-h-screen flex items-center justify-center" style={{ background: t.bg }}>
      <div className="text-sm" style={{ color: t.muted }}>...</div>
    </main>
  )

  if (!session) return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: t.bg, color: t.text }} dir="rtl">
      <div className="p-8 rounded-3xl w-full max-w-md border" style={{ background: t.surface, borderColor: t.border }}>
        <h1 className="text-2xl font-bold text-center mb-8" style={{ color: t.textBright }}>ورود مدیر</h1>
        <div className="space-y-4">
          <input
            type="email"
            placeholder="ایمیل"
            aria-label="ایمیل"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            className="w-full p-3 rounded-xl outline-none focus:ring-2"
            style={{ background: t.inputBg, color: t.text, ['--tw-ring-color' as string]: t.brand }}
          />
          <input
            type="password"
            placeholder="رمز عبور"
            aria-label="رمز عبور"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            className="w-full p-3 rounded-xl outline-none focus:ring-2"
            style={{ background: t.inputBg, color: t.text, ['--tw-ring-color' as string]: t.brand }}
          />
          <button
            type="button"
            onClick={login}
            disabled={loading}
            className="w-full disabled:opacity-50 font-bold py-3 rounded-xl transition-opacity"
            style={{ background: `linear-gradient(135deg, ${t.brand}, ${t.brand2})`, color: '#fff' }}
          >
            {loading ? 'در حال ورود...' : 'ورود'}
          </button>
        </div>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen p-6" style={{ background: t.bg, color: t.text }} dir="rtl">
      <div className="max-w-2xl mx-auto">

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-xl font-bold" style={{ color: t.textBright }}>پنل مدیریت بورس سنج</h1>
          <button type="button" onClick={logout} className="text-sm transition-colors hover:opacity-80" style={{ color: t.muted }}>
            خروج
          </button>
        </div>

        {/* KPI cards — traffic */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {[
            {
              label: 'بازدید امروز',
              value: stats?.viewsToday,
              sub: stats && stats.viewsYesterday > 0
                ? `${stats.viewsToday >= stats.viewsYesterday ? '▲' : '▼'} دیروز: ${fa(stats.viewsYesterday)}`
                : null,
              subColor: stats && stats.viewsToday >= stats.viewsYesterday ? t.green : t.red,
            },
            { label: 'بازدیدکننده یکتای امروز', value: stats?.uniqueToday, sub: null, subColor: t.muted },
            {
              label: 'آنلاین همین حالا',
              value: stats?.onlineNow,
              sub: '۵ دقیقه اخیر',
              subColor: t.green,
            },
            {
              label: 'بازدید ۳۰ روز',
              value: stats?.views30d,
              sub: stats ? `${fa(stats.unique30d)} بازدیدکننده یکتا` : null,
              subColor: t.muted,
            },
          ].map(c => (
            <div key={c.label} className="rounded-2xl border p-4 md:p-5" style={{ background: t.surface, borderColor: t.border }}>
              <div className="text-xs md:text-sm mb-1" style={{ color: t.muted }}>{c.label}</div>
              <div className="text-2xl md:text-3xl font-bold" style={{ color: t.textBright }}>
                {c.value !== undefined ? fa(c.value as number) : '...'}
              </div>
              {c.sub && <div className="text-[11px] mt-1" style={{ color: c.subColor }}>{c.sub}</div>}
            </div>
          ))}
        </div>

        {/* KPI cards — users */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'کل کاربران', value: stats?.usersCount },
            { label: 'ثبت‌نام امروز', value: stats?.signupsToday },
            { label: 'ثبت‌نام ۷ روز اخیر', value: stats?.signups7d },
            { label: 'کاربران فعال ۷ روز', value: stats?.activeUsers7d },
          ].map(c => (
            <div key={c.label} className="rounded-2xl border p-4 md:p-5" style={{ background: t.surface, borderColor: t.border }}>
              <div className="text-xs md:text-sm mb-1" style={{ color: t.muted }}>{c.label}</div>
              <div className="text-2xl md:text-3xl font-bold" style={{ color: t.textBright }}>
                {c.value !== undefined ? fa(c.value as number) : '...'}
              </div>
            </div>
          ))}
        </div>

        {/* Daily views chart — 30 days */}
        {stats && (
          <div className="rounded-2xl border p-4 md:p-6 mb-4" style={{ background: t.surface, borderColor: t.border }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold" style={{ color: t.textBright }}>بازدید ۳۰ روز اخیر</h2>
              <div className="text-xs" style={{ color: t.muted }}>ستون = بازدید · عدد داخل تولتیپ</div>
            </div>
            <div className="flex items-end gap-[2px] md:gap-1" style={{ height: 120 }}>
              {stats.viewsByDay.map((d, i) => {
                const max = Math.max(1, ...stats.viewsByDay.map(x => x.count))
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.date} — ${fa(d.count)} بازدید، ${fa(d.visitors)} یکتا`}>
                    <div
                      className="w-full rounded-t-sm"
                      style={{
                        height: Math.max(3, (d.count / max) * 95),
                        background: i === stats.viewsByDay.length - 1
                          ? `linear-gradient(180deg, ${t.brand2}, ${t.brand})`
                          : `linear-gradient(180deg, ${t.brand}, ${t.brand}66)`,
                      }}
                    />
                    <div className="text-[9px] leading-none" style={{ color: t.muted }}>
                      {i % 5 === 0 || i === stats.viewsByDay.length - 1 ? d.date.slice(8) : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Signups chart — 30 days */}
        {stats && stats.signupsByDay.some(d => d.count > 0) && (
          <div className="rounded-2xl border p-4 md:p-6 mb-4" style={{ background: t.surface, borderColor: t.border }}>
            <h2 className="font-bold mb-4" style={{ color: t.textBright }}>ثبت‌نام ۳۰ روز اخیر</h2>
            <div className="flex items-end gap-[2px] md:gap-1" style={{ height: 80 }}>
              {stats.signupsByDay.map((d, i) => {
                const max = Math.max(1, ...stats.signupsByDay.map(x => x.count))
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.date} — ${fa(d.count)} ثبت‌نام`}>
                    <div
                      className="w-full rounded-t-sm"
                      style={{ height: Math.max(3, (d.count / max) * 60), background: t.green }}
                    />
                    <div className="text-[9px] leading-none" style={{ color: t.muted }}>
                      {i % 5 === 0 || i === stats.signupsByDay.length - 1 ? d.date.slice(8) : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Top pages + devices/referrers */}
        {stats && (
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="rounded-2xl border p-4 md:p-6" style={{ background: t.surface, borderColor: t.border }}>
              <h2 className="font-bold mb-4" style={{ color: t.textBright }}>صفحات پربازدید (۳۰ روز)</h2>
              {stats.topPages.length === 0 ? (
                <div className="text-sm" style={{ color: t.muted }}>داده‌ای نیست</div>
              ) : (
                <div className="space-y-2">
                  {stats.topPages.map(p => {
                    const max = Math.max(1, stats.topPages[0].views)
                    return (
                      <div key={p.path} className="text-sm">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono text-xs truncate" dir="ltr" style={{ color: t.text }}>{p.path}</span>
                          <span className="text-xs shrink-0" style={{ color: t.muted }}>
                            {fa(p.views)} بازدید · {fa(p.visitors)} یکتا
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: t.border }}>
                          <div className="h-full rounded-full" style={{ width: `${(p.views / max) * 100}%`, background: `linear-gradient(90deg, ${t.brand}, ${t.brand2})` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border p-4 md:p-6" style={{ background: t.surface, borderColor: t.border }}>
                <h2 className="font-bold mb-4" style={{ color: t.textBright }}>دستگاه‌ها</h2>
                {Object.keys(stats.devices).length === 0 ? (
                  <div className="text-sm" style={{ color: t.muted }}>داده‌ای هنوز ثبت نشده (از این نسخه به بعد جمع می‌شود)</div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(stats.devices).sort((a, b) => b[1] - a[1]).map(([dev, count]) => {
                      const total = Object.values(stats.devices).reduce((s, n) => s + n, 0)
                      const label = dev === 'mobile' ? 'موبایل' : dev === 'desktop' ? 'دسکتاپ' : dev === 'tablet' ? 'تبلت' : dev
                      return (
                        <div key={dev} className="flex items-center gap-3 text-sm">
                          <span className="w-16 shrink-0" style={{ color: t.text }}>{label}</span>
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: t.border }}>
                            <div className="h-full rounded-full" style={{ width: `${(count / total) * 100}%`, background: t.brand }} />
                          </div>
                          <span className="text-xs w-14 text-left shrink-0" style={{ color: t.muted }}>{fa(Math.round((count / total) * 100))}٪</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border p-4 md:p-6" style={{ background: t.surface, borderColor: t.border }}>
                <h2 className="font-bold mb-4" style={{ color: t.textBright }}>منبع ورود (رفرر خارجی)</h2>
                {stats.referrers.length === 0 ? (
                  <div className="text-sm" style={{ color: t.muted }}>داده‌ای هنوز ثبت نشده (از این نسخه به بعد جمع می‌شود)</div>
                ) : (
                  <div className="space-y-2">
                    {stats.referrers.map(r => (
                      <div key={r.host} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs truncate" dir="ltr" style={{ color: t.text }}>{r.host}</span>
                        <span className="text-xs shrink-0" style={{ color: t.muted }}>{fa(r.count)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Users table */}
        <div className="rounded-2xl border p-6 mb-4" style={{ background: t.surface, borderColor: t.border }}>
          <h2 className="font-bold mb-4" style={{ color: t.textBright }}>کاربران ثبت‌نامی ({users?.length ?? '...'})</h2>
          {users ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right" style={{ color: t.text }}>
                <thead>
                  <tr style={{ color: t.muted }}>
                    <th className="p-2 font-medium">ایمیل</th>
                    <th className="p-2 font-medium">آیدی</th>
                    <th className="p-2 font-medium">تاریخ ثبت‌نام</th>
                    <th className="p-2 font-medium">آخرین ورود</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-t" style={{ borderColor: t.border }}>
                      <td className="p-2">{u.email}</td>
                      <td className="p-2 font-mono text-xs" style={{ color: t.muted }}>{u.id}</td>
                      <td className="p-2">{new Date(u.created_at).toLocaleString('fa-IR')}</td>
                      <td className="p-2">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('fa-IR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm" style={{ color: t.muted }}>...</div>
          )}
        </div>

        {/* Sync card */}
        <div className="rounded-2xl border p-6 mb-4" style={{ background: t.surface, borderColor: t.border }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold mb-1" style={{ color: t.textBright }}>بروزرسانی صندوق‌های کالایی</h2>
              <p className="text-sm" style={{ color: t.muted }}>
                دریافت از BrsAPI و ذخیره در Supabase.
                باید از IP ایران اجرا شود.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setAutoSync(v => !v)}
                type="button"
                className="text-xs px-3 py-2 rounded-xl border transition-colors font-medium"
                style={autoSync
                  ? { background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)', color: t.green }
                  : { background: t.inputBg, borderColor: t.border, color: t.muted }}
              >
                {autoSync ? '⏱ خودکار روشن' : '⏱ خودکار'}
              </button>
              <button
                onClick={syncFunds}
                disabled={syncing}
                type="button"
                className="disabled:opacity-50 disabled:cursor-not-allowed font-bold px-5 py-2 rounded-xl text-sm transition-opacity"
                style={{ background: `linear-gradient(135deg, ${t.brand}, ${t.brand2})`, color: '#fff' }}
              >
                {syncing ? '⏳ در حال sync...' : 'Sync Now'}
              </button>
            </div>
          </div>
        </div>

        {/* Log output */}
        {log.length > 0 && (
          <div className="border rounded-2xl p-4 font-mono text-xs space-y-1 max-h-96 overflow-y-auto" style={{ background: t.bg, borderColor: t.border }}>
            {log.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.includes('❌') ? t.red :
                    line.includes('✅') ? t.green :
                    line.includes('⚠️') ? '#f59e0b' :
                    t.muted,
                }}
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
