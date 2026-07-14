-- بورس سنج — فیلترهای VIP: میانگین حجم هفته (۵ روز) و ماه (۲۲ روز) هر نماد
-- برای فیلترهای «حجم مشکوک هفته/ماه» و «ضریب حجم» در صفحه /vip/filters
-- منبع: stock_candles (پایپ‌لاین کندل روزانه). در SQL Editor سوپابیس اجرا کنید.
-- security_invoker → همان policy خواندن anon روی stock_candles اعمال می‌شود.

create or replace view public.stock_vol_avgs
with (security_invoker = true) as
with recent as (
  select symbol, volume,
         row_number() over (partition by symbol order by trade_date desc) as rn
  from public.stock_candles
  where trade_date >= current_date - interval '60 days'
    and volume is not null
)
select symbol,
       round(avg(volume) filter (where rn <= 5))  as avg_vol_w,
       round(avg(volume) filter (where rn <= 22)) as avg_vol_m,
       count(*) filter (where rn <= 22)           as days_m
from recent
group by symbol;

grant select on public.stock_vol_avgs to anon, authenticated;
