#!/bin/bash
# نصب cron اطلاع کامنت جدید (فقط به ادمین) — با root/sudo روی 168.222.43.75 اجرا شود
# پیش‌نیاز: ادمین باید تلگرامش را با ربات پورتفوی (@bsportfo_bot) لینک کرده باشد

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/comment-notify.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "🔍 تست اجرا (بدون کامنت جدید باید «کامنت جدیدی نبود» بدهد)…"
"$NODE_BIN" "$SCRIPT_DIR/comment-notify.js"

echo ""
read -p "خروجی بالا درست است و cron نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد."
  exit 0
fi

CRON_FILE="/etc/cron.d/comment-notify"

cat > "$CRON_FILE" << EOF
# بورس سنج — اطلاع کامنت جدید به ادمین، هر ۲ دقیقه (بدون محدودیت ساعت بازار)
SHELL=/bin/bash
MAILTO=""

*/2 * * * * root $NODE_BIN $SCRIPT_DIR/comment-notify.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (هر ۲ دقیقه)"
echo "   لاگ: tail -f $LOG_FILE"
