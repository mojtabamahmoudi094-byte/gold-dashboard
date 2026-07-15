-- بورس سنج — درصد شناوری و کل سهام هر نماد (خروجی stock-float.js)
-- منبع: BrsApi Symbol.php (فیلد ff=درصد شناوری، z=کل سهام) — یک ردیف آخرین مقدار هر نماد (نه تاریخچه)
-- کرون سرور روزانه یک‌بار به‌روز می‌کند (شناوری به‌ندرت تغییر می‌کند)
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists stock_float (
  symbol             text primary key,
  free_float_pct     numeric,   -- ff (٪)
  shares_outstanding numeric,   -- z (کل سهام)
  updated            timestamptz not null default now()
);

alter table stock_float enable row level security;

-- خواندن برای همه (anon)؛ نوشتن فقط با service_role (از RLS عبور می‌کند)
create policy "public read" on stock_float
  for select using (true);
