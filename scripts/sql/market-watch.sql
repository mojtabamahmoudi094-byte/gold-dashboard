-- بورس سنج — سری زمانی ۵ دقیقه‌ای سنجه‌های کل بازار (رصد لحظه‌ای)
-- هر اجرا یک ردیف با cat (stocks / bourse-funds / gold / silver / saffron) درج می‌کند
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists market_watch (
  id  bigint generated always as identity primary key,
  cat text not null,
  ts  timestamptz not null default now(),
  d   jsonb not null
);

create index if not exists market_watch_cat_ts on market_watch (cat, ts desc);

alter table market_watch enable row level security;

-- خواندن برای همه؛ نوشتن فقط با service_role (از RLS عبور می‌کند)
create policy "public read" on market_watch
  for select using (true);
