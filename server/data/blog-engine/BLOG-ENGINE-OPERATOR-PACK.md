# Design Bees Blog Engine — Operator Pack

Everything a Claude agent needs to research, write, and publish a Design Bees blog post end to end. Read this in full before your first run. If anything here conflicts with a live file in `blog-engine/`, the live file wins and you flag the conflict to AJ.

---

## 1. What this engine is for

Win AEO (AI answer engines: ChatGPT, Claude, Gemini, Perplexity) and organic SEO for Design Bees on commercial-intent design queries. Buyers ask AI assistants questions like "how much does it cost to outsource design in Australia" and "is a design subscription worth it". These posts are the answer they get quoted back.

AEO is the method. Design is the subject. **Never write a post about AEO itself.** Every post answers a real buying question about outsourcing design, design cost, or design operations.

Design Bees is a human design service. Australian, Surry Hills based, works in the client's time zone. Monthly design plans, no contracts, cancel anytime, free 10-day trial.

---

## 2. Non-negotiables (read these twice)

These override everything. Breaking one means the post gets pulled.

- **Human design only.** Never promote, mention, or imply AI does the design. Do not reference any AI design tool. Design Bees is people.
- **Never name a client in body copy.** Named clients are allowed only inside formal testimonials or case studies with permission, never in a blog body. Default to anonymous framing ("a retail client", "an agency we work with").
- **Never name a competitor in body copy.** Queue items marked AJ-MANUAL name competitors on purpose and are written by AJ, not you. Skip them.
- **No em dashes. No double hyphens.** Use commas, full stops, or line breaks. This is the single most common failure. Check twice.
- **Fact-check every figure.** No number goes in a post unless you verified it this run. If you cannot verify it, cut it or soften to a range you can stand behind.
- **Draft, do not auto-publish.** Every run queues drafts for AJ. Publishing happens only after AJ says approve.
- **Late-night rule.** No publishing actions between 22:00 and 05:00 Australia/Sydney time.
- **Author byline is always AJ Kavanagh.**

---

## 3. The voice: L99

This is the Design Bees website and blog voice. Full spec lives at `blog-engine/L99-voice.md`. Reproduced here so you have it in one place. Run the quality check in section 10 against every draft.

### 3.1 What L99 sounds like

A competent operator who runs a design service, talking to another operator who is evaluating it. The reader is already on the page. They came from a search, an ad, or a link. You are not cold pitching. You are landing the one insight that confirms they are in the right place, then making the decision easy.

- Second person, direct. "You", "your". No "most teams we speak with" hedging. They are in front of you.
- Lead every section with the insight that earns the scroll. No throat-clearing intros.
- Use the reader's vocabulary, not agency jargon.
- Concrete metrics and moments. "8 to 12 hours a week", "two weeks before the drop", "set up in 24 hours".
- Australian register. "Worth a look", "back pocket", "house style", "no worries".
- Warm without performing. Direct without sales pressure. Honest about what Design Bees is and is not.

Bible phrases that sit naturally: "No contracts, cancel anytime", "Start your free 10-day trial", "Brief your first project on day one", "A full creative studio at your fingertips", "Designed for Aussie businesses, working in your time zone".

### 3.2 Hard bans (voice level)

- No em dashes, no double hyphens.
- No banned phrases: "Happy to help", "Let me know", "Great question", "Feel free to", "I hope this helps", "Excited to share", "Thrilled to announce", "Humbled and honoured", "As a seasoned professional", "Let us help you".
- No "startup" framing for Design Bees.
- No "ship / shipping / shipped". Use "deliver".
- No AI cadence: no three or more short billboard sentences in a row; no X-not-Y or X-so-Y symmetry; no three-item comma-list parallelism (especially adjectives); no generic gerund openers ("Crafting", "Delivering", "Empowering").
- No competitor names in body copy.

### 3.3 Structure rules

- Body paragraphs 2 to 4 sentences, mixed lengths. Vary them so it does not read like a machine.
- Hero headline (H1) 12 words or more is fine for a question title. Section subheads (H2) short and sub-insight shaped.
- Bullet lists capped at 5 items. Do not force parallel structure.
- FAQ answers 2 to 3 sentences in L99 voice, questions in the reader's own words.

