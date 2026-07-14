#!/bin/bash
# نصب cron روزانه‌ی ارزش بازار دلاری (سهام + صندوق‌ها) روی سرور — با root/sudo اجرا شود
# پیش‌نیاز: SQL scripts/sql/gold-funds-market-value-usd.sql قبلاً در Supabase اجرا شده باشد

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/sync-usd-market-value.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "🔍 اجرای آزمایشی (--force)…"
"$NODE_BIN" "$SCRIPT_DIR/sync-usd-market-value.js" --force

echo ""
read -p "خروجی بالا درست به نظر می‌رسد و cron نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد. اجرای دستی همیشه ممکن است:"
  echo "  node $SCRIPT_DIR/sync-usd-market-value.js --force"
  exit 0
fi

CRON_FILE="/etc/cron.d/sync-usd-market-value"

cat > "$CRON_FILE" << EOF
# بورس سنج — ارزش بازار دلاری سهام + صندوق‌ها، هر روز ساعت ۱۳:۰۰ تهران
# کرون دبیان TZ= را نادیده می‌گیرد — ساعت UTC است (۱۳:۰۰ تهران = ۰۹:۳۰ UTC)
SHELL=/bin/bash
MAILTO=""

30 9 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh sync-usd-market-value $NODE_BIN $SCRIPT_DIR/sync-usd-market-value.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (شنبه–چهارشنبه ۱۳:۰۰ تهران)"
echo "   لاگ: tail -f $LOG_FILE"
