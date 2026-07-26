# Design Bees Sales Navigator Operator Pack

Ian's authoritative playbook for LinkedIn Sales Navigator and Dripify. Read it before building any search, split or sequence. Researched and compiled 2026-07-26 from current Sales Navigator documentation and practitioner guides, joined to Design Bees' own client evidence. Where this pack states a Design Bees number, it carries the source; where it states a platform mechanic, verify against the live product if a search behaves unexpectedly — LinkedIn ships changes without notice.

**The standing rule: every split is a hypothesis until Dripify results prove it.** Record the reasoning behind every list you build, so when the weekly export lands the hive can score the split against real accept/reply rates. Never state a reply rate, acceptance rate or conversion expectation as fact unless it came from our own campaign data or this pack names its source.

---

## 1. Who we hunt (the settled ICP)

From AJ's client history, enrichment and demo-conversion record — not theory:

- **Primary: in-house marketing decision-makers** — Marketing Manager → Head of Marketing → CMO — at **11–200 staff** companies. They have recurring collateral needs, no in-house design team (or an overloaded one), and budget authority or a short path to it.
- **Secondary: small-business founders** — 1–10 staff, especially new ventures. They buy identity work: logo, branding, launch collateral. Expect smaller plans (Worker Bee / Buzz Basics) and project-shaped engagements — Richard Lowe (logo + branding in 48h on Buzz Basics) and Peter Nittes (deliberate ~3-month full logo suite) are the canonical examples. That shape is a win, not a churn risk.
- **Industries where we already win:** IT services/software, health care, education, construction, insurance. Weight searches toward these; treat other industries as experiments to be validated by Ian against client history before they get volume.
- **Geography:** Australia first — the time-zone promise ("working in your time zone", AEST 9–5) is a differentiator that only lands with AU prospects. NZ acceptable as adjacent.
- **Exclusions, always:** existing clients and anyone already contacted (dedupe against the master list and CRM before anything is sequenced); internal contacts; competitors' staff; recruiters.

## 2. Lead filters that matter (of the ~34 available)

The filters that do the work for our ICP, and how to set them:

- **Geography:** Australia (country) or metro-level (Sydney, Melbourne, Brisbane) when a split needs it.
- **Company headcount:** 11–50 and 51–200 for the marketing ICP; 1–10 for founders. Run these as separate searches, never blended — messaging differs.
- **Function:** Marketing for the primary ICP.
- **Seniority level:** Manager, Director, VP, CXO — combined with function, this is cleaner than title matching alone.
- **Current job title:** use for precision passes — "Marketing Manager" OR "Head of Marketing" OR "Marketing Director" OR "Brand Manager". Boolean in the title field beats keyword soup.
- **Years in current company / position:** under 1 year approximates the changed-jobs trigger with a wider window than the 90-day spotlight; 1–3 years = settled with budget cycles.
- **Company type:** privately held skews toward decision speed; avoid public-sector unless a split targets education deliberately.
- **Company headcount growth** (account-level, via account search or the lead filter where exposed): growing companies hire marketing before design — a growth company with a marketing hire and no design hire is the exact Design Bees moment.
- **Keywords:** last resort, noisy — a keyword hit can be anywhere in the profile. Prefer structured filters; use keywords only to exclude ("-recruiter", "-freelance").

**Boolean rules (title field):** quotes for exact phrases, OR in caps between variants, AND to combine requirements, NOT (or minus) to exclude. Build variants list once per persona and reuse: the marketing-title set, the founder-title set ("Founder" OR "Co-Founder" OR "Owner" OR "Managing Director").

## 3. Spotlights — what each one really signals

Spotlights sit above results and filter by buyer behaviour. What they mean **for us**:

- **Changed jobs (past 90 days).** For the marketing ICP this is the classic trigger: new in role, wants visible wins fast, inherits stale brand collateral, has or can get budget. First 90 days is the window. For **founders** it usually means *they just became one* — a new venture needing identity work. High intent, small pool, noisier (some are founders who left for employment; glance before sequencing). AJ's live founder search 2026-07-26: 14k results → 316 changed jobs → Tier 1.
- **Posted on LinkedIn (past 30 days).** Reachability, not intent. These people log in, so connection requests get seen and sequences actually deliver. The volume engine of any split. Same founder search: ~2k → Tier 2.
- **Mentioned in news (past 30 days).** For founders: launch or raise coverage = a spend moment and a natural, non-creepy opener. Small pool, high value.
- **Following your company.** Warmest possible cold outreach — they already know Design Bees. Tiny pool; check it every run and never waste it on generic messaging.
- **Shared experiences/connections.** Improves acceptance modestly; use as a tie-breaker between otherwise equal leads, not a primary filter.
- **Buyer intent / viewed your company page (2026 additions).** LinkedIn's AI-scored in-market signal and a 90-day company-page-viewer filter. Treat as promising but unproven for us — sequence separately and let Dripify results say whether the signal is real before trusting it with volume.

