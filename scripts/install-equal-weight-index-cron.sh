#!/bin/bash
# نصب cron شاخص هم‌وزن صندوق‌های طلا/نقره — با root/sudo اجرا شود
# فقط از Supabase می‌خواند (gold_funds/assets)، تماس زنده با BrsApi ندارد

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/equal-weight-index.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "🔍 تست backfill (کل تاریخچه)…"
"$NODE_BIN" "$SCRIPT_DIR/equal-weight-index.js" --backfill

echo ""
read -p "خروجی بالا درست است و cron روزانه نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد."
  exit 0
fi

CRON_FILE="/etc/cron.d/equal-weight-index"

cat > "$CRON_FILE" << EOF
# بورس سنج — شاخص هم‌وزن صندوق‌های طلا/نقره؛ همه زمان‌ها UTC (تهران = UTC+3:30)
# ۱۹:۵۰ تهران، بعد از fund-bubble-daily، شنبه–چهارشنبه = 6,0-3
SHELL=/bin/bash
MAILTO=""

20 16 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh equal-weight-index $NODE_BIN $SCRIPT_DIR/equal-weight-index.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (روزانه ۱۹:۵۰ تهران، شنبه–چهارشنبه)"
echo "   لاگ: tail -f $LOG_FILE"
