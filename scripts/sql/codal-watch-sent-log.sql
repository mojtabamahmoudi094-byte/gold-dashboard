-- جدول ادعای ارسال تلگرام برای codal-watch.js — واحد و مشترک بین همهٔ پروسه‌ها (زامبی/overlap/کرش)
-- برخلاف فایل JSON محلی (codal-watch-state.json) که فقط تو حافظهٔ همون پروسه‌ست و با کرش از دست می‌ره،
-- این جدول تنها منبع حقیقتِ «آیا این اطلاعیه واقعاً پست شده؟» است — درست قبل از هر sendPhoto/sendTelegram
-- واقعی، یه ردیف با کلید یکتا insert می‌شه؛ اگه از قبل insert شده بود (conflict)، اصلاً پست نمی‌شه.
create table if not exists codal_watch_sent (
  key text primary key,
  sent_at timestamptz not null default now()
);

alter table codal_watch_sent enable row level security;

-- فقط سرور (service-role) به این جدول دسترسی داره؛ کلاینت/سایت هیچ‌وقت بهش نیاز نداره
create policy "service role full access" on codal_watch_sent
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
