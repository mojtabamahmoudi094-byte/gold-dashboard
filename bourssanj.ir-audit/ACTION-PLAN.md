# bourssanj.ir — SEO Action Plan (re-verified 2026-07-19)

Composite score (measured categories only — Performance/On-Page/Images not separately audited this round): **~52/100 → est. ~68/100 after fixes**

## Re-verification (live checks, 2026-07-19)
- ✅ SSR fixed: `/stock/شبندر` etc serve real, unique per-symbol content (~3.4K chars, AI narration from Codal) — no more "در حال بارگذاری…" in raw HTML.
- ✅ 5 security headers live (HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy).
- ✅ Sitemap has 2270 URLs incl. `/market-map`, `/alerts`, 653 `/fundamentals/[symbol]`.
- ✅ JSON-LD live and valid: Organization, WebSite, BreadcrumbList, Dataset.
- ✅ `llms.txt` present with disclaimer + key page links.
- ❌ Still open: `/about`, `/contact`, `/team` all 404. Footer still has 4 dead `href="#"` links (Terms/Privacy/social).
- ❌ Still open: TTFB — host limitation (Render free plan), not fixable without plan/host change.
- ❌ Not started: backlinks (near-zero external links pointing in — biggest remaining lever).

| Category | Score | Weight |
|---|---|---|
| Technical | 72/100 | 22% |
| Content | 42/100 | 23% |
| Schema | 35/100 | 10% |
| GEO (AI search) | 46/100 | 10% |
| Sitemap | pass w/ gaps | — |

## Phase 1: Critical (this week)

1. **Server-render real content, not "در حال بارگذاری…"** — `/analysis`, `/funds`, `/signals`, `/stock/[symbol]` etc. serve only nav chrome + loading state in initial HTML; all real content (including numeric prices/NAV) loads client-side only. Invisible to AI crawlers, hurts LCP, hurts thin-content signal. → move data fetch to server components / generateStaticParams+revalidate.
2. **Fix cold-start TTFB (1.8–4.2s)** — existing Render keepalive cron may not be hitting the right endpoint ([[project_render_keepalive]]). Verify cron target.
3. **Disclaimer not co-located with AI-generated content** — non-advice disclaimer exists on homepage but not server-rendered alongside `/signals`/`/analysis` pages themselves. Compliance gap per project rule (AGENTS.md).

## Phase 2: High (1–2 weeks)

4. Add security headers (HSTS, CSP, X-Content-Type-Options, Referrer-Policy) via `next.config.js`.
5. Add `/about`, `/contact`, `/team` pages; fix dead `#` footer links (Terms/Privacy/social) — E-E-A-T trust signals.
6. Add `/market-map` to `app/sitemap.ts` (real 200 page, missing from sitemap).
7. Template-scale thin/duplicate content: ~1,630 `/stock/[symbol]` + fund pages near-identical — add unique per-symbol narrative (ties into existing LLM-narration feature, [[project_growth_backlog_2026_07]]).

## Phase 3: Medium (this month)

8. Add BreadcrumbList JSON-LD (visual breadcrumb exists, schema doesn't).
9. Add Dataset/FinancialProduct JSON-LD to stock/fund template pages (see `findings/schema.md` for snippets).
10. Add `/alerts` + `/fundamentals/[symbol]` (660+ pages) to sitemap.
11. Explicit AI-bot allow rules in robots.txt (GPTBot/ClaudeBot/PerplexityBot currently allowed by default, not explicit).
12. Fix sitemap `lastmod` — currently identical build-time timestamp for all URLs, not real content dates.

## Phase 4: Ongoing

13. Add Article schema + author/date to `/analysis` reports.
14. Expand `llms.txt` with example Q&A + RSL.
15. Add responsive `srcset` for images; deprioritize Enamad badge preload (competes with real LCP element).
16. Manual check: brand mention monitoring (Wikipedia/Reddit/YouTube/LinkedIn) for "بورس سنج" — not doable via automated search this round.

## Per-category detail
See `findings/technical.md`, `findings/content.md`, `findings/schema.md`, `findings/sitemap.md`, `findings/geo.md`.
