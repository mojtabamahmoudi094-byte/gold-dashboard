-- افزودن دسته‌بندی به جدول سیگنال‌ها — تا تاریخچه فقط طلا نباشد و نقره/صندوق‌های بورسی/سهام هم ثبت شوند
-- اجرا در Supabase SQL Editor / Run in Supabase SQL Editor

alter table public.signals
  add column if not exists category text not null default 'gold'
    check (category in ('gold', 'silver', 'leveraged', 'sector', 'equity', 'stock'));

-- فقط برای سیگنال دسته «سهام» پر می‌شود — نماد سهم (l18)
alter table public.signals
  add column if not exists symbol text;

create index if not exists signals_category_idx on public.signals (category, signal_date_shamsi);
