-- بورس سنج — سهامداران عمده هر نماد (خروجی stock-shareholders.js)
-- سرور ایران روزی یک‌بار بعد از بسته‌شدن بازار این جدول را upsert می‌کند
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists stock_shareholders (
  symbol  text primary key,
  data    jsonb not null,
  updated timestamptz not null default now()
);

alter table stock_shareholders enable row level security;

-- خواندن برای همه (anon)؛ نوشتن فقط با service_role (از RLS عبور می‌کند)
create policy "public read" on stock_shareholders
  for select using (true);
