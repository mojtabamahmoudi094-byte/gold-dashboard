-- بورس سنج — تاریخچه ۵دقیقه‌ای per-symbol برای «رصد لحظه‌ای پورتفو»
-- فقط برای نمادهایی که در تراکنش‌های پورتفوی کاربران هستند نوشته می‌شود (scripts/stocks-industries.js)
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists stock_watch_5m (
  id       bigint generated always as identity primary key,
  symbol   text not null,
  cat      text not null,   -- 'stocks' | 'bourse-funds' | 'gold' | 'silver' | 'saffron'
  ts       timestamptz not null default now(),
  tval     numeric,         -- ارزش معاملات تجمعی امروز (ریال)
  buy_pc_i numeric, sell_pc_i numeric,   -- سرانه خرید/فروش حقیقی (ریال)
  buy_pc_n numeric, sell_pc_n numeric,   -- سرانه خرید/فروش حقوقی (ریال)
  money_in numeric,         -- ورود پول حقیقی تجمعی امروز (ریال)
  big_buy  numeric, big_sell numeric,    -- پول درشت (ریال) — سرانه بالای ۲۰۰ میلیون تومان
  buy_queue_vol bigint, sell_queue_vol bigint, -- حجم صف خرید/فروش لحظه‌ای (بهترین سفارش روی سقف/کف دامنه)
  last_price bigint, last_price_pct numeric    -- آخرین قیمت معامله (ریال) + درصد تغییر
);

create index if not exists stock_watch_5m_symbol_ts_idx on stock_watch_5m (symbol, ts desc);

alter table stock_watch_5m enable row level security;

-- خواندن برای همه (anon)؛ نوشتن فقط با service_role (از RLS عبور می‌کند)
create policy "public read" on stock_watch_5m
  for select using (true);
