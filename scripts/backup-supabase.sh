#!/bin/bash
# بکاپ شبانهٔ Supabase (Postgres 17.6) با pg_dump — روی سرور آلمان (دیسک/دسترسی آزاد؛
# سرور ایران pooler دسترسی محدود/ناپایدار دارد). پلن رایگان Supabase فقط ۷ روز بکاپ خودکار
# دارد، پس این عملاً تنها بکاپ واقعی و مستقل است.
#
# پیش‌نیاز: postgresql-client-17 (نسخه باید >=17 باشد وگرنه pg_dump روی سرور ۱۷.۶ خطای
#   «server version mismatch» می‌دهد). نصب PGDG روی Ubuntu:
#     install -d /usr/share/postgresql-common/pgdg
#     curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
#       https://www.postgresql.org/media/keys/ACCC4CF8.asc
#     echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
#       https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
#       > /etc/apt/sources.list.d/pgdg.list
#     apt update && apt install -y postgresql-client-17
#
# env (فایل .env.backup کنار همین اسکریپت، حتماً chmod 600):
#   SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
#   (از Supabase Dashboard → Project Settings → Database → Connection string → URI، حالت Session)
#   BACKUP_DIR=/opt/backups   (اختیاری، پیش‌فرض /opt/backups)
#   RETAIN_DAYS=14            (اختیاری، پیش‌فرض ۱۴)
#
# نصب cron (۰۳:۰۰ UTC = ۰۶:۳۰ تهران، زیر پوشش dead-man + alert):
#   0 3 * * * root /opt/bourse-analyst/scripts/run-with-alert.sh backup-supabase \
#     /opt/bourse-analyst/scripts/backup-supabase.sh >> /var/log/backup-supabase.log 2>&1
#
# تست سلامت فایل (ماهانه): pg_restore --list /opt/backups/bourssanj-YYYY-MM-DD.dump | head

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env.backup" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/.env.backup"
  set +a
fi
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL تنظیم نشده — .env.backup را بساز}"

DIR="${BACKUP_DIR:-/opt/backups}"
RETAIN="${RETAIN_DAYS:-14}"
mkdir -p "$DIR"
FILE="$DIR/bourssanj-$(date +%F).dump"

# -Fc = فرمت custom فشرده و قابل pg_restore؛ بدون owner/privilege تا restore روی هر نقشی کار کند
pg_dump "$SUPABASE_DB_URL" -Fc --no-owner --no-privileges -f "$FILE"

# فقط بعد از dump موفق، قدیمی‌ها را پاک کن (اگر dump fail شود، بکاپ‌های سالم قدیمی نمی‌روند)
find "$DIR" -name 'bourssanj-*.dump' -mtime "+${RETAIN}" -delete

SIZE="$(du -h "$FILE" | cut -f1)"
echo "backup OK: $FILE ($SIZE)"
