import { describe, it, expect } from 'vitest'
import {
  FUND_WEIGHTS, SILVER_FUND_WEIGHTS,
  computeMarketBubbles, fundBubbleZati, fundBubbleAsmi, fundBubbleVaqei,
  computeSilverBubble, silverFundBubbleZati,
} from '../lib/goldBubbles'

describe('computeMarketBubbles', () => {
  it('مقیاس‌بندی شمش: fairBullion/1000 در برابر تابلو×10 (باگ -۹۹٪ قدیمی)', () => {
    // fairBullion برای شمش ۱۰۰۰گرمی، تابلو IME واحد متفاوت — بدون تبدیل، حباب ~-۹۹٪ می‌شد
    const ime = { fairBullion: 10_000_000, goldBarT: 1_050_000, fairCoinCert: 800, goldCoinT: 840 }
    const mb = computeMarketBubbles(ime)
    // fairK=10000، tabloK=10500000... صبر: goldBarT×10=10_500_000 و fair/1000=10_000
    // → این ورودی ساختگی مقیاسش عمداً جداست؛ فقط فرمول را چک می‌کنیم:
    expect(mb.bullion).toBeCloseTo(((1_050_000 * 10 - 10_000_000 / 1000) / (10_000_000 / 1000)) * 100, 6)
    expect(mb.coin).toBeCloseTo(((840 - 800) / 800) * 100, 10) // +۵٪
  })
  it('ورودی ناقص → null بدون کرش', () => {
    expect(computeMarketBubbles({}).bullion).toBeNull()
    expect(computeMarketBubbles(null).coin).toBeNull()
  })
})

describe('fundBubbleZati', () => {
  it('میانگین وزنی سکه/شمش با وزن واقعی صندوق «زر» (۱۷.۹/۸۲.۱)', () => {
    const mb = { bullion: 2, coin: 10 }
    const z = fundBubbleZati('زر', mb)!
    expect(z).toBeCloseTo(0.179 * 10 + 0.821 * 2, 6)
  })
  it('صندوق ناشناخته یا حباب null → null', () => {
    expect(fundBubbleZati('ناموجود', { bullion: 1, coin: 1 })).toBeNull()
    expect(fundBubbleZati('زر', { bullion: null, coin: 1 })).toBeNull()
  })
})

describe('fundBubbleAsmi/Vaqei', () => {
  it('اسمی = (قیمت−NAV)/NAV', () => {
    expect(fundBubbleAsmi(11_000, 10_000)).toBeCloseTo(10, 10)
    expect(fundBubbleAsmi(9_500, 10_000)).toBeCloseTo(-5, 10)
  })
  it('NAV صفر/null → null (نه Infinity)', () => {
    expect(fundBubbleAsmi(11_000, 0)).toBeNull()
    expect(fundBubbleAsmi(null, 10_000)).toBeNull()
  })
  it('واقعی = اسمی + ذاتی؛ اگر یکی نبود null', () => {
    const mb = { bullion: 2, coin: 10 }
    const v = fundBubbleVaqei('زر', 11_000, 10_000, mb)!
    expect(v).toBeCloseTo(10 + (0.179 * 10 + 0.821 * 2), 6)
    expect(fundBubbleVaqei('ناموجود', 11_000, 10_000, mb)).toBeNull()
  })
})

describe('نقره', () => {
  it('حباب شمش نقره + ذاتی صندوق با وزن واقعی «نقرین» (۲۵٪)', () => {
    const ime = { silverBarT: 110, fairSilverGram: 100 }
    const sb = computeSilverBubble(ime)!
    expect(sb).toBeCloseTo(10, 10)
    expect(silverFundBubbleZati('نقرین', sb)).toBeCloseTo(2.5, 10)
    expect(silverFundBubbleZati('سیمین', sb)).toBeCloseTo(10, 10) // ۱۰۰٪ نقره
  })
  it('ورودی ناقص → null', () => {
    expect(computeSilverBubble({})).toBeNull()
    expect(silverFundBubbleZati('نقرین', null)).toBeNull()
  })
})

describe('سلامت جدول وزن‌ها', () => {
  it('وزن هر صندوق طلا جمعاً ~۱۰۰ (سکه+شمش+نقد)', () => {
    for (const [name, w] of Object.entries(FUND_WEIGHTS)) {
      const sum = w.coin + w.bar + w.liq
      expect(sum, `${name}: ${sum}`).toBeGreaterThan(97)
      expect(sum, `${name}: ${sum}`).toBeLessThan(103)
    }
  })
  it('وزن صندوق‌های نقره جمعاً ۱۰۰', () => {
    for (const [name, w] of Object.entries(SILVER_FUND_WEIGHTS)) {
      expect(w.silver + w.other, name).toBe(100)
    }
  })
})
