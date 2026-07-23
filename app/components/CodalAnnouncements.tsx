'use client'

import { useCallback, useEffect, useState } from 'react'

// اطلاعیه‌های کدال زیر صفحه هر نماد (سهم و صندوق بورسی)
// دریافت کلاینت‌ساید مستقیم از BrsAPI — مرورگر کاربر IP ایران دارد و کدال/BrsAPI
// از IP خارجی (سرور Next) جواب نمی‌دهد. الگو مثل app/admin/page.tsx
// پاسخ صفر اطلاعیه = throttle موقت کدال؛ پیام + دکمه تلاش دوباره

const ACCENT = '#38BDF8'   // آبی آسمانی — اطلاعیه‌های کدال
const CACHE_TTL = 60 * 60 * 1000   // ۱ ساعت
const SHOW_LIMIT = 12

type Ann = {
  title?: string
  date_publish?: string
  date_title?: string
  link?: string
  link_attachment?: string
  link_excel?: string
}

// ماسک BrsAPI روی base64 لینک‌ها: QQQaQQQ = %2f و OOObOOO = %2b
const unmask = (s: string) => s.replace(/QQQaQQQ/g, '%2f').replace(/OOObOOO/g, '%2b')

const toFaDigits = (s: string) => s.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
const toEnDigits = (s: string) => s.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))

// تاریخ شمسی امروز منهای ۲ ماه — برای date_start (بازه بلند HTTP 400 می‌دهد)
function twoMonthsAgoShamsi(): string {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0)
  let y = get('year'), m = get('month') - 2
  const d = Math.min(get('day'), 29)
  if (m < 1) { m += 12; y -= 1 }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// دسته‌بندی از روی عنوان اطلاعیه
const CATS: [string, string, RegExp][] = [
  ['ماهانه',      '#FACC15', /فعالیت ماهانه/],
  ['میاندوره‌ای', '#F59E0B', /میان ?دوره/],
  ['صورت مالی',   '#F59E0B', /صورت های مالی|صورتهای مالی/],
  ['افشا',        '#F87171', /افشای اطلاعات/],
  ['مجمع',        '#A78BFA', /مجمع/],
  ['شفاف‌سازی',   '#34D399', /شفاف ?سازی/],
  ['پرتفوی',      '#60A5FA', /پرتفوی|وضعیت پورتفوی/],
]
const norm = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').replace(/\s+/g, ' ').trim()
function catOf(title: string): { label: string; color: string } {
  const t = norm(title)
  for (const [label, color, re] of CATS) if (re.test(t)) return { label, color }
  return { label: 'سایر', color: '#94A3B8' }
}

const linkOf = (a: Ann): string | null => {
  for (const raw of [a.link, a.link_attachment, a.link_excel]) {
    if (raw && /^https?:/i.test(raw)) return unmask(raw)
  }
  return null
}

// «1405/04/16» (رقم لاتین یا فارسی) → نمایش فارسی؛ برای sort نسخه لاتین
const pubKey = (a: Ann) => toEnDigits(String(a.date_publish ?? ''))

type State = 'loading' | 'ok' | 'empty' | 'error'

