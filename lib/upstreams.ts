// آدرس پایه‌ی سرویس‌های خارجی که از IP ایران بلاک هستند (گوگل/OpenRouter از سمت خودشان،
// تلگرام از سمت فیلترینگ). وقتی سایت روی سرور ایران میزبانی شود این envها به
// relay روی سرور آلمان (nginx) اشاره می‌کنند؛ بدون env همان مقصد اصلی است.
const strip = (u: string) => u.replace(/\/$/, '')

export const GEMINI_BASE = strip(process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com')
export const OPENROUTER_BASE = strip(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai')
export const TELEGRAM_BASE = strip(process.env.TELEGRAM_BASE_URL || 'https://api.telegram.org')
