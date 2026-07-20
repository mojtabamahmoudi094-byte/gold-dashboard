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

/** ریال → همت (هزار میلیارد تومان)، برای ارزش معاملات صندوق‌های کالایی */
export const fmtHomat = (v: any, decimals = 2) => {
  const n = safe(v) / 1e13
  if (n === 0) return '۰'
  return n.toLocaleString('fa-IR', { maximumFractionDigits: decimals })
}

/** درصد با علامت + برای مقادیر مثبت */
export const fmtPct = (n: number | null, decimals = 2) => {
  if (n == null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toLocaleString('fa-IR', { maximumFractionDigits: decimals })}٪`
}

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد', 'میلیون میلیارد']

const threeDigitsToWords = (n: number): string => {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const rest = n % 100
  if (h) parts.push(HUNDREDS[h])
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10])
  else {
    const t = Math.floor(rest / 10)
    const o = rest % 10
    if (t) parts.push(TENS[t])
    if (o) parts.push(ONES[o])
  }
  return parts.join(' و ')
}

/** عدد صحیح به حروف فارسی (مثلاً برای «مبلغ به حروف») */
export const toPersianWords = (v: any): string => {
  let n = Math.floor(Math.abs(safe(v)))
  if (n === 0) return 'صفر'
  const groups: number[] = []
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000) }
  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue
    const words = threeDigitsToWords(groups[i])
    parts.push(SCALES[i] ? `${words} ${SCALES[i]}` : words)
  }
  return parts.join(' و ')
}

/** تاریخ شمسی امروز به وقت تهران — قبلاً در چند صفحه جدا تعریف می‌شد */
export const todayShamsi = () =>
  new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' })
    .format(new Date())
