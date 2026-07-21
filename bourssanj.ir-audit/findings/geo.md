# GEO / AI Search Readiness — bourssanj.ir

Audit date: 2026-07-18

## GEO Readiness Score: 46 / 100

| Dimension | Weight | Score | Notes |
|---|---|---|---|
| Citability | 25% | 25/100 | No long-form/answer-style passages anywhere on the site; all pages are dashboard/tool UIs |
| Structural Readability | 20% | 40/100 | Headings exist but are UI labels ("سهام", "صندوقها"), not question-based; no self-contained answer blocks |
| Multi-Modal Content | 15% | 30/100 | Charts/tables present but client-rendered, no captions/alt-text-equivalent data summaries for AI extraction |
| Authority & Brand Signals | 20% | 55/100 | Organization/WebSite JSON-LD present with correct brand name; no visible author/date/citation signals; brand-mention presence off-site unverified |
| Technical Accessibility | 20% | 85/100 | robots.txt fully open (no bot-specific rules at all), Next.js SSR/prerender, llms.txt present and well-formed |

## Findings

### 1. robots.txt has no AI-crawler-specific rules — default allows everything (informational, mostly good)
- **Severity**: Info
- **Description**: `https://bourssanj.ir/robots.txt` contains only a generic `User-Agent: *` block with `Allow: /` and disallows for `/admin`, `/api`, `/auth`, `/dashboard`, `/portfolio`. There are no explicit entries for GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, anthropic-ai, or cohere-ai — meaning all of them fall under the wildcard `Allow: /` and are **not blocked**. This is favorable for AI search visibility but is passive rather than intentional (no verification it will stay this way, and no separate policy for training-only crawlers like CCBot/anthropic-ai/cohere-ai per the optional-block guidance).
- **Recommendation**: Add explicit `User-agent` blocks for GPTBot, OAI-SearchBot, ClaudeBot, and PerplexityBot with `Allow: /` to make the intent unambiguous and auditable, and decide deliberately whether to `Disallow: /` for CCBot / anthropic-ai / cohere-ai (training-only bots) if the site wants indexing/citation but not model-training scraping.

### 2. llms.txt is present and well-formed
- **Severity**: Info (positive finding)
- **Description**: `https://bourssanj.ir/llms.txt` returns HTTP 200 with a correct Markdown structure: H1 brand name "بورس سنج (Bourssanj)", a one-line description, a non-advice disclaimer, and a linked list of key sections (سهام, صندوق‌ها, تحلیل تکنیکال, سیگنال‌ها). This is one of the stronger GEO assets on the site and correctly uses the accurate brand name "بورس سنج" (not the common misspelling "بورسنج"). No RSL 1.0 licensing block was found alongside it.
- **Recommendation**: Extend llms.txt with a licensing/RSL section if the site wants to control AI-training use of its market-data content, and add 2-3 more lines per section giving a concrete example of the kind of question each page answers (e.g., "قیمت لحظه‌ای سهام فولاد چند است؟") to increase the odds an LLM routes a query here.

### 3. No long-form or answer-style content exists anywhere on the site — critical citability gap
- **Severity**: Critical
- **Description**: Crawling the homepage and key pages (`/`, `/stocks`, `/funds`, `/technical`, `/signals`, `/valuation`, `/analysis`) via `render_page.py --mode auto --json` (trafilatura `extracted_text`) shows every page is a data dashboard/tool with short UI copy only. Homepage extracted text is a list of nav labels and one-line feature blurbs (~170 words total across the whole page); `/funds` extracted text is 169 characters (mostly nav) followed by "در حال بارگذاری…" (loading spinner text) because the actual fund data loads client-side after hydration. There is no page anywhere in the sitemap (checked `sitemap.xml`, 20+ URLs) that is an article, explainer, or Q&A. Zero passages fall in the optimal 134-167 word citable range because there are no self-contained prose passages at all — everything is either a UI label or numeric data injected client-side.
- **Recommendation**: Add a content layer — e.g., `/funds/{symbol}` and `/stocks/{symbol}` detail pages with a static, SSR'd 130-170 word summary answering "نماد X چیست و NAV/قیمت امروز چند است؟", plus a `/glossary` or `/faq` section with question-based H2s (e.g., "صندوق طلا چگونه کار می‌کند؟") each followed by a direct 40-60 word answer. This is the single highest-leverage change for AI citation, since ChatGPT/Perplexity/AI Overviews cite extractable prose, not live widgets.

