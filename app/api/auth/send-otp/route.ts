import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin as sb } from '../../../../lib/supabaseAdmin'
import { sendOtpSms } from '../../../../lib/smsIr'

export const dynamic = 'force-dynamic'

const PHONE_RE = /^09\d{9}$/
const CODE_TTL_MS = 2 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_PER_DAY = 5

function hashCode(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const userId = body?.userId as string | undefined
  const phone = body?.phone as string | undefined

  if (!userId || !phone || !PHONE_RE.test(phone)) {
    return NextResponse.json({ error: 'شماره موبایل نامعتبر است' }, { status: 400 })
  }

  const { data: userRes, error: userErr } = await sb.auth.admin.getUserById(userId)
  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await sb
    .from('otp_verifications')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (recent && recent.length > 0) {
    const lastSentMs = new Date(recent[0].created_at).getTime()
    if (Date.now() - lastSentMs < RESEND_COOLDOWN_MS) {
      return NextResponse.json({ error: 'لطفاً کمی صبر کنید و دوباره تلاش کنید' }, { status: 429 })
    }
    if (recent.length >= MAX_PER_DAY) {
      return NextResponse.json({ error: 'تعداد درخواست کد امروز به سقف رسیده است' }, { status: 429 })
    }
  }

  const code = String(crypto.randomInt(10000, 99999))

  try {
    await sendOtpSms(phone, code)
  } catch (e) {
    return NextResponse.json({ error: 'ارسال پیامک ناموفق بود. دوباره تلاش کنید' }, { status: 502 })
  }

  const { error: insertErr } = await sb.from('otp_verifications').insert({
    user_id: userId,
    phone,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  })
  if (insertErr) {
    return NextResponse.json({ error: 'خطا در ثبت کد تایید' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
