import { createClient } from '@supabase/supabase-js'

// سرور-فقط: هرگز در فایل‌های 'use client' ایمپورت نشود — کلید service role
// دور زدن RLS را بلد است. اگر SUPABASE_KEY هنوز روی Render ست نشده، موقتاً به
// کلید anon (رفتار قبلی) fallback می‌کند تا چیزی نشکند.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey =
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabaseAdmin = createClient(supabaseUrl, serviceKey)
