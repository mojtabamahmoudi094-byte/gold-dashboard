# Schema.org / Structured Data Findings — bourssanj.ir

Audit date: 2026-07-18
Method: `curl -A "Mozilla/5.0"` raw HTML fetch (render_page.py's `--mode auto/always` truncated responses to ~500 bytes on this host — Playwright unavailable and the raw fetch path in that script is buggy for this site's chunked/gzip response, so curl was used instead) + source inspection (`app/layout.tsx`, `app/*/layout.tsx`). Pages checked: `/` (home), `/stocks`, `/market-map`, `/analysis`, `/funds/gold`, `/stock/وامید` (stock detail), `/fund/پالایز` (fund detail).

**Schema Score: 35/100**

The only structured data on the entire site is a single sitewide `Organization` + `WebSite` JSON-LD block injected once in the root layout (`app/layout.tsx`) and inherited unchanged by every route, including deep template-generated pages (stock detail, fund detail, technical/{symbol}, monitor/{cat} — ~1,630 URLs per the sitemap). No page ever adds page-specific schema despite each having its own `generateMetadata()` with per-entity title/description already computed.

---

## 1. Existing Schema — Detected

### Finding: Sitewide Organization + WebSite JSON-LD (identical on every page)
- Severity: Info
- Description: `app/layout.tsx` emits one `<script type="application/ld+json">` array:
  ```json
  [
    {"@context":"https://schema.org","@type":"Organization","name":"بورس سنج","url":"https://bourssanj.ir","logo":"https://bourssanj.ir/icon.jpeg"},
    {"@context":"https://schema.org","@type":"WebSite","name":"بورس سنج","url":"https://bourssanj.ir","inLanguage":"fa-IR"}
  ]
  ```
  Confirmed byte-identical on `/`, `/stocks`, `/market-map`, `/analysis`, `/funds/gold`, `/stock/وامید`, and `/fund/پالایز` — it is a global layout injection, not page-aware.
- Validation:
  - ✅ `@context` is `https://schema.org` (correct, HTTPS)
  - ✅ Both types valid, not deprecated
  - ✅ `url` absolute
  - ⚠️ `Organization.logo` — Google recommends the logo be square and ≥112×112px; `icon.jpeg` should be checked against these dimensions, and `sameAs` (social profiles, if any exist — Telegram channel, etc.) is missing, which weakens entity disambiguation for Google Knowledge Panel / AI answer engines.
  - ⚠️ `WebSite` has no `potentialAction` (SearchAction) — no internal site search exists to wire this to, so this is optional, not a gap.
  - Brand name correctly rendered as "بورس سنج" (not the incorrect "بورسنج") in both blocks — no fix needed here.

