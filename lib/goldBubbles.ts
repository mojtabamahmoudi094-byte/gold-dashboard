// حباب‌های بازار بورس کالا + حباب ذاتی صندوق‌ها — منطق مشترک بین /analysis/gold و /signals

export const FUND_WEIGHTS: Record<string, { coin: number; bar: number; liq: number }> = {
  'رز ترنج':   { coin: 9.5,  bar: 88.3,  liq: 2.2  },
  'آتش':       { coin: 0.0,  bar: 98.0,  liq: 2.0  },
  'درخشان':    { coin: 0.0,  bar: 96.9,  liq: 3.1  },
  'زرفام':     { coin: 0.0,  bar: 100.0, liq: 0.3  },
  'ناب':       { coin: 6.3,  bar: 92.6,  liq: 1.1  },
  'زمرد':      { coin: 2.2,  bar: 97.0,  liq: 0.9  },
  'آلتون':     { coin: 5.9,  bar: 94.0,  liq: 0.1  },
  'ریتون':     { coin: 0.8,  bar: 99.2,  liq: 0.0  },
  'گنج':       { coin: 0.0,  bar: 100.0, liq: 0.0  },
  'دفینه':     { coin: 0.0,  bar: 89.4,  liq: 10.6 },
  'کهربا':     { coin: 15.2, bar: 84.5,  liq: 0.4  },
  'گلدا':      { coin: 9.4,  bar: 87.6,  liq: 3.1  },
  'لیان':      { coin: 0.0,  bar: 98.8,  liq: 1.2  },
  'زرگر':      { coin: 0.6,  bar: 99.3,  liq: 0.1  },
  'زروان':     { coin: 4.9,  bar: 95.1,  liq: 0.0  },
  'مثقال':     { coin: 5.7,  bar: 93.1,  liq: 1.2  },
  'نگین فارس': { coin: 3.4,  bar: 96.5,  liq: 0.0  },
  'تابش':      { coin: 0.1,  bar: 99.4,  liq: 0.5  },
  'زر':        { coin: 17.9, bar: 82.1,  liq: 0.0  },
  'گلدیس':     { coin: 10.7, bar: 88.1,  liq: 1.2  },
  'امرالد':    { coin: 12.0, bar: 87.9,  liq: 0.1  },
  'عیار':      { coin: 12.7, bar: 87.3,  liq: 0.1  },
  'طلا':       { coin: 14.4, bar: 85.5,  liq: 0.0  },
  'همیان':     { coin: 0.0,  bar: 99.8,  liq: 0.2  },
  'گوهر':      { coin: 8.1,  bar: 91.1,  liq: 0.8  },
  'رزگلد':     { coin: 4.2,  bar: 95.5,  liq: 0.4  },
  'جواهر':     { coin: 0.0,  bar: 98.0,  liq: 2.1  },
  'نفیس':      { coin: 6.7,  bar: 93.3,  liq: 0.1  },
  'میراث':     { coin: 3.7,  bar: 96.1,  liq: 0.2  },
  'جام طلا':   { coin: 0.5,  bar: 99.1,  liq: 0.4  },
  'درنا':      { coin: 0.0,  bar: 100.0, liq: 0.0  },
  'قیراط':     { coin: 0.0,  bar: 97.0,  liq: 3.0  },
}

// وزن گواهی نقره در ترکیب دارایی صندوق‌های نقره (٪) — مابقی: سایر دارایی‌ها
export const SILVER_FUND_WEIGHTS: Record<string, { silver: number; other: number }> = {
  'نقرسا':  { silver: 0,   other: 100 },
  'نقرین':  { silver: 25,  other: 75  },
  'نقرفام': { silver: 99,  other: 1   },
  'نقران':  { silver: 99,  other: 1   },
  'سیمین':  { silver: 100, other: 0   },
  'نقرابی': { silver: 100, other: 0   },
  'سیلور':  { silver: 99,  other: 1   },
}

export interface MarketBubbles {
  bullion: number | null // حباب شمش بورس کالا (٪)
  coin: number | null    // حباب گواهی سکه بورس کالا (٪)
}

// حباب تابلو نسبت به قیمت واقعی — از پاسخ /api/gold-analysis فیلد ime
export function computeMarketBubbles(ime: any): MarketBubbles {
  const fairBullionK = ime?.fairBullion != null ? ime.fairBullion / 1000 : null
  const tabloBullionK = ime?.goldBarT != null ? ime.goldBarT * 10 : null
  return {
    bullion: fairBullionK != null && tabloBullionK != null
      ? ((tabloBullionK - fairBullionK) / fairBullionK) * 100 : null,
    coin: ime?.fairCoinCert != null && ime?.goldCoinT != null
      ? ((ime.goldCoinT - ime.fairCoinCert) / ime.fairCoinCert) * 100 : null,
  }
}

// حباب ذاتی صندوق = درصد سکه × حباب سکه + درصد شمش × حباب شمش (٪)
export function fundBubbleZati(name: string, mb: MarketBubbles): number | null {
  const w = FUND_WEIGHTS[name]
  if (!w || mb.bullion == null || mb.coin == null) return null
  return (w.coin / 100) * mb.coin + (w.bar / 100) * mb.bullion
}

// حباب اسمی = (قیمت پایانی − NAV ابطال) ÷ NAV (٪) — هر دو ریال
export function fundBubbleAsmi(priceRial: number | null | undefined, navRial: number | null | undefined): number | null {
  if (!priceRial || !navRial) return null
  return ((priceRial - navRial) / navRial) * 100
}

// حباب واقعی = حباب اسمی + حباب ذاتی (٪)
export function fundBubbleVaqei(name: string, priceRial: number | null | undefined, navRial: number | null | undefined, mb: MarketBubbles): number | null {
  const asmi = fundBubbleAsmi(priceRial, navRial)
  const zati = fundBubbleZati(name, mb)
  if (asmi == null || zati == null) return null
  return asmi + zati
}

// حباب شمش نقره بورس کالا (٪) — تابلو نقدی vs قیمت واقعی گرم نقره
export function computeSilverBubble(ime: any): number | null {
  if (ime?.silverBarT == null || !ime?.fairSilverGram) return null
  return ((ime.silverBarT - ime.fairSilverGram) / ime.fairSilverGram) * 100
}

// حباب ذاتی صندوق نقره = وزن گواهی نقره × حباب شمش نقره (٪)
export function silverFundBubbleZati(name: string, silverBubble: number | null): number | null {
  const w = SILVER_FUND_WEIGHTS[name]
  if (!w || silverBubble == null) return null
  return (w.silver / 100) * silverBubble
}
