import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  inserted: [] as unknown[],
}))

vi.mock('../../lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (row: unknown) => {
        state.inserted.push(row)
        return Promise.resolve({ error: null })
      },
    }),
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no' } }) },
  }),
}))

import { POST } from '../../app/api/chat/route'

// هر تست IP یکتا — rateLimit ماژول‌سطحی state دارد
let ipN = 0
const post = (body: unknown, ip?: string) =>
  POST(new NextRequest('http://x/api/chat', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip ?? `10.0.0.${++ipN}` },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))

beforeEach(() => {
  state.inserted = []
  vi.unstubAllGlobals()
})

describe('/api/chat', () => {
  it('JSON خراب → 400', async () => {
    const res = await post('نه-جیسون{')
    expect(res.status).toBe(400)
  })

  it('سوال خالی → 400', async () => {
    const res = await post({ question: '   ' })
    expect(res.status).toBe(400)
  })

  it('پاسخ upstream عبور می‌کند و لاگ L1 ثبت می‌شود', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ answer: 'جواب', symbol: 'فولاد', hasStockData: true }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )))
    const res = await post({ question: 'وضعیت فولاد؟' })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.answer).toBe('جواب')
    // لاگ best-effort — سوال و جواب ثبت شده
    expect(state.inserted).toHaveLength(1)
    expect((state.inserted[0] as { question: string }).question).toBe('وضعیت فولاد؟')
  })

  it('سوال بیش از ۱۰۰۰ کاراکتر بریده می‌شود (نه رد)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ answer: 'ok' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await post({ question: 'س'.repeat(1500) })
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(sent.question).toHaveLength(1000)
  })

  it('خطای upstream → 502 و لاگ ثبت نمی‌شود', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    const res = await post({ question: 'سلام' })
    expect(res.status).toBe(502)
    expect(state.inserted).toHaveLength(0)
  })

  it('rate limit: بعد از ۱۲ درخواست از یک IP → 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ answer: 'ok' }), { status: 200 })))
    const ip = '10.9.9.9'
    for (let i = 0; i < 12; i++) {
      const r = await post({ question: 'سوال' }, ip)
      expect(r.status).toBe(200)
    }
    const blocked = await post({ question: 'سوال' }, ip)
    expect(blocked.status).toBe(429)
    // IP دیگر همچنان مجاز
    const other = await post({ question: 'سوال' }, '10.8.8.8')
    expect(other.status).toBe(200)
  })
})