---

## 4. Site facts, categories, and IDs

Everything you need to address the right Wix property and slot the post into the right category.

| Thing | Value |
|---|---|
| Wix site id | `aa112b96-b980-49fa-8f7f-202343661708` |
| Author member id (AJ Kavanagh) | `b28d6c97-3735-4d9a-9313-447e4db61f52` |
| Blog categories endpoint | `GET https://www.wixapis.com/blog/v3/categories` |

**Approved categories (use only these three unless AJ says otherwise):**

| Category | Category id | Slug |
|---|---|---|
| Outsourcing Design | `c8b497ec-97f8-4897-acc1-42769e4988cf` | `outsourcing-design` |
| Design Costs & Budgeting | `7b05afa1-e3f3-4e14-9cc8-a4809cdffd77` | `design-costs-budgeting` |
| Design Operations | `baf159e1-105b-49aa-9169-09541949c584` | `design-operations` |

The blog has other categories and older posts. Ignore them. This engine uses the three above.

---

## 5. CTAs and internal links

Demo first, trial second. Every post drives a demo. Trial is the second option.

| Purpose | Anchor guidance | URL |
|---|---|---|
| Primary CTA | "book a demo" | `https://designbees.com.au/demo` |
| Secondary CTA | "start your free 10-day trial" | `https://designbees.com.au/pricing-plans` |
| Supporting link | "the work these plans produce" | `https://designbees.com.au/our-work` |
| Supporting link | "case studies" | `https://designbees.com.au/case-studies` |
| Supporting link | "reviews" | `https://designbees.com.au/reviews` |
| Supporting link | "plans and pricing" | `https://designbees.com.au/pricing-plans` |

Rules:
- The demo URL is the bare link `https://designbees.com.au/demo`. Never wrap or add tracking.
- Work at least one demo CTA and one trial CTA into every post, usually the demo mid-to-late and both near the end.
- Weave 2 to 4 supporting internal links into the body where they are genuinely useful, not stacked in a block.

---

## 6. Pricing framing (canonical)

Plans and prices are firm. Use these exact names, AUD inc GST amounts, and monthly hours whenever pricing appears. This is the locked ladder (confirmed by AJ 2026-07-26).

| Plan | Price (AUD inc GST) | Monthly hours | Effective rate |
|---|---|---|---|
| Worker Bee | $545 / month | 16 hours | roughly $34/hr |
| Buzz Basics | $995 / month | 30 hours | roughly $33/hr |
| Honey Comb | $1,645 / month | 53 hours | roughly $31/hr |
| Nectar Pro | $2,645 / month | 74 hours | roughly $36/hr |

Framing pattern, e.g. "Worker Bee at $545/mo is about 16 hours of design a month, roughly $34 an hour". Effective rate sits around $31 to $36 an hour across the ladder, so "roughly $30 to $35 an hour" is a safe blanket framing.

> **The old 20 / 33 / 55 / 88 hours ladder is retired. Do not use it.** Any existing draft or published post quoting those numbers (post-11 does) is now wrong and needs a correction pass before it publishes.

Never call these "three plans". There are four. Never write "Honeycomb Plus" or any variant. The names are exactly Worker Bee, Buzz Basics, Honey Comb, Nectar Pro.

---

## 7. The queue

Canonical queue lives at `blog-engine/content-queue.md`. Titles are the full question form, used as both H1 and SEO title. Each has a fixed category. Covers are matched by queue number.

**How to pick each run:**
1. Read `blog-engine/content-queue.md`.
2. Go top down. Pick the next two items that are NOT already drafted in `blog-drafts/` and NOT published.
3. Skip anything marked AJ-MANUAL (competitor round-ups AJ writes himself).
4. If the queue is exhausted, do not invent topics. Report exhaustion to AJ and propose candidate questions in the three approved categories for him to approve into the queue.

**Current state as of this pack (2026-07-26):** the 11-item queue is fully drafted except the two AJ-MANUAL items. The engine needs fresh queue items before it can draft again. Candidate questions are in AJ's hands.

