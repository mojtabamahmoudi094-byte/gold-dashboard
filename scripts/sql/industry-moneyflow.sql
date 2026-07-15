-- بورس سنج — تاریخچه روزانه خالص ورود پول حقیقی هر صنعت (برای فیلترهای «ورود/خروج پول»)
-- سرور ایران هر ۵ دقیقه (۹:۰۰–۱۲:۳۵ تهران) ردیف امروز هر صنعت را upsert می‌کند (scripts/stocks-industries.js)
-- چون تاریخچه گذشته موجود نیست، جمع‌آوری از روز نصب شروع می‌شود — پنجره‌های ۳/۵/۲۲ روزه تا تکمیل زمان می‌برند
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists industry_moneyflow_daily (
  industry_key   text not null,   -- cs_id یا نام صنعت (وقتی cs_id ندارد)
  industry_name  text not null,
  trade_date     date not null,
  money_in       numeric,         -- خالص ورود پول حقیقی امروز این صنعت (تومان، + یعنی ورود)
  updated        timestamptz not null default now(),
  primary key (industry_key, trade_date)
);

create index if not exists industry_moneyflow_daily_date_idx on industry_moneyflow_daily (trade_date);

alter table industry_moneyflow_daily enable row level security;

-- خواندن برای همه (anon)؛ نوشتن فقط با service_role (از RLS عبور می‌کند)
create policy "public read" on industry_moneyflow_daily
  for select using (true);
