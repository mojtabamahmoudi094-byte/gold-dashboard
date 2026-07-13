-- بورس سنج — بازده تاریخی سیگنال‌های اسکرینر (scripts/backtest-signals.js)
-- سرور ایران با کلید service-role هفتگی (پنجشنبه) upsert می‌کند؛ سایت فقط SELECT می‌زند.
-- در SQL Editor سوپابیس اجرا شود.

create table if not exists public.signal_backtest_stats (
  signal_key         text not null,        -- 'golden_cross', 'candle_hammer', ...
  horizon_days       int  not null,        -- 5 / 10 / 20
  bias               text not null,        -- 'bull' / 'bear'
  sample_count       int  not null,
  win_rate           numeric not null,     -- درصد
  avg_return_pct     numeric not null,
  median_return_pct  numeric not null,
  updated_at         timestamptz not null default now(),
  primary key (signal_key, horizon_days)
);

alter table public.signal_backtest_stats enable row level security;

drop policy if exists "signal_backtest_stats read" on public.signal_backtest_stats;
create policy "signal_backtest_stats read"
  on public.signal_backtest_stats
  for select
  to anon, authenticated
  using (true);
