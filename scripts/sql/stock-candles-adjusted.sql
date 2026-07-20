-- ستون‌های قیمت تعدیل‌شده روی جدول کندل‌ها
-- در Supabase SQL Editor اجرا شود (یک‌باره؛ idempotent)
--
-- منبع داده: tsetmc InstTradeHistory.aspx?A=1 (اسکریپت scripts/candles-adjusted.js)
-- RLS و policy های موجود stock_candles شامل ستون‌های جدید هم می‌شوند — چیزی لازم نیست.

alter table public.stock_candles
  add column if not exists adj_open  numeric,
  add column if not exists adj_high  numeric,
  add column if not exists adj_low   numeric,
  add column if not exists adj_close numeric;

comment on column public.stock_candles.adj_close is
  'قیمت پایانی تعدیل‌شده (افزایش سرمایه/سود نقدی) — tsetmc A=1؛ null یعنی هنوز محاسبه نشده';

-- ضرایب/افست روش‌های تعدیل اضافی (scripts/candles-adjusted.js می‌سازد).
-- برخلاف adj_close (که خودِ tsetmc محاسبه کرده)، این‌ها با رویدادهای تشخیص‌داده‌شده
-- (افزایش سرمایه / سود نقدی، از قیاس close با yesterday روز بعد + رکورد تغییر سهام) محاسبه می‌شوند.
-- کاربرد: adj_x_capital  = x * coef_capital   (فقط افزایش سرمایه، نسبی)
--         adj_x_dividend = x * coef_dividend  (فقط سود نقدی، نسبی)
--         adj_x_additive = x - offset_combined (هر دو با هم، جمعی/نقطه‌ای)
-- مقدار null یعنی رویدادی برای آن نماد/روز رخ نداده یا هنوز محاسبه نشده (⇒ همان x خام).
alter table public.stock_candles
  add column if not exists coef_capital   numeric,
  add column if not exists coef_dividend  numeric,
  add column if not exists offset_combined numeric;

comment on column public.stock_candles.coef_capital is
  'ضریب تعدیل نسبی فقط افزایش سرمایه — قیمت خام × این ضریب = تعدیل‌شده به روش افزایش سرمایه';
comment on column public.stock_candles.coef_dividend is
  'ضریب تعدیل نسبی فقط سود نقدی — قیمت خام × این ضریب = تعدیل‌شده به روش سود نقدی';
comment on column public.stock_candles.offset_combined is
  'افست تعدیل جمعی (افزایش سرمایه+سود نقدی با هم) — قیمت خام − این مقدار = تعدیل‌شده به روش جمعی';
