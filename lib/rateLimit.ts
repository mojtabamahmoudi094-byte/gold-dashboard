// محدودکننده نرخ ساده در حافظه — برای سرور تک-پردازه (Render) کافی است،
// روی چند اینستنس سرورلس هماهنگ نیست چون state پروسه به پروسه جدا است.
const buckets = new Map<string, { count: number; resetAt: number }>()

/** true یعنی مجاز است، false یعنی از سقف رد شده */
let lastSweep = 0

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()

  // پاکسازی دوره‌ای کلیدهای منقضی تا Map در uptime طولانی بی‌نهایت رشد نکند
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k)
    lastSweep = now
  }

  const bucket = buckets.get(key)

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= limit) return false

  bucket.count += 1
  return true
}
