import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '../../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../../lib/auth'

export const dynamic = 'force-dynamic'

type ViewRow = {
  created_at: string
  path: string | null
  visitor_id: string | null
  referrer: string | null
  device: string | null
}

// PostgREST caps a single select at 1000 rows — paginate to fetch the full window
async function fetchViews(sinceIso: string): Promise<ViewRow[]> {
  const rows: ViewRow[] = []
  const PAGE = 1000
  for (let page = 0; page < 50; page++) {
    const { data, error } = await sb
      .from('page_views')
      .select('created_at, path, visitor_id, referrer, device')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error || !data) break
    rows.push(...(data as ViewRow[]))
    if (data.length < PAGE) break
  }
  return rows
}

async function fetchAllUsers() {
  const users = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data?.users?.length) break
    users.push(...data.users)
    if (data.users.length < 1000) break
  }
  return users
}

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const daysBack = 30
  const windowStart = new Date(startOfToday)
  windowStart.setDate(windowStart.getDate() - (daysBack - 1))

  const [views, users] = await Promise.all([
    fetchViews(windowStart.toISOString()),
    fetchAllUsers(),
  ])

  const dayKey = (iso: string) => {
    const d = new Date(iso)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 10)
  }
  const days = Array.from({ length: daysBack }, (_, i) => {
    const d = new Date(windowStart)
    d.setDate(d.getDate() + i)
    return dayKey(d.toISOString())
  })

  // ── daily series: views + unique visitors ─────────────────────────────────
  const viewsPerDay: Record<string, number> = Object.fromEntries(days.map(d => [d, 0]))
  const visitorsPerDay: Record<string, Set<string>> = Object.fromEntries(days.map(d => [d, new Set<string>()]))
  const signupsPerDay: Record<string, number> = Object.fromEntries(days.map(d => [d, 0]))

  const todayIso = startOfToday.toISOString()
  const yesterdayIso = startOfYesterday.toISOString()
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()

  let viewsToday = 0
  let viewsYesterday = 0
  const uniqueToday = new Set<string>()
  const unique30d = new Set<string>()
  const onlineNow = new Set<string>()
  const pathViews: Record<string, number> = {}
  const pathVisitors: Record<string, Set<string>> = {}
  const referrerCounts: Record<string, number> = {}
  const deviceCounts: Record<string, number> = {}

  for (const v of views) {
    const k = dayKey(v.created_at)
    if (k in viewsPerDay) viewsPerDay[k]++
    const vid = v.visitor_id
    if (vid) {
      if (k in visitorsPerDay) visitorsPerDay[k].add(vid)
      unique30d.add(vid)
    }
    if (v.created_at >= todayIso) {
      viewsToday++
      if (vid) uniqueToday.add(vid)
    } else if (v.created_at >= yesterdayIso) {
      viewsYesterday++
    }
    if (v.created_at >= fiveMinAgo && vid) onlineNow.add(vid)
    const p = v.path || '/'
    pathViews[p] = (pathViews[p] ?? 0) + 1
    if (vid) (pathVisitors[p] ??= new Set()).add(vid)
    if (v.referrer) referrerCounts[v.referrer] = (referrerCounts[v.referrer] ?? 0) + 1
    if (v.device) deviceCounts[v.device] = (deviceCounts[v.device] ?? 0) + 1
  }

  // ── users ─────────────────────────────────────────────────────────────────
  const sevenDaysAgoIso = new Date(startOfToday.getTime() - 6 * 86400_000).toISOString()
  const thirtyDaysAgoIso = windowStart.toISOString()
  let signupsToday = 0
  let signups7d = 0
  let signups30d = 0
  let activeUsers7d = 0
  for (const u of users) {
    const k = dayKey(u.created_at)
    if (k in signupsPerDay) signupsPerDay[k]++
    if (u.created_at >= todayIso) signupsToday++
    if (u.created_at >= sevenDaysAgoIso) signups7d++
    if (u.created_at >= thirtyDaysAgoIso) signups30d++
    if (u.last_sign_in_at && u.last_sign_in_at >= sevenDaysAgoIso) activeUsers7d++
  }

  const topPages = Object.entries(pathViews)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([path, count]) => ({ path, views: count, visitors: pathVisitors[path]?.size ?? 0 }))

  const referrers = Object.entries(referrerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([host, count]) => ({ host, count }))

  return NextResponse.json({
    usersCount: users.length,
    signupsToday,
    signups7d,
    signups30d,
    activeUsers7d,
    viewsToday,
    viewsYesterday,
    views30d: views.length,
    uniqueToday: uniqueToday.size,
    unique30d: unique30d.size,
    onlineNow: onlineNow.size,
    viewsByDay: days.map(d => ({ date: d, count: viewsPerDay[d], visitors: visitorsPerDay[d].size })),
    signupsByDay: days.map(d => ({ date: d, count: signupsPerDay[d] })),
    topPages,
    referrers,
    devices: deviceCounts,
  })
}
