# Global breadcrumb shows Persian labels for routes outside the NAV map

Written against: c1926a0103f6bcfec628605621da077e2a7aee24

## Evidence chain

- Surface: global `<Breadcrumb />` (`app/components/Breadcrumb.tsx`, mounted on every non-home route via `app/layout.tsx:89`)
- Problem: `LABELS` is built only from `NAV` hrefs (`app/components/Breadcrumb.tsx:9-13`); any path segment not present falls back to `decodeURIComponent(segment)` (`:15-17`), rendering a raw English slug inside an otherwise-Persian trail. Concrete occurrences: `/vip/filters` → «خانه ‹ vip ‹ فیلترهای VIP»; `/stock/فولاد` → «خانه ‹ stock ‹ فولاد»; `/fund/<slug>` → «… ‹ fund ‹ <slug>»; `/track-record` → «track-record»; `/valuation/screener` → «… ‹ screener»; `/technical/backtest` → «… ‹ backtest»; `/about`, `/contact`, `/terms`, `/privacy` → raw English slugs. Direct language contradiction within a single nav element.
- Design evidence: sibling crumbs in the same trail use Persian NAV labels; each affected route already declares a canonical Persian title in its own layout metadata (e.g. `app/track-record/layout.tsx:4` «سابقه عملکرد سیگنال‌ها»)
- Owner: `app/components/Breadcrumb.tsx` (`LABELS`)
- Scope and affected surfaces: `app/components/Breadcrumb.tsx` only
- Uncertainty: none for the routes listed in Changes; routes without a canonical Persian title are excluded rather than guessed

## Design decision

Extend the `LABELS` map in the global breadcrumb owner with static Persian labels for the unmapped path prefixes, sourcing each label from the route's own layout `metadata.title` or, for link-only family prefixes, the NAV family label. One owner, no per-page breadcrumbs.

Note: `design-plans/funds-cat-single-breadcrumb.md` already extends `LABELS` for `/funds/gold|silver|…` and removes the page-local breadcrumb on `/funds/[cat]`. This plan is the same mechanism for the rest of the site; if both are executed, merge the additions into one `EXTRA_LABELS` block — do not create two competing structures.

## Reuse

- Existing `LABELS` record and `labelFor` fallback (`app/components/Breadcrumb.tsx:9-17`)
- Label sources: route layout `metadata.title` values and `NAV` labels (`app/components/Header.tsx:24-57`)
- Exemplar: the `LABELS[item.href] = item.label` population loop (`Breadcrumb.tsx:10-13`)

No new primitive required.

## Changes

1. `app/components/Breadcrumb.tsx`
   - Change: after the `NAV` loop (line 13), merge a static map of Persian labels:
     - `'/track-record': 'سابقه عملکرد سیگنال‌ها'` (from `app/track-record/layout.tsx:4`)
     - `'/valuation/screener': 'اسکرینر ارزش‌گذاری'` (from `app/valuation/screener/layout.tsx:4`)
     - `'/technical/backtest': 'بک‌تست استراتژی تکنیکال'` (from `app/technical/backtest/layout.tsx:4`)
     - `'/technical/screener': 'اسکرینر تکنیکال'` (from `app/technical/screener/layout.tsx:4` — NAV already maps this href to «دیده‌بان تکنیکال»; keep the NAV label, do not override; include only if NAV entry is ever removed)
     - `'/about': 'درباره ما'`, `'/contact': 'تماس با ما'`, `'/terms': 'قوانین و شرایط استفاده'`, `'/privacy': 'حریم خصوصی'` (each from its page's title)
     - Family prefixes that have no page of their own but appear as intermediate crumbs: `'/vip': 'فیلترها'` (NAV family label, `Header.tsx:49`), `'/stock': 'سهام'` (NAV label of the stocks family, `Header.tsx:26`), `'/fund': 'صندوق‌ها'` (NAV label of the funds family, `Header.tsx:27`)
   - Preserve: the `NAV`-derived labels (NAV wins on conflict — insert the static map before the loop or guard with `??`), the `decodeURIComponent` fallback (correct for dynamic Persian symbol segments like `/stock/فولاد`), all styling and theme branching.
   - Verify: `/vip/filters` renders «خانه ‹ فیلترها ‹ فیلترهای VIP»; `/track-record` renders «خانه ‹ سابقه عملکرد سیگنال‌ها»; `/stock/فولاد` renders «خانه ‹ سهام ‹ فولاد»; `/about` renders «خانه ‹ درباره ما».

## Scope

- Inherit: every route using the global breadcrumb
- Verify: `/funds/[cat]` interplay with `design-plans/funds-cat-single-breadcrumb.md` (merge, don't duplicate); intermediate crumbs `/vip`, `/stock`, `/fund` still link to routes that may 404 — link behavior is out of this plan's scope (functional, pre-existing)
- Exclude: `/fundamentals` and `/auth` prefixes (no canonical Persian title exists in the repo — adding one would invent copy; leave fallback until product names them); numeric dynamic segments like `/stocks/[id]` (no static label possible in this owner); admin routes

## Validation

- Product: a user on any listed route sees an all-Persian breadcrumb trail.
- Interface: `/vip/*` (all five), `/track-record`, `/valuation/screener`, `/technical/backtest`, `/about`, `/contact`, `/terms`, `/privacy`, `/stock/<symbol>`, `/fund/<slug>`, in dark and light themes, desktop and mobile.
- System: exactly one label map in one owner; no page-local breadcrumb added anywhere.
- Repository: `grep -c "track-record\|'/vip'\|'/stock'\|'/fund'" app/components/Breadcrumb.tsx` → ≥ 4 matches; no new breadcrumb components under `app/`.

## Stop conditions

- Stop if a route's layout title changes meaning (title ≠ suitable crumb label) — report the specific route instead of shortening copy unilaterally.
- Stop if the funds plan has already restructured `LABELS` into a different shape — reconcile into that shape instead.

## Design documentation

- After acceptance and validation: none.
