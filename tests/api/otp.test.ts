import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  // send-otp: ردیف‌های اخیر (هم per-user هم per-phone همین را می‌گیرند)
  recentRows: [] as { created_at: string }[],
  inserted: [] as Record<string, unknown>[],
  insertError: null as { message: string } | null,
  smsFail: false,
  smsSent: [] as { phone: string; code: string }[],
  // verify-otp
  verifyRow: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  metaUpdates: [] as Record<string, unknown>[],
}))

vi.mock('../../lib/smsIr', () => ({
  sendOtpSms: async (phone: string, code: string) => {
    if (state.smsFail) throw new Error('sms down')
    state.smsSent.push({ phone, code })
  },
}))

vi.mock('../../lib/supabaseAdmin', () => {
  // زنجیرهٔ select هر دو روت: .select().eq().gte().order() (thenable) و
  // .eq().eq().is().order().limit().maybeSingle()
  const chain = () => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'is', 'order', 'limit']) b[m] = () => b
    b.maybeSingle = async () => ({ data: state.verifyRow, error: null })
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: state.recentRows, error: null }).then(resolve)
    return b
  }
  return {
    supabaseAdmin: {
      from: () => ({
        ...chain(),
        insert: async (row: Record<string, unknown>) => {
          if (state.insertError) return { error: state.insertError }
          state.inserted.push(row)
          return { error: null }
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async () => { state.updates.push(patch); return { error: null } },
        }),
      }),
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: { app_metadata: { role: 'x' } } } }),
          updateUserById: async (_id: string, patch: Record<string, unknown>) => {
            state.metaUpdates.push(patch)
            return { data: {}, error: null }
          },
        },
      },
    },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => state.user
        ? { data: { user: state.user }, error: null }
        : { data: { user: null }, error: { message: 'bad' } },
    },
  }),
}))

import { POST as sendOtp } from '../../app/api/auth/send-otp/route'
import { POST as verifyOtp } from '../../app/api/auth/verify-otp/route'

let ipN = 0
const req = (body: unknown, token = 'tok') =>
  new Request('http://x', {
    method: 'POST',
    headers: {
      'x-forwarded-for': `10.1.0.${++ipN}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

const hash = (code: string) => crypto.createHash('sha256').update(code).digest('hex')

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.recentRows = []
  state.inserted = []
  state.insertError = null
  state.smsFail = false
  state.smsSent = []
  state.verifyRow = null
  state.updates = []
  state.metaUpdates = []
})

describe('/api/auth/send-otp', () => {
  it('بدون لاگین → 401', async () => {
    state.user = null
    expect((await sendOtp(req({ phone: '09121234567' }))).status).toBe(401)
  })

  it('شماره نامعتبر → 400', async () => {
    expect((await sendOtp(req({ phone: '12345' }))).status).toBe(400)
    expect((await sendOtp(req({}))).status).toBe(400)
  })

  it('cooldown ۵ دقیقه: ارسال اخیر → 429', async () => {
    state.recentRows = [{ created_at: new Date(Date.now() - 60_000).toISOString() }]
    expect((await sendOtp(req({ phone: '09121234567' }))).status).toBe(429)
    expect(state.smsSent).toHaveLength(0)
  })

  it('سقف روزانه ۵: با ۵ ردیف قدیمی‌ترِ خارج از cooldown → 429', async () => {
    const old = (m: number) => ({ created_at: new Date(Date.now() - m * 60_000).toISOString() })
    state.recentRows = [old(10), old(60), old(120), old(180), old(240)]
    expect((await sendOtp(req({ phone: '09121234567' }))).status).toBe(429)
  })

  it('موفق: پیامک می‌رود و hash کد (نه خود کد) ذخیره می‌شود', async () => {
    const res = await sendOtp(req({ phone: '09121234567' }))
    expect(res.status).toBe(200)
    expect(state.smsSent).toHaveLength(1)
    const row = state.inserted[0]
    expect(row.phone).toBe('09121234567')
    expect(row.code_hash).toBe(hash(state.smsSent[0].code))
    expect(String(row.code_hash)).not.toContain(state.smsSent[0].code)
  })

  it('شکست پیامک → 502 و هیچ ردیفی درج نمی‌شود', async () => {
    state.smsFail = true
    expect((await sendOtp(req({ phone: '09121234567' }))).status).toBe(502)
    expect(state.inserted).toHaveLength(0)
  })
})

describe('/api/auth/verify-otp', () => {
  const liveRow = (over: Record<string, unknown> = {}) => ({
    id: 7, code_hash: hash('123456'),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    attempts: 0, verified_at: null, ...over,
  })

  it('بدون لاگین → 401؛ بدنه ناقص → 400', async () => {
    state.user = null
    expect((await verifyOtp(req({ phone: '09121234567', code: '123456' }))).status).toBe(401)
    state.user = { id: 'user-1' }
    expect((await verifyOtp(req({ phone: '09121234567' }))).status).toBe(400)
  })

  it('کدی ارسال نشده → 400', async () => {
    state.verifyRow = null
    expect((await verifyOtp(req({ phone: '09121234567', code: '123456' }))).status).toBe(400)
  })

  it('کد منقضی → 400', async () => {
    state.verifyRow = liveRow({ expires_at: new Date(Date.now() - 1000).toISOString() })
    expect((await verifyOtp(req({ phone: '09121234567', code: '123456' }))).status).toBe(400)
  })

  it('کد اشتباه: 400 و شمارنده تلاش +۱', async () => {
    state.verifyRow = liveRow()
    expect((await verifyOtp(req({ phone: '09121234567', code: '999999' }))).status).toBe(400)
    expect(state.updates[0]).toEqual({ attempts: 1 })
  })

  it('سقف ۵ تلاش → 429 حتی با کد درست (ضد brute-force)', async () => {
    state.verifyRow = liveRow({ attempts: 5 })
    expect((await verifyOtp(req({ phone: '09121234567', code: '123456' }))).status).toBe(429)
  })

  it('کد درست: verified_at ثبت و phone_verified در app_metadata (نه user_metadata)', async () => {
    state.verifyRow = liveRow()
    const res = await verifyOtp(req({ phone: '09121234567', code: '123456' }))
    expect(res.status).toBe(200)
    expect(state.updates.some(u => 'verified_at' in u)).toBe(true)
    const meta = state.metaUpdates[0] as { app_metadata: Record<string, unknown> }
    expect(meta.app_metadata.phone_verified).toBe(true)
    expect(meta.app_metadata.verified_phone).toBe('09121234567')
    expect(meta.app_metadata.role).toBe('x') // متادیتای قبلی حفظ می‌شود
  })
})
