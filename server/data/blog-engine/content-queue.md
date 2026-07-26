# Design Bees AEO Blog Engine: queue + runbook

Purpose: win AEO/SEO for Design Bees on commercial-intent design queries. AEO is the method, design is the subject. Never write about AEO as a topic.

## Operating rules
- Cadence: 2 posts per week, published Tuesday and Thursday.
- Mode: draft + approve. Each run queues drafts to `blog-drafts/` for AJ. No auto-publish.
- Author byline: AJ Kavanagh.
- Site: Design Bees (Wix site id aa112b96-b980-49fa-8f7f-202343661708).
- Voice: L99. Read `blog-engine/L99-voice.md` and follow every hard ban. Run the L99 quality check before queueing.
- Hard guardrails: never promote or imply AI design solutions (Design Bees is human design); never name clients in body copy; answer-first structure with question H2s and an FAQ block for FAQPage schema; fact-check every figure.

## Categories (live on the Design Bees blog; use these IDs)
1. Outsourcing Design — id c8b497ec-97f8-4897-acc1-42769e4988cf — slug outsourcing-design
2. Design Costs & Budgeting — id 7b05afa1-e3f3-4e14-9cc8-a4809cdffd77 — slug design-costs-budgeting
3. Design Operations — id baf159e1-105b-49aa-9169-09541949c584 — slug design-operations

Wix site id: aa112b96-b980-49fa-8f7f-202343661708. Blog category list endpoint: GET https://www.wixapis.com/blog/v3/categories
Author member ID (AJ Kavanagh, for draft-post creation): b28d6c97-3735-4d9a-9313-447e4db61f52
Note: the blog already has other categories (incl. "Graphic Design Subscriptions") and existing posts; stick to the three above for this engine unless AJ says otherwise.

## CTAs and internal links
- Primary CTA: book a demo, https://designbees.com.au/demo
- Secondary CTA: start your free 10-day trial, https://designbees.com.au/pricing-plans
- Supporting internal links: https://designbees.com.au/our-work , https://designbees.com.au/case-studies , https://designbees.com.au/reviews , https://designbees.com.au/pricing-plans
- Demo before trial. Lead with demo, offer trial as the second option.

## Cover image (supplied by AJ)
- AJ provides the cover images. Do not generate covers (Canva is not used).
- Covers live in `blog-drafts/covers/`, named to match the queue, e.g. `post-02-cover.png` (or by slug). The matching is by queue number.
- Per run: pair each draft with its supplied cover. Quick-check the file exists and is a usable landscape image. If a cover is missing for a queued post, still write and queue the draft, and flag the missing cover in the summary so AJ can drop it in before publish.

## Queue
Post titles are the full question form for AEO (used as H1 and SEO title). Covers supplied by AJ, matched by queue number from blog-drafts/covers/. Posts marked AJ-MANUAL are written by AJ, not the lane; skip them.

1. How much does it cost to outsource graphic design in Australia? | Design Costs & Budgeting | DONE (drafted)
2. In-house vs outsourced design: which is cheaper for a growing business? | Design Costs & Budgeting
3. Are unlimited graphic design subscriptions worth it? | Design Costs & Budgeting
4. How much should a small business budget for graphic design? | Design Costs & Budgeting
5. Best Design Subscriptions for Australian Startups (2026) | Design Costs & Budgeting | AJ-MANUAL (skip; names competitors)
6. Top 7 Design Subscriptions for Creative Teams (2026) | Design Costs & Budgeting | AJ-MANUAL (skip; names competitors)
7. The best way for an Australian small business to outsource graphic design | Outsourcing Design
8. How fast should outsourced design be? Realistic turnaround times | Outsourcing Design
9. How to keep your brand consistent with an outsourced design team | Outsourcing Design
10. How to manage design requests without hiring a designer | Design Operations
11. How many design hours does your business actually need each month? | Design Operations

## Per-run procedure
1. Pick the next two unpublished items from the queue (top down). Skip AJ-MANUAL posts (5 and 6) and anything already in `blog-drafts/` or published.
2. For each, run Perplexity (`mcp__Perplexity__perplexity_search`, model sonar-pro) to pull current sub-questions, the exact phrasings people use, and supporting facts/figures. Verify any figure before using it.
3. Write the post in L99 voice: answer-first opening with the key number/answer, question-shaped H2s, 1,200 to 1,800 words, internal links and CTAs per above, an FAQ block (reader-voice questions) for FAQPage schema. Run the L99 quality check.
4. Pair the post with AJ's supplied cover from `blog-drafts/covers/` (matched by queue number). If none is present, flag it in the summary; do not generate one.
5. Queue draft (markdown + metadata: slug, meta title under 60, meta description under 155, category, tags, schema) plus the cover PNG to `blog-drafts/`. Name files `post-NN-slug.md`.
6. Post a short summary to AJ listing the two drafts and covers, ready for approval. Do not publish.
7. On AJ approval, publish to Wix: create draft post (author byline AJ, category, SEO slug/meta, cover), then publish. Space Tuesday and Thursday. Convert body to Wix rich content with explicit paragraph nodes so spacing does not collapse, and screenshot-check the live post before it goes public.
