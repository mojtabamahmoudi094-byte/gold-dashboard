'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { darkTheme, lightTheme } from '../lib/theme'
import { useIsMobile } from '../lib/useIsMobile'

// دروازه‌ی عضویت: تا وقتی کاربر لاگین نکرده، به‌جای محتوای صفحه پیام عضویت + لینک ورود/ثبت‌نام نشان می‌دهد
// حالت نرم (features): پشت کارت عضویت، اسکلت جدولی بلورشده نشان می‌دهد تا کاربر بفهمد
// «واقعاً چیزی این پشت هست» + فهرست امکانات با تیک. اسکلت هیچ داده/عددی ندارد (نه fetch،
// نه سهمیهٔ BrsApi، نه عدد ساختگی) — فقط حس بصری محتوای قفل‌شده.
export default function AuthGate({
  title,
  description,
  features,
  children,
}: {
  title: string
  description?: string
  features?: string[]
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
    const soft = !!features?.length
    return (
      <main style={{
        minHeight: '100vh', background: t.bg, color: t.text,
        fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
        padding: isMobile ? '20px 14px 60px' : '32px 24px 80px',
        position: 'relative', overflow: 'hidden',
      }}>
        {soft && (
          // اسکلت جدولی بلورشده — صرفاً بصری، بدون داده و بدون تعامل
          <div aria-hidden style={{
            position: 'absolute', inset: 0, padding: isMobile ? '24px 14px' : '40px 48px',
            filter: 'blur(5px)', opacity: isDark ? 0.5 : 0.65, pointerEvents: 'none', userSelect: 'none',
          }}>
            <div style={{ height: 26, width: '38%', borderRadius: 8, background: t.borderStrong, marginBottom: 10 }} />
            <div style={{ height: 13, width: '58%', borderRadius: 6, background: t.border, marginBottom: 22 }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              {[90, 120, 74, 104].map((w, i) => (
                <div key={i} style={{ height: 34, width: w, borderRadius: 999, background: t.border }} />
              ))}
            </div>
            <div style={{ borderRadius: 16, border: `1px solid ${t.border}`, background: t.panel, padding: 16 }}>
              {Array.from({ length: 9 }).map((_, r) => (
                <div key={r} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '11px 4px', borderBottom: r < 8 ? `1px solid ${t.border}` : 'none' }}>
                  <div style={{ height: 13, width: 68, borderRadius: 6, background: t.borderStrong }} />
                  {[110, 76, 88, 64, 96].slice(0, isMobile ? 3 : 5).map((w, c) => (
                    <div key={c} style={{ height: 11, width: w, borderRadius: 6, background: t.border }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{
          maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: isMobile ? '32px 22px' : 40,
          borderRadius: 16, background: t.panel, border: `1px solid ${t.border}`, boxShadow: t.cardShadow,
          position: 'relative',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{title}</h1>
          <p style={{ fontSize: 13, color: t.muted, lineHeight: 2, margin: '0 0 20px' }}>
            {description || 'برای استفاده از این بخش باید عضو سایت شوید.'}
          </p>
          {soft && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', textAlign: 'right', display: 'inline-block' }}>
              {features!.map(f => (
                <li key={f} style={{ fontSize: 13, lineHeight: 2.2, color: t.text }}>
                  <span style={{ color: '#d9b45b', marginLeft: 8 }}>✓</span>{f}
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/auth?tab=register" style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: 10, fontSize: 13.5, fontWeight: 600,
              background: 'linear-gradient(135deg, #d9b45b, #f4d795)', color: '#0A0805', textDecoration: 'none',
            }}>ثبت‌نام رایگان</Link>
            <Link href="/auth?tab=login" style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: 10, fontSize: 13.5, fontWeight: 600,
              background: 'transparent', color: t.text, textDecoration: 'none', border: `1px solid ${t.borderStrong}`,
            }}>ورود</Link>
          </div>
          {soft && (
            <p style={{ fontSize: 11, color: t.muted, margin: '14px 0 0' }}>
              عضویت رایگان است و کمتر از یک دقیقه طول می‌کشد.
            </p>
          )}
        </div>
      </main>
    )
  }

  return <>{children}</>
}
