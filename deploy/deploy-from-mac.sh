#!/usr/bin/env bash
# دیپلوی سایت بورس سنج به سرور ایران: بیلد standalone روی مک، rsync خروجی، ری‌استارت سرویس.
# پیش‌نیاز یک‌باره روی سرور: /opt/bourssanj-site/.env (از deploy/env.example) + سرویس systemd + nginx.
set -euo pipefail

SERVER="${DEPLOY_SERVER:-root@45.94.215.115}"
DEST=/opt/bourssanj-site
cd "$(dirname "$0")/.."

echo "==> next build (standalone)"
npm run build

# طبق داکیومنت Next: public و .next/static داخل standalone کپی می‌شوند تا server.js خودش سروشان کند
cp -r public .next/standalone/
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/

echo "==> rsync به $SERVER:$DEST/app/"
rsync -az --delete .next/standalone/ "$SERVER:$DEST/app/"

echo "==> restart + smoke test"
ssh "$SERVER" "systemctl restart bourssanj-site && sleep 3 && curl -sfo /dev/null -w '%{http_code}' http://127.0.0.1:3000/ && echo ' OK'"
