import { createClient } from '@supabase/supabase-js'
import { publicEnv, getSupabaseServiceKey } from './env'

// سرور-فقط: هرگز در فایل‌های 'use client' ایمپورت نشود — کلید service role
// دور زدن RLS را بلد است. اگر SUPABASE_KEY ست نشده، getSupabaseServiceKey() به anon
// fallback می‌کند و هشدار می‌دهد (به‌جای شکست خاموش نوشتن در پایپ‌لاین).
export const supabaseAdmin = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, getSupabaseServiceKey())
