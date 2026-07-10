-- بورس سنج — دیده‌بان تکنیکال: یک ردیف سیگنال به‌ازای هر نماد
-- سرور ایران (screener-daily.js) با service-role هر شب upsert می‌کند؛ سایت فقط SELECT.
-- در SQL Editor سوپابیس اجرا کنید.

create table if not exists public.stock_screener (
  symbol            text primary key,
  trade_date        date not null,             -- آخرین روز معاملاتی نماد
  trade_date_shamsi text not null,
  close             numeric not null,
  change_pct        numeric,
  rsi               numeric,                   -- RSI(14) وایلدر
  vol_ratio         numeric,                   -- حجم آخرین روز ÷ میانگین ۲۰ روزه
  trend             text,                      -- up / down / side (بر اساس SMA50/200)
  rsi_oversold      boolean not null default false,
  rsi_overbought    boolean not null default false,
  golden_cross      boolean not null default false,  -- کراس SMA50/200 در ۵ کندل اخیر
  death_cross       boolean not null default false,
  macd_cross_up     boolean not null default false,  -- تغییر علامت هیستوگرام در ۳ کندل اخیر
  macd_cross_down   boolean not null default false,
  near_high_52w     boolean not null default false,  -- در ۵٪ سقف ۵۲ هفته
  near_low_52w      boolean not null default false,
  new_high_52w      boolean not null default false,  -- سقف جدید ۵۲ هفته
  new_low_52w       boolean not null default false,
  vol_spike         boolean not null default false,  -- حجم > ۲.۵ برابر میانگین
  updated           timestamptz not null default now()
);

create index if not exists stock_screener_date_idx on public.stock_screener (trade_date desc);

alter table public.stock_screener enable row level security;

drop policy if exists "stock_screener read" on public.stock_screener;
create policy "stock_screener read"
  on public.stock_screener
  for select
  to anon, authenticated
  using (true);
