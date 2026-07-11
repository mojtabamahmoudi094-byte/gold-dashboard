-- بورس سنج — دیده‌بان تکنیکال نسخه ۲: ستون‌های اسمارت مانی
-- بعد از stock-screener.sql در SQL Editor سوپابیس اجرا کنید.

alter table public.stock_screener
  add column if not exists structure_break text,                       -- bos_up / bos_down / choch_up / choch_down
  add column if not exists fvg_bull_near   boolean not null default false,  -- FVG صعودی باز، ≤۳٪ قیمت
  add column if not exists fvg_bear_near   boolean not null default false,
  add column if not exists ob_bull_near    boolean not null default false,  -- اردر بلاک حمایتی فعال نزدیک قیمت
  add column if not exists ob_bear_near    boolean not null default false;
