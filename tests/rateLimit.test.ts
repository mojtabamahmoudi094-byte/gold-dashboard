import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rateLimit, quotaExceeded, quotaConsume } from '../lib/rateLimit'

// state ماژول مشترک است — هر تست کلید یکتای خودش را می‌سازد تا تداخل نکند
let n = 0
const key = () => `test-key-${++n}`

describe('rateLimit', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('تا سقف مجاز، بعدش رد', () => {
    const k = key()
    expect(rateLimit(k, 3, 60_000)).toBe(true)
    expect(rateLimit(k, 3, 60_000)).toBe(true)
    expect(rateLimit(k, 3, 60_000)).toBe(true)
    expect(rateLimit(k, 3, 60_000)).toBe(false)
  })

  it('بعد از پایان پنجره دوباره مجاز', () => {
    const k = key()
    rateLimit(k, 1, 60_000)
    expect(rateLimit(k, 1, 60_000)).toBe(false)
    vi.advanceTimersByTime(61_000)
    expect(rateLimit(k, 1, 60_000)).toBe(true)
  })

  it('کلیدهای مختلف سهمیه جدا دارند', () => {
    const a = key(), b = key()
    rateLimit(a, 1, 60_000)
    expect(rateLimit(a, 1, 60_000)).toBe(false)
    expect(rateLimit(b, 1, 60_000)).toBe(true)
  })
})

describe('quotaExceeded / quotaConsume — سهمیه دومرحله‌ای', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('peek مصرف نمی‌کند؛ فقط consume می‌شمارد', () => {
    const k = key()
    // ۱۰ بار peek بدون consume — نباید چیزی بسوزد
    for (let i = 0; i < 10; i++) expect(quotaExceeded(k, 2)).toBe(false)
    quotaConsume(k, 60_000)
    expect(quotaExceeded(k, 2)).toBe(false)
    quotaConsume(k, 60_000)
    expect(quotaExceeded(k, 2)).toBe(true) // سقف ۲ پر شد
  })

  it('انقضای پنجره سهمیه را صفر می‌کند', () => {
    const k = key()
    quotaConsume(k, 60_000)
    quotaConsume(k, 60_000)
    expect(quotaExceeded(k, 2)).toBe(true)
    vi.advanceTimersByTime(61_000)
    expect(quotaExceeded(k, 2)).toBe(false)
  })
})
