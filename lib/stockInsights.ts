// تحلیل قاعده‌محور گزارش‌های کدال (ماهانه + فصلی) — مشترک بین app/stock/[symbol] و app/signals
// این ماژول از app/stock/[symbol]/page.tsx استخراج شده تا صفحه سیگنال‌ها هم بتواند
// همان منطق را برای تولید سیگنال خرید/فروش سهام استفاده کند.

export type RProduct = {
  name: string; unit: string | null
  prod_m: number | null; qty_m: number | null; rate_m: number | null
  amount_m: number | null; amount_cum: number | null
}
// یک شرکت در پرتفوی هلدینگ (میلیون ریال) — dq/dc/dmv = تغییرات طی ماه (خرید مثبت، فروش منفی)
export type RHolding = {
  name: string
  q0: number | null; c0: number | null; mv0: number | null
  dq: number | null; dc: number | null; dmv: number | null
  own: number | null; c1: number | null; mv1: number | null
}
// سه فرم گزارش ماهانه کدال: تولیدی (محصولات)، پرتفوی (شرکت سرمایه‌گذاری)، بانک (اجزای درآمد)
export type MonthKind = 'production' | 'portfolio' | 'bank'
export type RMonth = {
  period: string; publish: string | null
  kind?: MonthKind
  // تولیدی و بانک
  month?: number | null; cum?: number | null; lastYearCum?: number | null
  products?: RProduct[]
  // بانک
  expenses?: RProduct[]; expense_m?: number | null; expense_cum?: number | null
  // شرکت سرمایه‌گذاری / هلدینگ
  holdings?: RHolding[]; totalCost?: number | null; totalMv?: number | null; gain?: number | null
}
export type RQuarter = {
  period: string; months: number; audited: boolean; consolidated: boolean; publish: string | null
  revenue: number | null; revenue_ly: number | null
  cogs: number | null; gross: number | null; gross_ly: number | null
  sga: number | null; op: number | null; fin_cost: number | null
  net: number | null; net_ly: number | null
  eps: number | null; capital: number | null
}
export type Reports = { symbol: string; updated: string; months: RMonth[]; quarters: RQuarter[] }

export type Tone = 'pos' | 'neg' | 'neutral'
export type Insight = { tone: Tone; text: string }

