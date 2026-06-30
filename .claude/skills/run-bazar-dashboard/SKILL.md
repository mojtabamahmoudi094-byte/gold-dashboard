---
name: run-bazar-dashboard
description: "Run, start, launch, build, test, screenshot, smoke-test the bazar-dashboard Next.js app. Covers dev server, all page routes, and API endpoints."
---

Next.js 16 app (Turbopack). Driven with `curl` for API + HTML checks. No browser needed for smoke testing — all pages are SSR/ISR. Dev server starts in ~320ms.

## Prerequisites

Node.js ≥20, npm. `.env.local` must exist with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BRSAPI_KEY`.

## Build

```bash
cd /Users/mojtabamahmoudi/shagerd-bazar-dashboard
npm install
npm run build   # optional — dev server doesn't need it
```

## Run (agent path)

### Start dev server

```bash
npm run dev &>/tmp/nextdev.log &
# Wait for "Ready" signal (~5s)
sleep 6 && grep -q "Ready" /tmp/nextdev.log && echo "UP" || cat /tmp/nextdev.log
```

### Smoke test — all routes

```bash
for path in / /funds /dashboard /signals /compare /analysis/gold /api/funds /api/gold-analysis; do
  code=$(/usr/bin/curl -s -o /dev/null -w "%{http_code}" http://localhost:3000$path)
  echo "$code $path"
done
```

Expected:
```
307 /           (redirects to /funds)
200 /funds
200 /dashboard
200 /signals
200 /compare
200 /analysis/gold
200 /api/funds
200 /api/gold-analysis
```

### Test specific API response

```bash
# Funds: returns array of assets with trade data
/usr/bin/curl -s http://localhost:3000/api/funds | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys()))"

# Gold analysis: returns live prices (stale=true on non-Iranian IP)
/usr/bin/curl -s http://localhost:3000/api/gold-analysis | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['inputs'])"
```

### Stop server

```bash
kill $(lsof -ti:3000) 2>/dev/null
```

## Run (human path)

```bash
npm run dev
# Opens http://localhost:3000 → redirects to /funds
# Ctrl-C to stop
```

## Key pages

| Route | Purpose |
|---|---|
| `/funds` | صندوق‌های طلا — gold fund list, trade value, ranking |
| `/dashboard` | تابلو — aggregate gold trade value chart (میلیارد تومان) |
| `/signals` | سیگنال‌های خرید/فروش |
| `/compare` | مقایسه صندوق‌ها |
| `/analysis/gold` | تحلیل طلا — live gold/coin prices + bubble calc |
| `/fund/[slug]` | جزئیات صندوق — 30-day price history |

## Key APIs

| Endpoint | Source | Note |
|---|---|---|
| `/api/funds` | Supabase `gold_funds` | trade_value in میلیارد ریال from VPS |
| `/api/gold-analysis` | BrsAPI (Iranian IP) + Supabase fallback | `_stale:true` on non-Iranian IP — uses cached Supabase data |

## Gotchas

- **`_stale: true` in gold-analysis**: Normal on non-Iranian IP (Render/local). BrsAPI requires Iranian IP. API falls back to Supabase cache (`signals` table, `signal_type='_gold_cache'`). Not an error.
- **`/` → 307**: Root redirects to `/funds`. Expected.
- **`trade_value` unit**: Stored as میلیارد ریال from BrsAPI `tval`. Display layer multiplies ×100 for م.ت (million Toman). Dashboard layer divides ÷10 for میلیارد تومان. Do not double-convert.
- **VPS cron at 17:10 Tehran**: Writes per-fund ISIN rows + aggregate gold asset row to `gold_funds`. Dashboard won't update until cron runs.
- **No `/api/signals` or `/api/compare`**: Signals and compare pages fetch Supabase directly from client — no API route.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Error: NEXT_PUBLIC_SUPABASE_URL is not defined` | `.env.local` missing or not in project root |
| `Ready in Xms` but port 3000 busy | `kill $(lsof -ti:3000)` then retry |
| `404 /api/funds` after `npm install` | Run `npm run dev` not `npm start` (no build yet) |
| Gold prices all `null` | Expected — BrsAPI blocked on local IP, Supabase cache empty |
