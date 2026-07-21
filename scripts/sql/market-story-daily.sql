-- بورس سنج — Market Story خودکار روزانه: روایت «چرا بازار امروز این‌طور بود»
-- scripts/market-story-daily.js از روی market_regime_daily + fund_bubble_daily می‌سازد
-- در Supabase Dashboard → SQL Editor اجرا شود

create table if not exists market_story_daily (
  trade_date_shamsi text primary key,
  regime            text not null,
  headline          text not null,
  body              text not null,
  updated           timestamptz not null default now()
);

alter table market_story_daily enable row level security;

drop policy if exists "public read" on market_story_daily;
create policy "public read" on market_story_daily
  for select using (true);
