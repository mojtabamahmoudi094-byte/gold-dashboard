#!/bin/bash
# نصب cron گزارش تلگرام روی سرور (کرون سرور UTC است؛ تهران = UTC+3:30)
# Install Telegram-report cron on the server (server cron is UTC; Tehran = UTC+3:30)
# با دسترسی کاربری که قرار است cron را اجرا کند اجرا شود
# Run as the user whose crontab should own the jobs.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="/var/log/telegram-report.log"

echo "📍 مسیر اسکریپت | script dir: $SCRIPT_DIR"

# ۱) وابستگی‌ها: puppeteer + chromium همراهش
# 1) deps: puppeteer (bundles chromium)
echo "📦 نصب puppeteer | installing puppeteer…"
( cd "$SCRIPT_DIR/.." && npm install puppeteer )

# ۲) فایل env نمونه اگر نبود
# 2) create env file if missing
if [ ! -f "$SCRIPT_DIR/.env.report" ]; then
  cat > "$SCRIPT_DIR/.env.report" <<'EOF'
# توکن و چت تلگرام (همان ربات فعلی telegram-notify)
# Telegram token & chat (same bot as telegram-notify)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
# دامنه عمومی سایت | public site
SITE_URL=https://bourssanj.ir
# فقط داده امروزِ تهران را بفرست (۱ = روشن) | only send today's data
REPORT_FRESH_ONLY=1
EOF
  echo "⚠️  فایل env ساخته شد. مقادیر را پر کن | fill values:"
  echo "     nano $SCRIPT_DIR/.env.report"
  echo "     سپس این اسکریپت را دوباره اجرا کن | then re-run this installer"
  exit 0
fi

# اطمینان از پر بودن توکن | ensure token present
# shellcheck disable=SC1091
. "$SCRIPT_DIR/.env.report"
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "❌ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID در .env.report خالی است"
  exit 1
fi

chmod +x "$SCRIPT_DIR/run-telegram-report.sh"
WRAP="$SCRIPT_DIR/run-telegram-report.sh"

# ۳) خطوط cron — زمان‌ها UTC، روزهای بازار شنبه–چهارشنبه (dow UTC: 0-3,6)
# 3) cron lines — UTC times, market days Sat–Wed
#   سهام (تهران ۹:۰۵ تا ۱۲:۰۵ هر ۳۰ دقیقه):
#     05:35,06:35,07:35,08:35  و  06:05,07:05,08:05  UTC
#   صندوق‌ها (تهران ۱۲:۰۰ تا ۱۷:۰۰ هر ۳۰ دقیقه):
#     08:30  و  09:00..13:30  UTC
CRON_TAG="# telegram-report (bourse-sanj)"
CRON_LINES=$(cat <<EOF
$CRON_TAG
35 5,6,7,8 * * 0-3,6 $WRAP stocks >> $LOG 2>&1
5 6,7,8 * * 0-3,6 $WRAP stocks >> $LOG 2>&1
30 8 * * 0-3,6 $WRAP funds >> $LOG 2>&1
0,30 9,10,11,12,13 * * 0-3,6 $WRAP funds >> $LOG 2>&1
$CRON_TAG-end
EOF
)

# حذف نسخه قبلی همین بلاک و درج نسخه جدید
# remove any previous block, then append fresh
TMP="$(mktemp)"
crontab -l 2>/dev/null | sed "/$CRON_TAG\$/,/$CRON_TAG-end\$/d" > "$TMP" || true
printf '%s\n' "$CRON_LINES" >> "$TMP"
crontab "$TMP"
rm -f "$TMP"

echo "✅ cron نصب شد | installed. لاگ | log: $LOG"
echo "— برای تست دستی | manual test:"
echo "    $WRAP stocks"
crontab -l | grep -A5 "$CRON_TAG\$" || true
