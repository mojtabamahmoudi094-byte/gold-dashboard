# Footer follows the active theme like the rest of the site shell

Written against: c1926a0103f6bcfec628605621da077e2a7aee24

## Evidence chain

- Surface: global `<Footer />` (`app/components/Footer.tsx`, mounted on every route via `app/layout.tsx:91`)
- Problem: Footer is the only shell component with no theme awareness. It hardcodes dark-theme literals — link color `#a9b0c2` (= `darkTheme.muted`), headings/brand `#eef1f8` (= `darkTheme.text`), borders `rgba(255,255,255,0.07/0.09)` (= `darkTheme.border`), hover `#fff`, icon chip `rgba(255,255,255,0.05)` (`app/components/Footer.tsx:5-9`, `:28-29`, `:51`, `:60`, `:64`, `:74`, `:78`, `:88`, `:103`, `:119`). Its background is `rgba(255,255,255,0.015)` over the always-dark body (`app/globals.css:83`, `--bg: #080a10`), so in light mode the page content switches to warm cream while the footer remains a dark band. Sibling shell components branch on theme: Header (`app/components/Header.tsx:182`, `:217-223`) and Breadcrumb (`app/components/Breadcrumb.tsx:23-28`, `:38-40`) both react to `themechange`.
- Design evidence: `lib/theme.ts` token owner (`lightTheme.text #1A1205`, `muted #6B5A3A`, `border rgba(184,134,11,0.14)`, `bg #F8F5EE`); the `themechange` listener pattern in `Breadcrumb.tsx:23-28`; no documented exception declares the footer theme-invariant
- Owner: `app/components/Footer.tsx`
- Scope and affected surfaces: `app/components/Footer.tsx` only
- Uncertainty: whether a permanently-dark footer was a deliberate choice is undocumented; the Header/Breadcrumb behavior is the only recorded precedent, so this plan follows it. If the user states the dark footer is intentional, drop this plan.

## Design decision

Make Footer theme-aware with the exact pattern Breadcrumb uses (`shouldUseDark()` + `themechange` listener) and map its hardcoded dark literals to resolved theme tokens, so the shell presents one theme end to end.

## Reuse

- `darkTheme` / `lightTheme` / `shouldUseDark` from `lib/theme.ts`
- Exemplar: `app/components/Breadcrumb.tsx:19-40` (state, listener, and resolved color pattern)

No new primitive required.

## Changes

1. `app/components/Footer.tsx`
   - Change: add the Breadcrumb-style theme state:
     - `const [isDark, setIsDark] = useState(true)` + `useEffect` with `shouldUseDark()` initial and `themechange` listener (copy `Breadcrumb.tsx:23-28`).
     - Resolve `const t = isDark ? darkTheme : lightTheme` and replace the module constants (lines 5-9): `LINK_C` → `t.muted`, `ICON_C` → `t.muted`, `MUTED` → `t.muted`, `BORDER` → `t.border`, `ICON_BG` → `isDark ? 'rgba(255,255,255,0.05)' : 'rgba(184,134,11,0.06)'`. Move them inside the component (they depend on state now).
     - Headings/brand title `#eef1f8` (lines 51, 60, 74, 88, 103) → `t.text`.
     - Footer wrapper (lines 27-29): `borderTop` → `1px solid ${t.border}`; background → `isDark ? 'rgba(255,255,255,0.015)' : 'transparent'`; add `background: t.bg`-safe fallback only if the light page behind is not guaranteed — prefer `background: isDark ? 'rgba(255,255,255,0.015)' : t.bg` so the footer never sits on the dark body in light mode.
     - Link hover `#fff` (lines 64, 78) → `isDark ? '#fff' : t.textBright`.
     - Bottom bar border (line 119) → `t.border`.
   - Preserve: layout/grid, link lists, Telegram icon and its hover tint, the enamad trust seal block, the disclaimer copy (AGENTS.md non-advice requirement), `direction: rtl`, `animate-fade-in`.
   - Verify: dark mode is visually identical to before; light mode footer renders cream background `#F8F5EE` with `#1A1205` headings and `#6B5A3A` links.

## Scope

- Inherit: every route (footer is global)
- Verify: pages whose own light background differs from `t.bg` (the funds hub before its token plan executes) — the footer should still read as continuous, since it paints its own `t.bg` in light mode
- Exclude: `body` background in `globals.css` (changing `--bg` per theme is a site-wide change outside this finding); footer copy (the «دیدبان» spelling on line 13 is owned by `design-plans/didehban-spelling-unification.md`)

## Validation

- Product: toggling the header theme switch flips the footer together with header, breadcrumb, and page content — no dark island in light mode.
- Interface: footer on `/`, `/funds`, `/stocks`, `/about` in dark and light themes; theme toggle live-switches the footer without reload; mobile and desktop widths.
- System: uses `lib/theme.ts` tokens and the existing `themechange` event — no second theme mechanism, no new tokens.
- Repository: `grep -n "#a9b0c2\|#eef1f8\|#8b93a7" app/components/Footer.tsx` → no matches.

## Stop conditions

- Stop if the user confirms the dark footer is a deliberate brand decision — record it as an explicit exception instead of changing it.
- Stop if adding `'use client'` state breaks any server-rendering assumption (the file is already `'use client'`, so this is not expected).

## Design documentation

- After acceptance and validation: record in AGENTS.md (review checklist) that all shell components (Header, Breadcrumb, Footer) must branch on theme via `themechange` + `lib/theme.ts` tokens.