When adding new items, keep the format: `N. Full question title | Category | (status)`. One question per post, commercial intent, answerable honestly by a human design service.

---

## 8. Per-run procedure (write path)

> Before you write, two things gate the work: the query has to be worth competing for (section 15) and you need its keyword cluster mapped (section 16). For queue items AJ has already curated, the go/no-go is effectively passed, but still run the keyword step. For any query you propose yourself, run both gates first. The AEO and SEO principles in section 17 apply to every post.

For each of the two picked posts:

**Step 1. Research with Perplexity.**
Tool: `mcp__Perplexity__perplexity_search`, model `sonar-pro`.
Pull: the current sub-questions people ask under this topic, the exact phrasings buyers use (mine these for H2s and the FAQ), and supporting facts or figures. Run more than one query if the topic has distinct angles (cost, process, timing).
**Fact-check every figure** before it goes in the post. If Perplexity gives a number, confirm it is current and sane. Australian-specific where the topic is Australian (salaries, hourly rates, super).

**Step 2. Write the post in L99 voice.**
- **Answer-first opening.** First paragraph gives the direct answer, including the key number or range. A buyer or an AI assistant should be able to quote paragraph one and be correct. Second paragraph bridges into the detail.
- **Question-shaped H2s.** Every section heading is a question a buyer would type or ask. Answer it in the first sentence under the heading.
- **Length 1,200 to 1,800 words.**
- **Internal links and CTAs** per section 5. Demo CTA and trial CTA both present.
- **Pricing** per section 6 if the post touches cost.
- **FAQ block** at the end. 4 to 6 questions in the reader's voice, each answered in 2 to 3 L99 sentences. This block feeds the FAQPage schema, so keep questions and answers clean and self-contained.

**Step 3. Run the L99 quality check** (section 10). Fix every flag before saving.

**Step 4. Pair the cover** (section 9).

**Step 5. Save the draft** (section 11) with its full metadata block.

**Step 6. Report to AJ.** Short Debra-voice summary naming the two drafts, their categories, and cover status. Do not publish.

---

## 9. Cover images

- **AJ supplies covers. You never generate them.** No Canva, no image tools.
- Covers live in `blog-drafts/covers/`, named by queue number: `post-02-cover.png`, `post-11-cover.png`, and so on.
- Per run, confirm the matching cover file exists and is a usable landscape image.
- If the cover is missing, still write and queue the draft, and flag the missing cover in your summary so AJ can drop it in before publish. Never block a draft on a missing cover, never substitute one.

---

## 10. L99 quality check (run before saving every draft)

Scan every section. Any hit means rewrite that section, then re-scan.

- [ ] Em dashes or double hyphens anywhere. (Most common failure.)
- [ ] Banned phrases (section 3.2).
- [ ] "ship / shipping / shipped".
- [ ] Three or more short billboard sentences in a row.
- [ ] X-not-Y or X-so-Y symmetry.
- [ ] Three-item comma list of adjectives.
- [ ] Generic gerund opener ("Crafting", "Delivering", "Empowering").
- [ ] Generic sentences that could apply to any business. Cut or make specific.
- [ ] Section subheads that are statements instead of buyer questions.
- [ ] Bullet lists over 5 items.
- [ ] Demo CTA present. Trial CTA present.
- [ ] Canonical plan names and prices if pricing appears.
- [ ] Answer-first opening with the key number in paragraph one.
- [ ] FAQ block present with reader-voice questions.
- [ ] No AI design mention or implication.
- [ ] No client names, no competitor names in body.
- [ ] Every figure fact-checked this run.

---

## 11. Draft file format and metadata

Save each draft to `blog-drafts/` named `post-NN-slug.md` where NN is the queue number and slug is the URL slug.

Every draft opens with this metadata header, then a `---`, then the body starting with the H1. Copy this template:

