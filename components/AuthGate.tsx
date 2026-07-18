'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { darkTheme, lightTheme } from '../lib/theme'
import { useIsMobile } from '../lib/useIsMobile'

// دروازه‌ی عضویت: تا وقتی کاربر لاگین نکرده، به‌جای محتوای صفحه پیام عضویت + لینک ورود/ثبت‌نام نشان می‌دهد
export default function AuthGate({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  const [isDark, setIsDark] = useState(true)
  const isMobile = useIsMobile()
  const [user, setUser] = useState<any>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme')
    if (saved) setIsDark(saved !== 'light')
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const t = isDark ? darkTheme : lightTheme

  if (!checked) {
    return (
      <main style={{
        minHeight: '100vh', background: t.bg, color: t.text,
        fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ color: t.muted, fontSize: 13 }}>در حال بارگذاری…</div>
      </main>
    )
  }

  if (!user) {
    return (
      <main style={{
        minHeight: '100vh', background: t.bg, color: t.text,
        fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
        padding: isMobile ? '20px 14px 60px' : '32px 24px 80px',
      }}>
        <div style={{
          maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: 40,
          borderRadius: 16, background: t.panel, border: `1px solid ${t.border}`, boxShadow: t.cardShadow,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{title}</h1>
          <p style={{ fontSize: 13, color: t.muted, lineHeight: 2, margin: '0 0 20px' }}>
            {description || 'برای استفاده از این بخش باید عضو سایت شوید.'}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/auth?tab=register" style={{
              display: 'inline-block', padding: '10px 28px', borderRadius: 10, fontSize: 13.5, fontWeight: 600,
              background: 'linear-gradient(135deg, #d9b45b, #f4d795)', color: '#0A0805', textDecoration: 'none',
            }}>ثبت‌نام</Link>
            <Link href="/auth?tab=login" style={{
              display: 'inline-block', padding: '10px 28px', borderRadius: 10, fontSize: 13.5, fontWeight: 600,
              background: 'transparent', color: t.text, textDecoration: 'none', border: `1px solid ${t.borderStrong}`,
            }}>ورود</Link>
          </div>
        </div>
      </main>
    )
  }

  return <>{children}</>
}
