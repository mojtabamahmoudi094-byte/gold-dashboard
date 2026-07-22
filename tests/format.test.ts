import { describe, it, expect } from 'vitest'
import { safe, fmtCompact, fmtHomat, fmtPct, toPersianWords, todayShamsi } from '../lib/format'
import { faNorm, faNormTight, nameMatchScore, bestNameMatch } from '../lib/faNorm'

describe('safe', () => {
  it('null/undefined/NaN-string → 0', () => {
    expect(safe(null)).toBe(0)
    expect(safe(undefined)).toBe(0)
    expect(safe('')).toBe(0)
    expect(safe('12.5')).toBe(12.5)
  })
})

describe('fmtCompact', () => {
  it('صفر → خط تیره', () => expect(fmtCompact(0)).toBe('—'))
  it('≤۵ رقم دست‌نخورده (ارقام فارسی)', () => {
    expect(fmtCompact(12345)).toBe((12345).toLocaleString('fa-IR', { maximumFractionDigits: 0 }))
  })
  it('>۵ رقم به ۵ رقم معنادار گرد می‌شود', () => {
    // 1234567 → len=7 → div=100 → 12346
    expect(fmtCompact(1234567)).toBe((12346).toLocaleString('fa-IR', { maximumFractionDigits: 0 }))
  })
})

describe('fmtHomat', () => {
  it('ریال → همت (÷1e13)', () => {
    expect(fmtHomat(2.5e13)).toBe((2.5).toLocaleString('fa-IR', { maximumFractionDigits: 2 }))
    expect(fmtHomat(0)).toBe('۰')
  })
})

describe('fmtPct', () => {
  it('مثبت با +، منفی بدون، null → —', () => {
    expect(fmtPct(3.14)).toContain('+')
    expect(fmtPct(-2)).not.toContain('+')
    expect(fmtPct(null)).toBe('—')
  })
})

describe('toPersianWords', () => {
  it('اعداد مرجع', () => {
    expect(toPersianWords(0)).toBe('صفر')
    expect(toPersianWords(7)).toBe('هفت')
    expect(toPersianWords(15)).toBe('پانزده')
    expect(toPersianWords(42)).toBe('چهل و دو')
    expect(toPersianWords(310)).toBe('سیصد و ده')
    expect(toPersianWords(1000)).toBe('یک هزار')
    expect(toPersianWords(1250)).toBe('یک هزار و دویست و پنجاه')
    expect(toPersianWords(2_000_000)).toBe('دو میلیون')
    expect(toPersianWords(1_000_000_000)).toBe('یک میلیارد')
  })
  it('منفی و اعشار → قدر مطلق صحیح', () => {
    expect(toPersianWords(-42.9)).toBe('چهل و دو')
  })
})

describe('todayShamsi', () => {
  it('قالب yyyy/mm/dd با ارقام لاتین', () => {
    expect(todayShamsi()).toMatch(/^14\d{2}\/\d{2}\/\d{2}$/)
  })
})

describe('faNorm', () => {
  it('ی/ک عربی + اعراب + نیم‌فاصله یکدست می‌شوند', () => {
    expect(faNorm('علي')).toBe('علی')
    expect(faNorm('كتاب')).toBe('کتاب')
    expect(faNorm('نیم‌فاصله')).toBe('نیم فاصله')
    expect(faNorm('مُدیر')).toBe('مدیر')
    expect(faNorm('  فاصله   زیاد  ')).toBe('فاصله زیاد')
  })
  it('faNormTight فاصله‌ها را حذف می‌کند', () => {
    expect(faNormTight('صندوق طلا')).toBe('صندوقطلا')
    expect(faNormTight('نیم‌فاصله')).toBe('نیمفاصله')
  })
})

describe('nameMatchScore / bestNameMatch', () => {
  it('دقیق > آغازین > شامل > هیچ', () => {
    expect(nameMatchScore('پایا', 'پایا')).toBe(3)
    expect(nameMatchScore('پايا', 'پایا')).toBe(3) // ی عربی = دقیق
    expect(nameMatchScore('طلای زر', 'طلا')).toBe(2)
    expect(nameMatchScore('صندوق طلا', 'طلا')).toBe(1)
    expect(nameMatchScore('آساس', 'کاریس')).toBe(0)
  })
  it('bestNameMatch امتیاز بالاتر را برمی‌گزیند نه اولین شامل', () => {
    const items = [{ name: 'صندوق طلای کیان' }, { name: 'طلا' }]
    expect(bestNameMatch(items, x => x.name, 'طلا')!.name).toBe('طلا')
  })
  it('هیچ تطبیقی → null', () => {
    expect(bestNameMatch([{ name: 'آساس' }], x => x.name, 'زعفران')).toBeNull()
  })
})
