import { NextRequest, NextResponse } from 'next/server'

// رله تلگرام برای بات پورتفوی شخصی — مشابه app/api/telegram-relay (کدال هم مثل تلگرام از IP
// غیرایرانی بلاک نیست ولی دلیل رله اینجا فرق دارد: codal-portfolio-notify.js روی سرور ایران
// (که به codal.ir دسترسی دارد) اجرا می‌شود و می‌خواهد به chat_id های مختلف کاربران پیام بدهد؛
// توکن این بات (TELEGRAM_PORTFOLIO_BOT_TOKEN) جدا از بات محتوایی (telegram-relay) است.
// احراز: فرستنده باید خودِ توکن بات را بفرستد — همان رازی که هر دو طرف دارند.

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_PORTFOLIO_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ ok: false, error: 'TELEGRAM_PORTFOLIO_BOT_TOKEN not set' }, { status: 500 })
  }

  let body: { token?: string; text?: string; chat_id?: string | number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.token !== token) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const chatId = String(body.chat_id || '')
  if (!/^-?\d+$/.test(chatId)) {
    return NextResponse.json({ ok: false, error: 'chat_id required' }, { status: 400 })
  }

  const text = (body.text || '').trim().slice(0, 4096)
  if (!text) {
    return NextResponse.json({ ok: false, error: 'text required' }, { status: 400 })
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
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
