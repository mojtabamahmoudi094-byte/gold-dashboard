// تعدیل قیمت برای رقیق‌شدگی ناشی از افزایش سرمایه — برای رویدادهایی که tsetmc خودش تعدیل نمی‌کند
// (مثل افزایش سرمایه از محل آورده نقدی/حق‌تقدم، برخلاف سهام جایزه که tsetmc با A=1 خودکار تعدیل می‌کند).
//
// روش: از تاریخچه فصلی سرمایه (کدال، ستون capital در stock_reports) جهش سرمایه پیدا می‌شود؛
// دقیق‌ترین تاریخ رویداد از خود کندل‌ها می‌آید (بازگشایی بعد از توقف طولانی، جهش قیمت واقعی) —
// چون تاریخ دقیق ثبت افزایش سرمایه در گزارش فصلی نیست، فقط سرمایه قبل/بعد.
// بدون تطابق داده کدال با شکاف واقعی معاملاتی، هیچ تعدیلی حدس زده نمی‌شود (ایمن‌تر از تعدیل غلط).

export type QuarterCapital = { period: string; capital: number | null }
export type CandleGap = { beforeDateShamsi: string; afterDateShamsi: string; beforeClose: number; afterClose: number }
export type DilutionEvent = { atDateShamsi: string; factor: number } // factor<1 — روی تاریخ‌های قبل از atDateShamsi ضرب می‌شود

const MIN_GAP_DAYS = 20          // کمتر از این، تعطیلی/آخر هفته عادی است نه توقف مجمع
const MIN_JUMP_RATIO = 1.02      // جهش سرمایه کمتر از ۲٪ گرد‌کردن گزارش‌دهی است، رویداد واقعی نیست

// شکاف‌های معاملاتی بزرگ (توقف طولانی، معمولاً مجمع/افزایش سرمایه) را در کندل‌های پیوسته یک نماد پیدا می‌کند
export function findTradingGaps(
  rows: { trade_date: string; trade_date_shamsi: string; close: number }[]
): CandleGap[] {
  const gaps: CandleGap[] = []
  for (let i = 1; i < rows.length; i++) {
    const days = (new Date(rows[i].trade_date).getTime() - new Date(rows[i - 1].trade_date).getTime()) / 86_400_000
    if (days >= MIN_GAP_DAYS) {
      gaps.push({
        beforeDateShamsi: rows[i - 1].trade_date_shamsi, afterDateShamsi: rows[i].trade_date_shamsi,
        beforeClose: rows[i - 1].close, afterClose: rows[i].close,
      })
    }
  }
  return gaps
}

// برای هر شکاف معاملاتی، اگر سرمایه فصلی کدال قبل/بعد آن رویداد واقعاً جهش کرده باشد، ضریب تعدیل می‌سازد.
// اگر گزارش فصلی تازه‌ای که سرمایه جدید را نشان دهد هنوز منتشر نشده (تأخیر معمول کدال)، رویدادی برنمی‌گردد —
// حدس‌زدن تعدیل بدون مدرک، ریسک نمایش بازده غلط دارد.
export function detectDilutionEvents(gaps: CandleGap[], quarters: QuarterCapital[]): DilutionEvent[] {
  const sortedQ = quarters
    .filter(q => q.capital != null && q.capital > 0 && q.period)
    .slice()
    .sort((a, b) => (a.period < b.period ? -1 : 1))
  if (sortedQ.length === 0) return []

  const events: DilutionEvent[] = []
  for (const gap of gaps) {
    const before = [...sortedQ].reverse().find(q => q.period <= gap.beforeDateShamsi)
    const after = sortedQ.find(q => q.period >= gap.afterDateShamsi)
    if (!before || !after || !before.capital || !after.capital) continue
    if (after.capital > before.capital * MIN_JUMP_RATIO) {
      events.push({ atDateShamsi: gap.afterDateShamsi, factor: before.capital / after.capital })
    }
  }
  return events
}

// قیمت خام یک تاریخ را با رویدادهای شناسایی‌شده تعدیل می‌کند (تجمعی برای چند رویداد پشت‌سرهم)
export function applyDilution(dateShamsi: string, rawPrice: number, events: DilutionEvent[]): number {
  let price = rawPrice
  for (const ev of events) {
    if (dateShamsi < ev.atDateShamsi) price *= ev.factor
  }
  return price
}
