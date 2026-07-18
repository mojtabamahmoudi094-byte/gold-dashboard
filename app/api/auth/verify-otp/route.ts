import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin as sb } from '../../../../lib/supabaseAdmin'
import { publicEnv } from '../../../../lib/env'

export const dynamic = 'force-dynamic'

const MAX_ATTEMPTS = 5

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

  const body = await req.json().catch(() => null)
  const phone = body?.phone as string | undefined
  const code = body?.code as string | undefined

  if (!phone || !code) {
    return NextResponse.json({ error: 'اطلاعات ناقص است' }, { status: 400 })
  }

  const { data: row, error } = await sb
    .from('otp_verifications')
    .select('id, code_hash, expires_at, attempts, verified_at')
    .eq('user_id', userId)
    .eq('phone', phone)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: 'کدی برای این شماره ارسال نشده است' }, { status: 400 })
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'کد تایید منقضی شده. کد جدید بگیرید' }, { status: 400 })
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'تعداد تلاش‌های مجاز تمام شده. کد جدید بگیرید' }, { status: 429 })
  }

  if (row.code_hash !== hashCode(code)) {
    await sb.from('otp_verifications').update({ attempts: row.attempts + 1 }).eq('id', row.id)
    return NextResponse.json({ error: 'کد تایید اشتباه است' }, { status: 400 })
  }

  await sb.from('otp_verifications').update({ verified_at: new Date().toISOString() }).eq('id', row.id)

  const { data: userRes } = await sb.auth.admin.getUserById(userId)
  const existingMeta = userRes?.user?.user_metadata ?? {}
  await sb.auth.admin.updateUserById(userId, {
    user_metadata: { ...existingMeta, phone_verified: true },
  })

  return NextResponse.json({ ok: true })
}
