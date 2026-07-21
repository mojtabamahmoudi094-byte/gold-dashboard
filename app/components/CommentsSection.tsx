'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Comment = {
  id: number
  user_id: string
  display_name: string
  body: string
  created_at: string
}

const CREAM = '#ddd5bd'
const ACCENT = '#38BDF8'

// نسبی: «۲ دقیقه پیش»، «۳ ساعت پیش»، «۵ روز پیش»
function timeAgo(iso: string): string {
  const diffSec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  const units: [number, string][] = [[60, 'ثانیه'], [60, 'دقیقه'], [24, 'ساعت'], [30, 'روز'], [12, 'ماه'], [Infinity, 'سال']]
  let v = diffSec, i = 0
  for (; i < units.length - 1 && v >= units[i][0]; i++) v /= units[i][0]
  return `${Math.floor(v).toLocaleString('fa-IR')} ${units[i][1]} پیش`
}

export default function CommentsSection({ targetType, targetKey, isDark }: {
  targetType: 'stock' | 'fund'; targetKey: string; isDark: boolean
}) {
  const panel = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,46,0.02)'
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,30,46,0.08)'
  const text = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#94A3B8' : '#64748B'

  const [comments, setComments] = useState<Comment[] | null>(null)
  const [user, setUser] = useState<any>(null)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setComments(null)
    supabase.from('comments').select('id, user_id, display_name, body, created_at')
      .eq('target_type', targetType).eq('target_key', targetKey)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setComments(data ?? []))
  }, [targetType, targetKey])

  const displayName = (u: any) =>
    u?.user_metadata?.first_name ? `${u.user_metadata.first_name} ${u.user_metadata.last_name || ''}`.trim() : (u?.email?.split('@')[0] || 'کاربر')

  const submit = async () => {
    const trimmed = body.trim()
    if (trimmed.length < 2) { setError('نظر خیلی کوتاهه'); return }
    if (trimmed.length > 500) { setError('حداکثر ۵۰۰ کاراکتر'); return }
    if (!user) return
    setSubmitting(true)
    setError(null)
    const { data, error: err } = await supabase.from('comments').insert({
      user_id: user.id, display_name: displayName(user),
      target_type: targetType, target_key: targetKey, body: trimmed,
    }).select('id, user_id, display_name, body, created_at').single()
    setSubmitting(false)
    if (err) { setError('ثبت نظر ناموفق بود'); return }
    setBody('')
    setComments(prev => [data as Comment, ...(prev ?? [])])
  }

  const remove = async (id: number) => {
    await supabase.from('comments').delete().eq('id', id)
    setComments(prev => (prev ?? []).filter(c => c.id !== id))
  }

  return (
    <section style={{
      background: panel, border: `0.5px solid ${border}`, borderRadius: 16,
      padding: '20px 20px 22px', marginTop: 22, backdropFilter: 'blur(12px)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: ACCENT, flexShrink: 0, boxShadow: `0 0 10px ${ACCENT}` }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: text }}>نظرات</span>
        {comments && (
          <span style={{ fontSize: 11, color: muted }}>({comments.length.toLocaleString('fa-IR')})</span>
        )}
      </div>

      {user ? (
        <div style={{ marginBottom: 18 }}>
          <textarea
            value={body}
            onChange={e => { setBody(e.target.value); setError(null) }}
            placeholder="نظرت رو درباره این نماد بنویس…"
            rows={3}
            maxLength={500}
            style={{
              width: '100%', resize: 'vertical', borderRadius: 10, padding: '10px 12px',
              background: isDark ? 'rgba(255,255,255,0.02)' : '#fff',
              border: `0.5px solid ${border}`, color: text, fontFamily: 'inherit', fontSize: 13,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: error ? '#FF4D6A' : muted }}>{error || `${body.length.toLocaleString('fa-IR')}/۵۰۰`}</span>
            <button onClick={submit} disabled={submitting || body.trim().length < 2} style={{
              fontSize: 12.5, fontWeight: 700, padding: '7px 18px', borderRadius: 9, cursor: submitting ? 'default' : 'pointer',
              background: ACCENT, color: '#04202e', border: 'none', opacity: submitting ? 0.6 : 1,
            }}>
              {submitting ? 'در حال ارسال…' : 'ثبت نظر'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: muted, marginBottom: 18, padding: '10px 12px', borderRadius: 10, background: `${ACCENT}0c`, border: `0.5px solid ${ACCENT}30` }}>
          برای ثبت نظر باید وارد حساب کاربری‌ات بشی.
        </div>
      )}

      {comments === null && <div style={{ fontSize: 12, color: muted }}>در حال بارگذاری…</div>}
      {comments && comments.length === 0 && <div style={{ fontSize: 12, color: muted }}>هنوز نظری ثبت نشده — اولین نفر باش.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(comments ?? []).map(c => (
          <div key={c.id} style={{ padding: '10px 0', borderTop: `0.5px solid ${border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: text }}>{c.display_name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10.5, color: muted }}>{timeAgo(c.created_at)}</span>
                {user?.id === c.user_id && (
                  <button onClick={() => remove(c.id)} style={{ fontSize: 10.5, color: '#FF4D6A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    حذف
                  </button>
                )}
              </div>
            </div>
            <div style={{ fontSize: 13, color: CREAM, lineHeight: 1.9, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
