# Technical SEO Findings — bourssanj.ir

Audit date: 2026-07-18
Method: HTTP header/HTML inspection via curl + render_page.py (raw mode; Playwright unavailable so rendered-mode CSR comparison not run, but `is_spa: false` and full content present in raw HTML confirms server-side rendering).

**Technical Score: 72/100**

---

## 1. Crawlability — PASS (minor issues)

### Finding: robots.txt present and correctly configured
- Severity: Info
- Description: `https://bourssanj.ir/robots.txt` returns 200, allows `/`, disallows `/admin`, `/api`, `/auth`, `/dashboard`, `/portfolio` (all correctly non-indexable app surfaces), and points to the sitemap.
- Recommendation: No action needed. Optionally add explicit AI-crawler directives (GPTBot, ClaudeBot, Google-Extended, PerplexityBot) if a stance on AI training/answer-engine crawling is desired — currently the wildcard `Allow: /` implicitly allows all of them.

### Finding: Sitemap present but very large single file, no lastmod granularity
- Severity: Low
- Description: `sitemap.xml` returns 200 with ~1,630 URLs (stocks, funds, technical/`{symbol}` pages, monitor pages, analysis). Every single `<lastmod>` in the file is identical (`2026-07-18T08:48:57.129Z`), suggesting it's regenerated wholesale rather than reflecting true per-page last-modified data. This reduces the crawl-efficiency signal Google/Bing use to prioritize re-crawls of genuinely changed pages.
- Recommendation: Set `lastmod` per URL based on actual content change time (e.g., last price/report update) rather than sitemap-build time. If the file continues to grow, consider splitting into a sitemap index (e.g., `sitemap-stocks.xml`, `sitemap-funds.xml`, `sitemap-static.xml`) once it approaches 5k+ URLs.

### Finding: No `X-Robots-Tag` or `<meta name="robots">` anywhere observed
- Severity: Info
- Description: Neither the homepage nor `/stocks` emit a robots meta tag or header — default is indexable, which is intended for public pages. Not verified whether `/technical/{symbol}` thin pages (1,630 of them) have their own noindex logic for low-value/duplicate variants.
- Recommendation: Confirm no thin/duplicate `/technical/{symbol}` pages exist for symbols with no real content — if any do, add `noindex` to avoid diluting quality signals across a large template-generated page set.

---

## 2. Indexability — PASS

### Finding: Canonical tags present and self-referencing, correct per-page
- Severity: Info
- Description: Homepage canonical: `https://bourssanj.ir` (no trailing slash). `/stocks` canonical: `https://bourssanj.ir/stocks`. Per-page titles and meta descriptions differ appropriately (checked homepage vs `/stocks`), i.e. no obvious title/description duplication template bug.
- Recommendation: None required. Just confirm the no-trailing-slash convention is applied consistently site-wide (Next.js default) to avoid canonical/URL mismatches.

### Finding: WWW → non-WWW and HTTP → HTTPS both single-hop 301
- Severity: Info
- Description: `http://bourssanj.ir/` → 301 → `https://bourssanj.ir/`. `https://www.bourssanj.ir/` → 301 → `https://bourssanj.ir/`. Both single redirects, no chains.
- Recommendation: None required.

---

## 3. Security — HIGH ISSUE

