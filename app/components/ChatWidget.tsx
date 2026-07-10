'use client'

import { useState, useEffect, useRef } from 'react'
import { useIsMobile } from '../../lib/useIsMobile'

// ————— چت‌باکس شناور سراسری (مثل Chatwoot) — دستیار هوشمند بورس سنج —————

// از سمت کلاینت به‌جای زدن مستقیم به بات خارجی، از پروکسی خودمان عبور می‌کند
// تا rate limit و اعتبارسنجی ورودی سمت سرور اعمال شود
const AI_API = '/api/chat'
const ACCENT = '#3b82f6'
const ACCENT2 = '#8b5cf6'
const GRAD = `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`

type ChatMsg = { role: 'user' | 'ai'; text: string }

const SUGGESTED_QS = [
  'وضعیت کلی بازار امروز چطوره؟',
  'صندوق طلا بخرم یا سکه فیزیکی؟',
  'تحلیل بنیادی یعنی چی؟',
]

const THINKING_STEPS = [
  'در حال فکر کردن…',
  'مرور کتاب‌های تحلیل بنیادی…',
  'بررسی داده‌های بازار…',
  'نوشتن جواب…',
]

const STORAGE_KEY = 'bs-chat-widget-msgs'

// حذف نشانه‌گذاری markdown از جواب برای نمایش تمیز
const stripMd = (s: string) =>
  s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,4}\s*/gm, '').replace(/^\s*[*-]\s+/gm, '• ')

// صدای اعلان ding دو-نتی با WebAudio — بدون فایل صوتی
function playDing() {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    type AC = typeof AudioContext
    const Ctx: AC = window.AudioContext || (window as unknown as { webkitAudioContext: AC }).webkitAudioContext
    const ctx = new Ctx()
    const notes: [number, number][] = [[660, 0], [990, 0.09]]
    for (const [freq, at] of notes) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      g.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.28)
      o.connect(g); g.connect(ctx.destination)
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.3)
    }
    setTimeout(() => ctx.close(), 800)
  } catch { /* صدا حیاتی نیست */ }
}

const ChatIcon = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ pointerEvents: 'none' }}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
)

const CloseIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ pointerEvents: 'none' }}>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const SendIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: 'scaleX(-1)', pointerEvents: 'none' }}>
    <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
)

const SparkIcon = ({ size = 16, color = '#fff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ pointerEvents: 'none' }}>
    <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z" fill={color} />
    <path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z" fill={color} opacity={0.7} />
  </svg>
)

const TrashIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ pointerEvents: 'none' }}>
    <path d="M3 6h18" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
)

const MailIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ pointerEvents: 'none' }}>
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 6L2 7" />
  </svg>
)

const CheckCircleIcon = ({ size = 42, color = '#4ade80' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ pointerEvents: 'none' }}>
    <circle cx="12" cy="12" r="10" /><path d="M8 12.5l2.5 2.5L16 9" />
  </svg>
)

