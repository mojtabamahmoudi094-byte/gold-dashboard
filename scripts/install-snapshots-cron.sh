#!/bin/bash
# نصب کرون snapshotهای روزانه (قیمت نمادهای سیگنال سهام + پورتفوی کاربران) روی سرور
# با دسترسی root یا sudo اجرا شود
#
# قبلاً این کرون به‌صورت دستی با فایل‌های مستقل /opt/*.js (بدون هشدار تلگرام) نصب شده بود؛
# این اسکریپت آن را با نسخه‌ی داخل ریپو + run-with-alert.sh جایگزین می‌کند تا:
#   1. با هر git pull به‌روز بماند (به‌جای کپی فراموش‌شده‌ی /opt/*.js)
#   2. روی خطا پیام تلگرام بفرستد، مثل بقیه‌ی کرون‌ها

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

chmod +x "$SCRIPT_DIR/run-with-alert.sh"

CRON_FILE="/etc/cron.d/bourssanj-snapshots"

cat > "$CRON_FILE" << EOF
# بورس سنج — snapshotهای روزانه پورتفو و سیگنال سهام (همه زمان‌ها UTC — تهران = UTC+3:30)
# روزها: 6,0-3 = شنبه تا چهارشنبه
# نیازمند اجرای scripts/sql/portfolio-daily-snapshot.sql و scripts/sql/signals-v2-category.sql
# و scripts/sql/stock-signal-prices.sql در Supabase SQL Editor — تا آن زمان خطای «table not found» می‌دهند (بی‌خطر)
SHELL=/bin/bash
MAILTO=""

# قیمت پایانی نمادهای سیگنال‌دار سهام — ۱۲:۴۰ تهران (بعد از بسته‌شدن بازار سهام ۱۲:۳۰)
10 9 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh snapshot-stock-signal-prices $NODE_BIN $SCRIPT_DIR/snapshot-stock-signal-prices.js >> /var/log/snapshot-stock-signal-prices.log 2>&1

# ارزش روزانه پورتفوی کاربران — ۱۸:۱۰ تهران (بعد از بسته‌شدن سهام ۱۲:۳۰ و صندوق‌های طلا/نقره/زعفران ۱۸:۰۰)
40 14 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh snapshot-portfolio $NODE_BIN $SCRIPT_DIR/snapshot-portfolio.js >> /var/log/snapshot-portfolio.log 2>&1
EOF

chmod 644 "$CRON_FILE"
echo "✅ Cron نصب شد: $CRON_FILE (نسخه‌ی ریپو، با هشدار تلگرام)"
