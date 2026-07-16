'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { PROVINCES } from '../../lib/iranRegions'

type Tab = 'login' | 'register' | 'forgot' | 'otp'
type Msg = { type: 'success' | 'error'; text: string }

export default function AuthPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('register')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [registered, setRegistered] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)

  // login fields
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // register fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')

  // otp fields
  const [otpUserId, setOtpUserId] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpResending, setOtpResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const cities = PROVINCES.find(p => p.name === province)?.cities ?? []

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace('/funds')
    })
  }, [])

  useEffect(() => {
    if (tab !== 'otp' || resendCooldown <= 0) return
    const t = setInterval(() => setResendCooldown(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [tab, resendCooldown > 0])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
    setLoading(false)
    if (error) {
      setMsg({ type: 'error', text: 'ایمیل یا رمز عبور اشتباه است' })
    } else {
      router.push('/funds')
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    const redirectTo = typeof window !== 'undefined'
      ? window.location.origin + '/auth/reset'
      : '/auth/reset'
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, { redirectTo })
    setLoading(false)
    if (error) {
      setMsg({ type: 'error', text: 'خطا در ارسال ایمیل. لطفاً دوباره تلاش کنید' })
    } else {
      setForgotSent(true)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !province || !city) {
      setMsg({ type: 'error', text: 'لطفاً تمام فیلدها را پر کنید' })
      return
    }
    setLoading(true)
    setMsg(null)
    const redirectTo = typeof window !== 'undefined'
      ? window.location.origin + '/auth'
      : '/auth'

    const { data, error } = await supabase.auth.signUp({
      email: regEmail,
      password: regPassword,
      options: {
        emailRedirectTo: redirectTo,
        data: { first_name: firstName, last_name: lastName, phone, province, city },
      },
    })
    if (error) {
      setLoading(false)
      const errMsg =
        error.message.includes('already registered') || error.message.includes('already been registered')
          ? 'این ایمیل قبلاً ثبت‌نام شده — لطفاً وارد شوید'
          : error.message.includes('Password')
          ? 'رمز عبور باید حداقل ۶ کاراکتر باشد'
          : 'خطا در ثبت‌نام. لطفاً دوباره تلاش کنید'
      setMsg({ type: 'error', text: errMsg })
      return
    }

    const userId = data.user?.id
    if (!userId) {
      setLoading(false)
      setMsg({ type: 'error', text: 'خطا در ثبت‌نام. لطفاً دوباره تلاش کنید' })
      return
    }

    setOtpUserId(userId)
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, phone }),
    })
    setLoading(false)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setMsg({ type: 'error', text: body?.error || 'خطا در ارسال کد تایید' })
      return
    }
    setTab('otp')
    setResendCooldown(60)
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: otpUserId, phone, code: otpCode }),
    })
    setLoading(false)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setMsg({ type: 'error', text: body?.error || 'کد تایید اشتباه است' })
      return
    }
    setRegistered(true)
  }

  const handleResendOtp = async () => {
    setOtpResending(true)
    setMsg(null)
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: otpUserId, phone }),
    })
    setOtpResending(false)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setMsg({ type: 'error', text: body?.error || 'خطا در ارسال کد' })
      return
    }
    setResendCooldown(60)
    setMsg({ type: 'success', text: 'کد جدید ارسال شد' })
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
    transition: 'border-color 0.2s, background 0.2s',
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#060B14',
      fontFamily: 'Vazirmatn, Arial, sans-serif',
      direction: 'rtl',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* gradient orbs */}
      <div style={{
        position: 'absolute', width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,200,255,0.06) 0%, transparent 65%)',
        top: '-10%', right: '-5%', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,229,160,0.05) 0%, transparent 65%)',
        bottom: '5%', left: '5%', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 200, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(167,139,250,0.05) 0%, transparent 70%)',
        top: '40%', left: '25%', pointerEvents: 'none',
      }} />

      {/* card */}
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'rgba(10,18,30,0.88)',
        border: '0.5px solid rgba(0,200,255,0.18)',
        borderRadius: 22,
        padding: '40px 44px',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        boxShadow: '0 0 100px rgba(0,200,255,0.05), 0 24px 80px rgba(0,0,0,0.6)',
        margin: '24px',
      }}>

        {registered ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(0,229,160,0.1)',
              border: '0.5px solid rgba(0,229,160,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28,
            }}>✅</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#00E5A0', marginBottom: 8 }}>ثبت‌نام موفق!</div>
              <div style={{ fontSize: 13, color: '#A0B4C8', lineHeight: 1.8 }}>
                شماره موبایل <span style={{ color: '#E8F4FF', fontWeight: 600 }}>{phone}</span> تایید شد. حساب کاربری‌ات آماده است.
              </div>
            </div>
            <button
              onClick={() => router.push('/funds')}
              style={{
                width: '100%', padding: '13px', borderRadius: 11,
                fontSize: 14, fontWeight: 700,
                background: 'linear-gradient(135deg, rgba(0,200,255,0.13), rgba(0,200,255,0.22))',
                border: '0.5px solid rgba(0,200,255,0.5)',
                color: '#00C8FF', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ورود به سایت
            </button>
          </div>
        ) : (<>

        {/* logo row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: '#00C8FF',
            boxShadow: '0 0 14px rgba(0,200,255,0.7)',
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>بورس سنج</div>
            <div style={{ fontSize: 9, color: '#ddd5bd', marginTop: -1 }}>bourssanj.ir</div>
          </div>
          <Link href="/funds" style={{
            fontSize: 11, color: '#ddd5bd', textDecoration: 'none',
            padding: '5px 12px', borderRadius: 8,
            border: '0.5px solid rgba(0,200,255,0.1)',
          }}>
            بازگشت
          </Link>
        </div>

        {/* tab switcher */}
        {tab !== 'otp' && (
        <div style={{
          display: 'flex', gap: 0, marginBottom: 28,
          background: 'rgba(0,0,0,0.35)', borderRadius: 12, padding: 4,
        }}>
          {(['register', 'login'] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setMsg(null) }} style={{
              flex: 1, padding: '10px', borderRadius: 9, fontSize: 13,
              fontWeight: tab === t ? 700 : 500,
              background: tab === t
                ? (t === 'register' ? 'rgba(0,229,160,0.14)' : 'rgba(0,200,255,0.14)')
                : 'transparent',
              border: tab === t
                ? `0.5px solid ${t === 'register' ? 'rgba(0,229,160,0.45)' : 'rgba(0,200,255,0.45)'}`
                : '0.5px solid transparent',
              color: tab === t
                ? (t === 'register' ? '#00E5A0' : '#00C8FF')
                : '#ddd5bd',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
              {t === 'login' ? 'ورود' : 'ثبت‌نام'}
            </button>
          ))}
        </div>
        )}

        {/* message */}
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

        {/* LOGIN FORM */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="ایمیل">
              <input
                type="email" required autoComplete="email"
                value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                placeholder="example@email.com"
                style={{ ...inputBase, direction: 'ltr', textAlign: 'right' }}
              />
            </Field>
            <Field label="رمز عبور">
              <PasswordInput
                autoComplete="current-password"
                value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                style={inputBase}
              />
            </Field>
            <Btn loading={loading} color="#00C8FF" label="ورود به حساب" />
            <div style={{ textAlign: 'center', fontSize: 12, color: '#ddd5bd' }}>
              <button type="button" onClick={() => { setTab('forgot'); setMsg(null); setForgotSent(false) }} style={{
                background: 'none', border: 'none', color: '#ddd5bd', fontSize: 12,
                cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
              }}>رمز عبور را فراموش کرده‌اید؟</button>
            </div>
            <div style={{ textAlign: 'center', fontSize: 12, color: '#ddd5bd', marginTop: 4 }}>
              حساب ندارید؟{' '}
              <button type="button" onClick={() => { setTab('register'); setMsg(null) }} style={{
                background: 'none', border: 'none', color: '#00E5A0', fontSize: 12,
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              }}>ثبت‌نام کنید</button>
            </div>
          </form>
        )}

        {/* FORGOT PASSWORD FORM */}
        {tab === 'forgot' && (
          forgotSent ? (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(0,229,160,0.1)',
                border: '0.5px solid rgba(0,229,160,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}>✉️</div>
              <div style={{ fontSize: 13, color: '#A0B4C8', lineHeight: 1.8 }}>
                لینک بازیابی رمز به <span style={{ color: '#E8F4FF', fontWeight: 600 }}>{forgotEmail}</span> ارسال شد.
                ایمیل را باز کنید و روی لینک کلیک کنید.
              </div>
              <button
                type="button"
                onClick={() => { setTab('login'); setForgotSent(false); setMsg(null) }}
                style={{
                  width: '100%', padding: '13px', borderRadius: 11,
                  fontSize: 14, fontWeight: 700,
                  background: 'linear-gradient(135deg, rgba(0,200,255,0.13), rgba(0,200,255,0.22))',
                  border: '0.5px solid rgba(0,200,255,0.5)',
                  color: '#00C8FF', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >بازگشت به ورود</button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 12, color: '#ddd5bd', lineHeight: 1.7, marginBottom: 4 }}>
                ایمیل حساب‌تان را وارد کنید تا لینک بازیابی رمز برایتان ارسال شود.
              </div>
              <Field label="ایمیل">
                <input
                  type="email" required autoComplete="email"
                  value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                  placeholder="example@email.com"
                  style={{ ...inputBase, direction: 'ltr', textAlign: 'right' }}
                />
              </Field>
              <Btn loading={loading} color="#00C8FF" label="ارسال لینک بازیابی" />
              <div style={{ textAlign: 'center', fontSize: 12, color: '#ddd5bd', marginTop: 4 }}>
                <button type="button" onClick={() => { setTab('login'); setMsg(null) }} style={{
                  background: 'none', border: 'none', color: '#00C8FF', fontSize: 12,
                  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                }}>بازگشت به ورود</button>
              </div>
            </form>
          )
        )}

        {/* REGISTER FORM */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="نام">
                <input
                  type="text" required autoComplete="given-name"
                  value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="نام"
                  style={inputBase}
                />
              </Field>
              <Field label="نام خانوادگی">
                <input
                  type="text" required autoComplete="family-name"
                  value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="نام خانوادگی"
                  style={inputBase}
                />
              </Field>
            </div>

            <Field label="ایمیل">
              <input
                type="email" required autoComplete="email"
                value={regEmail} onChange={e => setRegEmail(e.target.value)}
                placeholder="example@email.com"
                style={{ ...inputBase, direction: 'ltr', textAlign: 'right' }}
              />
            </Field>

            <Field label="رمز عبور (حداقل ۶ کاراکتر)">
              <PasswordInput
                minLength={6} autoComplete="new-password"
                value={regPassword} onChange={e => setRegPassword(e.target.value)}
                placeholder="••••••••"
                style={inputBase}
              />
            </Field>

            <Field label="شماره تماس">
              <input
                type="tel" required autoComplete="tel"
                value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="09xxxxxxxxx"
                style={{ ...inputBase, direction: 'ltr', textAlign: 'right' }}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="استان">
                <select
                  required
                  value={province}
                  onChange={e => { setProvince(e.target.value); setCity('') }}
                  style={{ ...inputBase, cursor: 'pointer', paddingLeft: 8 }}
                >
                  <option value="">انتخاب استان</option>
                  {PROVINCES.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="شهر">
                <select
                  required
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  disabled={!province}
                  style={{
                    ...inputBase,
                    cursor: province ? 'pointer' : 'not-allowed',
                    opacity: province ? 1 : 0.45,
                    paddingLeft: 8,
                  }}
                >
                  <option value="">انتخاب شهر</option>
                  {cities.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Btn loading={loading} color="#00E5A0" label="ایجاد حساب کاربری" />
            <div style={{ textAlign: 'center', fontSize: 12, color: '#ddd5bd', marginTop: 4 }}>
              قبلاً ثبت‌نام کرده‌اید؟{' '}
              <button type="button" onClick={() => { setTab('login'); setMsg(null) }} style={{
                background: 'none', border: 'none', color: '#00C8FF', fontSize: 12,
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              }}>وارد شوید</button>
            </div>
          </form>
        )}

        {/* OTP VERIFY FORM */}
        {tab === 'otp' && (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 12, color: '#ddd5bd', lineHeight: 1.7, marginBottom: 4 }}>
              کد تایید به شماره <span style={{ color: '#E8F4FF', fontWeight: 600 }}>{phone}</span> پیامک شد. کد را وارد کنید.
            </div>
            <Field label="کد تایید">
              <input
                type="text" required inputMode="numeric" autoComplete="one-time-code"
                value={otpCode} onChange={e => setOtpCode(e.target.value)}
                placeholder="12345"
                style={{ ...inputBase, direction: 'ltr', textAlign: 'center', letterSpacing: '0.3em', fontSize: 18 }}
              />
            </Field>
            <Btn loading={loading} color="#00E5A0" label="تایید کد" />
            <div style={{ textAlign: 'center', fontSize: 12, color: '#ddd5bd', marginTop: 4 }}>
              کد نیامد؟{' '}
              {resendCooldown > 0 ? (
                <span style={{ color: '#5A7088' }}>ارسال مجدد کد ({resendCooldown} ثانیه)</span>
              ) : (
                <button type="button" disabled={otpResending} onClick={handleResendOtp} style={{
                  background: 'none', border: 'none', color: '#00C8FF', fontSize: 12,
                  cursor: otpResending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600,
                }}>{otpResending ? '...' : 'ارسال مجدد کد'}</button>
              )}
            </div>
          </form>
        )}
        </>)}
      </div>

      <style>{`
        input::placeholder { color: rgba(90,112,136,0.6); }
        input:focus, select:focus {
          border-color: rgba(0,200,255,0.55) !important;
          background: rgba(0,200,255,0.04) !important;
        }
        option { background: #0A1628; color: #E8F4FF; }
        select:disabled option { color: #3A5068; }
      `}</style>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = React.useId()
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id })
    : children
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 11, color: '#ddd5bd', fontWeight: 500 }}>{label}</label>
      {child}
    </div>
  )
}

function PasswordInput({ id, value, onChange, placeholder, autoComplete, minLength, style }: {
  id?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  autoComplete?: string
  minLength?: number
  style: React.CSSProperties
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        required minLength={minLength} autoComplete={autoComplete}
        value={value} onChange={onChange}
        placeholder={placeholder}
        style={{ ...style, paddingLeft: 40 }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
        style={{
          position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 8, color: '#ddd5bd', fontSize: 13, lineHeight: 1,
          fontFamily: 'inherit',
        }}
      >
        {visible ? '🙈' : '👁️'}
      </button>
    </div>
  )
}

function Btn({ loading, color, label }: { loading: boolean; color: string; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: '100%', padding: '13px', borderRadius: 11,
        fontSize: 14, fontWeight: 700,
        background: loading
          ? `${color}0D`
          : `linear-gradient(135deg, ${color}22, ${color}38)`,
        border: `0.5px solid ${loading ? `${color}33` : `${color}66`}`,
        color: loading ? `${color}88` : color,
        cursor: loading ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.2s',
        marginTop: 4,
        letterSpacing: '0.02em',
      }}
    >
      {loading ? '...' : label}
    </button>
  )
}
