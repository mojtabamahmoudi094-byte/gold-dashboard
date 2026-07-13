#!/bin/bash
# نصب cron ماهانه‌ی وزن سکه/شمش طلا و گواهی نقره روی سرور — با root/sudo اجرا شود
# پیش‌نیاز: scripts/codal-portfolio.js و scripts/sync-fund-weight-one.js در همان مسیر
# نکته حافظه: سرور ~۱GB رم دارد؛ sync-fund-weights.js هر صندوق را در پروسه‌ی جدا
# با --max-old-space-size=350 اجرا می‌کند تا فایل حافظه‌بر یک صندوق سرور را OOM نکند

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(which node)"
LOG_FILE="/var/log/sync-fund-weights.log"

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js یافت نشد."
  exit 1
fi

echo "🔍 اجرای probe (فقط عیار + نقرفام، بدون نوشتن فایل)…"
"$NODE_BIN" "$SCRIPT_DIR/sync-fund-weights.js" --probe

echo ""
read -p "خروجی بالا درست به نظر می‌رسد و cron نصب شود؟ (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "نصب لغو شد. اجرای دستی همیشه ممکن است:"
  echo "  node $SCRIPT_DIR/sync-fund-weights.js"
  exit 0
fi

CRON_FILE="/etc/cron.d/sync-fund-weights"

cat > "$CRON_FILE" << EOF
# بورس سنج — وزن سکه/شمش صندوق‌های طلا + گواهی نقره صندوق‌های نقره از کدال
# گزارش ماهانه ~۵ تا ۱۵ هر ماه شمسی منتشر می‌شود؛ زمان‌ها UTC (تهران = UTC+3:30)
SHELL=/bin/bash
MAILTO=""

# سه‌شنبه و جمعه ۰۶:۰۰ تهران — بعد از update-portfolio.sh (۰۵:۳۰ تهران)
30 2 * * 2,5 root $SCRIPT_DIR/run-with-alert.sh sync-fund-weights $NODE_BIN $SCRIPT_DIR/sync-fund-weights.js >> $LOG_FILE 2>&1
EOF

chmod 644 "$CRON_FILE"
echo ""
echo "✅ Cron نصب شد: $CRON_FILE (سه‌شنبه/جمعه ۰۶:۰۰ تهران)"
echo "   لاگ: tail -f $LOG_FILE"
echo ""
echo "⚠️  خروجی در public/fund-weights/*.json روی خود سرور نوشته می‌شود — برای این‌که"
echo "    سایت (Render) آن را ببیند باید مثل codal-portfolio.js به ریپو commit/push شود."
echo "    این اسکریپت خودش push نمی‌کند؛ در صورت نیاز به همان الگوی update-portfolio.sh اضافه شود."
