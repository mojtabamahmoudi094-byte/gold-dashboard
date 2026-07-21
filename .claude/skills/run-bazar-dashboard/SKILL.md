---
name: run-bazar-dashboard
description: "Run, start, launch, build, test, screenshot, smoke-test the bazar-dashboard (بورس سنج) Next.js app. Covers dev server, all page routes, API endpoints, and Playwright screenshots."
---

Next.js 16 app (Turbopack), ~45 pages + ~40 API routes. Driven with `curl` for API/HTML smoke checks and `npx playwright screenshot` for visual checks. Dev server ready in ~350ms. All paths relative to repo root.

## Prerequisites

Node.js ≥20 (verified on v22), npm. `.env.local` must exist in repo root with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BRSAPI_KEY`. Playwright chromium already cached at `~/Library/Caches/ms-playwright` on this machine — no install step needed for screenshots.

## Build

```bash
npm install
npm run build   # optional — dev server doesn't need it
```

## Run (agent path)

### Start dev server

```bash
npm run dev &>/tmp/nextdev.log &
sleep 7 && grep -q "Ready" /tmp/nextdev.log && echo "UP" || tail -20 /tmp/nextdev.log
```

### Smoke test — key routes

All should return 200 (first hit per route compiles on demand — give `--max-time 60`):

```bash
for path in / /funds /funds/radar /dashboard /signals /compare /compare/stocks \
  /analysis/gold /analysis/silver /stocks /stock/فولاد /fundamentals/فولاد \
  /technical /technical/screener /futures /market-map /monitor /portfolio \
  /track-record /trade-value /valuation /alerts /vip/filters /admin /auth \
  /api/funds /api/gold-analysis /api/health /api/market-watch /api/physical-prices; do
  code=$(/usr/bin/curl -s -o /dev/null -w "%{http_code}" --max-time 60 "http://localhost:3000$path")
  echo "$code $path"
done
```

Full route list: `find app -name 'page.tsx'` (pages), `find app/api -name 'route.ts'` (APIs).

### Check API payloads

```bash
/usr/bin/curl -s http://localhost:3000/api/funds | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys()))"
# → ['assets', 'records', 'histRows', 'latestDate']

/usr/bin/curl -s http://localhost:3000/api/gold-analysis | python3 -c "import sys,json; d=json.load(sys.stdin); print('stale:', d['_stale'], list(d.keys()))"
# → stale: False … (True on non-Iranian IP, e.g. Render — falls back to Supabase cache; not an error)

/usr/bin/curl -s http://localhost:3000/api/health
# → {"ok":true,"status":"up","time":"…"}
```

### Screenshot a page

```bash
npx -y playwright screenshot --viewport-size=390,844 --wait-for-timeout=8000 \
  http://localhost:3000/ /tmp/home.png
```

Use 390×844 for the mobile-first check (project convention), 1280×800 for desktop. `--wait-for-timeout=8000` lets client-side Supabase fetches settle. Then Read the PNG and actually look at it.

### Stop server

```bash
kill $(lsof -ti:3000) 2>/dev/null
```

## Run (human path)

```bash
npm run dev
# http://localhost:3000 — homepage is a real landing page (no redirect)
# Ctrl-C to stop
```

## Key pages

| Route | Purpose |
|---|---|
| `/` | لندینگ — hero + market stats (SSR) |
| `/funds`, `/funds/radar`, `/funds/[cat]` | صندوق‌های طلا/کالایی — list, radar, categories |
| `/stocks`, `/stock/[symbol]` | سهام لحظه‌ای + صفحه نماد |
| `/fundamentals/[symbol]` | بنیادی — ratios from pipeline |
| `/technical`, `/technical/screener`, `/technical/backtest` | تکنیکال |
| `/analysis/gold`, `/analysis/silver` | حباب طلا/نقره + قیمت لحظه‌ای |
| `/futures` | آتی جهانی + IME |
| `/market-map`, `/monitor` | نقشه بازار، مانیتور |
| `/portfolio`, `/portfolio/live-monitor` | پرتفوی |
| `/signals`, `/track-record` | سیگنال + کارنامه |
| `/valuation`, `/valuation/screener` | ارزش‌گذاری |
| `/admin` | پنل ادمین (login gate — renders 200) |

## Gotchas

- **Homepage is NOT a redirect anymore** — old versions 307'd `/` → `/funds`; now `/` is a full landing page returning 200. If you see docs claiming 307, they're stale.
- **`_stale: true` in gold-analysis**: only on non-Iranian IP (Render). BrsAPI needs Iranian IP; API falls back to Supabase cache (`signals` table, `signal_type='_gold_cache'`). Locally in Iran `_stale: false` with live prices.
- **Red "N Issues" badge in screenshots**: Next.js dev overlay (bottom-left). Dev-only, not a page bug — but do check `/tmp/nextdev.log` if it appears.
- **First request per route is slow**: Turbopack compiles on demand; `/api/stocks-industries` took ~14s cold. `curl` without `--max-time 60` can time out.
- **`trade_value` unit**: stored as میلیارد ریال from BrsAPI `tval`. Display multiplies ×100 for م.ت; dashboard divides ÷10 for میلیارد تومان. Do not double-convert.
- **No API route for signals/compare pages** — they fetch Supabase directly from the client.
- **Persian symbols in URLs work as-is** in curl (`/stock/فولاد`) — no manual percent-encoding needed.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL is not defined` | `.env.local` missing from repo root |
| Port 3000 busy | `kill $(lsof -ti:3000)` then retry |
| `404 /api/...` right after install | Use `npm run dev`, not `npm start` (no build yet) |
| Gold prices `null` / `_stale:true` | Expected off-Iran IP; Supabase cache serves values |
| Screenshot blank | Increase `--wait-for-timeout` — client fetches not settled |
