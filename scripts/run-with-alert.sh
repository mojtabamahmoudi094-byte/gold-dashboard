#!/bin/bash
# پوشش هشدار تلگرام برای اسکریپت‌های cron — روی خروج غیرصفر پیام خطا به تلگرام می‌فرستد
# Telegram-alert wrapper for cron scripts — posts a Telegram message when the wrapped command exits non-zero.
# استفاده | usage: run-with-alert.sh <label> <command...>
#   ./run-with-alert.sh sync-funds node sync-funds.js

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/.env.sync" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/.env.sync"
  set +a
fi

LABEL="${1:?label required, e.g. sync-funds}"
shift
CMD=("$@")

OUTPUT="$("${CMD[@]}" 2>&1)"
CODE=$?

echo "$OUTPUT"

if [ "$CODE" -ne 0 ] && [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  TAIL="$(printf '%s' "$OUTPUT" | tail -c 2000)"
  MSG="⚠️ بورس سنج — شکست ${LABEL} (exit ${CODE})
$(date '+%Y-%m-%d %H:%M:%S %Z')

${TAIL}"
  SITE_URL="${SITE_URL:-https://bourssanj.ir}"
  # api.telegram.org از سرور ایران فیلتر است — اول مستقیم، بعد از راه رلهٔ سایت (خارج از ایران)
  DIRECT_OK="$(curl -s -m 10 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${MSG}" 2>/dev/null | grep -o '"ok":true' || true)"
  if [ -z "$DIRECT_OK" ]; then
    RELAY_BODY="$(TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" TELEGRAM_CHAT_ID="$TELEGRAM_CHAT_ID" MSG="$MSG" node -e '
      process.stdout.write(JSON.stringify({
        token: process.env.TELEGRAM_BOT_TOKEN,
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: process.env.MSG,
      }))
    ')"
    curl -s -m 90 -X POST "${SITE_URL}/api/telegram-relay" \
      -H "Content-Type: application/json" \
      --data-binary "$RELAY_BODY" \
      >/dev/null || true
  fi
fi

exit "$CODE"
