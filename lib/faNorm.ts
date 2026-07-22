// نرمال‌ساز واحد متن فارسی برای تطبیق نام/نماد در همهٔ نقاط جست‌وجو
// (NlFundFilter، fund-holding-search، GlobalSearch). یک منبع حقیقت تا کوئری موبایلی
// با ی/ک عربی، اعراب، یا نیم‌فاصله متفاوت، «پیدا نشد» کاذب نگیرد و سهمیهٔ کاربر نسوزد.

// نرمال‌سازی با حفظ فاصله‌ها (نیم‌فاصله → فاصله)
export function faNorm(s: unknown): string {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ؤ/g, 'و')
    .replace(/[ً-ْٰـ]/g, '') // اعراب + تطویل
    .replace(/[‌‎‏‪-‮]/g, ' ') // نیم‌فاصله و کاراکترهای جهت‌دار → فاصله
    .replace(/\s+/g, ' ')
    .trim()
}

// واریانت بدون فاصله — برای تطبیق وقتی کاربر نام را چسبیده یا با نیم‌فاصله تایپ کرده
export function faNormTight(s: unknown): string {
  return faNorm(s).replace(/\s+/g, '')
}

// امتیاز تطبیق دو نام نرمال‌شده: 3=دقیق، 2=آغازین، 1=شامل، 0=بی‌ربط.
// جای «first-match تصادفی» که با includes نام کوتاه اولین مورد را برمی‌داشت.
export function nameMatchScore(candidate: string, query: string): number {
  const c = faNorm(candidate)
  const q = faNorm(query)
  if (!c || !q) return 0
  if (c === q) return 3
  if (faNormTight(candidate) === faNormTight(query)) return 3
  if (c.startsWith(q) || q.startsWith(c)) return 2
  if (c.includes(q) || q.includes(c)) return 1
  return 0
}

// بهترین تطبیق از فهرست بر اساس بالاترین امتیاز؛ در تساوی، نام کوتاه‌تر (دقیق‌تر) اولویت دارد.
// null اگر هیچ تطبیقی نبود.
export function bestNameMatch<T>(items: T[], getName: (x: T) => string, query: string): T | null {
  let best: T | null = null
  let bestScore = 0
  let bestLen = Infinity
  for (const it of items) {
    const score = nameMatchScore(getName(it), query)
    if (score === 0) continue
    const len = faNorm(getName(it)).length
    if (score > bestScore || (score === bestScore && len < bestLen)) {
      best = it
      bestScore = score
      bestLen = len
    }
  }
  return best
}
