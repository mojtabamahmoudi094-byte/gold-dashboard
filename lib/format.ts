/**
 * توابع مشترک قالب‌بندی اعداد فارسی — به‌جای تعریف تکراری در هر صفحه.
 * دو نسخه‌ی fmtVal قدیمی رفتار متفاوتی داشتند؛ هر دو با نام جدا نگه داشته شده‌اند.
 */

export const safe = (v: any) => Number(v || 0)

/** عدد ساده با حداکثر ۱ رقم اعشار — نسخه‌ی dashboard/compare/fund */
export const fmtNum = (v: any) =>
  safe(v).toLocaleString('fa-IR', { maximumFractionDigits: 1 })

/** فشرده تا ۵ رقم معنادار — نسخه‌ی صفحه اصلی و funds/[cat] */
export const fmtCompact = (v: any) => {
  const n = safe(v)
  if (n === 0) return '—'
  const len = String(Math.floor(n)).length
  if (len <= 5) return n.toLocaleString('fa-IR', { maximumFractionDigits: 0 })
  const div = Math.pow(10, len - 5)
  return Math.round(n / div).toLocaleString('fa-IR', { maximumFractionDigits: 0 })
}

/** درصد با علامت + برای مقادیر مثبت */
export const fmtPct = (n: number | null, decimals = 2) => {
  if (n == null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toLocaleString('fa-IR', { maximumFractionDigits: decimals })}٪`
}

/** تاریخ شمسی امروز به وقت تهران — قبلاً در چند صفحه جدا تعریف می‌شد */
export const todayShamsi = () =>
  new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' })
    .format(new Date())
