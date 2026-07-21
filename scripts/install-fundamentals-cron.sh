#!/bin/bash
# نصب cron مستقل نسبت‌های مالی (P/E, P/B, ROE, ROA, ...) روی سرور — با root/sudo اجرا شود
# پیش‌نیاز: scripts/fundamentals-compute.js در همان مسیر، جدول stock_fundamentals ساخته شده باشد
# (scripts/sql/stock-fundamentals.sql در SQL Editor سوپابیس)
#
# این اسکریپت فقط از روی stock_reports/stock_industicesِ موجود در Supabase محاسبه می‌کند —
# تماس شبکه‌ای با کدال ندارد، پس اجرای مکرر بی‌خطر است (بر خلاف codal-watch.js که rate-limit دارد)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/fundamentals-compute.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "🔍 اجرای تست (یک‌بار، قبل از نصب cron)…"
"$NODE_BIN" "$SCRIPT_DIR/fundamentals-compute.js"

echo ""
read -p "خروجی بالا درست به نظر می‌رسد و cron نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد. اجرای دستی همیشه ممکن است:"
  echo "  node $SCRIPT_DIR/fundamentals-compute.js"
  exit 0
fi

CRON_FILE="/etc/cron.d/fundamentals-compute"

cat > "$CRON_FILE" << EOF
# بورس سنج — محاسبه نسبت‌های مالی از stock_reports (کدال) + stock_industries (قیمت)
# همه زمان‌ها UTC (تهران = UTC+3:30) — بدون تماس شبکه‌ای با کدال، اجرای مکرر بی‌خطر است
SHELL=/bin/bash
MAILTO=""

# هر ۳۰ دقیقه، هر روز — چند دقیقه بعد از هر sync گزارش کدال جدید را می‌بیند
*/30 * * * * root $SCRIPT_DIR/run-with-alert.sh fundamentals-compute $NODE_BIN $SCRIPT_DIR/fundamentals-compute.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (هر ۳۰ دقیقه)"
echo "   لاگ: tail -f $LOG_FILE"
