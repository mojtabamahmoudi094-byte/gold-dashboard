-- بورس سنج — Regime Engine ساده: وضعیت کلی روزانه بازار سهام (صعودی/نزولی/نوسانی/تجمیع/توزیع)
-- scripts/market-regime-daily.js از روی آخرین تیک هر روز market_watch (cat='stocks') محاسبه می‌کند
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists market_regime_daily (
  trade_date_shamsi text primary key,
  regime            text not null,   -- 'صعودی' | 'نزولی' | 'نوسانی' | 'تجمیع' | 'توزیع'
  breadth_pct       numeric not null, -- درصد نمادهای مثبت از کل مثبت+منفی
  avg_change_pct    numeric not null,
  net_flow          numeric not null, -- money_in (ریال)
  updated           timestamptz not null default now()
);

alter table market_regime_daily enable row level security;

drop policy if exists "public read" on market_regime_daily;
create policy "public read" on market_regime_daily
  for select using (true);
