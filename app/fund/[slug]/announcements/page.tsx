'use client'

// اطلاعیه‌های کدال صندوق — صفحهٔ مستقل
// باگ قبلی: به CodalAnnouncements، slug (ISIN مثل IRTKMOFD0001) پاس می‌شد
// ولی کدال l18 = نماد معاملاتی (مثل «عیار») می‌خواهد؛ این‌جا نام دارایی پاس می‌شود.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabase'
import { darkTheme, lightTheme, shouldUseDark } from '../../../../lib/theme'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { SubPageHeader } from '../fundShared'
import CodalAnnouncements from '../../../components/CodalAnnouncements'

export default function FundAnnouncementsPage() {
  const params = useParams()
  const slug = decodeURIComponent((params?.slug as string) || '')
  const isMobile = useIsMobile()
  const [isDark, setIsDark] = useState(true)
  const [asset, setAsset] = useState<any>(null)

  useEffect(() => {
    if (!shouldUseDark()) setIsDark(false)
    const handler = () => setIsDark(window.localStorage.getItem('theme') !== 'light')
    window.addEventListener('themechange', handler)
    return () => window.removeEventListener('themechange', handler)
  }, [])

  useEffect(() => {
    if (!slug) return
    supabase.from('assets').select('name').or(`slug.eq."${slug}",name.eq."${slug}"`).limit(1).maybeSingle()
      .then(({ data }) => setAsset(data ?? null))
  }, [slug])

  const t: any = isDark ? darkTheme : lightTheme
  const symbol = asset?.name ?? null

  return (
    <main style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'Vazirmatn, Arial, sans-serif', direction: 'rtl', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SubPageHeader t={t} slug={slug} assetName={asset?.name ?? slug} crumb="اطلاعیه‌های کدال" />
        {symbol
          ? <CodalAnnouncements symbol={symbol} isDark={isDark} isMobile={isMobile} pageSize={20} />
          : <div style={{ color: t.muted, fontSize: 13, padding: 40, textAlign: 'center' }}>در حال بارگذاری…</div>}
        <div style={{ marginTop: 6 }}>
          <Link href={`/fund/${encodeURIComponent(slug)}`} style={{ color: t.accent, fontSize: 13, textDecoration: 'none' }}>← بازگشت به صفحهٔ صندوق</Link>
        </div>
      </div>
    </main>
  )
}
