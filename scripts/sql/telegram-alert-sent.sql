-- بورس سنج — جدول ادعای ارسال هشدار تلگرام (مشترک بین اسکریپت‌های هشدار لحظه‌ای)
-- درست قبل از هر ارسال واقعی، یه ردیف با کلید یکتا insert می‌شه؛ اگه از قبل insert
-- شده بود (conflict)، اصلاً پست نمی‌شه — جلوگیری از هشدار دوباره وقتی دو اجرای
-- پشت‌سرهم cron همون تیک/رویداد رو (چون داده‌ی جدیدتری هنوز نیومده) دوباره می‌بینن.
create table if not exists telegram_alert_sent (
  key text primary key,
  sent_at timestamptz not null default now()
);

alter table telegram_alert_sent enable row level security;

-- فقط سرور (service-role) به این جدول دسترسی داره
create policy "service role full access" on telegram_alert_sent
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