const MONTH_NAMES = ['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
export const monthLabel = (period: string) => {
  const m = period.match(/^(\d{4})\/(\d{2})/)
  return m ? `${MONTH_NAMES[Number(m[2])]} ${Number(m[1]).toLocaleString('fa-IR', { useGrouping: false })}` : period
}

export const growth = (cur: number | null | undefined, prev: number | null | undefined) =>
  cur == null || prev == null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100

// تحلیل قاعده‌محور از گزارش‌های هر سهم — همراه با score خام برای رتبه‌بندی/سیگنال
export function buildInsights(months: RMonth[], quarters: RQuarter[]): { verdict: Insight; items: Insight[]; score: number } {
  const items: Insight[] = []
  const fa0 = (v: number) => Math.abs(v).toLocaleString('fa-IR', { maximumFractionDigits: 0 })
  let score = 0

  const kind: MonthKind = months[months.length - 1]?.kind ?? 'production'

  // ── شرکت سرمایه‌گذاری / هلدینگ: پرتفوی سهام ──
  if (kind === 'portfolio' && months.length >= 1) {
    const last = months[months.length - 1]
    const prev = months.length > 1 ? months[months.length - 2] : null
    const navChg = prev ? growth(last.totalMv, prev.totalMv) : null
    if (navChg !== null) {
      items.push({ tone: navChg >= 0 ? 'pos' : 'neg', text: `ارزش بازار پرتفوی در ${monthLabel(last.period)} نسبت به ماه قبل ${navChg >= 0 ? 'رشد' : 'افت'} ${fa0(navChg)}٪ داشته است.` })
      score += navChg >= 0 ? 1 : -1
    }
    if (last.totalCost && last.gain != null) {
      const gp = (last.gain / last.totalCost) * 100
      items.push({ tone: gp >= 0 ? 'pos' : 'neg', text: `سود تحقق‌نیافته پرتفوی ${fa0(gp)}٪ بهای تمام‌شده است.` })
    }
    const hs = last.holdings ?? []
    const buys = hs.filter(h => (h.dq ?? 0) > 0).sort((a, b) => (b.dc ?? 0) - (a.dc ?? 0))
    const sells = hs.filter(h => (h.dq ?? 0) < 0).sort((a, b) => (a.dc ?? 0) - (b.dc ?? 0))
    if (buys.length) items.push({ tone: 'neutral', text: `طی ماه در ${buys.length.toLocaleString('fa-IR')} شرکت خرید انجام شده؛ بیشترین: «${buys[0].name}».` })
    if (sells.length) items.push({ tone: 'neutral', text: `طی ماه در ${sells.length.toLocaleString('fa-IR')} شرکت فروش انجام شده؛ بیشترین: «${sells[0].name}».` })
    if (hs.length) items.push({ tone: 'neutral', text: `پرتفوی بورسی شامل ${hs.length.toLocaleString('fa-IR')} شرکت است.` })
  }

  // ── تولیدی و بانک: فروش/درآمد ماهانه ──
  if (kind !== 'portfolio' && months.length >= 2) {
    const noun = kind === 'bank' ? 'درآمد' : 'فروش'
    const last = months[months.length - 1], prev = months[months.length - 2]
    const mom = growth(last.month, prev.month)
    const yoy = growth(last.cum, last.lastYearCum)
    if (mom !== null) {
      items.push({ tone: mom >= 0 ? 'pos' : 'neg', text: `${noun} ${monthLabel(last.period)} نسبت به ماه قبل ${mom >= 0 ? 'رشد' : 'افت'} ${fa0(mom)}٪ داشته است.` })
      score += mom >= 0 ? 1 : -1
    }
    if (yoy !== null) {
      items.push({ tone: yoy >= 0 ? 'pos' : 'neg', text: `${noun} تجمعی سال مالی نسبت به دوره مشابه سال قبل ${yoy >= 0 ? '+' : '−'}${fa0(yoy)}٪ تغییر کرده است.` })
      score += yoy >= 0 ? 1 : -1
    }
    // روند نرخ فروش محصول اصلی (بانک‌ها نرخ ندارند)
    const mainP = (last.products ?? []).filter(p => (p.amount_m ?? 0) > 0 && (p.rate_m ?? 0) > 0).sort((a, b) => (b.amount_m ?? 0) - (a.amount_m ?? 0))[0]
    if (mainP) {
      const ser = months.map(m => (m.products ?? []).find(x => x.name === mainP.name)?.rate_m ?? null).filter((v): v is number => v !== null && v > 0)
      if (ser.length >= 2) {
        const g = growth(ser[ser.length - 1], ser[0])
        if (g !== null && Math.abs(g) >= 1) {
          items.push({ tone: g >= 0 ? 'pos' : 'neg', text: `نرخ فروش «${mainP.name}» طی دوره ${g >= 0 ? 'صعودی' : 'نزولی'} بوده و ${g >= 0 ? '+' : '−'}${fa0(g)}٪ تغییر کرده است.` })
          score += g >= 0 ? 1 : -1
        }
      }
    }
  }

  if (quarters.length >= 1) {
    const q = quarters[quarters.length - 1]
    const nm = q.revenue ? ((q.net ?? 0) / q.revenue) * 100 : null
    const netYoy = growth(q.net, q.net_ly)
    if (netYoy !== null) {
      items.push({ tone: netYoy >= 0 ? 'pos' : 'neg', text: `سود خالص آخرین دوره نسبت به دوره مشابه سال قبل ${netYoy >= 0 ? 'رشد' : 'افت'} ${fa0(netYoy)}٪ داشته است.` })
      score += netYoy >= 0 ? 1 : -1
    }
    if (nm !== null) {
      items.push({ tone: nm >= 25 ? 'pos' : nm >= 0 ? 'neutral' : 'neg', text: `حاشیه سود خالص آخرین دوره ${fa0(nm)}٪ بوده است${nm >= 30 ? ' که سطح بالایی است' : nm < 10 ? ' که پایین است' : ''}.` })
    }
    // روند حاشیه نسبت به دوره هم‌طول قبلی
    const prevSame = [...quarters].reverse().find(x => x.months === q.months && x.period < q.period)
    if (prevSame && prevSame.revenue && q.revenue && nm !== null) {
      const pnm = ((prevSame.net ?? 0) / prevSame.revenue) * 100
      const d = nm - pnm
      if (Math.abs(d) >= 1) {
        items.push({ tone: d >= 0 ? 'pos' : 'neg', text: `حاشیه سود خالص نسبت به دوره ${q.months.toLocaleString('fa-IR')} ماهه قبلی ${d >= 0 ? 'بهبود' : 'کاهش'} ${fa0(d)} واحد درصدی داشته است.` })
        score += d >= 0 ? 1 : -1
      }
    }
  }

  const verdict: Insight =
    score >= 2 ? { tone: 'pos', text: 'مجموع سیگنال‌های گزارش‌های اخیر مثبت است؛ روند فروش و سودآوری رو به بهبود بوده.' }
    : score <= -2 ? { tone: 'neg', text: 'مجموع سیگنال‌های گزارش‌های اخیر منفی است؛ فشار بر فروش یا سودآوری دیده می‌شود.' }
    : { tone: 'neutral', text: 'سیگنال‌های گزارش‌های اخیر متعادل است؛ روند مشخصی غالب نیست.' }

  return { verdict, items, score }
}

// سیگنال خرید/فروش سهام برای صفحه سیگنال‌های بازار — هم‌شکل با موتورهای دیگر (طلا/نقره/بورسی)
export function computeStockSignal(months: RMonth[], quarters: RQuarter[]) {
  const { items, score } = buildInsights(months, quarters)
  if (items.length === 0) return null
  const reasons = items.map(it => ({ text: it.text, dir: (it.tone === 'pos' ? 'pos' : it.tone === 'neg' ? 'neg' : 'neu') as 'pos' | 'neg' | 'neu' }))

  let type: string, color: string, confidence: number
  if (score >= 3) { type = 'خرید'; color = '#10B981'; confidence = Math.min(85, Math.round(50 + score * 7)) }
  else if (score <= -3) { type = 'فروش'; color = '#EF4444'; confidence = Math.min(85, Math.round(50 + Math.abs(score) * 7)) }
  else if (score >= 1) { type = 'تمایل خرید'; color = '#3BB07A'; confidence = Math.round(40 + score * 6) }
  else if (score <= -1) { type = 'احتیاط'; color = '#F59E0B'; confidence = Math.round(40 + Math.abs(score) * 6) }
  else { type = 'نگه‌داری'; color = '#00C8FF'; confidence = Math.round(45 + Math.abs(score) * 4) }

  return { type, color, confidence, score, reasons }
}
