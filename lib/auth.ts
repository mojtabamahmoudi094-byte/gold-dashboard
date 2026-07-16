import { createClient } from '@supabase/supabase-js'
import { publicEnv, getSupabaseServiceKey } from './env'

/** Verifies the Supabase session JWT sent as `Authorization: Bearer <token>`
 *  AND that the user is listed in public.admins.
 *  Returns the authenticated admin's user id, or null if missing/invalid/not-admin. */
export async function requireAdmin(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null

  const sb = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) return null

  const admin = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, getSupabaseServiceKey())
  const { data: row } = await admin.from('admins').select('id').eq('id', data.user.id).maybeSingle()
  if (!row) return null

  return data.user.id
}
