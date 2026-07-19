#!/usr/bin/env node
/**
 * پست تبلیغاتی روزانه معرفی امکانات بورس سنج به کانال — برای بک‌لینک/بازدید SEO
 * Daily feature-promo post to the channel — for SEO backlink/traffic push
 *
 * اجرا | Usage:
 *   node scripts/telegram-daily-promo.js
 *
 * متغیرهای محیطی لازم | Required env (روی سرور | on the server):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID (یا TELEGRAM_CHAT_ID)
 * اختیاری | Optional:
 *   SITE_URL   (پیش‌فرض | default: https://bourssanj.ir)
 */

const SITE = (process.env.SITE_URL || 'https://bourssanj.ir').replace(/\/$/, '')
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID

const TEXT = `<b>بورس سنج، دستیار تحلیل بورس شما 📈</b>

قیمت لحظه‌ای نمادهای بورس تهران، رصد صندوق‌های طلا و نقره و زعفران (با تشخیص حباب/تخفیف نسبت به NAV)، و تحلیل بنیادی خودکار هر نماد بر اساس گزارش‌های کدال (رشد فروش ماهانه، سود خالص، حاشیه سود) همه در یک جا.

امکانات دیگر بورس سنج:
🔹 اسکرینر تکنیکال + ابزار بک‌تست استراتژی
🔹 سیگنال خرید/فروش با صفحه‌ی کارنامه‌ی عملکرد تاریخی
🔹 نمودار کندل‌استیک ۳ ساله برای نمادها و شاخص‌ها
🔹 پیگیری پرتفوی با هشدار لحظه‌ای در ربات تلگرام (@bsportfo_bot) برای معاملات بزرگ و کوتاه‌شدن صف

همه‌چیز رایگان و در دسترس، همین حالا امتحان کنید 👇
🔗 ${SITE}

<i>این محتوا صرفاً جنبه اطلاع‌رسانی دارد و توصیه سرمایه‌گذاری نیست.</i>`

// api.telegram.org از داخل ایران فیلتر است — اول مستقیم، بعد از راه رلهٔ سایت (خارج از ایران)
async function sendMessage() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: TEXT, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(15_000),
    })
    const data = await res.json()
    if (data.ok) return
    throw new Error(data.description || 'sendMessage failed')
  } catch (e) {
    console.error(`[promo] ارسال مستقیم ناموفق (${e.message}) — تلاش از راه رله`)
  }

  const res = await fetch(`${SITE}/api/telegram-relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, chat_id: CHAT_ID, text: TEXT, parse_mode: 'HTML' }),
    signal: AbortSignal.timeout(90_000), // کلد-استارت Render
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error || `relay HTTP ${res.status}`)
}

async function main() {
  if (!TOKEN || !CHAT_ID) {
    console.error('❌ TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID تنظیم نشده')
    process.exit(1)
  }
  await sendMessage()
  console.log('✅ پست تبلیغاتی روزانه ارسال شد')
}

main().catch(e => {
  console.error('❌ خطا:', e.message)
  process.exit(1)
})
