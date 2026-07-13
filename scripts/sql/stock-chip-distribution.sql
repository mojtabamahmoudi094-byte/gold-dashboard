-- بورس سنج — توزیع چیپ (Chip Distribution): یک ردیف به‌ازای هر نماد، مثل stock_screener
-- سرور ایران (scripts/chip-distribution-daily.js) با کلید service-role هر شب upsert می‌کند؛
-- سایت فقط SELECT می‌زند.
-- در SQL Editor سوپابیس اجرا شود.

create table if not exists public.stock_chip_distribution (
  symbol             text primary key,
  trade_date         date not null,
  trade_date_shamsi  text not null,
  bins               jsonb not null,     -- [{price, weight}, ...] ۵۰ بازه قیمتی، weight نرمال‌شده (Σ=1)
  avg_cost           numeric not null,   -- میانگین وزنی قیمت خرید حامل‌های ۲۱۰ روز اخیر
  concentration_pct  numeric not null,   -- عرض باریک‌ترین بازه حاوی ۹۰٪ وزن ÷ avg_cost — کمتر یعنی چیپ متمرکزتر
  profit_ratio       numeric not null,   -- درصد وزنی زیر قیمت پایانی امروز (٪ حجم سودده)
  current_close      numeric not null,
  updated_at         timestamptz not null default now()
);

alter table public.stock_chip_distribution enable row level security;

drop policy if exists "stock_chip_distribution read" on public.stock_chip_distribution;
create policy "stock_chip_distribution read"
  on public.stock_chip_distribution
  for select
  to anon, authenticated
  using (true);
