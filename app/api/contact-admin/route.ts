import { NextRequest, NextResponse } from 'next/server'
import { TELEGRAM_BASE } from '../../../lib/upstreams'
import { rateLimit } from '../../../lib/rateLimit'
import { clientIp } from '../../../lib/clientIp'

// پیام کاربر به مدیر — ارسال خودکار به ایمیل (formsubmit.co، بدون نیاز به API key)
// + یک کپی به تلگرام اگر بات تنظیم شده باشد

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'mojtabamahmoudi093@gmail.com'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  if (!rateLimit(`contact-admin:${ip}`, 5, 60_000)) {
    return NextResponse.json({ ok: false, error: 'تعداد درخواست‌ها زیاد است' }, { status: 429 })
  }

  let body: { name?: string; email?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const name = (body.name || '').trim().slice(0, 100)
  const email = (body.email || '').trim().slice(0, 150)
  const message = (body.message || '').trim().slice(0, 3000)

  if (!message) {
    return NextResponse.json({ ok: false, error: 'message required' }, { status: 400 })
  }

  let emailOk = false
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${ADMIN_EMAIL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // formsubmit بدون Origin/Referer درخواست را رد می‌کند (خطای «web server»)
        Origin: 'https://bourssanj.ir',
        Referer: 'https://bourssanj.ir/',
      },
      body: JSON.stringify({
        _subject: `📩 پیام جدید از سایت بورس سنج${name ? ` — ${name}` : ''}`,
        _template: 'box',
        // با _replyto جوابِ ایمیل مستقیم به فرستنده می‌رود
        ...(email ? { _replyto: email } : {}),
        name: name || 'بدون نام',
        email: email || 'ذکر نشده',
        message,
      }),
    })
    const data = await res.json() as { success?: string | boolean }
    emailOk = data.success === 'true' || data.success === true
    if (!emailOk) console.error('[contact-admin] formsubmit response:', data)
  } catch (e) {
    console.error('[contact-admin] email error:', e)
  }

  // کپی تلگرام — اختیاری، شکستش ارسال را خراب نمی‌کند
  let telegramOk = false
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (token && chatId) {
    try {
      const text = [
        '📩 پیام جدید از سایت — بورس سنج',
        '',
        `👤 نام: ${name || 'بدون نام'}`,
        `📧 ایمیل: ${email || 'ذکر نشده'}`,
        '',
        `💬 پیام:`,
        message,
        '',
        'bourssanj.ir',
      ].join('\n')
      const res = await fetch(`${TELEGRAM_BASE}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(10_000),
      })
      const data = await res.json() as { ok: boolean }
      telegramOk = data.ok
    } catch (e) {
      console.error('[contact-admin] telegram error:', e)
    }
  }

  if (!emailOk && !telegramOk) {
    return NextResponse.json({ ok: false, error: 'delivery failed' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, email: emailOk, telegram: telegramOk })
}
