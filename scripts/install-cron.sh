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
# بورس سنج — همه زمان‌ها UTC (تهران = UTC+3:30)
# هشدار: cron دبیان TZ= را برای «زمان‌بندی» نادیده می‌گیرد — ساعت‌ها را UTC بنویسید
# روزهای cron: 0=یکشنبه ... 6=شنبه → شنبه تا چهارشنبه = 6,0-3
SHELL=/bin/bash
MAILTO=""

# کالایی (طلا/نقره/زعفران) + بورس کالا + جهانی + NAV — هر ۵ دقیقه، ۱۲:۰۰–۱۷:۰۵ تهران (گارد داخل اسکریپت)
30-55/5 8 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh sync-funds $NODE_BIN $SCRIPT_DIR/sync-funds.js >> $LOG_FILE 2>&1
*/5 9-13 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh sync-funds $NODE_BIN $SCRIPT_DIR/sync-funds.js >> $LOG_FILE 2>&1
# اسنپ‌شات نهایی ۱۷:۰۶ تهران
36 13 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh sync-funds-force $NODE_BIN $SCRIPT_DIR/sync-funds.js --force >> $LOG_FILE 2>&1

# صندوق‌های بورسی (اهرمی/بخشی/سهامی) — هر ۵ دقیقه، ۹:۰۰–۱۲:۳۰ تهران
30-55/5 5 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh sync-bourse $NODE_BIN $SCRIPT_DIR/sync-bourse.js >> $BOURSE_LOG_FILE 2>&1
*/5 6-8 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh sync-bourse $NODE_BIN $SCRIPT_DIR/sync-bourse.js >> $BOURSE_LOG_FILE 2>&1
0 9 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh sync-bourse $NODE_BIN $SCRIPT_DIR/sync-bourse.js >> $BOURSE_LOG_FILE 2>&1

# سهام (۹:۰۰–۱۲:۳۰) + رصد صندوق‌های کالایی (۱۲:۰۰–۱۷:۳۰) — هر ۵ دقیقه، گارد پر-دسته داخل اسکریپت
30-55/5 5 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh stocks-industries $NODE_BIN $SCRIPT_DIR/stocks-industries.js >> /var/log/stocks-industries.log 2>&1
*/5 6-13 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh stocks-industries $NODE_BIN $SCRIPT_DIR/stocks-industries.js >> /var/log/stocks-industries.log 2>&1
0 14 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh stocks-industries $NODE_BIN $SCRIPT_DIR/stocks-industries.js >> /var/log/stocks-industries.log 2>&1

# شناوری هر نماد (ff/z) — یک‌بار روزانه، ۱۳:۱۵ تهران = ۰۹:۴۵ UTC (بعد بسته شدن بازار سهام، خودش تک‌به‌تک همه نمادها را می‌خواند)
45 9 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh stock-float $NODE_BIN $SCRIPT_DIR/stock-float.js >> /var/log/stock-float.log 2>&1
EOF

chmod +x "$SCRIPT_DIR/run-with-alert.sh"

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
