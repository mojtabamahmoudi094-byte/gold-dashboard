#!/bin/bash
# روی سرور ایران، cron واقعی /opt/codal-watch.js را اجرا می‌کند (نه /opt/bourssanj/scripts/)
# چون این فایل‌ها flat کپی شده‌اند نه گیت‌کلون، بعد از هر git pull در /opt/bourssanj خودکار
# آپدیت نمی‌شوند — همین باعث شد فیکس دوپست‌شدن اطلاعیه (کامیت fix(codal-watch) در ۲۰۲۶-۰۷-۱۹)
# چند روز روی نسخهٔ قدیمی جا بمونه و باگ ادامه پیدا کنه. بعد از هر git pull این را اجرا کن.
set -euo pipefail
SRC=/opt/bourssanj/scripts
DST=/opt

FILES=(
  codal-watch.js
  codal-company-reports.js
  codal-letter-extract.js
  monthly-report-card.js
  quarterly-report-card.js
  brand-assets.js
)

TS=$(date +%Y%m%d-%H%M%S)
BACKUP="/root/opt-backup-$TS"
mkdir -p "$BACKUP"

for f in "${FILES[@]}"; do
  if [ -f "$DST/$f" ]; then cp "$DST/$f" "$BACKUP/$f"; fi
  cp "$SRC/$f" "$DST/$f"
  node -c "$DST/$f"
  echo "✅ $f"
done

echo "پشتیبان قبلی | previous backup: $BACKUP"
