-- بورس سنج — تاریخچه روزانه سرانه خرید حقیقی هر نماد (برای فیلترهای «افزایش سرانه خریدار»)
-- سرور ایران هر ۵ دقیقه (۹:۰۰–۱۲:۳۵ تهران) ردیف امروز هر نماد را upsert می‌کند (scripts/stocks-industries.js)
-- چون تاریخچه گذشته موجود نیست، جمع‌آوری از روز نصب شروع می‌شود — پنجره‌های ۱۰/۲۰ روزه تا تکمیل زمان می‌برند
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists stock_per_capita_daily (
  symbol         text not null,
  trade_date     date not null,
  per_capita_buy numeric,           -- سرانه خرید حقیقی امروز (تومان)
  updated        timestamptz not null default now(),
  primary key (symbol, trade_date)
);

create index if not exists stock_per_capita_daily_date_idx on stock_per_capita_daily (trade_date);

alter table stock_per_capita_daily enable row level security;

-- خواندن برای همه (anon)؛ نوشتن فقط با service_role (از RLS عبور می‌کند)
create policy "public read" on stock_per_capita_daily
  for select using (true);
