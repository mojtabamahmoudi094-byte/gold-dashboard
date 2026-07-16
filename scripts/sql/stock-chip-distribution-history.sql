-- بورس سنج — توزیع چیپ: تبدیل stock_chip_distribution از «یک ردیف زنده به‌ازای هر نماد»
-- به «یک ردیف به‌ازای هر نماد در هر روز معاملاتی» (آرشیو تاریخی، مثل stock_candles).
-- در SQL Editor سوپابیس اجرا کنید — یک‌بار، بعد از دیپلوی کد جدید.

alter table public.stock_chip_distribution drop constraint if exists stock_chip_distribution_pkey;
alter table public.stock_chip_distribution add primary key (symbol, trade_date);

create index if not exists stock_chip_distribution_symbol_date_idx
  on public.stock_chip_distribution (symbol, trade_date desc);
