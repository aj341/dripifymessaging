# Design Bees — The AI Brain

A design & architecture spec for a hive of specialised AI "employees" that
refine, source, create, research, analyse and report — and hand off to each
other through one shared brain, with a boss on top that tells the joined-up
story.

> **Status:** architecture agreed. Not yet built. This document is the
> blueprint the implementation follows.

A living visual version of this spec is maintained as an artifact (the
"Hive Wall" blueprint) alongside this repo.

---

## The shape

```
                        👑  QUEEN  (Chief of Staff / the boss)
                            reads the whole hive, tells the story
                                     │
                        🧠  THE BRAIN  (shared memory + signal bus)
                            Railway Postgres  ·  rendered as the Hive Wall
                                     │
        ┌────────────┬──────────────┼──────────────┬────────────┐
      🔭 Scout     🎙️ Voice       📡 Radar       🛠️ Forge      📊 Ledger
       ICP &        Social         Trends &       Tools &       Revenue &
      sourcing      content        pain points    analytics     churn
```

- **Workers write signals** into the brain (each with provenance).
- **The Queen reads everything** and produces one narrative digest.
- **You** talk to the whole hive through a **single Telegram thread**.

---

## Rule #1 — evidence only (non-negotiable)

Every brain runs purely off evidence-backed analytics. Enforced by:

1. **Every claim carries its receipt.** No bare numbers. A stored figure
   records the exact source query and record IDs that produced it. The Hive
   Wall shows the source next to every statement.
2. **"I don't know" beats a guess.** If a worker can't back a claim with a
   pulled data point, it writes `unknown — need X`, never an invented value.
3. **Fact vs. hypothesis are labelled separately.** "July is soft because we
   shifted to ICP-C" is tagged a *hypothesis* (an inference) and sits next to
   the *facts* it is built on. Correlation is never presented as proof.

This matters most for **Ledger** (money) and for anything the **Queen**
quotes back at you.

---

## The workforce

Each worker maps to connectors/skills already in the Design Bees stack. Status
reflects how close each is to switching on.

### 01 · Scout — ICP & Sourcing  · READY
Learns the winning ICP from clients who actually closed and demos that actually
booked, then sources matching profiles from Sales Navigator and hands over
verified, enriched leads.
- **Tools:** Pipedrive · Sales Nav Extractor · LinkedIn Resolver · Clay ·
  Reoon · Calendly · Granola
- **Cadence:** weekly ICP refresh · daily lead pull
- **Loop:** reads Radar's pain points to sharpen search keywords; writes
  "this ICP is converting" back so Voice can lean into it.
