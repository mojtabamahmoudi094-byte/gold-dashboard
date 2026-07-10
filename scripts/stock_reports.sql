-- بورس سنج — جدول گزارش‌های کدال هر نماد
-- سرور ایران (codal-watch.js) با کلید service-role upsert می‌کند؛
-- سایت از /api/stock-reports/<نماد> فقط SELECT می‌زند.
-- در SQL Editor سوپابیس اجرا کنید.

create table if not exists public.stock_reports (
  symbol   text primary key,
  data     jsonb       not null,
  months   int         not null default 0,
  quarters int         not null default 0,
  updated  timestamptz not null default now()
);

create index if not exists stock_reports_updated_idx on public.stock_reports (updated desc);

alter table public.stock_reports enable row level security;

-- تنها عملیاتی که کلاینت انجام می‌دهد: خواندن. نوشتن با service-role است که RLS را دور می‌زند.
drop policy if exists "stock_reports read" on public.stock_reports;
create policy "stock_reports read"
  on public.stock_reports
  for select
  to anon, authenticated
  using (true);
