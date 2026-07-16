import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin as sb } from '../../../../lib/supabaseAdmin'
import { publicEnv } from '../../../../lib/env'

export const dynamic = 'force-dynamic'

const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000

function hashCode(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

async function requireUser(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const anon = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user.id
}

export async function POST(req: Request) {
  const userId = await requireUser(req)
  if (!userId) {
    return NextResponse.json({ error: 'ابتدا وارد حساب کاربری شوید' }, { status: 401 })
  }

  const since = new Date(Date.now() - RESEND_COOLDOWN_MS).toISOString()
  const { data: recent } = await sb
    .from('telegram_link_codes')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)

  if (recent && recent.length > 0) {
    return NextResponse.json({ error: 'لطفاً کمی صبر کنید و دوباره تلاش کنید' }, { status: 429 })
  }

  const code = String(crypto.randomInt(100000, 999999))

  const { error: insertErr } = await sb.from('telegram_link_codes').insert({
    user_id: userId,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  })
  if (insertErr) {
    return NextResponse.json({ error: 'خطا در ثبت کد اتصال' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, code, expiresInSec: CODE_TTL_MS / 1000 })
}

export async function GET(req: Request) {
  const userId = await requireUser(req)
  if (!userId) {
    return NextResponse.json({ error: 'ابتدا وارد حساب کاربری شوید' }, { status: 401 })
  }

  const { data: link } = await sb
    .from('telegram_links')
    .select('telegram_username, linked_at')
    .eq('user_id', userId)
    .maybeSingle()

  return NextResponse.json({ linked: !!link, username: link?.telegram_username ?? null, linkedAt: link?.linked_at ?? null })
}

export async function DELETE(req: Request) {
  const userId = await requireUser(req)
  if (!userId) {
    return NextResponse.json({ error: 'ابتدا وارد حساب کاربری شوید' }, { status: 401 })
  }

  const { error } = await sb.from('telegram_links').delete().eq('user_id', userId)
  if (error) {
    return NextResponse.json({ error: 'خطا در قطع اتصال' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
