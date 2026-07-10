import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rateLimit'

const AI_API = 'https://newbot.dadashchekhabare.qzz.io/ai/ask'
const MAX_QUESTION_LEN = 1000
const LIMIT = 12
const WINDOW_MS = 60_000

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

  try {
    const upstream = await fetch(AI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch {
    return NextResponse.json({ error: 'ارتباط با دستیار برقرار نشد.' }, { status: 502 })
  }
}
