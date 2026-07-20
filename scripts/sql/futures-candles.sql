-- قراردادهای آتی پیوسته — جهانی (Yahoo Finance) و داخلی (IME/BrsApi)
-- در Supabase SQL Editor اجرا شود (یک‌باره؛ idempotent)

-- ───────────────────────── آتی جهانی پیوسته ─────────────────────────
-- منبع: Yahoo Finance chart API (رایگان، بدون کلید) — نماد پیوسته (continuous)، مثل GC=F برای طلا.
-- اسکریپت: scripts/global-futures-backfill.js (بک‌فیل چندساله) + scripts/global-futures-daily.js (کرون شبانه)

create table if not exists public.global_futures_candles (
  symbol            text not null,
  trade_date        date not null,
  trade_date_shamsi text not null,
  open   numeric,
  high   numeric,
  low    numeric,
  close  numeric,
  volume numeric,
  primary key (symbol, trade_date)
);

comment on table public.global_futures_candles is
  'کندل روزانه قراردادهای آتی پیوسته جهانی (طلا/نقره/نفت/مس/گاز) — منبع Yahoo Finance، نماد پیوسته نه یک سررسید خاص';

alter table public.global_futures_candles enable row level security;

drop policy if exists "global_futures_candles_read" on public.global_futures_candles;
create policy "global_futures_candles_read" on public.global_futures_candles
  for select using (true);

-- ───────────────────────── آتی داخلی IME (سکه/زعفران) ─────────────────────────
-- منبع: BrsApi IME/Futures.php — فقط لحظه‌ای است (بدون تاریخچه)، پس فقط از تاریخ نصب این
-- اسکریپت به بعد داده جمع می‌شود. اسکریپت: scripts/ime-futures-daily.js (کرون روزانه نزدیک بسته‌شدن بازار)

create table if not exists public.ime_futures_candles (
  contract_code        text not null,
  contract_description text,
  trade_date            date not null,
  trade_date_shamsi     text not null,
  open           numeric,
  high           numeric,
  low            numeric,
  close          numeric, -- قیمت تسویه (py)
  volume         numeric,
  value          numeric,
  open_interest  numeric,
  day_remain     integer,
  primary key (contract_code, trade_date)
);

comment on table public.ime_futures_candles is
  'اسنپ‌شات روزانه بازار آتی بورس کالا (سکه/زعفران) — از تاریخ نصب کرون به بعد جمع می‌شود (بدون تاریخچه گذشته)';

alter table public.ime_futures_candles enable row level security;

drop policy if exists "ime_futures_candles_read" on public.ime_futures_candles;
create policy "ime_futures_candles_read" on public.ime_futures_candles
  for select using (true);
