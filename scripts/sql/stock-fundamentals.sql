-- بورس سنج — جدول نسبت‌های مالی هر نماد (P/E, P/B, ROE, ROA, ...)
-- fundamentals-compute.js با کلید service-role از روی stock_reports + stock_industries محاسبه و upsert می‌کند؛
-- سایت از /api/fundamentals/<نماد> فقط SELECT می‌زند.
-- در SQL Editor سوپابیس اجرا کنید.

create table if not exists public.stock_fundamentals (
  symbol  text primary key,
  data    jsonb       not null,   -- خروجی computeFundamentals (lib/fundamentalRatios.ts)
  updated timestamptz not null default now()
);

create index if not exists stock_fundamentals_updated_idx on public.stock_fundamentals (updated desc);

alter table public.stock_fundamentals enable row level security;

-- تنها عملیاتی که کلاینت انجام می‌دهد: خواندن. نوشتن با service-role است که RLS را دور می‌زند.
drop policy if exists "stock_fundamentals read" on public.stock_fundamentals;
create policy "stock_fundamentals read"
  on public.stock_fundamentals
  for select
  to anon, authenticated
  using (true);
