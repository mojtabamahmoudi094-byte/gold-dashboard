-- بورس سنج — دیده‌بان تکنیکال نسخه ۳: الگوهای کندلی (scripts/candle-patterns.js)
-- بعد از stock-screener-v2.sql در SQL Editor سوپابیس اجرا کنید.

alter table public.stock_screener
  add column if not exists candle_pattern      text,  -- کلید انگلیسی الگو، مثل bullish_engulfing — نگاه کنید به PATTERN_LABELS در candle-patterns.js
  add column if not exists candle_pattern_bias  text;  -- 'bull' / 'bear' / null
