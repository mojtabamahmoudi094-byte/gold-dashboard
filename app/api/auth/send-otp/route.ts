import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin as sb } from '../../../../lib/supabaseAdmin'
import { sendOtpSms } from '../../../../lib/smsIr'
import { publicEnv } from '../../../../lib/env'
import { rateLimit } from '../../../../lib/rateLimit'
import { clientIp } from '../../../../lib/clientIp'

export const dynamic = 'force-dynamic'

const PHONE_RE = /^09\d{9}$/
const CODE_TTL_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 5 * 60 * 1000
const MAX_PER_DAY = 5

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
  // سقف per-IP تا مهاجم نتواند با ساختن اکانت‌های متعدد از یک IP، پیامک‌بمباران کند
  if (!rateLimit(`send-otp:${clientIp(req)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'تعداد درخواست‌ها زیاد است. کمی صبر کنید' }, { status: 429 })
  }

  const userId = await requireUser(req)
  if (!userId) {
    return NextResponse.json({ error: 'ابتدا وارد حساب کاربری شوید' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const phone = body?.phone as string | undefined

  if (!phone || !PHONE_RE.test(phone)) {
    return NextResponse.json({ error: 'شماره موبایل نامعتبر است' }, { status: 400 })
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // cooldown و سقف روزانه هم per-account و هم per-phone بررسی می‌شوند:
  // شماره مقصد به اکانت گره نخورده، پس چک صرفاً per-user اجازه می‌داد مهاجم با
  // اکانت‌های تازه به یک شماره‌ی قربانی بی‌نهایت پیامک بزند.
  const [{ data: recentUser }, { data: recentPhone }] = await Promise.all([
    sb.from('otp_verifications').select('created_at').eq('user_id', userId)
      .gte('created_at', since).order('created_at', { ascending: false }),
    sb.from('otp_verifications').select('created_at').eq('phone', phone)
      .gte('created_at', since).order('created_at', { ascending: false }),
  ])

  const now = Date.now()
  for (const recent of [recentUser, recentPhone]) {
    if (recent && recent.length > 0) {
      const lastSentMs = new Date(recent[0].created_at).getTime()
      if (now - lastSentMs < RESEND_COOLDOWN_MS) {
        return NextResponse.json({ error: 'لطفاً کمی صبر کنید و دوباره تلاش کنید' }, { status: 429 })
      }
      if (recent.length >= MAX_PER_DAY) {
        return NextResponse.json({ error: 'تعداد درخواست کد امروز به سقف رسیده است' }, { status: 429 })
      }
    }
  }

  const code = String(crypto.randomInt(100000, 999999))

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
