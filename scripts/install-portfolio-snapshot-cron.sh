#!/bin/bash
# نصب cron اسنپ‌شات روزانه‌ی پورتفو روی سرور — با root/sudo اجرا شود
# پیش‌نیاز: scripts/sql/portfolio-daily-snapshot.sql در Supabase اجرا شده و .env.sync
# با SUPABASE_KEY (service_role — نه anon) تنظیم شده باشد (رجوع به هدر snapshot-portfolio.js)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/snapshot-portfolio.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "📦 نصب وابستگی‌ها…"
cd "$SCRIPT_DIR" && npm install @supabase/supabase-js 2>/dev/null || \
  (cd .. && npm install @supabase/supabase-js)

echo "🔍 اجرای دستی یک‌باره برای تست (بدون --force ممکن است خارج از بازار کاری نکند)…"
"$NODE_BIN" "$SCRIPT_DIR/snapshot-portfolio.js" --force

echo ""
read -p "خروجی بالا درست به نظر می‌رسد و cron نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد."
  exit 0
fi

CRON_FILE="/etc/cron.d/snapshot-portfolio"

cat > "$CRON_FILE" << EOF
# بورس سنج — اسنپ‌شات روزانه‌ی ارزش پورتفو؛ همه زمان‌ها UTC (تهران = UTC+3:30)
# شنبه تا چهارشنبه = 6,0-3
SHELL=/bin/bash
MAILTO=""

# ۱۸:۱۵ تهران — بعد از بسته‌شدن آخرین بازار (کالایی/طلا/نقره تا ~۱۸:۰۰ تهران)
45 14 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh snapshot-portfolio $NODE_BIN $SCRIPT_DIR/snapshot-portfolio.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (روزانه ۱۸:۱۵ تهران، شنبه–چهارشنبه)"
echo "   لاگ: tail -f $LOG_FILE"