```markdown
# DRAFT FOR REVIEW: Post NN (L99 voice)

**Status:** Draft, awaiting AJ approval. Not published.
**Goal:** Win the AI answer + organic ranking for "<the buyer query>" (<buyer stage / intent>).
**Author byline:** AJ Kavanagh
**Category:** <Category name> (id <category-id>)
**Tags:** <5 to 7 comma-separated tags>
**URL slug:** <kebab-case-slug>
**Meta title (under 60 chars):** <title>
**Meta description (under 155 chars):** <description with the answer + a reason to click>
**Schema:** Article + FAQPage
**Internal links:** designbees.com.au/demo, designbees.com.au/pricing-plans, <others used>
**Cover:** blog-drafts/covers/post-NN-cover.png (present / MISSING)
**AEO note:** <one line on the answer-first hook and FAQ logic>
**Word count:** ~<count>

---

# <Full question title as H1>

<answer-first opening...>
```

Metadata rules:
- **Meta title under 60 characters.** Front-load the query. Title case.
- **Meta description under 155 characters.** Lead with the answer, give a reason to click.
- **Slug** is kebab-case, matches the question, no stop-word padding. e.g. `how-many-design-hours-does-your-business-need`.
- **Schema** is always `Article + FAQPage`.
- **Tags** 5 to 7, lowercase, buyer-vocabulary.

Gold-standard reference to match for structure, depth, and voice: `blog-drafts/post-11-how-many-design-hours-does-your-business-need.md`.

---

## 12. Publishing to Wix (only after AJ approves)

Do not touch this section until AJ replies "approve" (or "approve post NN"). Publishing is a separate, explicit step.

### 12.1 Connector and tools

Use the connected Wix MCP server (tool names `mcp__...__ExecuteWixAPI`, `mcp__...__CallWixSiteAPI`, `mcp__...__UploadImageToWixSite`, plus the Wix REST docs search tools). The Blog API is the Wix Blog v3 REST API. Confirm the tools are connected at run time. If the Wix connector is not authorised in the session, stop and tell AJ it needs authorising before publish.

Known write path: draft posts are created and updated against the Blog v3 draft-posts resource (create draft, then PATCH/update the draft with body and metadata, then publish). Keep `richContent` under ~30KB per post; a 1,200 to 1,800 word post is comfortably inside that.

### 12.2 Convert the markdown body to Wix rich content

Wix stores body as a Ricos rich-content node tree, not markdown. **Convert explicitly. Do not paste markdown.** The critical rule: **insert an explicit empty PARAGRAPH node between blocks so vertical spacing does not collapse.** Without the empty paragraphs the whole post renders as one dense wall.

Node shapes (see `blog-drafts/post-01-richcontent.json` for a full worked example):

- Paragraph:
```json
{"type": "PARAGRAPH", "id": "<short-id>", "nodes": [{"type": "TEXT", "id": "", "nodes": [], "textData": {"text": "<paragraph text>", "decorations": []}}], "style": {}, "paragraphData": {"textStyle": {"textAlignment": "AUTO"}}}
```
- Heading (H2 = level 2):
```json
{"type": "HEADING", "id": "<short-id>", "nodes": [{"type": "TEXT", "id": "", "nodes": [], "textData": {"text": "<heading text>", "decorations": []}}], "style": {}, "headingData": {"level": 2, "textStyle": {"textAlignment": "AUTO"}}}
```
- Spacer between blocks (this is the anti-collapse node):
```json
{"type": "PARAGRAPH", "id": "<short-id>", "nodes": [], "style": {}, "paragraphData": {"textStyle": {"textAlignment": "AUTO"}}}
```
- Links: apply a LINK decoration on the TEXT node for the anchor text. Point the demo anchor at `https://designbees.com.au/demo`, trial anchor at `https://designbees.com.au/pricing-plans`.
- Bullets: use the BULLETED_LIST / LIST_ITEM node types. Keep to 5 items max.

Every `id` just needs to be unique and short (8 chars, alphanumeric). Bold for the FAQ questions uses a `"decorations": [{"type": "BOLD"}]` on the TEXT node.

### 12.3 Publish steps