### 4. Market data and charts are injected client-side, invisible to non-JS-executing crawlers
- **Severity**: High
- **Description**: Pages like `/funds` and `/stocks` render a loading placeholder ("در حال بارگذاری…") in the raw/SSR HTML captured by `render_page.py` (`is_spa: false` per shell detection, but the actual numeric content — prices, P/E, NAV, change % — populates after client-side fetch). `render_page.py --mode auto` did not need to invoke Playwright (`mode_used: "raw"`), confirming the shell itself is server-rendered, but the data tables inside are not in that shell. GPTBot, ClaudeBot, and PerplexityBot's crawlers execute limited or no JavaScript, so the actual numbers users would want cited (e.g., "قیمت صندوق طلا امروز") are likely not visible to them.
- **Recommendation**: Server-render (or statically generate with revalidation) the current numeric snapshot directly into the initial HTML for `/stocks`, `/funds`, `/funds/{symbol}`, and `/monitor/*` pages — at minimum a `<noscript>`-safe summary table with today's key figures — so AI crawlers can extract current data without executing JS. Next.js `generateStaticParams` + ISR (`revalidate: 300`) fits the existing 5-minute cron cadence already used for stocks-live data.

### 5. No question-based headings or structured Q&A blocks
- **Severity**: Medium
- **Description**: All observed H1/H2-equivalent headings are declarative UI labels ("سهام به تفکیک صنعت", "دیدبان صندوق‌ها") rather than questions. There are no `FAQPage` or `QAPage` schema blocks detected in the JSON-LD (only `Organization` and `WebSite` types found on the homepage).
- **Recommendation**: Where a content layer is added (see Finding 3), phrase section headings as questions Persian users actually type into ChatGPT/Perplexity (e.g., "بهترین صندوق طلا کدام است؟", "ارزش معاملات بورس امروز چقدر است؟") and mark them up with `FAQPage`/`Article` JSON-LD to increase extraction confidence.

### 6. Authority signals are thin: no authorship, no publication dates, no external citations
- **Severity**: Medium
- **Description**: `publication_date` returned `null` from htmldate extraction on the homepage. No author/byline, no "منبع" (source) citations for figures, and JSON-LD is limited to generic `Organization`/`WebSite` types — no `Person` (author), no `NewsArticle`/`Article` with `datePublished`/`dateModified`, despite the site pulling from Codal and live market feeds that could be cited as sources.
- **Recommendation**: For any editorial content added (analysis pages, fund cards, Telegram-sourced reports already produced by the content pipeline), include visible "منبع: کدال" / "به‌روزرسانی: [تاریخ]" lines and matching `Article`/`dateModified` schema. This directly targets the Authority & Brand Signals dimension and the entity-presence factor AI systems weight when deciding what to cite.

### 7. Brand mention signals (Wikipedia / Reddit / YouTube / LinkedIn) could not be verified live
- **Severity**: Info / needs manual follow-up
- **Description**: Live SERP/social-mention lookups for "بورس سنج" were not obtainable in this session (Google search fetch was blocked by a consent-redirect, and no DataForSEO MCP tools were available for `ai_optimization_chat_gpt_scraper` / `ai_opt_llm_ment_search`). On-site signals are consistent and correct: the JSON-LD `Organization.name` and `llms.txt` H1 both use the accurate brand name "بورس سنج", with no on-site occurrence of the misspelling "بورسنج" found.
- **Recommendation**: Manually check (or re-run with DataForSEO MCP enabled) for "بورس سنج" mentions on Wikipedia (Persian), Reddit/related forums, YouTube, and LinkedIn — per the correlation data, YouTube mentions (~0.737) and Wikipedia entity presence correlate most strongly with AI citation likelihood. Also monitor for the "بورسنج" misspelling being used by third parties, since brand confusion could fragment citation signal between two name variants.

## Platform-Specific Readiness (qualitative, no live scraping performed)

| Platform | Readiness | Rationale |
|---|---|---|
| Google AI Overviews | Low-Medium | Structured data + SSR shell help, but no crawlable prose to surface as an overview snippet |
| ChatGPT (browsing/search) | Low | No long-form answer content; llms.txt is a good signal but insufficient alone |
| Perplexity | Low-Medium | Open robots.txt and SSR shell aid crawling; still needs citable passages |
| Bing Copilot | Low-Medium | Same technical accessibility strengths, same content gap |

## Top 5 Highest-Impact Changes

| # | Change | Effort | Impact |
|---|---|---|---|
| 1 | Add SSR'd content layer (symbol/fund detail pages + FAQ/glossary with 130-170 word direct answers) | High (multi-day) | Highest — unlocks citability entirely |
| 2 | Server-render current numeric snapshots into initial HTML instead of client-fetch-only | Medium (1-2 days, reuse existing 5-min cron data) | High — makes live data extractable by AI crawlers |
| 3 | Add explicit GPTBot/OAI-SearchBot/ClaudeBot/PerplexityBot rules to robots.txt + decide on CCBot/anthropic-ai/cohere-ai | Low (30 min) | Medium — clarity/auditability, not a current blocker |
| 4 | Add `Article`/`FAQPage` schema + visible source/date lines ("منبع: کدال", "به‌روزرسانی: ...") to new content pages | Medium | Medium-High — authority signal |
| 5 | Expand llms.txt with example questions per section + RSL licensing block | Low (1-2 hours) | Low-Medium — incremental |
