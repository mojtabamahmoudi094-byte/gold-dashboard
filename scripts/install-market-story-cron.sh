#!/bin/bash
# نصب cron Market Story روزانه — با root/sudo اجرا شود
# فقط از Supabase (market_regime_daily/fund_bubble_daily) + API خود سایت می‌خواند

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/market-story-daily.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "🔍 تست اجرا…"
"$NODE_BIN" "$SCRIPT_DIR/market-story-daily.js"

echo ""
read -p "خروجی بالا درست است و cron روزانه نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد."
  exit 0
fi

CRON_FILE="/etc/cron.d/market-story-daily"

cat > "$CRON_FILE" << EOF
# بورس سنج — Market Story خودکار روزانه؛ همه زمان‌ها UTC (تهران = UTC+3:30)
# ۱۲:۵۰ تهران (بعد از market-regime-daily)، شنبه–چهارشنبه = 6,0-3
SHELL=/bin/bash
MAILTO=""

20 9 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh market-story-daily $NODE_BIN $SCRIPT_DIR/market-story-daily.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (روزانه ۱۲:۵۰ تهران، شنبه–چهارشنبه)"
echo "   لاگ: tail -f $LOG_FILE"
