-- بورس سنج — آرشیو روزانه اسنپ‌شات کل بازار (stock_industries همچنان کش زنده و id=1 می‌ماند،
-- این جدول جدا هر روز آخرین اسنپ‌شات همون روز رو نگه می‌داره؛ نه هر ۵ دقیقه، برای صرفه‌جویی حجم).
-- سرور ایران (stocks-industries.js) با کلید service-role upsert می‌کند؛ سایت فقط SELECT می‌زند.
-- در SQL Editor سوپابیس اجرا کنید.

create table if not exists public.stock_industries_history (
  trade_date date primary key,
  data       jsonb not null,
  updated    timestamptz not null default now()
);

alter table public.stock_industries_history enable row level security;

drop policy if exists "stock_industries_history read" on public.stock_industries_history;
create policy "stock_industries_history read"
  on public.stock_industries_history
  for select
  to anon, authenticated
  using (true);
