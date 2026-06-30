#!/bin/bash
# نصب cron job روی سرور ایرانی
# با دسترسی root یا sudo اجرا شود

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/sync-funds.log"

echo "📍 مسیر اسکریپت: $SCRIPT_DIR/sync-funds.js"
echo "📍 Node.js: $NODE_BIN"
echo ""

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد. ابتدا نصب کنید:"
  echo "   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
  echo "   apt-get install -y nodejs"
  exit 1
fi

# نصب وابستگی‌ها
echo "📦 نصب وابستگی‌ها..."
cd "$SCRIPT_DIR" && npm install @supabase/supabase-js 2>/dev/null || \
  (cd .. && npm install @supabase/supabase-js)

# ایجاد فایل env اگر وجود ندارد
if [ ! -f "$SCRIPT_DIR/.env.sync" ]; then
  cp "$SCRIPT_DIR/.env.sync.example" "$SCRIPT_DIR/.env.sync"
  echo ""
  echo "⚠️  فایل .env.sync ایجاد شد. قبل از ادامه مقادیر را تنظیم کنید:"
  echo "    nano $SCRIPT_DIR/.env.sync"
  echo ""
  read -p "پس از تنظیم، Enter بزنید تا ادامه دهیم..."
fi

# تست اتصال
echo ""
echo "🔍 تست probe (بررسی فرمت API)..."
"$NODE_BIN" "$SCRIPT_DIR/sync-funds.js" --probe

echo ""
read -p "آیا فرمت API درست به نظر می‌رسد و cron نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد."
  exit 0
fi

# ایجاد فایل cron
CRON_FILE="/etc/cron.d/sync-funds"

cat > "$CRON_FILE" << EOF
# بورسنج — بروزرسانی صندوق‌های کالایی از BrsAPI
# هر ۱۰ دقیقه، شنبه تا چهارشنبه، ۱۲:۰۰ تا ۱۷:۱۰ به وقت تهران
# (اسکریپت خودش چک می‌کند ۱۷:۰۵ گذشته یا نه)
SHELL=/bin/bash
MAILTO=""
TZ=Asia/Tehran

*/10 12-17 * * 0-4 root $NODE_BIN $SCRIPT_DIR/sync-funds.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE"
echo ""
echo "📋 وضعیت:"
echo "   زمان‌بندی:  هر ۱۰ دقیقه، ۱۲:۰۰–۱۷:۱۰ تهران، شنبه–چهارشنبه"
echo "   لاگ:        tail -f $LOG_FILE"
echo ""
echo "🧪 تست دستی (با --force خارج از ساعت بازار):"
echo "   node $SCRIPT_DIR/sync-funds.js --force"
