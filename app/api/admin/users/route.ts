import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '../../../../lib/supabaseAdmin'
import { requireAdmin } from '../../../../lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = data.users
    .map(u => ({
      id: u.id,
      email: u.email ?? '',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  return NextResponse.json({ users })
}
