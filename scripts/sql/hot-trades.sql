-- بورس سنج — معاملات سنگین/میلیاردی تکی امروز (برای فیلتر «پول داغ» → خرید و فروش‌های درشت)
-- سرور ایران هر ۵ دقیقه ریزمعاملات امروز ~۱۵۰ نماد پرارزش را می‌خواند و معاملات ≥۱ میلیارد تومان را upsert می‌کند
-- (scripts/hot-money.js) — چون هر بار کل ریزمعاملات امروز دوباره خوانده می‌شود، upsert idempotent است (بدون رکورد تکراری)
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists hot_trades (
  symbol      text not null,
  direction   text not null check (direction in ('buy', 'sell')),  -- تشخیص با قانون تیک (تیک بالا=خرید، تیک پایین=فروش)
  trade_date  date not null,
  trade_time  text not null,   -- ساعت معامله (HH:MM:SS)
  price       numeric not null,
  volume      numeric not null,
  value       numeric not null,  -- ارزش معامله به تومان
  tick_count  int not null default 1,  -- تعداد ریزمعامله ادغام‌شده در این ردیف (هم‌زمان و هم‌قیمت)
  updated     timestamptz not null default now(),
  primary key (symbol, trade_date, trade_time, price, direction)
);

create index if not exists hot_trades_date_value_idx on hot_trades (trade_date, value desc);

alter table hot_trades enable row level security;

-- خواندن برای همه (anon)؛ نوشتن فقط با service_role (از RLS عبور می‌کند)
create policy "public read" on hot_trades
  for select using (true);
