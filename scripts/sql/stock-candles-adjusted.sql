-- ستون‌های قیمت تعدیل‌شده روی جدول کندل‌ها
-- در Supabase SQL Editor اجرا شود (یک‌باره؛ idempotent)
--
-- منبع داده: tsetmc InstTradeHistory.aspx?A=1 (اسکریپت scripts/candles-adjusted.js)
-- RLS و policy های موجود stock_candles شامل ستون‌های جدید هم می‌شوند — چیزی لازم نیست.

alter table public.stock_candles
  add column if not exists adj_open  numeric,
  add column if not exists adj_high  numeric,
  add column if not exists adj_low   numeric,
  add column if not exists adj_close numeric;

comment on column public.stock_candles.adj_close is
  'قیمت پایانی تعدیل‌شده (افزایش سرمایه/سود نقدی) — tsetmc A=1؛ null یعنی هنوز محاسبه نشده';
