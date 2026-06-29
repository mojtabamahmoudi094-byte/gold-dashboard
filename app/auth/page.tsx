'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { PROVINCES } from '../../lib/iranRegions'

type Tab = 'login' | 'register'
type Msg = { type: 'success' | 'error'; text: string }

export default function AuthPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('register')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)

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

  const cities = PROVINCES.find(p => p.name === province)?.cities ?? []

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace('/funds')
    })
  }, [])

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !province || !city) {
      setMsg({ type: 'error', text: 'لطفاً تمام فیلدها را پر کنید' })
      return
    }
    setLoading(true)
    setMsg(null)
    const { error } = await supabase.auth.signUp({
      email: regEmail,
      password: regPassword,
      options: {
        data: { first_name: firstName, last_name: lastName, phone, province, city },
      },
    })
    setLoading(false)
    if (error) {
      const errMsg =
        error.message.includes('already registered') || error.message.includes('already been registered')
          ? 'این ایمیل قبلاً ثبت‌نام شده — لطفاً وارد شوید'
          : error.message.includes('Password')
          ? 'رمز عبور باید حداقل ۶ کاراکتر باشد'
          : 'خطا در ثبت‌نام. لطفاً دوباره تلاش کنید'
      setMsg({ type: 'error', text: errMsg })
    } else {
      setMsg({ type: 'success', text: 'ثبت‌نام موفق! اگر تأیید ایمیل فعال است، لینک ارسال شد. در غیر این صورت هم‌اکنون وارد شده‌اید.' })
      setTimeout(() => router.push('/funds'), 2500)
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

        {/* logo row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: '#00C8FF',
            boxShadow: '0 0 14px rgba(0,200,255,0.7)',
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>بورسنج</div>
            <div style={{ fontSize: 9, color: '#3A5068', marginTop: -1 }}>bourssanj.ir · شاگرد تنبل بازار</div>
          </div>
          <Link href="/funds" style={{
            fontSize: 11, color: '#3A5068', textDecoration: 'none',
            padding: '5px 12px', borderRadius: 8,
            border: '0.5px solid rgba(0,200,255,0.1)',
          }}>
            بازگشت
          </Link>
        </div>

        {/* tab switcher */}
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
                : '#3A5068',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
              {t === 'login' ? 'ورود' : 'ثبت‌نام'}
            </button>
          ))}
        </div>

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
              <input
                type="password" required autoComplete="current-password"
                value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                style={inputBase}
              />
            </Field>
            <Btn loading={loading} color="#00C8FF" label="ورود به حساب" />
            <div style={{ textAlign: 'center', fontSize: 12, color: '#3A5068', marginTop: 4 }}>
              حساب ندارید؟{' '}
              <button type="button" onClick={() => { setTab('register'); setMsg(null) }} style={{
                background: 'none', border: 'none', color: '#00E5A0', fontSize: 12,
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              }}>ثبت‌نام کنید</button>
            </div>
          </form>
        )}

        {/* REGISTER FORM */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="نام">
                <input
                  type="text" required
                  value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="نام"
                  style={inputBase}
                />
              </Field>
              <Field label="نام خانوادگی">
                <input
                  type="text" required
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
              <input
                type="password" required minLength={6} autoComplete="new-password"
                value={regPassword} onChange={e => setRegPassword(e.target.value)}
                placeholder="••••••••"
                style={inputBase}
              />
            </Field>

            <Field label="شماره تماس">
              <input
                type="tel" required
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
            <div style={{ textAlign: 'center', fontSize: 12, color: '#3A5068', marginTop: 4 }}>
              قبلاً ثبت‌نام کرده‌اید؟{' '}
              <button type="button" onClick={() => { setTab('login'); setMsg(null) }} style={{
                background: 'none', border: 'none', color: '#00C8FF', fontSize: 12,
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              }}>وارد شوید</button>
            </div>
          </form>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, color: '#5A7088', fontWeight: 500 }}>{label}</label>
      {children}
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
