import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '../../../lib/rateLimit'
import { publicEnv } from '../../../lib/env'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const AI_API = 'https://newbot.dadashchekhabare.qzz.io/ai/ask'
const MAX_QUESTION_LEN = 1000
const LIMIT = 12
const WINDOW_MS = 60_000

// اختیاری: اگر کاربر لاگین است user_id را برمی‌گرداند، وگرنه null (چت بدون لاگین هم کار می‌کند)
async function resolveUserId(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const anon = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user.id
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  if (!rateLimit(`chat:${ip}`, LIMIT, WINDOW_MS)) {
    return NextResponse.json({ error: 'تعداد درخواست‌ها زیاد است، کمی صبر کنید.' }, { status: 429 })
  }

  let body: { question?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const question = (body.question || '').trim().slice(0, MAX_QUESTION_LEN)
  if (!question) {
    return NextResponse.json({ error: 'سوال خالی است.' }, { status: 400 })
  }

  const userId = await resolveUserId(req)

  try {
    const upstream = await fetch(AI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await upstream.json()

    // لاگ L1: best-effort، شکست لاگ نباید جواب کاربر را خراب کند
    if (upstream.ok) {
      supabaseAdmin.from('assistant_qa_log').insert({
        user_id: userId,
        question,
        answer: data.answer ?? null,
        symbol: data.symbol ?? null,
        has_stock_data: !!data.hasStockData,
        sources: data.sources ?? null,
      }).then(({ error }) => {
        if (error) console.error('[chat] ثبت لاگ سوال/جواب شکست خورد:', error.message)
      })
    }

    return NextResponse.json(data, { status: upstream.status })
  } catch {
    return NextResponse.json({ error: 'ارتباط با دستیار برقرار نشد.' }, { status: 502 })
  }
}
