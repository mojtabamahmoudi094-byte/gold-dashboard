'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

type Msg = { type: 'success' | 'error'; text: string }

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setReady(!!data.session)
      if (!data.session) {
        setMsg({ type: 'error', text: 'لینک بازیابی نامعتبر یا منقضی شده — دوباره درخواست بدهید' })
      }
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      setMsg({ type: 'error', text: 'رمز عبور باید حداقل ۶ کاراکتر باشد' })
      return
    }
    if (password !== password2) {
      setMsg({ type: 'error', text: 'رمز عبور و تکرار آن یکسان نیستند' })
      return
    }
    setLoading(true)
    setMsg(null)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setMsg({ type: 'error', text: 'خطا در تغییر رمز. لطفاً دوباره تلاش کنید' })
    } else {
      setDone(true)
    }
  }

  const inputBase: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '0.5px solid rgba(0,200,255,0.2)',
    borderRadius: 10,
    padding: '12px 16px',
    color: '#E8F4FF',
    fontSize: 13,
    fontFamily: 'Vazirmatn, Arial, sans-serif',
    outline: 'none',
    direction: 'rtl',
    boxSizing: 'border-box',
  }

  return (
    <main style={{
      minHeight: '100vh', background: '#060B14', fontFamily: 'Vazirmatn, Arial, sans-serif',
      direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: 'rgba(10,18,30,0.88)',
        border: '0.5px solid rgba(0,200,255,0.18)',
        borderRadius: 22, padding: '40px 44px', margin: '24px',
        backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
        boxShadow: '0 0 100px rgba(0,200,255,0.05), 0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 24 }}>
          تنظیم رمز عبور جدید
        </div>

        {msg && (
          <div style={{
            padding: '13px 16px', borderRadius: 10, marginBottom: 22,
            background: msg.type === 'success' ? 'rgba(0,229,160,0.08)' : 'rgba(255,77,106,0.08)',
            border: `0.5px solid ${msg.type === 'success' ? 'rgba(0,229,160,0.4)' : 'rgba(255,77,106,0.4)'}`,
            color: msg.type === 'success' ? '#00E5A0' : '#FF4D6A',
            fontSize: 12, lineHeight: 1.7,
          }}>
            {msg.text}
          </div>
        )}

        {done ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: '#00E5A0' }}>رمز عبور با موفقیت تغییر کرد.</div>
            <button
              type="button"
              onClick={() => router.push('/funds')}
              style={{
                width: '100%', padding: '13px', borderRadius: 11, fontSize: 14, fontWeight: 700,
                background: 'linear-gradient(135deg, rgba(0,200,255,0.13), rgba(0,200,255,0.22))',
                border: '0.5px solid rgba(0,200,255,0.5)', color: '#00C8FF',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >ورود به سایت</button>
          </div>
        ) : ready ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: '#ddd5bd', fontWeight: 500 }}>رمز عبور جدید</label>
              <input
                type="password" required minLength={6} autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" style={inputBase}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: '#ddd5bd', fontWeight: 500 }}>تکرار رمز عبور</label>
              <input
                type="password" required minLength={6} autoComplete="new-password"
                value={password2} onChange={e => setPassword2(e.target.value)}
                placeholder="••••••••" style={inputBase}
              />
            </div>
            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '13px', borderRadius: 11, fontSize: 14, fontWeight: 700,
                background: loading ? 'rgba(0,200,255,0.05)' : 'linear-gradient(135deg, rgba(0,200,255,0.13), rgba(0,200,255,0.22))',
                border: `0.5px solid ${loading ? 'rgba(0,200,255,0.2)' : 'rgba(0,200,255,0.5)'}`,
                color: loading ? 'rgba(0,200,255,0.5)' : '#00C8FF',
                cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >{loading ? '...' : 'تغییر رمز عبور'}</button>
          </form>
        ) : (
          <div style={{ fontSize: 12, color: '#ddd5bd' }}>در حال بررسی لینک...</div>
        )}
      </div>
    </main>
  )
}