### Finding: Missing HTTP security headers
- Severity: High
- Description: Response headers on `https://bourssanj.ir/` include none of: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. Site is served over HTTPS via Cloudflare, but these headers are not being injected by Cloudflare or the origin (Render/Next.js). This is not a classic ranking factor but is flagged in Lighthouse "Best Practices" (which does influence some SEO tooling/trust signals) and is a real security gap for a financial-data site handling user auth (per `/auth`, `/dashboard`, `/portfolio` in robots.txt).
- Recommendation: Add security headers via `next.config.js` `headers()` (or a Cloudflare Transform Rule): at minimum `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a scoped `Content-Security-Policy` (start report-only given third-party scripts: GTM/GA, Enamad trust-seal iframe/image).

### Finding: HTTPS enforced correctly
- Severity: Info
- Description: TLS via Cloudflare, HTTP/2, valid redirect to HTTPS.

---

## 4. URL Structure — PASS

### Finding: Clean, human-readable URL structure
- Severity: Info
- Description: URLs like `/stocks`, `/funds/bourse`, `/monitor/gold`, `/technical/{persian-symbol}` are clean, lowercase (where Latin), hierarchical, and free of tracking/query-string clutter in the sitemap. Persian-symbol slugs are percent-encoded correctly in the sitemap XML (e.g. `/technical/%D8%AE%D8%A8%D8%A7%D8%B2%D8%B1%D8%B3` = `/technical/خبازرس`).
- Recommendation: None required.

---

## 5. Mobile-Friendliness — PASS

### Finding: Correct responsive viewport meta tag
- Severity: Info
- Description: `<meta name="viewport" content="width=device-width, initial-scale=1"/>` present, RTL (`dir="rtl"`) and `lang="fa"` correctly set on `<html>`. No `maximum-scale=1` or `user-scalable=no` restricting pinch-zoom (good for accessibility, aligned with the project's existing mobile/elderly-accessibility priority).
- Recommendation: None required, but recommend running a real Lighthouse mobile pass (this audit is source-only) to confirm touch-target sizing on the dense stock-table UI, which is a common failure mode for financial dashboards on mobile.

---

## 6. Core Web Vitals (source-inspection estimate) — CRITICAL ISSUE

### Finding: Very high and inconsistent Time-To-First-Byte (server latency)
- Severity: Critical
- Description: Three consecutive cold requests to `https://bourssanj.ir/` measured TTFB of **2.68s, 1.78s, and 4.24s**, with total response times up to 4.7s. This is despite the documented Render free-tier keep-alive cron (see project memory: 10-minute keepalive cron on 45.94.215.115). Because LCP cannot occur before TTFB completes, this alone puts LCP solidly in the "Poor" range (>4s) on a meaningful share of visits, and explains why any client-side interactivity (INP) would also feel sluggish on cold hits. Headers show `x-nextjs-cache: HIT` and `cf-cache-status: DYNAMIC`, meaning Next.js's own page cache is being hit yet the request is still slow — pointing to Render origin cold-start/cold-region latency (response is served from Render then proxied, `x-render-origin-server: Render`) rather than an application-code issue.
- Recommendation: This is the single highest-impact item in this audit. Options ranked by effort: (1) verify the keepalive cron is actually still running and hitting a page that forces the Next.js/Render process to stay warm (not just a cheap static asset); (2) move off Render free tier to a plan without cold starts, or move static/marketing pages to a CDN-cached edge (Cloudflare's own edge cache, since Cloudflare is already in front) so that the homepage and other high-traffic pages are served from Cloudflare cache without hitting Render at all; (3) increase `s-maxage`/edge caching (`cache-control: public, max-age=0, s-maxage=60`) to a higher value for pages that don't need per-minute freshness.

### Finding: Third-party trust-seal image preloaded with high priority, competing with real LCP content
- Severity: Medium
- Description: Homepage `<head>` contains `<link rel="preload" as="image" href="https://trustseal.enamad.ir/logo.aspx?...">` with no `fetchPriority` deprioritization, meaning the browser is told to fetch this third-party (cross-origin) Enamad trust-badge image at high priority before/alongside the actual page content. If this image is not the true LCP element, it's wasting early network priority that should go to real above-the-fold content (charts/price tables), and it also has an empty `alt=""` (see Finding below).
- Recommendation: Remove the `preload` hint for the Enamad badge (or set `fetchPriority="low"`, matching the pattern already used for `_next/static/chunks/...js` preload in the `/stocks` page). Preload only the actual LCP image/font.

### Finding: No responsive image optimization detected (no `srcset`)
- Severity: Medium
- Description: Zero `srcset` attributes found in either homepage or `/stocks` HTML, meaning images are not being served via `next/image` (or an equivalent responsive-image pipeline) — at least the Enamad badge is a raw `<img>`. For a data-dense dashboard likely to add charts/screenshots, unoptimized images are a common CLS/LCP risk on mobile.
- Recommendation: Audit all `<img>` usage; migrate to `next/image` (or manually add `srcset`/`sizes` + explicit `width`/`height`) wherever real content images/charts are rendered, to get automatic responsive sizing and layout-shift prevention.

### Finding: Explicit width/height not verifiable from source alone (CLS risk, unconfirmed)
- Severity: Low
- Description: Static source inspection cannot fully rule out layout shift from client-rendered stock tables/charts (data arrives after hydration). Given the site is Next.js SSR (confirmed, not pure CSR), the HTML shell does render server-side, which is good for CLS/LCP baseline, but live price widgets updating post-hydration are a classic CLS source if they don't reserve space.
- Recommendation: Run a real Lighthouse/CrUX field-data check on `/stocks` and `/monitor/*` to confirm CLS stays <0.1 when live data streams in; reserve fixed height/skeletons for price-table rows and chart containers before data loads.

---

## 7. Structured Data — PASS (basic)

### Finding: Organization + WebSite JSON-LD present on homepage
- Severity: Info
- Description: Homepage includes two `application/ld+json` blocks: `Organization` (name, url, logo) and `WebSite` (name, url, `inLanguage: fa-IR`). No `SearchAction` (sitelinks search box) and no page-type-specific schema (e.g. `FinancialProduct`/`Dataset`/`Table` markup on `/stocks`, `/funds/*`) checked on `/stocks` — none found there.
- Recommendation: Consider adding `FinancialProduct` or `Dataset` structured data to fund/stock detail pages if eligible for rich results, and a `BreadcrumbList` for the `/technical/{symbol}` and `/monitor/*` hierarchies to strengthen sitelinks and breadcrumb rich snippets in Persian SERPs.

---

## 8. JavaScript Rendering — PASS

### Finding: Server-rendered Next.js confirmed, not CSR/SPA
- Severity: Info
- Description: `render_page.py` classified the homepage and `/stocks` as `is_spa: false` (raw mode), and full text content (titles, meta, JSON-LD, visible copy) is present in the initial HTML response without executing JavaScript. This is optimal for crawlability — no reliance on Googlebot's second-wave rendering queue.
- Recommendation: None required. Maintain this SSR approach for any new pages (per AGENTS.md's Next.js-specific conventions — verify with local `node_modules/next/dist/docs/` before assuming default App Router behavior).

---

## 9. IndexNow Protocol — NOT IMPLEMENTED

### Finding: No IndexNow support detected
- Severity: Medium
- Description: No `/indexnow.txt` key file (404), and no evidence in headers/HTML of IndexNow ping integration. For a site with time-sensitive financial data (live prices, hourly `changefreq` in sitemap) across ~1,630 URLs, IndexNow would let Bing/Yandex/Naver pick up updates near-instantly instead of waiting on crawl schedule, complementing the existing sitemap.
- Recommendation: Implement IndexNow: generate a key, host `https://bourssanj.ir/{key}.txt`, and call the IndexNow API (`https://api.indexnow.org/indexnow`) on publish/update events — likely from the existing content-update pipelines (codal-watch, price-update crons) rather than per pageview, to avoid quota waste. Low implementation cost, decent payoff for Bing/Yandex visibility given the site already has cron infrastructure for scheduled jobs.

---

## Summary Table

| Category | Status | Score impact |
|---|---|---|
| Crawlability | Pass | - |
| Indexability | Pass | - |
| Security headers | Fail (High) | -12 |
| URL structure | Pass | - |
| Mobile | Pass | - |
| Core Web Vitals (TTFB/LCP) | Fail (Critical) | -14 |
| Core Web Vitals (image/preload hygiene) | Fail (Medium) | -6 |
| Structured Data | Pass (basic) | - |
| JS Rendering (SSR) | Pass | - |
| IndexNow | Not implemented (Medium) | -6 |

**Overall Technical Score: 72/100**
