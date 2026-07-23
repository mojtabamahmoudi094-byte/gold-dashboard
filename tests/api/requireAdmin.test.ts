import { describe, it, expect, vi, beforeEach } from 'vitest'

// رگرسیون باگ امنیتی ۲۰۲۶-۰۷-۱۶: requireAdmin قبلاً جدول admins را واقعاً چک نمی‌کرد —
// هر کاربر لاگین‌شده ادمین حساب می‌شد. این تست‌ها آن مسیر را قفل می‌کنند.

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  adminRow: null as { id: string } | null,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => state.user
        ? { data: { user: state.user }, error: null }
        : { data: { user: null }, error: { message: 'invalid token' } },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.adminRow, error: null }),
        }),
      }),
    }),
  }),
}))

import { requireAdmin } from '../../lib/auth'

const req = (token?: string) =>
  new Request('http://x', { headers: token ? { authorization: `Bearer ${token}` } : {} })

beforeEach(() => { state.user = null; state.adminRow = null })

describe('requireAdmin', () => {
  it('بدون هدر Authorization → null', async () => {
    expect(await requireAdmin(req())).toBeNull()
  })

  it('توکن نامعتبر → null', async () => {
    expect(await requireAdmin(req('bad-token'))).toBeNull()
  })

  it('کاربر معتبر ولی خارج از جدول admins → null (رگرسیون اصلی)', async () => {
    state.user = { id: 'user-1' }
    state.adminRow = null
    expect(await requireAdmin(req('valid'))).toBeNull()
  })

  it('کاربر معتبر و داخل admins → همان id', async () => {
    state.user = { id: 'admin-1' }
    state.adminRow = { id: 'admin-1' }
    expect(await requireAdmin(req('valid'))).toBe('admin-1')
  })
})
