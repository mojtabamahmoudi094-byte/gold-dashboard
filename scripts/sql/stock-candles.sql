-- بورس سنج — کندل‌های روزانه سهام + تاریخچه شاخص‌ها (پایه بخش تحلیل تکنیکال)
-- سرور ایران (candles-backfill.js / candles-daily.js) با کلید service-role upsert می‌کند؛
-- سایت فقط SELECT می‌زند.
-- در SQL Editor سوپابیس اجرا کنید.

create table if not exists public.stock_candles (
  symbol            text    not null,           -- l18 تمیزشده
  trade_date        date    not null,           -- میلادی — برای سورت و کتابخانه نمودار
  trade_date_shamsi text    not null,           -- 1403/08/08
  open              numeric,                    -- pf اولین قیمت
  high              numeric,                    -- pmax
  low               numeric,                    -- pmin
  close             numeric,                    -- pc قیمت پایانی
  last              numeric,                    -- pl آخرین معامله
  yesterday         numeric,                    -- py قیمت دیروز
  change_pct        numeric,                    -- pcp درصد تغییر پایانی
  volume            numeric,                    -- tvol
  value             numeric,                    -- tval (ریال)
  trades            int,                        -- tno تعداد معاملات
  primary key (symbol, trade_date)
);

create index if not exists stock_candles_symbol_date_idx
  on public.stock_candles (symbol, trade_date desc);
create index if not exists stock_candles_date_idx
  on public.stock_candles (trade_date desc);

alter table public.stock_candles enable row level security;

drop policy if exists "stock_candles read" on public.stock_candles;
create policy "stock_candles read"
  on public.stock_candles
  for select
  to anon, authenticated
  using (true);

-- تاریخچه شاخص‌ها — نام canonical از normalizeIndexName در candles-lib.js
create table if not exists public.index_candles (
  index_name        text    not null,
  trade_date        date    not null,
  trade_date_shamsi text    not null,
  value             numeric not null,
  change_pct        numeric,
  primary key (index_name, trade_date)
);

create index if not exists index_candles_name_date_idx
  on public.index_candles (index_name, trade_date desc);

alter table public.index_candles enable row level security;

drop policy if exists "index_candles read" on public.index_candles;
create policy "index_candles read"
  on public.index_candles
  for select
  to anon, authenticated
  using (true);
