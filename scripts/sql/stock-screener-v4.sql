-- بورس سنج — دیده‌بان تکنیکال نسخه ۴: سه سیگنال پایه استراتژی‌های آماده (preset strategies)
-- بعد از stock-screener-v3.sql در SQL Editor سوپابیس اجرا کنید.

alter table public.stock_screener
  add column if not exists platform_breakout    boolean not null default false, -- شکست پلتفرم: تثبیت باریک ۲۰روزه + شکست با حجم
  add column if not exists year_line_pullback    boolean not null default false, -- بازگشت به خط سالانه (SMA200 صعودی)
  add column if not exists turtle_breakout_20d   boolean not null default false; -- شکست سقف ۲۰روزه (Donchian)
