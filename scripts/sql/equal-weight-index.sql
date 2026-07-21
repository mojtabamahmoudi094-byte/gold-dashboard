-- بورس سنج — شاخص هم‌وزن صندوق‌های طلا/نقره (فیچر اختصاصی، رقبا جدی ندارند)
-- scripts/equal-weight-index.js هر روز محاسبه و upsert می‌کند
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists equal_weight_index (
  category          text not null check (category in ('طلا', 'نقره')),
  trade_date_shamsi text not null,
  index_value       numeric not null,   -- پایه ۱۰۰ در اولین روز موجود
  daily_return_pct  numeric not null,   -- میانگین ساده بازده روزانه صندوق‌های همان دسته
  fund_count        int not null,       -- تعداد صندوقی که آن روز داده داشتند
  updated           timestamptz not null default now(),
  primary key (category, trade_date_shamsi)
);

create index if not exists equal_weight_index_date_idx on equal_weight_index (category, trade_date_shamsi);

alter table equal_weight_index enable row level security;

drop policy if exists "public read" on equal_weight_index;
create policy "public read" on equal_weight_index
  for select using (true);
