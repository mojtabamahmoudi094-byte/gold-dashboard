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

  const [viewsToday, users] = await Promise.all([
    sb.from('page_views').select('id', { count: 'exact', head: true }).gte('created_at', startOfToday.toISOString()),
    sb.auth.admin.listUsers({ perPage: 1000 }),
  ])

  return NextResponse.json({
    viewsToday: viewsToday.count ?? 0,
    usersCount: users.data?.users?.length ?? 0,
  })
}
