-- بورس سنج — ستون ارزش بازار دلاری صندوق‌ها (پر می‌شود توسط sync-usd-market-value.js، هر روز ساعت ۱۳ تهران)
-- در Supabase Dashboard → SQL Editor اجرا شود

alter table public.gold_funds
  add column if not exists market_value_usd numeric;

comment on column public.gold_funds.market_value_usd is
  'ارزش بازار به دلار = market_value (ریال) / نرخ دلار همان روز؛ توسط scripts/sync-usd-market-value.js ساعت ۱۳ تهران محاسبه می‌شود';
