// جمع‌بندی خودکار فارسی وضعیت تکنیکال — کاملاً rule-based، بدون LLM
// هر عدد مستقیم از کندل‌ها محاسبه می‌شود؛ چیزی اختراع نمی‌شود.

import { sma, rsi, macd, bollinger, type Candle } from './indicators'

export type SummaryTone = 'pos' | 'neg' | 'mid'
export type SummaryItem = { text: string; tone: SummaryTone }
export type TechnicalSummary = {
  bias: SummaryTone
  posCount: number
  negCount: number
  items: SummaryItem[]
}

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const pct = (v: number, d = 1) => `${fa(Math.abs(v), d)}٪`

export function buildTechnicalSummary(candles: Candle[]): TechnicalSummary | null {
  const n = candles.length
  if (n < 60) return null

  const closes = candles.map(c => c.close)
  const vols = candles.map(c => c.volume)
  const last = closes[n - 1]
  const items: SummaryItem[] = []

  // ── روند و میانگین‌ها
  const s50 = sma(closes, 50)
  const s200 = sma(closes, 200)
  const s50v = s50[n - 1]
  const s200v = s200[n - 1]
  if (s50v !== null) {
    const dist50 = ((last - s50v) / s50v) * 100
    if (s200v !== null) {
      if (last > s50v && s50v > s200v) {
        items.push({ text: `روند بلندمدت صعودی است — قیمت بالای میانگین ۵۰ روزه و میانگین ۵۰ بالای ۲۰۰ روزه قرار دارد`, tone: 'pos' })
      } else if (last < s50v && s50v < s200v) {
        items.push({ text: `روند بلندمدت نزولی است — قیمت زیر میانگین ۵۰ روزه و میانگین ۵۰ زیر ۲۰۰ روزه قرار دارد`, tone: 'neg' })
      } else {
        items.push({ text: `روند بلندمدت خنثی است — آرایش میانگین‌های ۵۰ و ۲۰۰ روزه هم‌جهت نیست`, tone: 'mid' })
      }
    }
    items.push({
      text: `قیمت ${pct(dist50)} ${dist50 >= 0 ? 'بالاتر' : 'پایین‌تر'} از میانگین ۵۰ روزه است`,
      tone: Math.abs(dist50) < 3 ? 'mid' : dist50 > 0 ? 'pos' : 'neg',
    })

    // کراس طلایی/مرگ در ۵ کندل اخیر
    if (s200v !== null) {
      for (let i = Math.max(1, n - 5); i < n; i++) {
        if (s50[i] === null || s200[i] === null || s50[i - 1] === null || s200[i - 1] === null) continue
        if ((s50[i] as number) > (s200[i] as number) && (s50[i - 1] as number) <= (s200[i - 1] as number)) {
          items.push({ text: `کراس طلایی (عبور میانگین ۵۰ از روی ۲۰۰) به‌تازگی شکل گرفته است`, tone: 'pos' })
          break
        }
        if ((s50[i] as number) < (s200[i] as number) && (s50[i - 1] as number) >= (s200[i - 1] as number)) {
          items.push({ text: `کراس مرگ (سقوط میانگین ۵۰ زیر ۲۰۰) به‌تازگی شکل گرفته است`, tone: 'neg' })
          break
        }
      }
    }
  }

  // ── RSI
  const r = rsi(closes)
  const rv = r[n - 1]
  if (rv !== null) {
    items.push({
      text: rv >= 70
        ? `RSI در ${fa(rv, 1)} است — محدوده اشباع خرید`
        : rv <= 30
          ? `RSI در ${fa(rv, 1)} است — محدوده اشباع فروش`
          : `RSI در ${fa(rv, 1)} است — محدوده خنثی`,
      tone: rv >= 70 ? 'neg' : rv <= 30 ? 'pos' : 'mid',
    })
  }

  // ── MACD
  const m = macd(closes)
  const hist = m.map(x => x.hist)
  const hv = hist[n - 1]
  if (hv !== null) {
    let crossed: SummaryItem | null = null
    for (let i = Math.max(1, n - 3); i < n; i++) {
      if (hist[i] === null || hist[i - 1] === null) continue
      if ((hist[i] as number) > 0 && (hist[i - 1] as number) <= 0) {
        crossed = { text: `هیستوگرام مکدی به‌تازگی مثبت شده — تقاطع صعودی خط مکدی و سیگنال`, tone: 'pos' }
      } else if ((hist[i] as number) < 0 && (hist[i - 1] as number) >= 0) {
        crossed = { text: `هیستوگرام مکدی به‌تازگی منفی شده — تقاطع نزولی خط مکدی و سیگنال`, tone: 'neg' }
      }
    }
    items.push(crossed ?? {
      text: `هیستوگرام مکدی ${hv >= 0 ? 'مثبت' : 'منفی'} است`,
      tone: hv >= 0 ? 'pos' : 'neg',
    })
  }

  // ── بولینگر
  const bb = bollinger(closes)
  const bu = bb[n - 1].upper
  const bl = bb[n - 1].lower
  if (bu !== null && bl !== null) {
    if (last > bu) items.push({ text: `قیمت بالای باند بولینگر بسته شده — نوسان از سمت سقف باند`, tone: 'mid' })
    else if (last < bl) items.push({ text: `قیمت زیر باند بولینگر بسته شده — نوسان از سمت کف باند`, tone: 'mid' })
  }

  // ── سقف/کف ۵۲ هفته
  const win = closes.slice(-252, -1)
  if (win.length >= 100) {
    const hi = Math.max(...win)
    const lo = Math.min(...win)
    if (last > hi) {
      items.push({ text: `قیمت در سقف جدید ۵۲ هفته‌ای است`, tone: 'pos' })
    } else if (last >= hi * 0.95) {
      items.push({ text: `قیمت ${pct(((hi - last) / hi) * 100)} تا سقف ۵۲ هفته‌ای فاصله دارد`, tone: 'mid' })
    }
    if (last < lo) {
      items.push({ text: `قیمت در کف جدید ۵۲ هفته‌ای است`, tone: 'neg' })
    } else if (last <= lo * 1.05) {
      items.push({ text: `قیمت تنها ${pct(((last - lo) / lo) * 100)} بالاتر از کف ۵۲ هفته‌ای است`, tone: 'mid' })
    }
  }

  // ── حجم
  if (n >= 21) {
    const avg20 = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20
    if (avg20 > 0) {
      const ratio = vols[n - 1] / avg20
      if (ratio >= 2.5) items.push({ text: `حجم آخرین روز ${fa(ratio, 1)} برابر میانگین ۲۰ روزه است — ورود پول قابل توجه`, tone: 'mid' })
      else if (ratio <= 0.4) items.push({ text: `حجم آخرین روز تنها ${fa(ratio * 100, 0)}٪ میانگین ۲۰ روزه است — معاملات کم‌رمق`, tone: 'mid' })
    }
  }

  // ── بازده‌ها
  if (n > 66) {
    const m1 = ((last - closes[n - 23]) / closes[n - 23]) * 100
    const m3 = ((last - closes[n - 67]) / closes[n - 67]) * 100
    items.push({
      text: `بازده یک ماه اخیر ${m1 >= 0 ? '+' : '−'}${pct(m1)} و سه ماه اخیر ${m3 >= 0 ? '+' : '−'}${pct(m3)} بوده است`,
      tone: m1 >= 0 && m3 >= 0 ? 'pos' : m1 < 0 && m3 < 0 ? 'neg' : 'mid',
    })
  }

  const posCount = items.filter(i => i.tone === 'pos').length
  const negCount = items.filter(i => i.tone === 'neg').length
  const bias: SummaryTone = posCount > negCount ? 'pos' : negCount > posCount ? 'neg' : 'mid'

  return { bias, posCount, negCount, items }
}
