# Content Quality / E-E-A-T / AI-Citation-Readiness — bourssanj.ir

Scope: homepage + ~20 pages crawled (analysis, analysis/gold, funds, funds/gold, funds/silver, stocks, stock/[symbol] sample, technical, signals, valuation, dashboard, market-map, track-record, trade-value, monitor, portfolio, compare) fetched via raw HTTP (curl, no JS execution) and analyzed with trafilatura extraction. Playwright/rendered mode was unavailable in the plugin venv, so findings reflect what non-JS crawlers (most AI-answer bots, and Google in low render-budget scenarios) actually receive on first response.

**Content Quality Score: 42 / 100**

---

## Findings

### 1. Nearly all interior pages ship as an empty "در حال بارگذاری…" shell (Critical)
- **Severity:** Critical
- **Description:** Of 17 non-homepage pages sampled, 14 return only global nav chrome plus the literal string "در حال بارگذاری…" ("Loading…") in the server response — e.g. `/analysis`, `/funds`, `/signals`, `/technical`, `/valuation`, `/portfolio`, `/monitor`, `/funds/gold`, `/funds/silver`, `/analysis/gold`, and the sampled `/stock/وبملت` page (37KB of HTML, 186 characters of real text after boilerplate stripping). All real content (prices, charts, tables, AI-generated analytical summaries) is fetched client-side after hydration and is invisible to any crawler/LLM that does not execute JavaScript (GPTBot, ClaudeBot, PerplexityBot, and many AI-citation pipelines do not render JS). Even Googlebot, which does render JS, defers rendering to a second wave and can index the loading-state text if render budget is constrained on a low-authority domain.
- **Recommendation:** Server-render (SSR/SSG) at least the primary content for these routes — headline metrics, the current top movers/prices, and any AI-written analytical summary text — instead of a client-only fetch. Next.js supports this natively; treat the JS-rendered version as an enhancement, not the only path to content. Prioritize `/stocks`, `/funds`, `/analysis`, `/signals`, and the ~1,630 `/stock/[symbol]` and `/fund/[symbol]` pages found in the sitemap, since those are the pages most likely to be cited or indexed individually.

### 2. Programmatic stock/fund pages are near-identical duplicate/thin content at scale (Critical)
- **Severity:** Critical
- **Description:** The sitemap lists ~1,630 `/stock/[symbol]` and hundreds of `/fund/[symbol]` URLs. The one sampled (`/stock/وبملت`) server-renders to 186 characters of unique text — nav chrome, breadcrumb, and "Loading…" — identical in structure to every other symbol page except the symbol name. At the scale of 1,600+ URLs this is a textbook thin/duplicate-content pattern that risks Panda/Helpful-Content-style demotion across the whole template, not just individual URLs. Per the `seo-programmatic` delegation guidance, these pages need a genuine per-symbol data floor server-rendered on load (current price, day range, sector, P/E, related codal report snippet), not just client-hydrated tables.
- **Recommendation:** Establish a topical coverage floor per symbol page (e.g., 150–300 words of server-rendered unique data/summary) and defer to `seo-programmatic` for template-level fixes (canonical strategy, index/noindex tiering for low-traffic symbols, internal linking between related symbols/funds).

### 3. AI-generated financial content lacks a server-rendered, page-level non-advice disclaimer (High)
- **Severity:** High
- **Description:** A non-advice disclaimer does exist and is well-worded on the **homepage**: *"...سیگنال‌ها و تحلیل‌های ارائه‌شده در بورس سنج صرفاً جنبه اطلاع‌رسانی دارند و توصیه سرمایه‌گذاری یا خرید و فروش محسوب نمی‌شوند. مسئولیت هرگونه تصمیم مالی بر عهده خود کاربر..."* — this satisfies the project rule for the homepage. However, the pages that actually carry AI-generated analytical/signal content (`/signals`, `/analysis`, `/analysis/gold`, `/valuation`, `/track-record`, individual stock/fund pages) do **not** server-render this disclaimer at all — their SSR payload is just the loading shell (see Finding 1), so any crawler, AI answer engine, or user with JS disabled sees the AI-derived signal/analysis text with zero disclaimer attached in the same response. This is both a legal/compliance gap for the site and an E-E-A-T trust deduction, since disclaimers must travel with the content they qualify, not live only on the homepage.
- **Recommendation:** Render the non-advice disclaimer server-side, adjacent to every page that surfaces signals, "امتیاز بازار" (market score), technical analysis, or valuation output — not just the homepage footer. This is a compliance requirement per project rules, not merely an SEO nicety.

