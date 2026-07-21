#!/bin/bash
# نصب cron حباب روزانه صندوق‌های طلا/نقره — با root/sudo اجرا شود
# پیش‌نیاز: scripts/sql/fund-bubble-daily.sql اجرا شده باشد (یا از قبل با mcp اعمال شده)
# این اسکریپت فقط از کش‌های Supabase (signals) می‌خواند، تماس زنده با BrsApi ندارد —
# پس نیازی به IP ایران نیست، اما برای سادگی کنار بقیه کرون‌های پایان‌روز همین سرور نصب می‌شود.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/fund-bubble-daily.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "🔍 تست backfill (همه روزهای موجود در کش)…"
"$NODE_BIN" "$SCRIPT_DIR/fund-bubble-daily.js" --backfill

echo ""
read -p "خروجی بالا درست است و cron روزانه نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد."
  exit 0
fi

CRON_FILE="/etc/cron.d/fund-bubble-daily"

cat > "$CRON_FILE" << EOF
# بورس سنج — حباب روزانه صندوق‌های طلا/نقره؛ همه زمان‌ها UTC (تهران = UTC+3:30)
# ۱۹:۴۵ تهران (بعد از candles-adjusted/chip-distribution)، شنبه–چهارشنبه = 6,0-3
SHELL=/bin/bash
MAILTO=""

15 16 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh fund-bubble-daily $NODE_BIN $SCRIPT_DIR/fund-bubble-daily.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (روزانه ۱۹:۴۵ تهران، شنبه–چهارشنبه)"
echo "   لاگ: tail -f $LOG_FILE"
