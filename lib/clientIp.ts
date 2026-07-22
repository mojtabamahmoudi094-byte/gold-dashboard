// استخراج IP واقعی کلاینت پشت پروکسی (Render).
// نکته امنیتی: کلاینت می‌تواند هدر X-Forwarded-For دلخواه بفرستد؛ پروکسی مورد اعتماد
// IP واقعی را به *انتهای* زنجیره append می‌کند. پس اولین ورودی قابل‌جعل است و
// آخرین ورودیِ افزوده‌شده توسط پروکسی قابل‌اعتماد است. برای rate limit همیشه از
// آخرین ورودی استفاده کن، نه اولین.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}