**Spotlight doctrine:** spotlights are mutually exclusive views of one pool — the same person can sit in several. Pull tiers in priority order (followers → changed jobs → news → posted) and dedupe forward, so each lead lands in exactly one tier and the results are attributable.

## 4. The tier doctrine for any split

1. **Tier 0 — Following Design Bees.** Always check first. Personal, direct, reference what we do; no template.
2. **Tier 1 — Trigger tiers.** Changed jobs; mentioned in news. Messaging opens on the trigger (new role / new venture / the coverage), then bridges to one concrete pain from the hive's evidence.
3. **Tier 2 — Active tier.** Posted in 30 days. Evergreen pain-led messaging; this is where Ricky's evidenced pains (e.g. hire-vs-subscribe with fluctuating workload) become the opener.
4. **Tier 3 — Cold remainder.** Only after tiers 0–2 are exhausted, only with the tightest firmographic cut, and lowest daily volume.

**The 500-contact drill** (AJ's standing test): split ≈ Tier 0 (all of it) + Tier 1 (all, usually 200–400) + Tier 2 to fill, weighted toward win-industries and 11–200 staff, deduped against everyone previously contacted, each tier with its own messaging note for Sam and its own Dripify campaign so results are attributable per tier. Deliver as: filters per tier, expected pool size, the hypothesis each tier tests, and what result would kill or scale it.

## 5. Saved searches, lists and alerts — the compounding layer

- **Saved searches are the standing radar.** One per persona × territory (e.g. "AU Marketing Mgr 11–50", "AU Founders 1–10 new"). Sales Nav surfaces *new results since last visit* — that delta is the freshest possible outreach pool and should feed each week's Dripify intake.
- **Lead lists mirror the tiers.** One list per tier per campaign, named `YYYY-MM tier# persona` so exports join cleanly to hive knowledge.
- **Alerts on saved leads** (job changes, posts, news) are follow-up triggers for warm-but-not-converted leads — a demo no-show who changes jobs is a fresh conversation, not a dead lead.

## 6. Dripify mechanics and safety (2026 state)

- LinkedIn's effective ceiling is **~100 connection requests per week** (dynamic — account age, SSI and acceptance rate move it; a throttled account can be at 20–30). Dripify's own cap is 75/day but the weekly LinkedIn ceiling binds first. **Plan splits around ~100 invites/week, not per day.**
- **Acceptance rate above ~25% is the safety line** — low acceptance is the strongest throttling predictor. If a tier's acceptance runs below that in the weekly export, pause the tier and fix targeting or messaging before resuming. This is also why tiering matters: Tier 2 (active users) protects the acceptance rate that Tier 3 spends.
- **Connection notes under 300 characters, specific, no pitch.** The trigger reference (new role, the post they wrote, the news) is the note; the pitch waits for the sequence.
- Withdraw invites pending older than ~3–4 weeks — a large pending pile is a spam signal.
- Sequences: connect → wait ≥2 days → value message keyed to the tier's pain hypothesis → wait → soft demo ask. Never more than one ask per message. All sequence copy goes through Sam (it must clear his voice rules) and AJ approves before a campaign starts.
- **Weekly export is non-negotiable.** Every campaign's results go to the hive (`/ingest/dripify`) so accept/reply per tier becomes knowledge. A campaign whose results never come back teaches nothing and wasted its sends.

## 7. Evidence rules for Ian

- Pool sizes: state them only after running the search (AJ's screenshots or exports count).
- Accept/reply/conversion rates: only from our own Dripify exports, cited by campaign — or clearly labelled as an untested hypothesis.
- Every split records: filters used, tier logic, pool sizes, the hypothesis, and the messaging angle handed to Sam. That record is what makes campaign N+1 smarter than campaign N.
- When the evidence is thin, say so and ship the split anyway with the hypothesis labelled — outreach is the experiment that produces the evidence.
