import { z } from 'zod'

// این متغیرها برای کار کردن سایت الزامی‌اند — نبودشون باید در boot خطای واضح بده، نه خطای مبهم در runtime
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

const parsedPublicEnv = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
})

if (!parsedPublicEnv.success) {
  throw new Error(
    `متغیرهای محیطی ضروری Supabase ست نشده‌اند: ${parsedPublicEnv.error.issues.map(i => i.path.join('.')).join(', ')}`
  )
}

export const publicEnv = parsedPublicEnv.data

/** کلید سرویس‌رول Supabase — دور زدن RLS را بلد است، فقط سرور. اگر ست نشده باشد
 *  به anon key (رفتار محدودتر) fallback می‌کند، اما به‌جای خاموش بودن هشدار می‌دهد
 *  تا شکست خاموش نوشتن در پایپ‌لاین دیده شود. */
export function getSupabaseServiceKey(): string {
  const serviceKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey) return serviceKey

  console.warn(
    '[env] SUPABASE_KEY/SUPABASE_SERVICE_ROLE_KEY ست نشده — عملیات سرور به anon key fallback می‌کند و ممکن است RLS آن را رد کند.'
  )
  return publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
}
