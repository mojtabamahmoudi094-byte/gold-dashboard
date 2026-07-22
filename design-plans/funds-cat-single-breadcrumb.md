# Single breadcrumb on /funds/[cat] via the global Breadcrumb owner

Written against: f82ba993cc275dd0affcda4272532ec22a41f6df

## Evidence chain

- Surface: `/funds/[cat]` (e.g. `/funds/gold`), rendered logged-in
- Problem: Two breadcrumbs stack on the same viewport. The root layout renders the global `<Breadcrumb />` on every non-home route (`app/layout.tsx:89`), producing «خانه ‹ صندوق‌ها ‹ gold» — the final crumb is the raw English slug because `LABELS` in `app/components/Breadcrumb.tsx:9-13` is built only from `NAV` hrefs and has no entry for `/funds/gold|silver|saffron|leveraged|sector|equity|fixed-income`, so `labelFor` falls back to `decodeURIComponent(segment)` (line 15-17). Directly below it, the page draws its own inline breadcrumb (`app/funds/[cat]/page.tsx:196-203`) with a different separator («/» vs «‹») and hardcoded gold link color `#d9b45b` (the dark-theme brand literal, unchanged in light mode where `lightTheme.brand` is `#b8860b`).
- Design evidence: `app/components/Breadcrumb.tsx` is the site-wide breadcrumb owner, mounted once in `app/layout.tsx`; no documented exception allows a second breadcrumb.
- Owner: `app/components/Breadcrumb.tsx`
- Scope and affected surfaces: `app/funds/[cat]/page.tsx`, `app/components/Breadcrumb.tsx`
- Uncertainty: none

## Design decision

Remove the page-local breadcrumb and teach the global owner the Persian labels for funds category paths, so the route shows exactly one breadcrumb with correct Persian labels and theme-correct colors.

## Reuse

- Global `Breadcrumb` component and its `LABELS` map
- Persian category labels already defined in `CAT_MAP` (`app/funds/[cat]/page.tsx:13-21`): gold→طلا, silver→نقره, saffron→زعفران, leveraged→اهرمی, sector→بخشی, equity→سهامی, fixed-income→درآمد ثابت
- Exemplar: existing `LABELS` population loop in `app/components/Breadcrumb.tsx:9-13`

No new primitive required.

## Changes

1. `app/components/Breadcrumb.tsx`
   - Change: after the NAV-derived loop (line 13), merge a static map of funds category paths: `/funds/gold` → «طلا», `/funds/silver` → «نقره», `/funds/saffron` → «زعفران», `/funds/leveraged` → «اهرمی», `/funds/sector` → «بخشی», `/funds/equity` → «سهامی», `/funds/fixed-income` → «درآمد ثابت», `/funds/bourse` → «صندوق‌های بورسی», `/funds/radar` → «رادار پول هوشمند» (radar already labeled via NAV — keep whichever exists, do not duplicate).
   - Preserve: NAV-derived labels, `decodeURIComponent` fallback for dynamic symbol/slug segments, existing colors and separator.
   - Verify: on `/funds/gold` the global breadcrumb reads «خانه ‹ صندوق‌ها ‹ طلا».
2. `app/funds/[cat]/page.tsx`
   - Change: delete the inline breadcrumb block, lines 196-203 (`{/* Breadcrumb */}` `<div>` … `</div>`), including its hardcoded `#d9b45b` links.
   - Preserve: the toolbar heading («دیدبان صندوق‌های …» + date/count), all sections below.
   - Verify: exactly one breadcrumb visible on the page; page spacing below the global breadcrumb remains sane (the parent flex column already has `gap: 16`).

## Scope

- Inherit: `/funds/[cat]` for all seven category slugs; every route benefits from the added labels (`/funds/bourse` last crumb becomes Persian too)
- Verify: `/funds/bourse`, `/funds/radar`, `/fund/[slug]` — global breadcrumb labels there must not regress (fund detail final crumb remains the fund slug fallback; unchanged behavior, out of scope)
- Exclude: restyling the global Breadcrumb; adding labels for non-funds dynamic routes

## Validation

- Product: user on a category page sees one breadcrumb, fully Persian, and can navigate to «صندوق‌ها» and «خانه».
- Interface: `/funds/gold`, `/funds/fixed-income`, `/funds/bourse` in dark and light themes, mobile and desktop.
- System: no other page in the funds family hand-rolls a breadcrumb (verified at audit time: only `[cat]` did).
- Repository: `grep -n "خانه" "app/funds/[cat]/page.tsx"` → no matches; `grep -n "funds/gold" app/components/Breadcrumb.tsx` → one label entry.

## Stop conditions

- Stop if the global Breadcrumb turns out to be hidden on `/funds/[cat]` in some state (it is not — it returns null only on `/`), or if removing the inline block also removes non-breadcrumb content.

## Design documentation

- After acceptance and validation: none.
