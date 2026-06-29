'use client'

import Link from 'next/link'

const analyses = [
  {
    href: '/analysis/gold',
    icon: '🥇',
    title: 'تحلیل طلا',
    desc: 'انس جهانی، ارز، سکه، مثقال، گرم — قیمت واقعی vs بازار — حباب لحظه‌ای',
    live: true,
    tags: ['انس طلا', 'سکه', 'مثقال', 'گرم ۱۸/۲۴', 'حباب'],
  },
  // Future analyses
  {
    href: '#',
    icon: '🏘️',
    title: 'تحلیل مسکن',
    desc: 'به‌زودی',
    live: false,
    tags: [],
  },
  {
    href: '#',
    icon: '📈',
    title: 'تحلیل بورس',
    desc: 'به‌زودی',
    live: false,
    tags: [],
  },
]

export default function AnalysisPage() {
  const bg = '#060B14'
  const panel = 'rgba(10,18,30,0.88)'
  const border = 'rgba(0,200,255,0.12)'
  const text = '#E8F4FF'
  const muted = '#5A7088'
  const accent = '#00C8FF'
  const green = '#00E5A0'

  return (
    <main style={{
      minHeight: '100vh', background: bg, color: text,
      fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl',
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px' }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: text, marginBottom: 6 }}>تحلیل بازارها</div>
          <div style={{ fontSize: 13, color: muted }}>
            داده زنده از API‌های عمومی — حباب‌سنجی لحظه‌ای برای بازارهای مختلف
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {analyses.map((a) => {
            const isActive = a.live

            return (
              <Link
                key={a.href}
                href={a.href}
                style={{
                  textDecoration: 'none',
                  display: 'block',
                  background: panel,
                  border: `0.5px solid ${isActive ? 'rgba(0,200,255,0.25)' : border}`,
                  borderRadius: 16,
                  padding: '24px',
                  transition: 'border-color 0.2s, background 0.2s',
                  cursor: isActive ? 'pointer' : 'default',
                  opacity: isActive ? 1 : 0.5,
                  backdropFilter: 'blur(12px)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, fontSize: 22,
                    background: isActive ? 'rgba(0,200,255,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `0.5px solid ${isActive ? 'rgba(0,200,255,0.2)' : border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {a.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: text }}>{a.title}</span>
                      {a.live && (
                        <span style={{
                          fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                          background: `${green}22`, border: `0.5px solid ${green}66`,
                          color: green, fontFamily: 'system-ui',
                        }}>LIVE</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: muted, lineHeight: 1.6 }}>{a.desc}</div>
                  </div>
                </div>

                {a.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {a.tags.map(tag => (
                      <span key={tag} style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 6,
                        background: 'rgba(0,200,255,0.06)',
                        border: '0.5px solid rgba(0,200,255,0.15)',
                        color: '#A0B4C8',
                      }}>{tag}</span>
                    ))}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');`}</style>
    </main>
  )
}
