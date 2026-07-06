-- نسخه ۲: افزودن دارایی فیزیکی (طلا، سکه، نقره) به انواع مجاز
-- اگر portfolio.sql را قبلاً اجرا کرده‌اید فقط همین فایل را اجرا کنید.
-- Run this if you already ran portfolio.sql; new installs only need portfolio.sql.

alter table public.portfolio_transactions
  drop constraint if exists portfolio_transactions_asset_type_check;

alter table public.portfolio_transactions
  add constraint portfolio_transactions_asset_type_check
  check (asset_type in ('stock', 'fund', 'physical'));
