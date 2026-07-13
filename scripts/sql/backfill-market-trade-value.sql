-- بورس سنج — بک‌فیل یک‌بارهٔ market_trade_value_daily از تاریخچه موجود stock_candles
-- پیش‌نیاز: symbol_market حداقل یک بار توسط candles-daily.js پر شده باشد
-- (چون طبقه‌بندی isin فعلی برای کل تاریخچه اعمال می‌شود — نمادهای منسوخ/تغییرنام‌یافته ممکن است
-- در بازه‌ی «سایر» جا بمانند، اثر ناچیز است).
-- در SQL Editor سوپابیس اجرا کنید — یک‌بار کافی است، بعدها candles-daily.js خودش هر روز اضافه می‌کند.

insert into public.market_trade_value_daily (trade_date, trade_date_shamsi, bourse, fara_bourse, other, total)
select
  sc.trade_date,
  max(sc.trade_date_shamsi),
  sum(case when sm.market = 'bourse'      then sc.value else 0 end),
  sum(case when sm.market = 'fara-bourse' then sc.value else 0 end),
  sum(case when sm.market is null or sm.market = 'other' then sc.value else 0 end),
  sum(coalesce(sc.value, 0))
from public.stock_candles sc
left join public.symbol_market sm on sm.symbol = sc.symbol
group by sc.trade_date
on conflict (trade_date) do update set
  trade_date_shamsi = excluded.trade_date_shamsi,
  bourse             = excluded.bourse,
  fara_bourse        = excluded.fara_bourse,
  other              = excluded.other,
  total              = excluded.total;