export default function CodalAnnouncements({ symbol, isDark, isMobile, pageSize }: {
  symbol: string; isDark: boolean; isMobile: boolean
  // اگر ست شود، به‌جای «نمایش همه» صفحه‌بندی pageSize‌تایی فعال می‌شود
  pageSize?: number
}) {
  const [list, setList] = useState<Ann[]>([])
  const [state, setState] = useState<State>('loading')
  const [expanded, setExpanded] = useState(false)
  const [page, setPage] = useState(0)

  const load = useCallback(async (force = false) => {
    if (!symbol) return
    const cacheKey = `codal-ann:${symbol}`
    if (!force) {
      try {
        const raw = window.sessionStorage.getItem(cacheKey)
        if (raw) {
          const { ts, anns } = JSON.parse(raw)
          if (Date.now() - ts < CACHE_TTL && Array.isArray(anns)) {
            setList(anns)
            setState(anns.length > 0 ? 'ok' : 'empty')
            return
          }
        }
      } catch { /* کش خراب — دریافت تازه */ }
    }
    setState('loading')
    try {
      const url = `/api/brs-proxy?endpoint=codal-announcement`
        + `&l18=${encodeURIComponent(symbol)}&date_start=${encodeURIComponent(twoMonthsAgoShamsi())}`
      const res = await fetch(url, { signal: AbortSignal.timeout(40_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const anns: Ann[] = (Array.isArray(data) ? data : (data?.announcement ?? []))
        .filter((a: Ann) => a && a.title)
        .sort((a: Ann, b: Ann) => pubKey(b).localeCompare(pubKey(a)))
      try { window.sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), anns })) } catch {}
      setList(anns)
      setState(anns.length > 0 ? 'ok' : 'empty')
    } catch {
      setState('error')
    }
  }, [symbol])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(0) }, [symbol])

  const panel = isDark ? 'rgba(10,18,30,0.88)' : 'rgba(255,255,255,0.9)'
  const text  = isDark ? '#E8F4FF' : '#0F1E2E'
  const muted = isDark ? '#ddd5bd' : '#6B7F90'
  const line  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,46,0.08)'

  // حالت صفحه‌بندی: pageSize اطلاعیه در هر صفحه؛ حالت قدیمی: SHOW_LIMIT + «نمایش همه»
  const totalPages = pageSize ? Math.max(1, Math.ceil(list.length / pageSize)) : 1
  const safePage = Math.min(page, totalPages - 1)
  const shown = pageSize
    ? list.slice(safePage * pageSize, (safePage + 1) * pageSize)
    : (expanded ? list : list.slice(0, SHOW_LIMIT))

  return (
    <section style={{
      background: panel, border: `0.5px solid ${line}`, borderRadius: 16,
      padding: '20px 20px 22px', marginTop: 22, backdropFilter: 'blur(12px)', minWidth: 0,
      direction: 'rtl', fontFamily: 'Vazirmatn, Arial, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: ACCENT, flexShrink: 0, boxShadow: `0 0 10px ${ACCENT}` }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: text }}>اطلاعیه‌های کدال</span>
        {state === 'ok' && (
          <span style={{
            fontSize: 10, padding: '3px 9px', borderRadius: 7,
            background: `${ACCENT}14`, border: `0.5px solid ${ACCENT}40`, color: ACCENT,
          }}>{list.length.toLocaleString('fa-IR')} اطلاعیه — ۲ ماه اخیر</span>
        )}
      </div>

      {state === 'loading' && (
        <div style={{ fontSize: 12, color: muted, padding: '14px 0' }}>در حال دریافت از کدال…</div>
      )}

      {(state === 'empty' || state === 'error') && (
        <div style={{ fontSize: 12, color: muted, padding: '10px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>
            {state === 'empty'
              ? 'اطلاعیه‌ای دریافت نشد — کدال ممکن است موقتاً درخواست‌ها را محدود کرده باشد.'
              : 'خطا در دریافت اطلاعیه‌ها — اتصال یا سرویس کدال در دسترس نیست.'}
          </span>
          <button onClick={() => load(true)} style={{
            fontSize: 11, padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
            background: `${ACCENT}14`, border: `0.5px solid ${ACCENT}40`, color: ACCENT,
            fontFamily: 'inherit',
          }}>تلاش دوباره</button>
        </div>
      )}

      {state === 'ok' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {shown.map((a, i) => {
              const cat = catOf(a.title || '')
              const href = linkOf(a)
              const row = (
                <div style={{
                  display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: 10,
                  padding: '9px 2px', borderTop: i === 0 ? 'none' : `0.5px solid ${line}`,
                  flexDirection: isMobile ? 'column' : 'row',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, padding: '2.5px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                      color: cat.color, background: `${cat.color}14`, border: `0.5px solid ${cat.color}35`, flexShrink: 0,
                    }}>{cat.label}</span>
                    <span style={{ fontSize: 12, color: text, lineHeight: 1.7, minWidth: 0 }}>{a.title}</span>
                  </div>
                  <span style={{ fontSize: 10.5, color: muted, whiteSpace: 'nowrap', flexShrink: 0, marginRight: isMobile ? 0 : 'auto' }}>
                    {a.date_publish ? toFaDigits(toEnDigits(String(a.date_publish))) : '—'}
                  </span>
                </div>
              )
              return href ? (
                <a key={i} href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{row}</a>
              ) : <div key={i}>{row}</div>
            })}
          </div>
          {pageSize ? (totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                style={{
                  fontSize: 11, padding: '6px 16px', borderRadius: 8, minHeight: 36,
                  cursor: safePage === 0 ? 'default' : 'pointer', opacity: safePage === 0 ? 0.4 : 1,
                  background: 'transparent', border: `0.5px solid ${line}`, color: muted, fontFamily: 'inherit',
                }}
              >قبلی</button>
              <span style={{ fontSize: 11, color: muted }}>
                صفحه {(safePage + 1).toLocaleString('fa-IR')} از {totalPages.toLocaleString('fa-IR')}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                style={{
                  fontSize: 11, padding: '6px 16px', borderRadius: 8, minHeight: 36,
                  cursor: safePage >= totalPages - 1 ? 'default' : 'pointer', opacity: safePage >= totalPages - 1 ? 0.4 : 1,
                  background: `${ACCENT}14`, border: `0.5px solid ${ACCENT}40`, color: ACCENT, fontFamily: 'inherit',
                }}
              >بعدی</button>
            </div>
          )) : (list.length > SHOW_LIMIT && (
            <button onClick={() => setExpanded(e => !e)} style={{
              marginTop: 12, fontSize: 11, padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', border: `0.5px solid ${line}`, color: muted, fontFamily: 'inherit',
            }}>
              {expanded ? 'نمایش کمتر' : `نمایش همه (${list.length.toLocaleString('fa-IR')})`}
            </button>
          ))}
          <div style={{ fontSize: 9.5, color: muted, marginTop: 10 }}>
            منبع: سامانه کدال (codal.ir) — دریافت زنده از مرورگر شما
          </div>
        </>
      )}
    </section>
  )
}
