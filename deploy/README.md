# انتقال bourssanj.ir از Render به سرور ایران (ParsPack)

معماری: بیلد روی مک (`deploy/deploy-from-mac.sh`) → rsync خروجی standalone → systemd + nginx روی سرور ایران.
سرویس‌های بلاک‌شده از IP ایران (Gemini، OpenRouter، Telegram) از طریق relay روی Apache سرور آلمان
(`relay.bourssanj.ir/relay/…` → 168.222.43.75) رد می‌شوند — کانفیگ: `deploy/apache-relay-germany.conf`.
دامنه‌ی اختصاصی relay لازم بود چون فیلترینگ ایران SNI دامنه‌ی بات را می‌کشید؛ نکته‌ی مهم:
سرور آلمان IPv6ش به گوگل/کلادفلر خراب است، در `/etc/gai.conf` خط `precedence ::ffff:0:0/96 100`
اضافه شد تا کل سیستم IPv4 را ترجیح دهد (وگرنه mod_proxy روی IPv6 تایم‌اوت می‌کند).

## مراحل (به ترتیب، هر کدام یک بار)

۱. **ارتقای سرور ایران به ۲ گیگ رم** (پنل ParsPack) — خروجی مورد انتظار: `free -h` مقدار total ≈ 2.0Gi.
۲. **relay روی سرور آلمان** (✅ انجام شد ۲۰۲۶-۰۷-۲۲): vhost اختصاصی `relay.bourssanj.ir` روی Apache 168.222.43.75 با گواهی certbot (webroot، چون پلاگین apache نصب نبود). فایل‌ها: `relay.bourssanj.ir.conf` (پورت ۸۰) و `relay.bourssanj.ir-ssl.conf` (۴۴۳ با proxy paths). تست از سرور ایران: `curl https://relay.bourssanj.ir/relay/gemini/v1beta/models` = 403 گوگل، openrouter = 200، telegram = JSON. محدود به IP `45.94.215.115`.
۳. **آماده‌سازی سرور ایران**: `apt install nginx certbot python3-certbot-nginx`، ساخت `/opt/bourssanj-site/`، کپی `env.example` به `/opt/bourssanj-site/.env` و پرکردن مقادیر از Environment سرویس Render.
۴. **سرویس systemd**: `bourssanj-site.service` به `/etc/systemd/system/` و بعد `systemctl daemon-reload && systemctl enable bourssanj-site`.
۵. **اولین دیپلوی**: روی مک `bash deploy/deploy-from-mac.sh` — خروجی مورد انتظار: `200 OK` در انتها.
۶. **nginx**: `nginx-bourssanj.conf` به `/etc/nginx/sites-available/bourssanj` + symlink به `sites-enabled` + حذف `default`، بعد `nginx -t && systemctl reload nginx`.
۷. **DNS**: رکورد A دامنه `bourssanj.ir` و `www` به `45.94.215.115` (TTL کم قبل از سوییچ). تا انتشار DNS، سایت Render همچنان جواب می‌دهد — downtime صفر.
۸. **SSL**: بعد از انتشار DNS: `certbot --nginx -d bourssanj.ir -d www.bourssanj.ir`.
۹. **پس از پایداری**: سرویس Render حذف/suspend شود، کرون keepalive از crontab سرور ایران پاک شود (`render-keepalive`)، و روی مک alias دیپلوی: هر merge به main → اجرای `deploy/deploy-from-mac.sh`.

## نکته‌ها

- `NEXT_PUBLIC_*` موقع **بیلد** inline می‌شوند → مقادیرشان باید موقع بیلد روی مک در `.env.local` ست باشند؛ `.env` سرور فقط برای متغیرهای سمت سرور است.
- سه متغیر `*_BASE_URL` فقط روی سرور ایران ست می‌شوند؛ روی Render/لوکال ست نشوند (پیش‌فرض = مقصد اصلی).
- روت‌های `/api/telegram-relay*` که قبلاً خودِ سایت (روی Render) برای کرون‌های سرور ایران relay می‌کرد، حالا خودشان از relay آلمان رد می‌شوند — زنجیره: کرون ایران → سایت (همین سرور) → Apache آلمان → تلگرام.
