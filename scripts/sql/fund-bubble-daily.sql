-- بورس سنج — تاریخچه روزانه حباب صندوق‌های طلا/نقره (اسمی/ذاتی/واقعی)
-- scripts/fund-bubble-daily.js هر روز (بعد بسته‌شدن بازار) از روی کش‌های موجود
-- (_nav_cache, _gold_cache, _ime_cache در جدول signals) محاسبه و upsert می‌کند
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists fund_bubble_daily (
  fund_name       text not null,
  trade_date      text not null,   -- شمسی، مثل gold_funds.trade_date_shamsi
  bubble_asmi     numeric,         -- (قیمت پایانی − NAV ابطال) ÷ NAV (٪)
  bubble_zati     numeric,         -- ترکیب وزنی حباب سکه/شمش یا گواهی نقره بورس کالا (٪)
  bubble_vaqei    numeric,         -- اسمی + ذاتی (٪)
  updated         timestamptz not null default now(),
  primary key (fund_name, trade_date)
);

create index if not exists fund_bubble_daily_date_idx on fund_bubble_daily (trade_date);

alter table fund_bubble_daily enable row level security;

-- خواندن برای همه (anon)؛ نوشتن فقط با service_role (از RLS عبور می‌کند)
create policy "public read" on fund_bubble_daily
  for select using (true);