1. Upload the cover to the site (`UploadImageToWixSite` or the media path) and capture the returned image reference. Set it as the post cover / hero image.
2. Create the draft post with: title (the H1 / SEO title), author member id `b28d6c97-3735-4d9a-9313-447e4db61f52`, category id (section 4), URL slug, SEO meta title and description, cover image, and the converted rich-content body.
3. Set FAQPage + Article schema. If the Blog UI/API does not expose custom JSON-LD directly, add the FAQ as a proper FAQ section in the body so the structured data can be generated, and note to AJ if manual schema insertion is needed.
4. Publish the draft.
5. **Screenshot-check the live post** before considering it done. Open the published URL, confirm: spacing did not collapse, headings render as headings, links work and point to the right URLs, cover shows, no em dashes slipped through, pricing correct. Read it, do not trust that it published without error.
6. Report the live URL to AJ.

### 12.4 Cadence

Two posts a week, **published Tuesday and Thursday.** Space the two approved drafts across those two days. Respect the late-night rule: no publish actions 22:00 to 05:00 Australia/Sydney.

---

## 13. Fast reference: one run, start to finish

1. Read `blog-engine/content-queue.md`. Pick next two undrafted, non-AJ-MANUAL items. If proposing your own query, clear the five gates in section 15 first.
2. Keyword pass (section 16): map one primary query plus a 3 to 6 term long-tail cluster from Perplexity `sonar-pro` plus live SERP autocomplete and People Also Ask. Check Ahrefs/GSC state; do not invent volumes.
3. Write each in L99: answer-first open, question H2s, direct-answer blocks, 1,200 to 1,800 words, demo + trial CTAs, 2 to 4 deep internal links, FAQ block. Fact-check every figure. Apply section 17 principles.
4. Run the L99 quality check. Fix flags.
5. Confirm the matching cover in `blog-drafts/covers/`. Flag if missing.
6. Save `post-NN-slug.md` with full metadata header.
7. Debra-voice summary to AJ. Do not publish.
8. On "approve": convert to Wix rich content with explicit paragraph spacer nodes, create draft (author AJ, category, slug, meta, cover), publish, screenshot-check live, send URL. Tuesday and Thursday.

---

## 14. Files you will touch

| Path | What it is |
|---|---|
| `blog-engine/content-queue.md` | The queue, categories, CTAs, cover rules, per-run procedure. Source of truth. |
| `blog-engine/L99-voice.md` | The voice spec and quality check. Source of truth. |
| `blog-engine/BLOG-ENGINE-OPERATOR-PACK.md` | This pack. |
| `blog-drafts/` | Where drafts are saved as `post-NN-slug.md`. |
| `blog-drafts/covers/` | AJ's supplied covers, named by queue number. |
| `blog-drafts/post-11-...md` | Gold-standard draft to match. |
| `blog-drafts/post-01-richcontent.json` | Worked example of Wix rich-content node tree. |

If `content-queue.md` or `L99-voice.md` ever disagree with this pack, they win. Flag the drift to AJ so the pack gets fixed.

Deeper source docs, if you need the full reasoning behind sections 15 to 17:
- `06-SEO-AEO/Perplexity-AEO-Roadmap-Thread-2026-06-03.md` — the full AEO roadmap (DAB system, schema stack, query clusters, measurement).
- `06-SEO-AEO/SEO-Audit-designbees-2026-06-04.md` — the site audit and the keyword opportunity table.
- `06-SEO-AEO/designbees_aeo_test_kit.md` — canonical facts, brand AI audit prompts, passage-clarity checkpoints.
- `06-SEO-AEO/Design-Bees-Schema-and-AEO-Recommendations.md` — ready-to-paste JSON-LD for schema.

---

## 15. Is this query worth competing for?

Not every question deserves a post. Run a candidate query through these five gates before it earns a slot. This applies to anything you propose. Queue items AJ curated have effectively passed already.

**Gate 1: Intent match.** Is this a commercial or high-intent query, or idle curiosity? Favour consideration, comparison, and purchase-stage questions where the reader is close to buying: "is a design subscription worth it", "how much does outsourcing design cost in Australia", "how many design hours do I need". Pure informational queries with no path to a demo are low priority. A query has to have a natural bridge to book a demo or start a trial. If you cannot see the bridge, skip it.

