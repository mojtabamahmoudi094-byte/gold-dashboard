import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../lib/auth'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    return NextResponse.json({ ok: false, error: 'Telegram env vars not set' }, { status: 500 })
  }

  let body: {
    signal_type?: string; date?: string; confidence?: number; note?: string
    gold_funds?: string[]
    silver_signal?: string | null; silver_confidence?: number | null; silver_funds?: string[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { signal_type, date, confidence, note, gold_funds, silver_signal, silver_confidence, silver_funds } = body
  if (!signal_type) {
    return NextResponse.json({ ok: false, error: 'signal_type required' }, { status: 400 })
  }

  const sigEmoji = (t: string) => t === 'خرید' || t === 'تمایل خرید' ? '🟢' : t === 'فروش' || t === 'احتیاط' ? '🔴' : '🔵'
  const confPct = confidence !== undefined ? `${Math.round(confidence)}٪` : '—'

  const lines: (string | null)[] = [
    `${sigEmoji(signal_type)} سیگنال جدید — بورس سنج`,
    '',
    `🥇 بازار طلا: ${signal_type} (اطمینان ${confPct})`,
    date ? `📅 تاریخ: ${date}` : null,
    note ? `📝 دلیل: ${note}` : null,
  ]

  if (gold_funds?.length) {
    lines.push('', '🏆 صندوق‌های طلای پیشنهادی:')
    gold_funds.forEach((f, i) => lines.push(`  ${i + 1}. ${f}`))
  }

  if (silver_signal) {
    lines.push('', `${sigEmoji(silver_signal)} 🥈 بازار نقره: ${silver_signal}${silver_confidence != null ? ` (اطمینان ${Math.round(silver_confidence)}٪)` : ''}`)
    if (silver_funds?.length) {
      lines.push('🏆 صندوق‌های نقره پیشنهادی:')
      silver_funds.forEach((f, i) => lines.push(`  ${i + 1}. ${f}`))
    }
  }

  lines.push('', 'bourssanj.ir')
  const text = lines.filter(l => l !== null).join('\n')

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
