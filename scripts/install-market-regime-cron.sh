#!/bin/bash
# نصب cron Regime Engine بازار سهام — با root/sudo اجرا شود
# فقط از Supabase (market_watch) می‌خواند، تماس زنده با BrsApi ندارد

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/market-regime-daily.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "🔍 تست backfill (کل تاریخچه موجود در market_watch)…"
"$NODE_BIN" "$SCRIPT_DIR/market-regime-daily.js" --backfill

echo ""
read -p "خروجی بالا درست است و cron روزانه نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد."
  exit 0
fi

CRON_FILE="/etc/cron.d/market-regime-daily"

cat > "$CRON_FILE" << EOF
# بورس سنج — Regime Engine روزانه بازار سهام؛ همه زمان‌ها UTC (تهران = UTC+3:30)
# ۱۲:۴۰ تهران (۱۰ دقیقه بعد بسته‌شدن بازار سهام)، شنبه–چهارشنبه = 6,0-3
SHELL=/bin/bash
MAILTO=""

10 9 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh market-regime-daily $NODE_BIN $SCRIPT_DIR/market-regime-daily.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (روزانه ۱۲:۴۰ تهران، شنبه–چهارشنبه)"
echo "   لاگ: tail -f $LOG_FILE"
