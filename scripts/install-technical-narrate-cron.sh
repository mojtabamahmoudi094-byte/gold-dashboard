#!/bin/bash
# نصب cron روزانه تحلیل تکنیکال تصویری (P2، چارت‌بین Gemini) — با root/sudo اجرا شود
# پیش‌نیاز: scripts/technical-chart-card.js, technical-narrate-watch.js در همان مسیر
# scripts/sql/stock-fundamentals.sql لازم نیست — این فیچر جدول جداگانه‌ای نمی‌خواهد

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/technical-narrate-watch.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "🔍 اجرای تست دستی (--force، بدون گارد ساعت بازار)…"
"$NODE_BIN" "$SCRIPT_DIR/technical-narrate-watch.js" --force

echo ""
read -p "خروجی بالا + پست‌های کانال درست به نظر می‌رسند و cron نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد. اجرای دستی همیشه ممکن است:"
  echo "  node $SCRIPT_DIR/technical-narrate-watch.js --force"
  exit 0
fi

CRON_FILE="/etc/cron.d/technical-narrate-watch"

cat > "$CRON_FILE" << EOF
# بورس سنج — تحلیل تکنیکال تصویری روزانه (چارت‌بین Gemini) — همه زمان‌ها UTC (تهران = UTC+3:30)
# گارد ساعت بازار داخل خود اسکریپت است (بعد از ۱۲:۳۵ تهران)؛ اینجا فقط یک بار بعد از بسته‌شدن بازار صدا می‌زنیم
SHELL=/bin/bash
MAILTO=""

# ۱۳:۳۰ تهران (۱۰:۰۰ UTC)، شنبه تا چهارشنبه
0 10 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh technical-narrate-watch $NODE_BIN $SCRIPT_DIR/technical-narrate-watch.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (روزانه ۱۳:۳۰ تهران، شنبه–چهارشنبه)"
echo "   لاگ: tail -f $LOG_FILE"
echo "   تعداد نماد هر روز: NARRATE_PER_SIDE (پیش‌فرض ۱+۱=۲) در .env.local/.env.sync قابل تنظیم"
