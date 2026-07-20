#!/bin/bash
# نصب cron کندل روزانه روی سرور ایرانی — با root/sudo اجرا شود
# پیش‌نیاز: جدول‌ها با scripts/sql/stock-candles.sql در سوپابیس ساخته شده باشند

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/candles-daily.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "📦 نصب وابستگی‌ها…"
cd "$SCRIPT_DIR" && npm install @supabase/supabase-js jalaali-js 2>/dev/null || \
  (cd .. && npm install @supabase/supabase-js jalaali-js)

echo "🔍 تست probe (فرمت AllSymbols + Index)…"
"$NODE_BIN" "$SCRIPT_DIR/candles-daily.js" --probe

echo ""
read -p "فرمت درست است و cron نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد."
  exit 0
fi

CRON_FILE="/etc/cron.d/candles-daily"

cat > "$CRON_FILE" << EOF
# بورس سنج — کندل روزانه + دیده‌بان تکنیکال؛ همه زمان‌ها UTC (تهران = UTC+3:30)
# شنبه تا چهارشنبه = 6,0-3
SHELL=/bin/bash
MAILTO=""

# کندل روزانه — ۱۷:۴۵ تهران
15 14 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh candles-daily $NODE_BIN $SCRIPT_DIR/candles-daily.js >> $LOG_FILE 2>&1
# دیده‌بان تکنیکال — ۱۸:۱۵ تهران (نیم ساعت بعد از کندل‌ها)
45 14 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh screener-daily $NODE_BIN $SCRIPT_DIR/screener-daily.js >> /var/log/screener-daily.log 2>&1
# قیمت‌های تعدیل‌شده — ۱۹:۰۰ تهران (tsetmc، بدون بودجه BrsApi؛ کل تاریخچه هر شب تازه می‌شود)
30 15 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh candles-adjusted $NODE_BIN $SCRIPT_DIR/candles-adjusted.js >> /var/log/candles-adjusted.log 2>&1
# توزیع چیپ — ۱۹:۱۵ تهران (نیم ساعت بعد از قیمت‌های تعدیل‌شده)
45 15 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh chip-distribution $NODE_BIN $SCRIPT_DIR/chip-distribution-daily.js >> /var/log/chip-distribution.log 2>&1
# بک‌تست سیگنال‌ها — هفتگی پنجشنبه ۱۰:۰۰ تهران (بازار تعطیل، سرور بی‌کارتر)
30 6 * * 4 root $SCRIPT_DIR/run-with-alert.sh backtest-signals $NODE_BIN $SCRIPT_DIR/backtest-signals.js >> /var/log/backtest-signals.log 2>&1
# آتی جهانی پیوسته — ۰۶:۳۰ تهران، هر روز هفته (Yahoo Finance، بدون بودجه BrsApi و بدون نیاز به سرور ایرانی)
0 3 * * * root $SCRIPT_DIR/run-with-alert.sh global-futures-daily $NODE_BIN $SCRIPT_DIR/global-futures-daily.js >> /var/log/global-futures-daily.log 2>&1
# آتی داخلی IME (سکه/زعفران) — ۱۹:۰۰ تهران، شنبه–چهارشنبه (فقط لحظه‌ای؛ آرشیو از این تاریخ به بعد جمع می‌شود)
30 15 * * 6,0-3 root $SCRIPT_DIR/run-with-alert.sh ime-futures-daily $NODE_BIN $SCRIPT_DIR/ime-futures-daily.js >> /var/log/ime-futures-daily.log 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (روزانه ۱۷:۴۵ تهران، شنبه–چهارشنبه)"
echo "   لاگ: tail -f $LOG_FILE"
echo ""
echo "🧪 بک‌فیل ۳ سال (یک‌باره — بودجه BrsApi روزانه ۱۰۰۰ درخواست):"
echo "   node $SCRIPT_DIR/candles-backfill.js --probe        # اول فرمت را ببینید"
echo "   node $SCRIPT_DIR/candles-backfill.js --probe-index  # فرمت تاریخچه شاخص tsetmc"
echo "   node $SCRIPT_DIR/candles-backfill.js --limit=900    # روز اول"
echo "   node $SCRIPT_DIR/candles-backfill.js                # روز بعد — از همان‌جا ادامه می‌دهد"
echo ""
echo "🧪 آتی جهانی پیوسته — بک‌فیل یک‌بارهٔ ۱۰ساله (هرجا اجرا شود، نیازی به سرور ایرانی ندارد):"
echo "   node $SCRIPT_DIR/global-futures-backfill.js"
echo "🧪 آتی داخلی IME — قبل از فعال‌کردن کرون، فرمت را با کلید واقعی چک کن:"
echo "   node $SCRIPT_DIR/ime-futures-daily.js --probe"
