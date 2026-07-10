import { createClient } from '@supabase/supabase-js'
import { publicEnv } from './env'

export const supabase = createClient(
  publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
)