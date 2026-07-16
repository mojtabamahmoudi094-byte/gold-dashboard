'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function PageViewLogger() {
  const pathname = usePathname()

  useEffect(() => {
    supabase.from('page_views').insert({ path: pathname }).then()
  }, [pathname])

  return null
}
