-- نسخه ۳: افزودن «پول نقد» به انواع دارایی مجاز پورتفو
-- اگر portfolio.sql و portfolio-v2.sql را قبلاً اجرا کرده‌اید فقط همین فایل را اجرا کنید.
-- Run this if you already ran portfolio.sql + portfolio-v2.sql; new installs only need portfolio.sql.

alter table public.portfolio_transactions
  drop constraint if exists portfolio_transactions_asset_type_check;

alter table public.portfolio_transactions
  add constraint portfolio_transactions_asset_type_check
  check (asset_type in ('stock', 'fund', 'physical', 'cash'));
