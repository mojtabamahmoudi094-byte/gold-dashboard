# Bourssanj (بورسنج) - Project Guide

## Overview
Persian-language gold/silver/saffron fund market intelligence platform.
URL: bourssanj.ir | bourssanj.onrender.com
Telegram: t.me/shagerdebazar (شاگرد تنبل بازار)

## Tech Stack
- **Frontend**: Next.js 16.2.9 (App Router, Turbopack), TypeScript
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Charts**: lightweight-charts v5 (home page), CSS custom charts (funds page)
- **Deployment**: Render.com (auto-deploy on git push)
- **Font**: Vazirmatn (Persian), RTL layout
- **Theme**: Dark (#060B14) / Light (#F4F7FB), synced via localStorage + 'themechange' event

## File Structure
```
app/
├── page.tsx              → redirect to /dashboard
├── layout.tsx            → root layout (Header + Footer)
├── globals.css
├── components/
│   ├── Header.tsx        → global nav (hamburger on mobile), theme toggle
│   └── Footer.tsx        → global footer with links
├── dashboard/
│   ├── page.tsx          → HOME: historical trade value chart (371 manual records, slug='gold')
│   ├── TerminalChart.tsx → lightweight-charts component
│   └── import/           → Excel/CSV import logic
├── funds/
│   └── page.tsx          → WATCHLIST: all 41 funds, heatmap, money flow, per capita, AI analysis, scoring
├── fund/
│   └── [slug]/
│       └── page.tsx      → FUND DETAIL: per-fund metrics, daily money flow, per capita, history
├── compare/
│   └── page.tsx          → COMPARE: side-by-side fund comparison
├── signals/
│   └── page.tsx          → SIGNAL HISTORY
└── admin/
    └── page.tsx          → HIDDEN login (no link anywhere, only user knows URL)
lib/
└── supabase.ts           → Supabase client
```

## Database Schema (Supabase)
### Table: assets
- id, created_at, slug (unique), name, category ('طلا'/'نقره'/'زعفران'), unit
- Old 'gold' asset (slug='gold') = aggregated historical data, hidden from fund lists
- 41 API assets with ISIN as slug (e.g., IRTKMOFD0001), symbol as name (e.g., عیار)
- Silver funds: نقرابی, سیمین, سیلور, نقران, نقرین, نقرفام, نقرسا
- Saffron funds: سافرون, نهال, دفینه

### Table: gold_funds
- id, created_at, trade_date_shamsi, trade_value, asset_id (FK→assets)
- price_close, price_last, price_change_pct, market_value, volume
- buy_count_i, sell_count_i, buy_i_volume, sell_i_volume
- RLS: public SELECT, authenticated INSERT/UPDATE/DELETE

### Table: signals
- id, created_at, signal_date_shamsi, signal_type, market_value, note

## API Integration
- Source: BrsApi.ir (IME Fund endpoint)
- Script: ~/Desktop/gold-fetcher/fetch.js (LOCAL only, not in repo - contains API keys)
- Runs manually: `cd ~/Desktop/gold-fetcher && node fetch.js` (after 5pm on working days Sat-Wed)
- Filters junk funds, auto-categorizes (gold/silver/saffron), converts rial→billion toman
- Calculates total gold trade value → saves to old 'gold' asset for home chart

## Key Features
- Category tabs (🥇 طلا, 🥈 نقره, 🌿 زعفران)
- Heatmap (log-scale sizing, color by price change)
- Money flow chart (vertical bars, green=inflow, red=outflow)
- Per capita buy/sell chart (in million toman)
- AI market analysis (rule-based, auto-generated Persian summary)
- Smart scoring (0-100 per fund: price change 20% + money flow 25% + buyer power 20% + trade value 15% + buyer ratio 20%)
- Fund comparison page (11 metrics side-by-side + visual bars + AI summary)
- Custom glassmorphism tooltips on intel cards and anomaly labels
- Responsive mobile (hamburger menu, 2-col cards, horizontal scroll tables)

## Important Rules
- **fund/[slug]/page.tsx** MUST use `'../../../lib/supabase'` (THREE dots!)
- Admin page (/admin) is hidden — NO link from anywhere
- Theme: Header sets localStorage('theme') + dispatches 'themechange'; pages listen
- Old 'gold' asset hidden from dropdowns with `.neq('slug', 'gold')`
- Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (set in Render)
- User works solo, pastes code manually into VS Code
- Persian/English on SEPARATE lines in instructions, never mixed

## Env Variables (Render)
- NEXT_PUBLIC_SUPABASE_URL=https://jtrusonoqkolckhidgch.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_6_H9XGHkJU3EKKCG9LkVJw_1PSS00zo

## ⚠️ CRITICAL: Unit System (READ THIS FIRST)

**م.ت = میلیارد تومان** (NOT میلیون تومان — a common mistake)
**ه.م.ت = هزار میلیارد تومان**

### DB has TWO eras of data (backward-compat required):

| Field | Old data (< ~1404) | New data (>= ~1404) | Detection |
|---|---|---|---|
| `price_close` | Toman (e.g. 4580) | Rial (e.g. 45800) | `>= 100_000` = Rial |
| `price_last` | Toman | Rial | same threshold |
| `trade_value` | میلیارد تومان (e.g. 25.8) | Raw Rial (e.g. 258,520,000,000) | `> 1e6` = Rial |
| `market_value` | always Raw Rial | always Raw Rial | always divide |
| `volume` | always سهم count | always سهم count | divide by 1e6 for display |

### Correct conversions for display:
```
price_close (Rial)  → Toman: Math.round(v / 10)
trade_value (Rial)  → م.ت: Math.round(tv / 1e9)        ← NOT /1e10 (that's for aggregate)
market_value (Rial) → ه.م.ت: Math.round(mv / 1e12)
volume              → م.سهم: vol / 1e6
سرانه (Rial era)   → م.ت: vol × price / count / 1e7    ← 3 digits result
جریان پول (Rial era)→ م.ت: (buyVol-sellVol)×price/1e10
```

### Aggregate (dashboard, slug='gold') conversions:
```
sync-funds.js cron: totalTval (raw Rial from BrsAPI) → ÷1e10 = میلیارد تومان stored in DB
funds/page.tsx display: stored_value / 1e10 (was wrong ×100 before — fixed commit f294ebc)
dashboard/page.tsx: reads stored value directly (already in میلیارد تومان)
```

### Detection pattern used in fund/[slug]/page.tsx:
```tsx
const priceIsRial = safe(record.price_close) >= 100_000
const priceToman = (v: number) => priceIsRial ? Math.round(v / 10) : v
const avgDivisor = priceIsRial ? 1e7 : 1e6   // سرانه
const flowDivisor = priceIsRial ? 1e10 : 1e9  // جریان پول
```

## VPS Cron (sync-funds.js)

- Location on VPS: copy from `scripts/sync-funds.js` in repo
- Runs every 10 min, 12:00–17:05 Tehran time (UTC+3:30), Sun–Thu
- Writes per-fund rows + one aggregate row (asset_id=1, slug='gold') to `gold_funds`
- Aggregate formula: `Math.round(totalTval / 1e10 * 100) / 100` → میلیارد تومان
- **If VPS has old sync-funds.js**: aggregate will be stored wrong (too large). Fix: copy new file to VPS.

## Supabase RLS Note

- Anon key: SELECT only. Cannot DELETE or INSERT without service role key.
- To fix bad DB records: use Supabase SQL Editor (dashboard) with service role.
- Pending SQL (run if not done yet):
  ```sql
  -- Fix wrong aggregate for 1405/04/09 (stored 7.27T instead of 7272)
  DELETE FROM gold_funds WHERE id = 1213;
  INSERT INTO gold_funds (asset_id, trade_date_shamsi, trade_value) VALUES (1, '1405/04/09', 7272.49);
  -- Delete zero-value test records with wrong date
  DELETE FROM gold_funds WHERE trade_date_shamsi = '3005/04/09';
  ```

## Recent Fixes (session 2025-07)

- `app/funds/page.tsx`: `fmtVal(f.tradeValue / 1e10)` — was `* 100` (commit f294ebc)
- `scripts/sync-funds.js`: aggregate formula `totalTval / 1e10` — was `/ 10 * 100` (same commit)
- `app/fund/[slug]/page.tsx`: full unit overhaul with isRial threshold (commit 5426795)
  - price ÷10, trade_value /1e9, market_value /1e12, volume /1e6, سرانه 3 digits, all charts

## Pending / Future
- Connect bourssanj.ir domain (DNS propagating via Cloudflare)
- Abnormal money flow alerts (need 5-7 days of data)
- Improved signals (reason + confidence + historical outcome tracking)
- Design System unification
- Portfolio tracking (future)
- Telegram bot integration (future)
- نمودار قیمت در صفحه صندوق (A1 — lightweight-charts, داده موجوده)
- جستجو + sort پیشرفته صفحه صندوق‌ها (A2 — client-side filter)
- عملکرد تاریخی سیگنال‌ها (A3 — cross با gold_funds)
