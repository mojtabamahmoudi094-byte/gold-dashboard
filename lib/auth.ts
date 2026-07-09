import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Verifies the Supabase session JWT sent as `Authorization: Bearer <token>`.
 *  Returns the authenticated user id, or null if missing/invalid. */
export async function requireAdmin(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null

  const sb = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user.id
}
