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

## Pending / Future
- Connect bourssanj.ir domain (DNS propagating via Cloudflare)
- Abnormal money flow alerts (need 5-7 days of data)
- Improved signals (reason + confidence)
- Design System unification
- Portfolio tracking (future)
- Telegram bot integration (future)
