'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

type ToastKind = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  message: string
  kind: ToastKind
}

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const KIND_STYLE: Record<ToastKind, { border: string; icon: string }> = {
  success: { border: '#059669', icon: '✓' },
  error: { border: '#DC2626', icon: '✕' },
  info: { border: '#d9b45b', icon: 'ℹ' },
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx.showToast
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, kind }])
    window.setTimeout(() => dismiss(id), 3000)
  }, [dismiss])

  useEffect(() => {
    const onOnline = () => showToast('اتصال اینترنت وصل شد', 'success')
    const onOffline = () => showToast('اتصال اینترنت قطع شد', 'error')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [showToast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          insetInlineEnd: 20,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 220,
              maxWidth: 340,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(13,16,23,0.96)',
              color: '#eef1f8',
              borderInlineStart: `3px solid ${KIND_STYLE[t.kind].border}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
              fontSize: 13,
              lineHeight: 1.6,
              animation: 'bs-toast-in 0.2s ease-out',
            }}
          >
            <span style={{ color: KIND_STYLE[t.kind].border, fontWeight: 700 }}>{KIND_STYLE[t.kind].icon}</span>
            <span style={{ flex: 1 }}>{t.message}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes bs-toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
