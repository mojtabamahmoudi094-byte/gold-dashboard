import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '../../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../../lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const sevenDaysAgo = new Date(startOfToday)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)

  const [viewsToday, users, recentViews] = await Promise.all([
    sb.from('page_views').select('id', { count: 'exact', head: true }).gte('created_at', startOfToday.toISOString()),
    sb.auth.admin.listUsers({ perPage: 1000 }),
    sb.from('page_views').select('created_at').gte('created_at', sevenDaysAgo.toISOString()),
  ])

  const dayKey = (iso: string) => iso.slice(0, 10)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sevenDaysAgo)
    d.setDate(d.getDate() + i)
    return d.toISOString().slice(0, 10)
  })

  const viewsByDay: Record<string, number> = Object.fromEntries(last7Days.map(d => [d, 0]))
  for (const row of recentViews.data ?? []) {
    const k = dayKey(row.created_at)
    if (k in viewsByDay) viewsByDay[k]++
  }

  const signupsByDay: Record<string, number> = Object.fromEntries(last7Days.map(d => [d, 0]))
  for (const u of users.data?.users ?? []) {
    const k = dayKey(u.created_at)
    if (k in signupsByDay) signupsByDay[k]++
  }

  return NextResponse.json({
    viewsToday: viewsToday.count ?? 0,
    usersCount: users.data?.users?.length ?? 0,
    viewsByDay: last7Days.map(d => ({ date: d, count: viewsByDay[d] })),
    signupsByDay: last7Days.map(d => ({ date: d, count: signupsByDay[d] })),
  })
}
