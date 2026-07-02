import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    return NextResponse.json({ ok: false, error: 'Telegram env vars not set' }, { status: 500 })
  }

  let body: { signal_type?: string; date?: string; confidence?: number; note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { signal_type, date, confidence, note } = body
  if (!signal_type) {
    return NextResponse.json({ ok: false, error: 'signal_type required' }, { status: 400 })
  }

  const emoji = signal_type === 'خرید' ? '🟢' : signal_type === 'فروش' ? '🔴' : '🔵'
  const confPct = confidence !== undefined ? `${Math.round(confidence)}٪` : '—'

  const text = [
    `${emoji} سیگنال جدید — بورسنج`,
    '',
    `📊 نوع: ${signal_type}`,
    date ? `📅 تاریخ: ${date}` : null,
    `💯 اطمینان: ${confPct}`,
    note ? `📝 دلیل: ${note}` : null,
    '',
    'bourssanj.ir',
  ].filter(Boolean).join('\n')

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    const data = await res.json() as { ok: boolean; description?: string }
    if (!data.ok) {
      console.error('[telegram-notify] Telegram error:', data.description)
      return NextResponse.json({ ok: false, error: data.description }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[telegram-notify] fetch error:', e)
    return NextResponse.json({ ok: false, error: 'Network error' }, { status: 502 })
  }
}
