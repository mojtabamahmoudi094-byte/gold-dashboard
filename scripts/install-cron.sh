#!/bin/bash
# نصب cron job روی سرور ایرانی
# با دسترسی root یا sudo اجرا شود

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/sync-funds.log"
BOURSE_LOG_FILE="/var/log/sync-bourse.log"

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

# ثبت یک‌باره صندوق‌های بورسی در جدول assets (اگر قبلاً ثبت نشده باشند)
echo ""
echo "🌱 ثبت صندوق‌های بورسی (seed — فقط نمادهای جدید درج می‌شوند)..."
"$NODE_BIN" "$SCRIPT_DIR/seed-bourse-assets.js"

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
# بورس سنج — بروزرسانی صندوق‌های کالایی از BrsAPI
# هر ۱۰ دقیقه، شنبه تا چهارشنبه، ۱۲:۰۰ تا ۱۷:۱۰ به وقت تهران
# (اسکریپت خودش چک می‌کند ۱۷:۰۵ گذشته یا نه)
# روزهای cron: 0=یکشنبه ... 6=شنبه → شنبه تا چهارشنبه = 6,0-3
SHELL=/bin/bash
MAILTO=""
TZ=Asia/Tehran

*/10 12-17 * * 6,0-3 root $NODE_BIN $SCRIPT_DIR/sync-funds.js >> $LOG_FILE 2>&1

# بورس سنج — بروزرسانی صندوق‌های بورسی (اهرمی/بخشی/سهامی) از BrsAPI
# هر ۱۰ دقیقه، شنبه تا چهارشنبه، ۹:۰۰ تا ۱۲:۳۰ به وقت تهران
# (دو خط چون cron بازه «تا ۱۲:۳۰» را یک‌خطی پشتیبانی نمی‌کند)
*/10 9-11 * * 6,0-3 root $NODE_BIN $SCRIPT_DIR/sync-bourse.js >> $BOURSE_LOG_FILE 2>&1
0,10,20,30 12 * * 6,0-3 root $NODE_BIN $SCRIPT_DIR/sync-bourse.js >> $BOURSE_LOG_FILE 2>&1

# بورس سنج — قیمت لحظه‌ای سهام به تفکیک صنعت (stock_industries در Supabase)
# هر ۵ دقیقه، شنبه تا چهارشنبه، ۹:۰۰ تا ۱۲:۳۵ تهران (گارد دقیق داخل اسکریپت)
*/5 9-12 * * 6,0-3 root $NODE_BIN $SCRIPT_DIR/stocks-industries.js >> /var/log/stocks-industries.log 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE"
echo ""
echo "📋 وضعیت:"
echo "   کالایی:     هر ۱۰ دقیقه، ۱۲:۰۰–۱۷:۱۰ تهران، شنبه–چهارشنبه"
echo "   بورسی:      هر ۱۰ دقیقه، ۹:۰۰–۱۲:۳۰ تهران، شنبه–چهارشنبه"
echo "   لاگ کالایی: tail -f $LOG_FILE"
echo "   لاگ بورسی:  tail -f $BOURSE_LOG_FILE"
echo ""
echo "🧪 تست دستی (با --force خارج از ساعت بازار):"
echo "   node $SCRIPT_DIR/sync-funds.js --force"
echo "   node $SCRIPT_DIR/sync-bourse.js --force"