No Microdata or RDFa detected anywhere. No other JSON-LD blocks found on any checked page (the only other place `application/ld+json` appears in the raw HTML is inside Next.js's React Flight/RSC payload script, which is not a second rendered tag — it is the serialized data the same script hydrates from).

---

## 2. Missing Schema Opportunities

### Finding: No BreadcrumbList schema despite a visible breadcrumb UI on every subpage
- Severity: Medium
- Description: `app/components/Breadcrumb.tsx` renders a client-side (`'use client'`) breadcrumb nav (`خانه › صندوق‌ها › طلا`, etc.) on every non-home route, but it emits plain HTML only — no `BreadcrumbList` JSON-LD. This is a straightforward, high-value addition for a deeply nested URL structure (`/funds/gold`, `/stock/{symbol}`, `/technical/{symbol}`, `/monitor/{cat}`) and helps both classic breadcrumb rich results and AI crawlers understand site hierarchy.
- Recommendation: Since the breadcrumb component already computes `crumbs` client-side, either (a) move breadcrumb generation into a server component so JSON-LD can be emitted server-side, or (b) keep the UI client-side but inject a matching JSON-LD `<script>` via `useEffect`/`next/head` equivalent (App Router: emit via a small server wrapper per-layout using the same path segments). Example for `/funds/gold`:
  ```json
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "خانه", "item": "https://bourssanj.ir/" },
      { "@type": "ListItem", "position": 2, "name": "صندوق‌ها", "item": "https://bourssanj.ir/funds" },
      { "@type": "ListItem", "position": 3, "name": "طلا", "item": "https://bourssanj.ir/funds/gold" }
    ]
  }
  ```

### Finding: Stock detail pages (`/stock/{symbol}`) have no `FinancialProduct`/`Dataset` schema
- Severity: Medium
- Description: `app/stock/[symbol]/layout.tsx` already computes per-symbol title/description (`قیمت لحظه‌ای، تحلیل بنیادی و تکنیکال نماد {name}`) but adds zero structured data. ~1,630 template-generated URLs in the sitemap represent stock/fund/technical pages with live price, fundamental, and technical data — currently invisible to structured-data consumers (Google's financial-data understanding, AI answer engines doing entity/price lookups).
- Recommendation: Add a `Dataset` (for the underlying time-series/fundamental data) or `FinancialProduct` (if framed as the security itself) block per stock page, populated server-side from data already fetched for the page render. Do not fabricate values — only include what's already displayed. Example:
  ```json
  {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "name": "داده‌های لحظه‌ای و تکنیکال نماد وامید",
    "description": "قیمت لحظه‌ای، تحلیل بنیادی و تکنیکال نماد وامید در بورس تهران",
    "url": "https://bourssanj.ir/stock/وامید",
    "creator": { "@type": "Organization", "name": "بورس سنج", "url": "https://bourssanj.ir" },
    "inLanguage": "fa-IR"
  }
  ```
  If price is included, use `Offer`/`PriceSpecification` sparingly and only with a live, correctly-timestamped value (ISO 8601 `priceValidUntil`/`validFrom` — avoid stale-price schema, a known past bug class in this codebase per `project_usd_value_wipe_bug`).

### Finding: Fund detail pages (`/fund/{slug}`) have no schema beyond the global block
- Severity: Medium
- Description: Same pattern as stocks — `app/fund/[slug]/layout.tsx` computes "اطلاعات، NAV و تحلیل صندوق {name}" but no `FinancialProduct` schema describing the fund (NAV, fund type, issuer) is emitted.
- Recommendation: Add a `FinancialProduct` block per fund page:
  ```json
  {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    "name": "صندوق پالایز",
    "url": "https://bourssanj.ir/fund/پالایز",
    "provider": { "@type": "Organization", "name": "بورس سنج", "url": "https://bourssanj.ir" },
    "category": "صندوق سرمایه‌گذاری"
  }
  ```
  Only include NAV/price fields if rendered directly from the same server-side data source as the page body, with correct ISO 8601 timestamps.

### Finding: No `WebPage`/`Article` schema on `/analysis`, `/track-record`, or Telegram-sourced report content surfaced on-site
- Severity: Low
- Description: `/analysis` and related report-style pages read as editorial/analytical content but carry no `Article`/`AnalysisNewsArticle`-equivalent schema (Google does not have a bespoke financial-analysis type; `Article` or `BlogPosting` with `about`/`mentions` pointing at the relevant `FinancialProduct`/organization is the closest fit). If these pages are dynamically generated per report/date, this is a good target for a lightweight per-page `Article` block with `datePublished` in ISO 8601, sourced from the report's actual generation timestamp — not the page-render time.
- Recommendation: Add `Article` schema only where there is genuine authored/dated analytical content (not raw live-price tables, which are better served by `Dataset`). Example:
  ```json
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "<real report title>",
    "datePublished": "2026-07-18T08:00:00+03:30",
    "author": { "@type": "Organization", "name": "بورس سنج" },
    "publisher": { "@type": "Organization", "name": "بورس سنج", "logo": { "@type": "ImageObject", "url": "https://bourssanj.ir/icon.jpeg" } },
    "mainEntityOfPage": "https://bourssanj.ir/analysis"
  }
  ```
  Per project rules, any AI-generated Persian market content must carry a non-advice disclaimer in the visible copy — schema is a supplement, not a substitute for that disclaimer.

### Finding: No FAQPage anywhere — acceptable, do not add for SERP purposes
- Severity: Info
- Description: No FAQ-style content or `FAQPage` markup detected on any checked page. Per current guidance, Google retired FAQ rich results for all sites (May 2026), so there is no SERP incentive to add `FAQPage`. If genuine user Q&A functionality is ever built (e.g. a public Q&A/support page), use `QAPage`, not `FAQPage`. If an FAQ-style section is added purely for AI/LLM citation and entity grounding (GEO), `FAQPage` markup is still acceptable for that purpose — just don't expect a rich result.
- Recommendation: No action required now. Revisit only if genuine FAQ or Q&A content is added to the site.

### Finding: No `HowTo` schema present — correctly avoided
- Severity: Info
- Description: No `HowTo` markup found. Given the deprecated status (rich results removed Sept 2023), this is correct as-is; do not add `HowTo` even for any future "how to read this chart" / "how to use the screener" explainer content — use plain `Article`/`WebPage` instead.

---

## 3. Validation Summary

| Block | @context correct | @type valid/non-deprecated | Required props present | No placeholders | Absolute URLs | ISO 8601 dates | Verdict |
|---|---|---|---|---|---|---|---|
| Organization (global) | ✅ | ✅ | ✅ (name, url) | ✅ | ✅ | n/a | PASS |
| WebSite (global) | ✅ | ✅ | ✅ (name, url) | ✅ | ✅ | n/a | PASS |
| BreadcrumbList | — | — | — | — | — | — | MISSING |
| Dataset/FinancialProduct (stock/fund pages) | — | — | — | — | — | — | MISSING |
| Article (analysis/reports) | — | — | — | — | — | — | MISSING |
| FAQPage | — | — | — | — | — | — | Not present (correctly, per current Google policy) |
| HowTo | — | — | — | — | — | — | Not present (correctly avoided, deprecated) |

---

## Priority Summary

| Priority | Item |
|---|---|
| Medium | Add `BreadcrumbList` JSON-LD matching the existing visible breadcrumb component |
| Medium | Add `Dataset`/`FinancialProduct` schema to `/stock/{symbol}` template pages (~1,630 URLs) |
| Medium | Add `FinancialProduct` schema to `/fund/{slug}` template pages |
| Low | Add `Article` schema to genuinely dated/authored analysis or report pages |
| Info | Global `Organization`/`WebSite` block is correctly implemented — consider adding `sameAs` social links |
| Info | No FAQPage/HowTo present — correct, no action needed |
