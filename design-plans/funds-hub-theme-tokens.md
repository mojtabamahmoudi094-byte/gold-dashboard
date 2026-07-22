# Funds hub and bourse pages adopt the shared theme tokens

Written against: f82ba993cc275dd0affcda4272532ec22a41f6df

## Evidence chain

- Surface: `/funds` (`app/funds/page.tsx`) and `/funds/bourse` (`app/funds/bourse/page.tsx`)
- Problem: Both pages hardcode a private palette — dark `bg #060B14`, `panel rgba(10,18,30,0.88)`, `text #E8F4FF`; light `bg #F4F7FB` (cool blue-white), `text #0F1E2E`, `muted #6B7F90` (`app/funds/page.tsx:105-108`, `app/funds/bourse/page.tsx:70-73`). Every sibling in the same task flow — `/funds/[cat]` (`app/funds/[cat]/page.tsx:38`), `/funds/radar` (`app/funds/radar/page.tsx:39`), `/fund/[slug]` (`app/fund/[slug]/FundPageClient.tsx:131`) — resolves `darkTheme`/`lightTheme` from `lib/theme.ts` (dark `bg #080a10`, light `bg #F8F5EE` warm cream). Navigating hub → category visibly shifts the page background and text colors. On `/funds` itself, the logged-out `AuthGate` screen (`components/AuthGate.tsx:43-63`) renders with theme tokens, then the page swaps to the private palette after login — a contradiction on a single route.
- Design evidence: `lib/theme.ts` is the token owner consumed by every other surface in the funds family and by `AuthGate`.
- Owner: `lib/theme.ts` (`darkTheme`, `lightTheme`)
- Scope and affected surfaces: `app/funds/page.tsx`, `app/funds/bourse/page.tsx`
- Uncertainty: none

## Design decision

Replace the private palette constants in the two pages with the resolved theme object (`const t = isDark ? darkTheme : lightTheme`), so the whole funds family renders from one token set and background/text no longer shift during navigation or after login.

## Reuse

- `darkTheme` / `lightTheme` / `shouldUseDark` from `lib/theme.ts` (both files already import `shouldUseDark`)
- Exemplar: `app/funds/[cat]/page.tsx` — lines 7, 38-39 show the exact import, `t` resolution, and the `cream` accent pattern (`isDark ? '#ddd5bd' : '#6B5A3A'`)

No new primitive required.

## Changes

1. `app/funds/page.tsx`
   - Change: extend the import at line 7 to `import { darkTheme, lightTheme, shouldUseDark } from '../../lib/theme'`. Replace the four constants at lines 105-108 with `const t = isDark ? darkTheme : lightTheme`, then map usages: `bg` → `t.bg`, `panel` → `t.panel`, `text` → `t.text`, `muted` → `t.muted` — **except** the dark-mode muted value: this page used `#ddd5bd` (the cream body-text convention from AGENTS.md) for dark muted; keep that by using the exemplar pattern `const cream = isDark ? '#ddd5bd' : '#6B5A3A'` and substituting `cream` wherever the old `muted` colored Persian body text (card descriptions at lines 120-122, 164, 215, 265).
   - Preserve: the category card accent colors (`oklch(...)` per category), card layout, hover behavior, `NlFundFilter`, `AuthGate` wrapper.
   - Verify: in dark mode `/funds` background is `#080a10`; in light mode it is `#F8F5EE`; the background no longer changes between the AuthGate gate screen and the logged-in page.
2. `app/funds/bourse/page.tsx`
   - Change: same substitution — extend the theme import, replace the constants at lines 70-73 with `const t = isDark ? darkTheme : lightTheme` plus `const cream = isDark ? '#ddd5bd' : '#6B5A3A'`, and map `bg`/`panel`/`text`/`muted` usages to `t.bg`/`t.panel`/`t.text`/`cream` (dark muted was already `#ddd5bd` here). Any additional hardcoded `#060B14`/`#F4F7FB` occurrences in the file get the same mapping.
   - Preserve: fund-type card accents, layout, back-link behavior.
   - Verify: `/funds/bourse` matches `/funds/[cat]` backgrounds in both modes.

## Scope

- Inherit: `/funds`, `/funds/bourse`
- Verify: `/funds/[cat]`, `/funds/radar`, `/fund/[slug]` (must be untouched); `AuthGate` gate screens on the two changed routes
- Exclude: other route families that hardcode `#060B14` (stocks, technical, vip, analysis, auth, futures, market-map, trade-value) — separate surfaces, out of this plan's scope; `lib/theme.ts` itself is not edited

## Validation

- Product: a user browsing hub → category → fund detail sees one continuous background and text palette in both dark and light modes.
- Interface: `/funds` and `/funds/bourse` in dark and light themes, logged-out (AuthGate gate) and logged-in states, mobile and desktop widths.
- System: no remaining private palette constants in the two files; no new token or duplicated theme object introduced.
- Repository: `grep -n "060B14\|F4F7FB\|E8F4FF\|0F1E2E\|6B7F90\|rgba(10,18,30" app/funds/page.tsx app/funds/bourse/page.tsx` → no matches.

## Stop conditions

- Stop if either page turns out to render outside `AuthGate`/root layout (different runtime path), or if mapping `muted` → `cream` would recolor non-text elements (borders, icons) — in that case map only text usages and report.

## Design documentation

- After acceptance and validation: update the stale theme note in `app/fund/[slug]/CLAUDE.md` ("Theme: Dark (#060B14) / Light (#F4F7FB)") to reference `lib/theme.ts` tokens (`#080a10` / `#F8F5EE`) as the single source.
