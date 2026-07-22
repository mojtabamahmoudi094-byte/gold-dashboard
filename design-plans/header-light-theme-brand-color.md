# Header and GlobalSearch gold foreground accents follow the active theme's brand token

Written against: c1926a0103f6bcfec628605621da077e2a7aee24

## Evidence chain

- Surface: site shell header on every route (`app/components/Header.tsx`, mounted in `app/layout.tsx:88`) and its child `GlobalSearch` (`app/components/Header.tsx:471`, `:561`)
- Problem: Foreground gold accents are hardcoded to the dark-theme brand literal `#d9b45b` in both themes: active nav link (`app/components/Header.tsx:273`), desktop hover handlers (`:357`, `:410`, `:488`), indices-dropdown trigger active color (`:439`), mobile hamburger open color (`:584`), mobile active nav (`:618`), mobile submenu active (`:636`), the «شاخص‌های بازار» dropdown heading (`:655`), and GlobalSearch's open-state trigger color (`app/components/GlobalSearch.tsx:153`). In light mode the header background is cream `rgba(252,249,242,0.97)` (`:217`) and `lightTheme.brand` is `#b8860b` (`lib/theme.ts:35`). The same component already branches this exact hue for light mode at `app/components/Header.tsx:333` (`isDark ? 'rgba(217,180,91,0.5)' : 'rgba(184,134,11,0.6)'`) — a direct internal contradiction.
- Design evidence: `lib/theme.ts` (`darkTheme.brand: '#d9b45b'`, `lightTheme.brand: '#b8860b'`); the in-file exemplar branch at `Header.tsx:333`
- Owner: `app/components/Header.tsx` (which passes `isDark` to `GlobalSearch` as a prop)
- Scope and affected surfaces: `app/components/Header.tsx`, `app/components/GlobalSearch.tsx`
- Uncertainty: none for the listed foreground colors; translucent gold tints and gradients are deliberately excluded (see Exclude)

## Design decision

Branch every gold **foreground text color** in the header shell on the active theme: `#d9b45b` in dark, `#b8860b` in light, matching `lib/theme.ts` brand tokens and the existing branch at line 333. This fixes low-contrast gold-on-cream active/hover states in light mode without touching brand identity marks.

## Reuse

- `darkTheme.brand` / `lightTheme.brand` values from `lib/theme.ts` (`#d9b45b` / `#b8860b`)
- Exemplar: `app/components/Header.tsx:333` (the `isDark ? … : …` gold branch)
- `GlobalSearch` already receives `isDark` as a prop — no new wiring needed

No new primitive required. Optional tidy: define one local `const BRAND = isDark ? '#d9b45b' : '#b8860b'` near the existing `TEXT_NAV` constant (`Header.tsx:222`) and reuse it, mirroring how `TEXT_NAV` is defined.

## Changes

1. `app/components/Header.tsx`
   - Change: define `const BRAND = isDark ? '#d9b45b' : '#b8860b'` next to `TEXT_NAV` (line 222). Replace the literal `'#d9b45b'` with `BRAND` at lines 273, 357, 410, 439, 488, 584, 618, 636, 655. For the hover handlers (357, 410, 488) the surrounding `onMouseEnter`/`onMouseLeave` closures already capture component scope, so `BRAND` is directly usable.
   - Preserve: the brand wordmark gradients (`:322`, `:536`, `:677`), the top accent stripe (`:299`), all translucent `rgba(217,180,91,…)` background/border tints (lines 218, 241, 276, 280, 358, 395, 409, 438, 454, 467, 487, 489, 507, 508, 541, 544, 548, 582, 583, 620, 622, 638), and all existing `isDark` branches.
   - Verify: in light mode the active nav link, hovered nav links, open dropdown trigger, mobile active items, and the dropdown heading render `#b8860b`; dark mode is pixel-identical to before.
2. `app/components/GlobalSearch.tsx`
   - Change: at line 153 replace `color: open ? '#d9b45b' : muted` with `color: open ? (isDark ? '#d9b45b' : '#b8860b') : muted` (the `isDark` prop is already in scope).
   - Preserve: the open-state tint background/border at lines 151-152 and all other styling.
   - Verify: open search trigger text/icon is `#b8860b` in light mode, `#d9b45b` in dark.

## Scope

- Inherit: every route (header is global), both desktop and mobile nav, the indices dropdown, the search trigger
- Verify: `GlobalSearch` compact variant (`Header.tsx:561`) renders the same corrected color; no other component imports these literals from Header
- Exclude: translucent gold tints (10-20% opacity backgrounds/borders — the light branch uses them deliberately, e.g. `Header.tsx:467`, `:508`); brand gradients and the accent stripe (brand identity, theme-invariant like a logo); gold literals in other route files (separate surfaces — `app/funds` family already has its own plan)

## Validation

- Product: a light-theme user sees readable dark-gold (`#b8860b`) active/hover states in the header instead of pale gold on cream.
- Interface: desktop nav (active + hover), dropdown menus, indices dropdown, mobile hamburger menu (open state, active item, submenu), GlobalSearch trigger (open/closed) — each in dark and light themes.
- System: dark-mode rendering unchanged; one `BRAND` constant, no duplicated ternaries beyond the GlobalSearch prop use.
- Repository: `grep -n "'#d9b45b'" app/components/Header.tsx app/components/GlobalSearch.tsx` → matches only inside `isDark ?` branches, gradients (lines with `linear-gradient`), or the `BRAND` definition.

## Stop conditions

- Stop if any listed line's literal turns out to color a non-foreground element (background/border/shadow) — those stay as-is; report instead of widening.
- Stop if `GlobalSearch` is found mounted anywhere without the `isDark` prop.

## Design documentation

- After acceptance and validation: none (theme tokens already document the decision).
