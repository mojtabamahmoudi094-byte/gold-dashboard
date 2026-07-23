import { describe, it, expect } from 'vitest'
import { clientIp } from '../lib/clientIp'

const req = (headers: Record<string, string>) => new Request('http://x', { headers })

describe('clientIp — ضدجعل XFF', () => {
  it('آخرین ورودی XFF (افزودهٔ پروکسی)، نه اولین (قابل‌جعل کلاینت)', () => {
    // کلاینت مهاجم «1.1.1.1» را جلو می‌فرستد؛ پروکسی IP واقعی را آخر append می‌کند
    expect(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 9.9.9.9, 5.5.5.5' }))).toBe('5.5.5.5')
    expect(clientIp(req({ 'x-forwarded-for': '5.5.5.5' }))).toBe('5.5.5.5')
  })
  it('fallback به x-real-ip بعد unknown', () => {
    expect(clientIp(req({ 'x-real-ip': '7.7.7.7' }))).toBe('7.7.7.7')
    expect(clientIp(req({}))).toBe('unknown')
  })
})
