'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../../lib/supabase'

function getVisitorId(): string {
  try {
    const KEY = 'bs_visitor_id'
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return 'unknown'
  }
}

function getDevice(): string {
  const ua = navigator.userAgent
  if (/iPad|Tablet/i.test(ua)) return 'tablet'
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile'
  return 'desktop'
}

function getReferrer(): string | null {
  try {
    if (!document.referrer) return null
    const ref = new URL(document.referrer)
    if (ref.host === location.host) return null
    return ref.host
  } catch {
    return null
  }
}

export default function PageViewLogger() {
  const pathname = usePathname()

  useEffect(() => {
    supabase.from('page_views').insert({
      path: pathname,
      visitor_id: getVisitorId(),
      referrer: getReferrer(),
      device: getDevice(),
    }).then()
  }, [pathname])

  return null
}
