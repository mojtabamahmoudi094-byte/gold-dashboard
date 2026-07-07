-- بورس سنج — جدول تک‌ردیفی قیمت لحظه‌ای سهام (خروجی stocks-industries.js)
-- سرور ایران هر ۵ دقیقه (۹:۰۰–۱۲:۳۵ تهران) این ردیف را upsert می‌کند
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists stock_industries (
  id      int primary key default 1 check (id = 1),
  data    jsonb not null,
  updated timestamptz not null default now()
);

alter table stock_industries enable row level security;

-- خواندن برای همه (anon)؛ نوشتن فقط با service_role (از RLS عبور می‌کند)
create policy "public read" on stock_industries
  for select using (true);
