-- بورس سنج — تفکیک بورس/فرابورس ارزش معاملات + جدول تجمیع روزانه کل بازار سرمایه
-- symbol_market: طبقه‌بندی هر نماد به بورس/فرابورس بر اساس کاراکتر چهارم isin (پر می‌شود توسط candles-daily.js)
-- market_trade_value_daily: تجمیع روزانه ارزش معاملات (سهام+صندوق‌های بورسی) — پایه صفحات
--   /trade-value/capital-market ، /trade-value/tse ، /trade-value/ifb
-- در SQL Editor سوپابیس اجرا کنید.

create table if not exists public.symbol_market (
  symbol     text primary key,           -- l18 تمیزشده، هم‌کلید stock_candles.symbol
  isin       text,
  market     text not null,              -- 'bourse' | 'fara-bourse' | 'other'
  updated_at timestamptz not null default now()
);

alter table public.symbol_market enable row level security;

drop policy if exists "symbol_market read" on public.symbol_market;
create policy "symbol_market read"
  on public.symbol_market
  for select
  to anon, authenticated
  using (true);

create table if not exists public.market_trade_value_daily (
  trade_date        date primary key,
  trade_date_shamsi text    not null,
  bourse            numeric not null default 0,   -- ارزش معاملات بورس (ریال)
  fara_bourse       numeric not null default 0,   -- ارزش معاملات فرابورس (ریال)
  other             numeric not null default 0,   -- نمادهای غیرقابل‌طبقه‌بندی با isin (عمدتاً ETF)
  total             numeric not null default 0    -- bourse + fara_bourse + other = «ارزش معاملات کل بازار سرمایه»
);

create index if not exists market_trade_value_daily_date_idx
  on public.market_trade_value_daily (trade_date desc);

alter table public.market_trade_value_daily enable row level security;

drop policy if exists "market_trade_value_daily read" on public.market_trade_value_daily;
create policy "market_trade_value_daily read"
  on public.market_trade_value_daily
  for select
  to anon, authenticated
  using (true);