**Gate 2: Real demand.** Is there evidence people actually ask this? We do not always have a paid volume tool connected (see section 16), so use the free signals: Perplexity related questions and "people also ask", Google autocomplete and the People Also Ask box on the live SERP, and, once the site-wide Search Console property is verified, the question-format query report (how / what / is / can / best). If an AI engine already returns a substantive answer for the query, that itself confirms demand. If nothing surfaces anywhere, the query is too thin. Skip it.

**Gate 3: Winnability.** Can Design Bees realistically rank or get cited here? The hard-won lesson on this project: do not fight the global head terms. "Unlimited graphic design", "design subscription" and the like are owned worldwide by Design Pickle, Kimp, ManyPixels and Penji. You will not out-rank them on the generic term. **Own the "Australia" angle and the specific long-tail instead.** AU-modified, specific, buyer-stage questions are winnable. Broad global head terms are not. Lower competition plus a specific angle beats high volume every time for this site.

**Gate 4: Answer gap or inaccuracy.** Does the current AI answer miss Design Bees, or get a fact wrong? Query where the answer engines are silent about DB, or where they quote the wrong price (we have seen $499 and $349 bleed in from competitors when the floor is $545), is a high-value target because there is room to become the cited source. A query already answered well with DB featured is lower priority to write fresh, defend the existing page instead.

**Gate 5: Honest fit.** Can a human design subscription answer this truthfully and well, without naming a competitor in the body and without implying AI does the design? If answering it honestly forces a competitor comparison, that belongs on an AJ-MANUAL comparison page, not a blog-engine post. Skip it here.

**Decision:** a query is worth a post when it clears intent, demand, winnability, and fit, and ideally sits on an answer gap. If it is a global head term, or has no commercial bridge, or cannot be answered honestly without a competitor, it is a no-go for this engine. Put strong-but-out-of-scope candidates (comparisons, competitor alternatives) to AJ as AJ-MANUAL suggestions rather than writing them yourself.

---

## 16. Keyword research and how many keywords per post

### 16.1 Tool state (check before you rely on it)

As of the June 2026 audit, **no keyword volume tool was reliably connected.** The Ahrefs MCP is installed in the workspace but needs auth. The site-wide `designbees.com.au` Search Console property was pending DNS verification (only a `/our-work/` prefix was verified, showing zero data). Before quoting any volume or difficulty number, check whether Ahrefs or a verified GSC property is live now. If neither is, your research is qualitative from SERP and AI-engine inspection, and you say so rather than inventing numbers. Never publish a made-up search volume.

### 16.2 The research pass (run before writing each post)

1. **Seed from the queue title.** The title is the primary query in full question form.
2. **Perplexity `sonar-pro`** for the sub-questions people ask under this topic and the exact phrasings they use. These become your H2s and FAQ questions.
3. **Live SERP mining, no tool needed:** Google autocomplete on the seed, the People Also Ask box, and the related searches at the foot of the results. Harvest the real phrasings.
4. **If Ahrefs is authed:** pull volume, difficulty, and current DB ranking for the primary and the variants. Prefer low-to-moderate difficulty AU-modified terms per Gate 3.
5. **If a verified GSC property is live:** check the question-format query report for terms already earning impressions but low clicks. Those are pre-qualified demand.
6. **Map the cluster** to one target category (section 4) and confirm no existing draft or live post already owns it (avoid cannibalising yourself, a real issue flagged in the audit where duplicate pages competed).

### 16.3 How many keywords per post

**One primary query, one post.** Each post targets a single buyer question, which is the H1 and the SEO title. Do not try to rank one post for two unrelated head terms.

Around that primary, build a **tight cluster of 3 to 6 secondary and long-tail variations**. These are not stuffed into the body, they are structured in:
- The **question-shaped H2s**, each answering one secondary query.
- The **FAQ block**, each question a real long-tail phrasing mined in 16.2.
- Natural mentions in the answer-first opening and meta description.

So the working target per post is one primary plus roughly four to six supporting long-tails, all genuinely related to the same buyer intent. If a secondary term pulls in a different direction, it is a separate post, not a second target here. Keyword density is not a lever, passage-level clarity and matching real phrasings is (section 17).