// ————— فرم پیام به مدیر —————
function ContactForm({ isDark, TEXT, MUTED, PANEL_BORDER, INPUT_BG, INPUT_BORDER }: {
  isDark: boolean; TEXT: string; MUTED: string; PANEL_BORDER: string; INPUT_BG: string; INPUT_BORDER: string
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const submit = async () => {
    if (!message.trim() || status === 'sending') return
    setStatus('sending')
    try {
      const res = await fetch('/api/contact-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      })
      const data = await res.json()
      if (data.ok) {
        setStatus('sent')
        setMessage('')
        playDing()
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 12,
    background: INPUT_BG, border: `1px solid ${INPUT_BORDER}`,
    color: TEXT, fontSize: 12.5, fontFamily: 'inherit',
    transition: 'border-color .15s ease, box-shadow .15s ease',
  }

  if (status === 'sent') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', animation: 'cwMsgIn 0.3s ease both' }}>
        <CheckCircleIcon />
        <div style={{ fontSize: 14.5, fontWeight: 800, color: TEXT, margin: '14px 0 6px' }}>پیامت ارسال شد ✅</div>
        <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 2, marginBottom: 18 }}>
          پیام به ایمیل مدیر رسید. در اولین فرصت پاسخ داده می‌شود.
        </div>
        <button
          className="cw-chip"
          onClick={() => setStatus('idle')}
          style={{
            fontSize: 11.5, padding: '9px 18px', borderRadius: 999, cursor: 'pointer',
            background: `${ACCENT}12`, border: `1px solid ${ACCENT}35`,
            color: isDark ? '#93c5fd' : '#2563eb', fontFamily: 'inherit',
          }}
        >
          ارسال پیام جدید
        </button>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT, marginBottom: 4 }}>پیام به مدیر سایت</div>
        <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.9 }}>
          انتقاد، پیشنهاد یا هر حرفی داری بنویس — مستقیم به ایمیل مدیر می‌رسد
        </div>
      </div>
      <input
        className="cw-input"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="نام (اختیاری)"
        aria-label="نام"
        style={fieldStyle}
      />
      <input
        className="cw-input"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="ایمیل برای دریافت پاسخ (اختیاری)"
        aria-label="ایمیل"
        type="email"
        dir="ltr"
        style={{ ...fieldStyle, textAlign: 'right' }}
      />
      <textarea
        className="cw-input"
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="متن پیام…"
        aria-label="متن پیام"
        rows={5}
        style={{ ...fieldStyle, resize: 'none', lineHeight: 1.9 }}
      />
      {status === 'error' && (
        <div style={{ fontSize: 11, color: '#ef4444', textAlign: 'center' }}>
          ارسال ناموفق بود. دوباره امتحان کن.
        </div>
      )}
      <button
        className="cw-send"
        onClick={submit}
        disabled={status === 'sending' || !message.trim()}
        aria-label="ارسال پیام به مدیر"
        style={{
          padding: '12px 0', borderRadius: 12, border: 'none',
          cursor: status === 'sending' || !message.trim() ? 'default' : 'pointer',
          background: GRAD, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: status === 'sending' || !message.trim() ? 0.45 : 1,
        }}
      >
        {status === 'sending' ? 'در حال ارسال…' : <><SendIcon size={15} /> ارسال به مدیر</>}
      </button>
    </div>
  )
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'ai' | 'contact'>('ai')
  const [isDark, setIsDark] = useState(true)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [unread, setUnread] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const isMobile = useIsMobile()
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const openRef = useRef(open)
  openRef.current = open

  // تم + بازیابی گفتگو از sessionStorage
  useEffect(() => {
    const readTheme = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    readTheme()
    window.addEventListener('themechange', readTheme)
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY)
      if (saved) setMessages(JSON.parse(saved))
    } catch { /* گفتگوی قبلی مهم نیست */ }
    setHydrated(true)
    return () => window.removeEventListener('themechange', readTheme)
  }, [])

  // ذخیره گفتگو
  useEffect(() => {
    if (!hydrated) return
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))) } catch { /* پر بودن storage */ }
  }, [messages, hydrated])

  // چرخش پیام وضعیت هنگام انتظار
  useEffect(() => {
    if (!loading) return
    setStep(0)
    const id = setInterval(() => setStep(s => (s + 1) % THINKING_STEPS.length), 6000)
    return () => clearInterval(id)
  }, [loading])

  // اسکرول خودکار به آخرین پیام
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, open])

  // بستن با ESC
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // فوکوس روی ورودی وقتی پنل باز شد
  useEffect(() => {
    if (open) {
      setUnread(false)
      setTimeout(() => inputRef.current?.focus(), 250)
    }
  }, [open])

  const send = async (raw?: string) => {
    const q = (raw ?? input).trim()
    if (!q || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: q }])
    setLoading(true)
    try {
      const res = await fetch(AI_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'ai', text: stripMd(data.answer || data.error || 'خطایی رخ داد.') }])
      playDing()
      if (!openRef.current) setUnread(true)
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'ارتباط با دستیار برقرار نشد. کمی بعد دوباره امتحان کنید.' }])
    }
    setLoading(false)
  }

  const clearChat = () => {
    setMessages([])
    try { window.sessionStorage.removeItem(STORAGE_KEY) } catch { /* مهم نیست */ }
  }

  // رنگ‌های تم
  const PANEL_BG = isDark ? '#0d1017' : '#fdfaf4'
  const PANEL_BORDER = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(59,130,246,0.18)'
  const TEXT = isDark ? '#dbe2ef' : '#3d3425'
  const MUTED = isDark ? '#6b7280' : '#8a7a5e'
  const AI_BUBBLE = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(59,130,246,0.06)'
  const INPUT_BG = isDark ? 'rgba(255,255,255,0.04)' : '#fff'
  const INPUT_BORDER = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'

  const panelW = isMobile ? 'calc(100vw - 24px)' : 380
  const panelH = isMobile ? 'min(560px, calc(100dvh - 100px))' : 'min(600px, calc(100dvh - 120px))'

  return (
    <div style={{ fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl' }}>
      <style>{`
        @keyframes cwMsgIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        @keyframes cwPanelIn { from { opacity: 0; transform: translateY(14px) scale(0.97) } to { opacity: 1; transform: none } }
        @keyframes cwDot { 0%,80%,100% { transform: translateY(0); opacity: .45 } 40% { transform: translateY(-4px); opacity: 1 } }
        @keyframes cwPulse { 0%,100% { box-shadow: 0 6px 24px rgba(59,130,246,0.45) } 50% { box-shadow: 0 6px 34px rgba(139,92,246,0.6) } }
        @keyframes cwBadge { 0%,100% { transform: scale(1) } 50% { transform: scale(1.25) } }
        @media (prefers-reduced-motion: reduce) {
          .cw-anim, .cw-anim * { animation: none !important; transition: none !important }
        }
        .cw-fab { transition: transform .2s ease, box-shadow .2s ease }
        .cw-fab:hover { transform: translateY(-3px) scale(1.05) }
        .cw-fab:active { transform: scale(0.96) }
        .cw-chip { transition: transform .18s ease, box-shadow .18s ease, background .18s ease }
        .cw-chip:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 14px ${ACCENT}30; background: ${ACCENT}1e }
        .cw-send { transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease }
        .cw-send:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px ${ACCENT}50 }
        .cw-input:focus { outline: none; border-color: ${ACCENT}70 !important; box-shadow: 0 0 0 3px ${ACCENT}22 }
        .cw-hbtn { transition: background .15s ease; background: transparent }
        .cw-hbtn:hover { background: rgba(255,255,255,0.15) }
      `}</style>

      {/* ————— پنل چت ————— */}
      {open && (
        <div
          className="cw-anim"
          role="dialog"
          aria-label="چت با دستیار بورس سنج"
          style={{
            position: 'fixed', bottom: isMobile ? 84 : 96, left: isMobile ? 12 : 24, zIndex: 9999,
            width: panelW, height: panelH,
            display: 'flex', flexDirection: 'column',
            background: PANEL_BG,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 18, overflow: 'hidden',
            boxShadow: isDark ? '0 24px 70px rgba(0,0,0,0.65)' : '0 24px 70px rgba(0,0,0,0.18)',
            animation: 'cwPanelIn 0.25s ease both',
          }}
        >
          {/* هدر */}
          <div style={{
            flexShrink: 0, padding: '14px 16px',
            background: GRAD,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              width: 38, height: 38, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
            }}>
              <SparkIcon size={19} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>دستیار بورس سنج</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
                آنلاین — هوش مصنوعی
              </div>
            </div>
            {tab === 'ai' && messages.length > 0 && (
              <button
                className="cw-hbtn"
                onClick={clearChat}
                title="پاک کردن گفتگو"
                aria-label="پاک کردن گفتگو"
                style={{ width: 32, height: 32, borderRadius: 9, border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <TrashIcon />
              </button>
            )}
            <button
              className="cw-hbtn"
              onClick={() => setOpen(false)}
              aria-label="بستن چت"
              style={{ width: 32, height: 32, borderRadius: 9, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <CloseIcon size={18} />
            </button>
          </div>

          {/* تب‌ها: دستیار هوشمند / پیام به مدیر */}
          <div style={{ flexShrink: 0, display: 'flex', borderBottom: `1px solid ${PANEL_BORDER}` }}>
            {([
              { id: 'ai' as const, label: 'دستیار هوشمند', icon: <SparkIcon size={13} color={tab === 'ai' ? ACCENT : MUTED} /> },
              { id: 'contact' as const, label: 'پیام به مدیر', icon: <MailIcon size={13} /> },
            ]).map(t2 => (
              <button
                key={t2.id}
                onClick={() => setTab(t2.id)}
                aria-selected={tab === t2.id}
                role="tab"
                style={{
                  flex: 1, padding: '11px 0', border: 'none', cursor: 'pointer',
                  background: tab === t2.id ? `${ACCENT}10` : 'transparent',
                  color: tab === t2.id ? (isDark ? '#93c5fd' : '#2563eb') : MUTED,
                  fontSize: 11.5, fontWeight: tab === t2.id ? 700 : 500, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderBottom: tab === t2.id ? `2px solid ${ACCENT}` : '2px solid transparent',
                  transition: 'all .18s ease',
                }}
              >
                {t2.icon} {t2.label}
              </button>
            ))}
          </div>

          {tab === 'contact' ? (
            <ContactForm isDark={isDark} TEXT={TEXT} MUTED={MUTED} PANEL_BORDER={PANEL_BORDER} INPUT_BG={INPUT_BG} INPUT_BORDER={INPUT_BORDER} />
          ) : (
            <>
          {/* پیام‌ها */}
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '26px 8px 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                  <span style={{
                    width: 52, height: 52, borderRadius: 17, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `linear-gradient(135deg, ${ACCENT}25, ${ACCENT2}12)`,
                    border: `1px solid ${ACCENT}40`,
                  }}>
                    <SparkIcon size={25} color={ACCENT} />
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: TEXT, marginBottom: 6 }}>
                  سلام! 👋 چطور می‌تونم کمکت کنم؟
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 18, lineHeight: 1.9 }}>
                  درباره بورس، صندوق‌ها، طلا و تحلیل بنیادی هر سوالی داری بپرس
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {SUGGESTED_QS.map(q => (
                    <button
                      key={q}
                      className="cw-chip"
                      onClick={() => send(q)}
                      disabled={loading}
                      aria-label={`پرسیدن: ${q}`}
                      style={{
                        fontSize: 11, padding: '8px 13px', borderRadius: 999, cursor: 'pointer',
                        background: `${ACCENT}12`, border: `1px solid ${ACCENT}35`,
                        color: isDark ? '#93c5fd' : '#2563eb', fontFamily: 'inherit',
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-start' : 'flex-end' }}>
                <div style={{
                  maxWidth: '85%', padding: '10px 14px', borderRadius: 14,
                  fontSize: 12.5, lineHeight: 2, whiteSpace: 'pre-wrap',
                  animation: 'cwMsgIn 0.3s ease both',
                  ...(m.role === 'user'
                    ? { background: GRAD, color: '#fff', borderBottomRightRadius: 4 }
                    : { background: AI_BUBBLE, color: TEXT, border: `1px solid ${PANEL_BORDER}`, borderBottomLeftRadius: 4 }),
                }}>
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: 14, borderBottomLeftRadius: 4,
                  background: AI_BUBBLE, border: `1px solid ${PANEL_BORDER}`,
                  display: 'flex', alignItems: 'center', gap: 9,
                  animation: 'cwMsgIn 0.3s ease both',
                }}>
                  <span style={{ display: 'flex', gap: 3 }}>
                    {[0, 1, 2].map(d => (
                      <span key={d} style={{
                        width: 6, height: 6, borderRadius: '50%', background: ACCENT,
                        animation: `cwDot 1.2s ease-in-out ${d * 0.18}s infinite`,
                      }} />
                    ))}
                  </span>
                  <span style={{ fontSize: 11, color: MUTED }}>{THINKING_STEPS[step]}</span>
                </div>
              </div>
            )}
          </div>

          {/* ورودی */}
          <div style={{ flexShrink: 0, padding: '12px 14px', borderTop: `1px solid ${PANEL_BORDER}`, display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              className="cw-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send() }}
              placeholder="سوالت رو بنویس…"
              aria-label="متن پیام"
              disabled={loading}
              style={{
                flex: 1, padding: '11px 14px', borderRadius: 12,
                background: INPUT_BG, border: `1px solid ${INPUT_BORDER}`,
                color: TEXT, fontSize: 12.5, fontFamily: 'inherit',
                transition: 'border-color .15s ease, box-shadow .15s ease',
              }}
            />
            <button
              className="cw-send"
              onClick={() => send()}
              disabled={loading || !input.trim()}
              aria-label="ارسال پیام"
              style={{
                width: 44, height: 44, borderRadius: 12, border: 'none', flexShrink: 0,
                cursor: loading || !input.trim() ? 'default' : 'pointer',
                background: GRAD, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: loading || !input.trim() ? 0.45 : 1,
              }}
            >
              <SendIcon />
            </button>
          </div>
            </>
          )}

          {/* امضا */}
          <div style={{ flexShrink: 0, textAlign: 'center', fontSize: 9.5, color: MUTED, padding: '0 0 8px' }}>
            قدرت‌گرفته از هوش مصنوعی بورس سنج
          </div>
        </div>
      )}

      {/* ————— دکمه شناور ————— */}
      <button
        className="cw-fab cw-anim"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'بستن چت' : 'باز کردن چت با دستیار'}
        aria-expanded={open}
        style={{
          position: 'fixed', bottom: isMobile ? 18 : 26, left: isMobile ? 16 : 24, zIndex: 9999,
          width: isMobile ? 54 : 58, height: isMobile ? 54 : 58, borderRadius: '50%',
          border: 'none', cursor: 'pointer',
          background: GRAD,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 24px rgba(59,130,246,0.45)',
          animation: open ? undefined : 'cwPulse 3s ease-in-out infinite',
        }}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
        {unread && !open && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            width: 14, height: 14, borderRadius: '50%',
            background: '#ef4444', border: '2px solid #fff',
            animation: 'cwBadge 1.4s ease-in-out infinite',
          }} />
        )}
      </button>
    </div>
  )
}
