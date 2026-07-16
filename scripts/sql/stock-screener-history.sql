-- بورس سنج — دیده‌بان تکنیکال: تبدیل stock_screener از «یک ردیف زنده به‌ازای هر نماد»
-- به «یک ردیف به‌ازای هر نماد در هر روز معاملاتی» (آرشیو تاریخی، مثل stock_candles).
-- در SQL Editor سوپابیس اجرا کنید — یک‌بار، بعد از دیپلوی کد جدید.

alter table public.stock_screener drop constraint if exists stock_screener_pkey;
alter table public.stock_screener add primary key (symbol, trade_date);

-- ایندکس trade_date از قبل هست (stock_screener_date_idx)؛ برای گرفتن سریع «آخرین ردیف هر نماد» هم مفیده.
create index if not exists stock_screener_symbol_date_idx
  on public.stock_screener (symbol, trade_date desc);
