#!/bin/bash
# نصب cron Portfolio Intelligence (تمرکز صنعتی) — با root/sudo اجرا شود

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/portfolio-industry-alert.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "🔍 تست اجرا (ممکن است هشدار واقعی برای کاربران واجد شرایط بفرستد)…"
"$NODE_BIN" "$SCRIPT_DIR/portfolio-industry-alert.js"

echo ""
read -p "خروجی بالا درست است و cron روزانه نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد."
  exit 0
fi

CRON_FILE="/etc/cron.d/portfolio-industry-alert"

cat > "$CRON_FILE" << EOF
# بورس سنج — Portfolio Intelligence (هشدار تمرکز صنعتی)؛ همه زمان‌ها UTC (تهران = UTC+3:30)
# ۱۳:۰۰ تهران (بعد بسته‌شدن بازار)، شنبه–چهارشنبه = 6,0-3
SHELL=/bin/bash
MAILTO=""

30 9 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh portfolio-industry-alert $NODE_BIN $SCRIPT_DIR/portfolio-industry-alert.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (روزانه ۱۳:۰۰ تهران، شنبه–چهارشنبه)"
echo "   لاگ: tail -f $LOG_FILE"
