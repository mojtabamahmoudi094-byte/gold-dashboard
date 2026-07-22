# Unify «دیدبان» → «دیده‌بان» in all user-facing copy

Written against: f82ba993cc275dd0affcda4272532ec22a41f6df

## Evidence chain

- Surface: site-wide navigation and the funds family
- Problem: The same product noun is spelled two ways in adjacent user-facing strings. On `/funds/[cat]` the AuthGate gate title says «دیده‌بان صندوق‌ها» (`app/funds/[cat]/page.tsx:187`) while the page heading says «دیدبان صندوق‌های …» (line 208). Inside one `NAV` array, the funds menu item is «دیدبان صندوق‌ها» (`app/components/Header.tsx:28`) while the analysis menu item is «دیده‌بان تکنیکال» (line 36). Site-wide the split is 12 «دیدبان» vs 13 «دیده‌بان».
- Design evidence: direct contradiction in user-facing content within the same task and the same component; «دیده‌بان» is the standard Persian orthography (dictionary form) and is what the gate screens and technical section already use.
- Owner: the copy strings themselves (no shared constant exists)
- Scope and affected surfaces: 8 files, 12 occurrences (listed below)
- Uncertainty: none — occurrences verified by grep at the recorded commit; re-grep before editing (concurrent sessions are common in this repo)

## Design decision

Normalize every user-facing «دیدبان» to «دیده‌بان» (with ه + zero-width non-joiner U+200C before «بان»), matching the standard orthography and the already-dominant form.

## Reuse

- Canonical string form: «دیده‌بان» exactly as written in `app/funds/[cat]/page.tsx:187`
- Exemplar: `app/components/Header.tsx:36` («دیده‌بان تکنیکال»)

No new primitive required.

## Changes

Replace the word «دیدبان» with «دیده‌بان» (preserving the rest of each string) at:

1. `app/page.tsx:181` — «دیدبان جامع صندوق‌های سرمایه‌گذاری مبتنی بر نقره»
2. `app/page.tsx:527` — «دیدبان من»
3. `app/dashboard/page.tsx:459` — QuickLink title «دیدبان صندوق‌ها»
4. `app/components/Footer.tsx:13` — footer label «دیدبان»
5. `app/components/Header.tsx:28` — NAV label «دیدبان صندوق‌ها»
6. `app/funds/page.tsx:13`, `:30`, `:46` — category card descriptions; `:119` — h1 «دیدبان صندوق‌های کالایی»
7. `app/funds/bourse/page.tsx:85` — back link «← بازگشت به دیدبان صندوق‌ها»
8. `app/funds/radar/page.tsx:205` — back link «← بازگشت به دیدبان صندوق‌ها»
9. `app/funds/[cat]/page.tsx:208` — heading «دیدبان صندوق‌های {catInfo.label}»

- Preserve: all surrounding copy, string interpolation, and any occurrences already spelled «دیده‌بان»; do not touch code identifiers, slugs, or comments.
- Verify: each edited string renders with the joined form «دیده‌بان» (ZWNJ present, not a plain space or attached «دیدهبان»).

## Scope

- Inherit: home, dashboard quick links, header nav, footer, funds hub/cat/bourse/radar
- Verify: SEO metadata (`lib/pageMetadata.ts`, route `layout.tsx` files) contained neither spelling of this word at audit time — confirm still true; Telegram/content scripts under `scripts/` are out of scope unless they emit this word to users (not audited)
- Exclude: `app/funds/[cat]/page.tsx:187` and all other existing «دیده‌بان» strings (already correct)

## Validation

- Product: nav, footer, funds pages, and back links all show one spelling.
- Interface: `/`, `/dashboard`, `/funds`, `/funds/gold`, `/funds/bourse`, `/funds/radar`; header desktop menu and mobile hamburger.
- System: no shared constant introduced — plain string edits only.
- Repository: `grep -rn "دیدبان" app lib --include="*.tsx" --include="*.ts"` → no matches (the pattern without ه does not match «دیده‌بان» because of the intervening ه+ZWNJ).

## Stop conditions

- Stop if re-grep shows new occurrences beyond the 12 listed (another session added copy) — extend the list mechanically, but stop and report if any occurrence is in metadata/SEO titles, since changing indexed titles is a separate decision.

## Design documentation

- After acceptance and validation: add to `AGENTS.md` review checklist, alongside the existing brand-name rule: user-facing copy spells it «دیده‌بان», never «دیدبان».