- **Day-1 behaviour:** does **not** invent an ICP. Pulls the evidence that
  exists, drafts a candidate, and **asks clarifying questions over Telegram**
  ("5 of 8 closed deals are agencies with higher LTV; SaaS closed faster —
  weight toward agencies or keep SaaS?"). Your answer is logged as part of the
  record, so the ICP is co-authored: *the data says* + *AJ decided*.

### 02 · Voice — Social Content  · READY
Owns the content engine — trend-driven LinkedIn posts in AJ's voice, Dripify
sequences, hooks, plus visuals — and stages everything on Trello.
- **Tools:** Lidrip · Trend Posts · LinkedIn Hooks · Canva · Gamma ·
  Higgsfield · Trello · Telegram
- **Cadence:** weekly batch + reactive posts on new trends
- **Loop:** pulls topics straight from Radar. The Messaging Editor in this repo
  is Voice's Dripify workspace.

### 03 · Radar — Research & Trends  · READY
Sweeps Reddit, the web and socials for talking points, trends and pain points,
then digests them into "here's what this means for Design Bees" — not a link
dump.
- **Tools:** Trend Posts (Reddit) · WebSearch · WebFetch
- **Cadence:** daily scan · weekly synthesis
- **Loop:** the upstream source of truth — its signals feed Scout (keywords),
  Voice (topics) and the Queen (market context).

### 04 · Forge — Internal Tools & Analytics  · MOSTLY
Builds internal tools and dashboards for visibility, heavy on analytics —
marketing performance, funnels, lead throughput — shipped as live pages.
- **Tools:** Supermetrics · Wireflow · dataviz · web-artifacts · Railway
- **Cadence:** on-demand builds + daily dashboard refresh
- **Note:** "build me a tool" stays request-driven, not scheduled.

### 05 · Ledger — Revenue & Churn  · 1 GAP
Watches the money — flags churn, calls a good month vs a bad one, reports
"we're $5k behind last month at this point."
- **Tools:** Pipedrive (MRR/churn) · **＋ Stripe — not connected yet**
- **Cadence:** daily revenue pulse · churn alerts
- **The one real gap:** a direct Stripe connector is not in the stack.
  Revenue/subscription data lives in Pipedrive today, so Ledger starts there
  and Stripe is added in Phase 4.

### The Boss · Queen — Chief of Staff  · ORCHESTRATOR
Sits above all five. Reads every worker's signals and produces the joined-up
story — why revenue moved, which ICP and which content drove it, what trend is
shifting the ground.
- **Tools:** reads the whole hive · Telegram digest · Railway
- **Cadence:** weekly board meeting + on-demand deep dives
- **How it's built:** a scheduled synthesis run that fans out to all five, then
  writes one narrative digest to the Telegram thread.

---

## Worked example — the July question

> "Sales for July are trending down — we'd done $5,000 more by this point last
> month. Why?"

| Worker | Contribution |
| --- | --- |
| **Ledger** | Flags it: MRR pacing $5k under June at day 25; two churned accounts on the 12th and 19th. |
| **Scout** | "Sourcing pointed mainly at ICP-C (SaaS founders) instead of ICP-A (agencies), which historically closes slower." |
| **Voice** | "July content skewed to brand-strategy topics, away from the offer-led posts that drove June's demo bookings." |
| **Radar** | "New pain point trending — buyers asking about AI-generated design quality. Nobody's posting on it yet." |
| **Queen** | Stitches it into one read, not four dashboards. |

**Queen's narrative (a hypothesis, labelled as such):** "July is soft because
sourcing shifted to a slower-closing ICP *and* content moved off the offer-led
angle that filled June's calendar — compounded by two churns. Open lane:
Radar's AI-design-quality trend is untouched. Recommend Voice ships that angle
this week and Scout re-weights toward ICP-A."

---

## What makes them a team, not five chatbots

- **Shared memory.** An AI session forgets everything when it ends. The brain
  is an external store — **Railway Postgres**, provenance on every record —
  rendered as the **Hive Wall** you open to see everyone's thoughts. That
  persistence *is* the brain.
- **How they talk.** Worker-to-worker is async notes on the hive wall (Radar
  writes a trend, Voice reads it and posts on it). Worker-to-you is a **single
  Telegram thread** where any worker asks a question and you answer back.
- **"Constantly" = a schedule.** Each worker is a scheduled job on Railway
  (always-on). "Constantly refining" realistically means daily/weekly runs plus
  on-demand — shifts, not a 24/7 pulse.

---

## Deployment

- **Home:** Railway (always-on). Workers run on schedule, push to Telegram,
  and serve the Hive Wall. Chosen over GitHub Actions for a responsive
  two-way conversation and a real database.
- **Telegram:** a bot (created via BotFather) posts into one hive thread and
  reads AJ's replies. The build sandbox's egress policy blocks
  `api.telegram.org`, which is exactly why the hive runs on Railway, not inside
  a Claude session.
- **Secrets:** the Telegram bot token and all connector credentials live only
  in Railway's secret store — **never committed to this repo**. Best practice:
  regenerate the bot token in BotFather immediately before storing it, so it
  exists in one secure place only.

---

## Honest limitations

- **Shifts, not staff.** Scheduled + on-demand runs, not employees reacting
  second-by-second.
- **Memory must be built.** The brain is the project, not an afterthought —
  it's the first thing to stand up.
- **Stripe isn't wired yet.** Ledger runs on Pipedrive revenue until a Stripe
  connector is added.
- **The Queen proposes; you decide.** Its conclusions are hypotheses.
  Correlation isn't causation — keep a human on anything money- or
  churn-related.

---

## Build order

| Phase | Scope | Outcome |
| --- | --- | --- |
| **0** | Railway service + Postgres brain + Hive Wall, evidence-provenance rules in the schema, Telegram bridge wired | the hive wall exists, Telegram is live |
| **1** | Wire **Scout** fully: pull Pipedrive evidence, draft an ICP, message AJ its first clarifying questions | proof it works, not a demo |
| **2** | Add Voice, Radar, Forge — one at a time, each reading/writing the hive | five workers on shift |
| **3** | Crown the **Queen**: weekly synthesis → one Telegram digest | the boss speaks |
| **4** | Add the Stripe connector for Ledger + an on-demand "ask the whole hive" deep-dive | full coverage |
