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

NODE_BIN="${NODE_BIN:-$(command -v node)}"
exec "$NODE_BIN" "$SCRIPT_DIR/telegram-report.js" "${1:?job required: stocks|funds}"
