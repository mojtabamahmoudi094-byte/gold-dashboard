# انتقال bourssanj.ir از Render به سرور ایران (ParsPack)

معماری: بیلد روی مک (`deploy/deploy-from-mac.sh`) → rsync خروجی standalone → systemd + nginx روی سرور ایران.
سرویس‌های بلاک‌شده از IP ایران (Gemini، OpenRouter، Telegram) از طریق relay روی Apache سرور آلمان
(`newbot.dadashchekhabare.qzz.io/relay/…`) رد می‌شوند — کانفیگ: `deploy/apache-relay-germany.conf`.

## مراحل (به ترتیب، هر کدام یک بار)

۱. **ارتقای سرور ایران به ۲ گیگ رم** (پنل ParsPack) — خروجی مورد انتظار: `free -h` مقدار total ≈ 2.0Gi.
۲. **relay روی سرور آلمان**: فایل `apache-relay-germany.conf` به `/etc/apache2/conf-available/bourssanj-relay.conf` کپی شود، بعد داخل vhost اولِ 443 در `sites-enabled/newbot.dadashchekhabare.qzz.io-ssl.conf` خط `Include conf-available/bourssanj-relay.conf` اضافه شود؛ سپس `apache2ctl configtest && systemctl reload apache2`. تست از سرور ایران: `curl -s https://newbot.dadashchekhabare.qzz.io/relay/gemini/` باید جواب گوگل (خطای ۴۰۴/۴۰۳ گوگل، نه تایم‌اوت) بدهد.
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