---

## 17. AEO and SEO principles from this project

These are the durable lessons this project has already paid for. They apply to every post.

**Write for passage-level retrieval.** AI engines lift a single paragraph as the answer, so every paragraph must stand on its own. Inverted pyramid: the answer and the key number in the first one or two sentences, detail below. One idea per paragraph, roughly 40 words or less for the answer-carrying ones. This is why the answer-first opening and the question H2s are non-negotiable, not stylistic.

**Use Direct Answer Blocks.** The structure that gets cited: a question heading in the reader's words, a direct answer of one to two standalone sentences under 50 words, then two to four sentences of supporting detail, then an optional internal link. The answer sentence must make sense lifted out on its own, with the specific constraint baked in (price, timeframe, plan, geography). No preamble before the answer.

**Own the Australia angle.** Design Bees wins on local specificity and content depth. It loses head-to-head on generic global terms. Every post should carry the Australian context where it is natural (AEST hours, AU pricing, Australian market), because that is the entity signal competitors cannot match. Do not chase rankings you cannot win.

**Concrete numbers, always correct.** Answer engines substitute a competitor's number when yours is not stated unmissably. We have watched $499 and $349 bleed in when the real floor is $545. Every figure must be exact and current: prices $545 / $995 / $1,645 / $2,645, the four plan names, the 10-day trial (1 job plus up to 4 hours), AEST 9 to 5, no contracts. Fact-check every other figure you introduce.

**FAQPage schema is the highest-value structured data.** It is exactly what answer engines extract. Every post carries a real FAQ block feeding FAQPage schema, plus Article schema with datePublished and dateModified for freshness. The schema text must match the visible on-page text, and carry no CTA inside the schema answer. Google penalises schema for content not shown on the page. Ready-to-paste JSON-LD patterns are in `06-SEO-AEO/Design-Bees-Schema-and-AEO-Recommendations.md`.

**Freshness is a ranking and citation signal.** Posts get a 90-day review: update figures, refresh `dateModified`, add answer blocks for new question-format queries that appear in GSC. Stale content (old years in titles, dead promos) actively hurt the site in the audit.

**Internal links carry equity, so point them at the right page.** The audit found most CTAs pointing back at the homepage, wasting link equity and stranding readers. Point demo anchors at `/demo`, trial anchors at `/pricing-plans`, and supporting links at the specific deep page (`/our-work`, `/case-studies`, `/reviews`), never lazily at the homepage.

**No competitor names in body copy, even though comparison pages are strategy.** The single biggest AEO gap on the site is the missing "Design Bees vs [competitor]" comparison pages. Those are high-value, but they are AJ-MANUAL and live outside this engine. Blog-engine posts stay competitor-free in the body. If your research says a comparison page is the real opportunity, flag it to AJ, do not write it here.

**Measurement is how we know it worked.** Success is tracked through GSC (AI Overview appearances, question-format impressions), a GA4 "AI Search" channel (sessions where the source is perplexity.ai, chatgpt.com, claude.ai, gemini.google.com, bing.com/chat), and a monthly manual brand-audit across ChatGPT, Perplexity and Google AI Overview. You do not run this per post, but write every post knowing that is the scoreboard: getting cited by name, with the right price, on a commercial query.

## Comparison tables: we go first, and we look different

Standing rule from AJ, 2026-07-27. Any table or list that compares Design Bees
against other ways of buying design follows two hard rules:

1. **Design Bees is the first row.** Never last, never buried in the middle.
   A reader scanning a table reads the first row properly and skims the rest.
2. **Our row is visually distinct.** Bold the option name and bold the cells
   where we genuinely win, so the difference is visible before anything is read.

This is presentation, not spin. The honest trade-offs still get stated, and the
sections that say where a hire or an agency beats us stay in. Being first in the
table and being straight about where we lose are not in tension.

**Always include a "try before you commit" column where the comparison allows
it.** The free 10-day trial is the single strongest differentiator in the
offering: close to a fortnight of real briefs and real turnarounds before a
decision, against competitors and hires who want the decision first. It matters
most on any page where the reader is weighing a six or twelve month commitment.

