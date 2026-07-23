import { supabase } from './supabase'

// آدرس صندوق می‌تواند slug (ISIN) یا نام نماد (مثل «عیار») باشد
export async function resolveFundAsset(key: string) {
  const { data } = await supabase
    .from('assets')
    .select('*')
    .or(`slug.eq."${key}",name.eq."${key}"`)
    .limit(1)
    .maybeSingle()
  return data ?? null
}

// خلاصه‌ای فقط از آخرین رکورد — برای SSR بخش عمومی صفحه صندوق (نه تاریخچه/نمودارهای گیت‌شده که کلاینت‌ساید می‌مانند)
export async function getFundDetail(slug: string): Promise<{ asset: any | null; record: any | null }> {
  const asset = await resolveFundAsset(slug)
  if (!asset) return { asset: null, record: null }

  const { data: records } = await supabase
    .from('gold_funds')
    .select('*')
    .eq('asset_id', asset.id)
    .order('trade_date_shamsi', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)

  return { asset, record: records?.[0] ?? null }
}