### 4. No author/expertise or contact/about signals anywhere on the crawled site (High)
- **Severity:** High
- **Description:** No `/about`, `/contact`, `/team`, `/terms`, or `/privacy` route resolves (all return 404). The footer's "قوانین" (Terms) and "حریم خصوصی" (Privacy) links, and all three social-icon links, point to `href="#"` placeholders rather than real pages. There is no author byline, analyst credential, or company/legal-entity information anywhere in the crawled HTML — only a one-line tagline ("سامانه هوشمند رصد، تحلیل و پایش بازار سرمایه ایران"). For a site that publishes trading signals and valuation output, this is a significant Expertise/Trustworthiness gap under the Sept 2025 QRG, which explicitly weighs author/organization transparency for YMYL-adjacent financial content.
- **Recommendation:** Publish real `/about` and `/contact` pages (legal entity name, method of contact, methodology behind signals/valuation), and either implement or remove the Terms/Privacy/social links currently pointing to `#`. Consider an "روش‌شناسی" (methodology) page explaining how signals and the "امتیاز بازار" score are computed — this doubles as both an E-E-A-T and AI-citation asset (a citable, stable explainer page).

### 5. One positive signal: eNamad trust seal and structured Organization/WebSite schema present (Info)
- **Severity:** Info
- **Description:** The homepage embeds an eNamad (Iranian e-commerce trust certification) badge/link and a minimal `application/ld+json` block with `Organization` and `WebSite` types (name, url, logo, inLanguage). This is a genuine trust signal for an Iranian financial site and a small AI-citation aid (entity disambiguation), but it stops at organization identity — no `Article`, `FAQPage`, `Dataset`, or `FinancialProduct` schema on any of the deeper pages that actually carry analysis/signal content.
- **Recommendation:** Keep the eNamad badge and Organization schema. Extend structured data to interior content pages once they are server-rendered (Finding 1) — e.g. `Article`/`AnalysisNewsArticle` schema on `/analysis/*` pages with `datePublished` and disclaimer text embedded, `FAQPage` for any onboarding/help content.

### 6. Homepage heading hierarchy and SSR text quality are acceptable (Info)
- **Severity:** Info
- **Description:** The homepage's server-rendered HTML has a single `<h1>` ("بازار بورس را...") followed by logical `<h2>`/`<h3>` nesting for the feature-grid sections (سهام بازار، گزارش‌های کدال، سیگنال‌های بازار، etc.), a populated `<meta name="description">`, and RTL/Persian rendering with no encoding artifacts. Persian sentence structure in the SSR'd hero/feature copy reads naturally (not keyword-stuffed, not obviously templated AI filler) and includes concrete specificity ("بیش از ۶۰۰ نماد در ۴۵ صنعت", "هر ۵ دقیقه در ساعت بازار به‌روز می‌شود") consistent with genuine first-hand product description (Experience signal). This is the one page in the crawl with an adequate word-count floor for its page type (~500-word target for homepages); every other sampled page falls far short (Finding 1).
- **Recommendation:** No action needed for the homepage's SSR copy itself; replicate this level of specific, server-rendered description on interior pages once hydration-dependency is fixed.

---

## E-E-A-T Breakdown

| Factor | Weight | Score (0-100) | Notes |
|---|---|---|---|
| Experience | 20% | 55 | Specific, concrete homepage copy (real-time cadence, symbol/sector counts) suggests genuine product experience, but this signal exists on the homepage only — nowhere else in the crawl. |
| Expertise | 25% | 25 | No author/analyst credentials, no methodology page, no visible technical byline for signals/valuation outputs. |
| Authoritativeness | 25% | 30 | eNamad seal + minimal Organization schema are the only external-recognition signals found; no citations, press mentions, or backlink-worthy assets identified in-crawl. |
| Trustworthiness | 30% | 35 | Homepage disclaimer is good, but it does not travel with the AI-generated signal/analysis content itself (Finding 3); Terms/Privacy/Contact are all dead links or 404s (Finding 4). |

**Weighted E-E-A-T score: ~35/100**

## AI Citation Readiness Score: 20 / 100
Rationale: real content (prices, signals, analytical summaries) is not present in the initial HTTP response for ~1,600+ symbol/fund pages and most feature pages — only the homepage is citable as-is by a non-JS-executing AI crawler. Structured data is present but minimal (Organization/WebSite only, no Article/Dataset markup on content pages). No stable "methodology" or "about" page exists as a quotable authority anchor.

## Content Quality Score: 42 / 100
Driven down primarily by Findings 1 and 2 (SSR-invisible content across nearly the entire site) and Finding 4 (no author/contact/about signals); partially offset by a genuinely well-written, specific homepage and the presence of a compliant homepage-level disclaimer and eNamad trust badge.
