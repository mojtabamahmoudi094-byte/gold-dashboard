'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const safe = (v: any) => Number(v || 0)

const darkTheme = {
  bg: '#060B14',
  panel: 'rgba(13,23,38,0.8)',
  border: 'rgba(0,200,255,0.1)',
  borderStrong: 'rgba(0,200,255,0.2)',
  text: '#E2E8F0',
  textBright: '#FFFFFF',
  muted: '#7B93AC',
  faint: '#5A7088',
  accent: '#00C8FF',
  headerBg: 'rgba(6,11,20,0.97)',
}
const lightTheme = {
  bg: '#F4F7FB',
  panel: 'rgba(255,255,255,0.9)',
  border: 'rgba(0,120,170,0.15)',
  borderStrong: 'rgba(0,120,170,0.3)',
  text: '#1A2433',
  textBright: '#0A0E16',
  muted: '#5A6B7E',
  faint: '#8595A8',
  accent: '#0095C8',
  headerBg: 'rgba(244,247,251,0.97)',
}

export default function SignalsPage() {
  const router = useRouter()
  const [signals, setSignals] = useState<any[]>([])
  const [isDark, setIsDark] = useState(true)
  const [loading, setLoading] = useState(true)

  const t: any = isDark ? darkTheme : lightTheme

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('signals')
        .select('*')
        .order('id', { ascending: false })
      if (data) setSignals(data)
      setLoading(false)
    }
    load()
  }, [])

  // count by type
  const buyCount = signals.filter(s => s.signal_type === 'خرید').length
  const sellCount = signals.filter(s => s.signal_type === 'فروش').length
  const holdCount = signals.filter(s => s.signal_type === 'نگه‌داری').length

  return (
    <main style={{
      minHeight: '100vh', background: t.bg, color: t.text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
      transition: 'background 0.3s, color 0.3s',
    }}>
      {/* HEADER */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', borderBottom: `0.5px solid ${t.border}`,
        background: t.headerBg, position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.accent, boxShadow: `0 0 8px ${t.accent}` }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.textBright, letterSpacing: '0.02em' }}>
              تاریخچه سیگنال‌ها
            </div>
            <div style={{ fontSize: 10, color: t.muted }}>شاگرد تنبل بازار · t.me/shagerdebazar</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              fontSize: 12, padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
              background: `${t.accent}1A`, border: `0.5px solid ${t.accent}66`,
              color: t.accent, fontFamily: 'inherit', fontWeight: 700,
            }}
          >
            بازگشت به داشبورد
          </button>
          <button
            onClick={() => setIsDark(!isDark)}
            title="تغییر قالب"
            style={{
              fontSize: 15, padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
              background: t.panel, border: `0.5px solid ${t.borderStrong}`, color: t.text,
              fontFamily: 'inherit',
            }}
          >
            {isDark ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* SUMMARY CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <SummaryCard t={t} label="سیگنال خرید" count={buyCount} color="#00E5A0" />
          <SummaryCard t={t} label="سیگنال فروش" count={sellCount} color="#FF4D6A" />
          <SummaryCard t={t} label="سیگنال نگه‌داری" count={holdCount} color={t.accent} />
        </div>

        {/* TABLE */}
        <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: t.muted, letterSpacing: '0.04em' }}>همه سیگنال‌ها</span>
            <span style={{ fontSize: 11, color: t.muted }}>{signals.length.toLocaleString('fa-IR')} سیگنال</span>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: t.muted, fontSize: 13 }}>در حال بارگذاری...</div>
          ) : signals.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: t.muted, fontSize: 13 }}>
              هنوز سیگنالی ثبت نشده است
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['تاریخ', 'سیگنال', 'ارزش بازار', 'توضیح'].map(h => (
                      <th key={h} style={{ color: t.muted, fontWeight: 500, textAlign: 'right', padding: '8px 10px', borderBottom: `0.5px solid ${t.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s) => {
                    const sigColor = s.signal_type === 'خرید' ? '#00E5A0' : s.signal_type === 'فروش' ? '#FF4D6A' : t.accent
                    return (
                      <tr key={s.id} style={{ borderBottom: `0.5px solid ${t.border}` }}>
                        <td style={{ padding: '10px', color: t.text }}>{s.signal_date_shamsi}</td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ display: 'inline-block', background: `${sigColor}1A`, color: sigColor, borderRadius: 4, padding: '3px 12px', fontSize: 11, fontWeight: 700 }}>
                            {s.signal_type}
                          </span>
                        </td>
                        <td style={{ padding: '10px', color: t.textBright, fontWeight: 500 }}>{safe(s.market_value).toLocaleString('fa-IR')}</td>
                        <td style={{ padding: '10px', color: t.muted, fontSize: 11 }}>{s.note}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
      `}</style>
    </main>
  )
}

function SummaryCard({ label, count, color, t }: any) {
  return (
    <div style={{ background: t.panel, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', backdropFilter: 'blur(12px)' }}>
      <div style={{ fontSize: 11, color: t.muted, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{count.toLocaleString('fa-IR')}</div>
    </div>
  )
}
