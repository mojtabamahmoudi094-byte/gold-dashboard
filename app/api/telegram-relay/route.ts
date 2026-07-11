import { NextRequest, NextResponse } from 'next/server'

// رله تلگرام برای سرور ایران — api.telegram.org از داخل ایران فیلتر است،
// ولی سرور ایران به این سایت (خارج از ایران) می‌رسد و این سایت به تلگرام.
// احراز: فرستنده باید خودِ توکن ربات را بفرستد (همان رازی که هر دو طرف دارند)؛
// هیچ env جدیدی لازم نیست و توکن غریبه هم پذیرفته نمی‌شود.

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    return NextResponse.json({ ok: false, error: 'Telegram env vars not set' }, { status: 500 })
  }

  let body: { token?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.token !== token) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }
  const text = (body.text || '').trim().slice(0, 4096)
  if (!text) {
    return NextResponse.json({ ok: false, error: 'text required' }, { status: 400 })
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    const data = await res.json()
    if (!data.ok) {
      return NextResponse.json({ ok: false, error: data.description || 'sendMessage failed' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, message_id: data.result?.message_id })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }, { status: 502 })
  }
}
