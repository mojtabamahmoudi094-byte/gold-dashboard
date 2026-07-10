#!/bin/bash
# پوشش اجرا برای cron — env را می‌خواند و اسکریپت گزارش را اجرا می‌کند
# cron wrapper — loads env then runs the report script
# استفاده | usage: run-telegram-report.sh <stocks|funds>

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# بارگذاری env | load env
if [ -f "$SCRIPT_DIR/.env.report" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/.env.report"
  set +a
fi

JOB="${1:?job required: stocks|funds}"

alert_on_failure() {
  local code=$?
  if [ "$code" -ne 0 ] && [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s -m 10 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=⚠️ بورس سنج — گزارش ${JOB} ارسال نشد (exit ${code})" >/dev/null || true
  fi
}
trap alert_on_failure EXIT

NODE_BIN="${NODE_BIN:-$(command -v node)}"
"$NODE_BIN" "$SCRIPT_DIR/telegram-report.js" "$JOB"
