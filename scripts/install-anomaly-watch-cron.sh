#!/bin/bash
# نصب cron رصدگر نوسان غیرعادی روی سرور ایرانی — با root/sudo اجرا شود
# پیش‌نیاز: puppeteer نصب‌شده باشد (همان که telegram-report.js استفاده می‌کند)
# و .env.sync کنار این اسکریپت‌ها TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID داشته باشد

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/anomaly-watch.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "📦 اطمینان از puppeteer…"
cd "$SCRIPT_DIR/.." && npm ls puppeteer >/dev/null 2>&1 || npm install puppeteer

echo "🔍 تست dry-run (بدون ارسال، بدون گارد ساعت بازار)…"
"$NODE_BIN" "$SCRIPT_DIR/anomaly-watch.js" --dry --force

echo ""
read -p "خروجی بالا درست است و cron نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد."
  exit 0
fi

CRON_FILE="/etc/cron.d/anomaly-watch"

# همه زمان‌ها UTC (تهران = UTC+3:30). دو دقیقه بعد از هر tick سهام stocks-industries.js
# تا خودِ اسنپ‌شات تازه‌شده باشد. بازهٔ سهام تهران ۹:۰۰–۱۲:۳۵ = UTC ۵:۳۰–۹:۰۵.
# گارد ساعت بازار داخل خودِ اسکریپت هم هست (دفاع دوم در برابر cron نادرست).
cat > "$CRON_FILE" << EOF
# بورس سنج — رصدگر نوسان غیرعادی لحظه‌ای؛ همه زمان‌ها UTC (تهران = UTC+3:30)
# شنبه تا چهارشنبه = 6,0-3 ؛ دو دقیقه بعد از هر تیک stocks-industries.js
SHELL=/bin/bash
MAILTO=""

32-59/5 5 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh anomaly-watch $NODE_BIN $SCRIPT_DIR/anomaly-watch.js >> $LOG_FILE 2>&1
2-59/5 6-8 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh anomaly-watch $NODE_BIN $SCRIPT_DIR/anomaly-watch.js >> $LOG_FILE 2>&1
2,7 9 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh anomaly-watch $NODE_BIN $SCRIPT_DIR/anomaly-watch.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (۹:۰۰–۱۲:۳۵ تهران، هر ۵ دقیقه، شنبه–چهارشنبه)"
echo "   لاگ: tail -f $LOG_FILE"
echo "   تست دستی: $NODE_BIN $SCRIPT_DIR/anomaly-watch.js --dry --force"
