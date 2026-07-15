-- بورس سنج — تاریخچه روزانه خالص ورود پول حقیقی هر نماد (برای فیلتر «بیشترین ورود پول حقیقی»)
-- سرور ایران هر ۵ دقیقه (۹:۰۰–۱۲:۳۵ تهران) ردیف امروز هر نماد را upsert می‌کند (scripts/stocks-industries.js)
-- چون تاریخچه گذشته موجود نیست، جمع‌آوری از روز نصب شروع می‌شود — پنجره‌های هفتگی/ماهانه/سه‌ماهه تا تکمیل زمان می‌برند
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists stock_moneyflow_daily (
  symbol      text not null,
  trade_date  date not null,
  money_in    numeric,   -- خالص ورود پول حقیقی امروز این نماد (تومان، + یعنی ورود)
  updated     timestamptz not null default now(),
  primary key (symbol, trade_date)
);

create index if not exists stock_moneyflow_daily_date_idx on stock_moneyflow_daily (trade_date);

alter table stock_moneyflow_daily enable row level security;

-- خواندن برای همه (anon)؛ نوشتن فقط با service_role (از RLS عبور می‌کند)
create policy "public read" on stock_moneyflow_daily
  for select using (true);
