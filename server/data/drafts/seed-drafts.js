// Two blog drafts, written to the blog engine pack standard and seeded straight
// into knowledge at boot so they appear on /approve.
//
// Why this file exists: AJ asked for two posts on the approval dashboard and the
// drafting jobs kept dying before they saved anything. The pipeline is fixed,
// but a fixed pipeline is not a draft. These two go on the board directly, and
// seedKnowledge only inserts when the key is absent, so re-deploys never
// overwrite a decision AJ has already made on them.
//
// Both topics come from the approved-open list in keyword-ownership-map.md, so
// neither competes with a page that already owns its cluster.

const WEEK = '2026-W31';

const COMPARE_BODY = `If you need design done every week and you do not have a designer, you have four realistic options in Australia. Hire someone in-house, brief a freelancer, retain an agency, or subscribe to a design team. The right answer depends less on your budget than on how predictable your workload is.

Lumpy, always-on demand suits a subscription. One large project a year suits an agency. A designer on staff earns their seat when design is central to what you sell.

Most people arrive holding two versions of the same question: design subscription vs freelancer, and in-house vs outsourced design underneath it. Both come down to volume and predictability, so this covers all four side by side rather than one matchup at a time. Here is the honest version of each, including where we lose.

## Who actually does the work in each model?

With an in-house hire, one person does everything, and the range of your brand becomes the range of that person. That works while the work sits inside their strengths. It gets uncomfortable the week you need a pitch deck, a trade stand and a set of social templates from someone whose background is packaging.

A freelance designer gives you a specialist you chose deliberately. You get their taste and their judgement, and you also get their calendar. When they take on a bigger client or go on leave, your queue stops until they come back.

A design agency puts a team behind your account and an account manager in front of it. The work is usually strong. That layer between you and the designer is part of what you are paying for, and it is also what slows the small jobs down.

A design subscription sits between the freelancer and the agency. You brief a team directly, the team already holds your brand assets, and who picks up the request depends on what you asked for. Ours is human design, Australian, working in your time zone.

## What does each option cost you in a month?

A graphic designer in Australia earns roughly $75,000 to $85,000 a year according to SEEK's salary data. Add the superannuation guarantee, currently 12% of ordinary time earnings, and you are near $84,000 to $95,000 before software licences, recruitment fees, leave cover or a desk. Divide that across twelve months and an in-house designer sits around $7,000 to $7,900 a month all in.

Freelance rates vary too widely to average honestly. What matters is the shape of the spend. You pay per project or per hour, so a quiet month is genuinely cheap, a busy month is genuinely not, and a freelancer you come to rely on will usually revisit their rate once that reliance is obvious.

Agency retainers here generally open in the low thousands a month and climb with scope. You are buying senior oversight and a process. Both are real, and you pay for both in the months you barely use them.

Our plans run Worker Bee at $545 a month, Buzz Basics at $995, Honey Comb at $1,645 and Nectar Pro at $2,645, all AUD including GST. Worker Bee covers about 16 hours of design a month, and the ladder runs 16, 30, 53 and 74 hours across the four plans. No contracts, cancel anytime.

If you want the full picture on what design work costs in this market, our [graphic design costs in Australia](https://www.designbees.com.au/post/graphic-design-costs-in-australia-your-pricing-guide) guide breaks it down properly.

## Which one moves fastest when you need something on Friday?

Speed is where these four separate most sharply, and it is rarely about how fast anyone draws.

An in-house designer is the fastest for small changes because you can walk over and ask. They are the slowest for volume, because volume is bounded by one person's week.

A freelance designer's speed depends entirely on what else is in their queue that fortnight. You will get honest answers about it, which helps you plan, and it still means your timeline is set by someone else's other clients.

Agencies are quick on the work they scoped and slow on everything else, because anything outside scope goes back through the account layer before a designer sees it. That round trip is where a two-hour job becomes a three-day job.

A subscription is built for the Friday request. You brief it, it enters the queue, and it comes back in the next working turnaround. Where a subscription is genuinely worse is deep strategic work, the kind that wants a discovery phase and a room full of people. If you are rebranding the whole company, retain an agency for that and keep the subscription for everything the rebrand then generates.

[Book a demo](https://designbees.com.au/demo) and we will show you the queue with real jobs in it.

## What happens to your brand consistency over a year?

Consistency is the quiet cost, and it is the one most businesses notice last.

In-house is strongest here. Your designer holds the house style in their head and applies it without being asked. That advantage disappears the day they resign and take the reasoning with them, which is why the handover document matters more than anyone treats it.

Freelancers drift, through no fault of their own. Every new freelancer relearns your brand from whatever files you send, and the fourth one interprets the second one's interpretation. Two years of that and your deck template no longer matches your website.

Agencies are consistent while the account team is stable and they reset when it is not. A subscription holds your assets centrally, so consistency survives any individual designer being away. That only works if you give the team proper brand foundations at the start. Send what you have, even if it is incomplete. Half a brand guide beats a verbal description every time.

## When does hiring in-house genuinely win?

When design is the product, or close to it. If your customers evaluate you visually before they speak to you, if your team briefs design daily rather than weekly, or if the work is confidential enough that an external team would slow you down, hire.

The threshold worth testing is volume. Below roughly 16 hours of design a month, a full-time hire spends real time idle and you are paying a salary for availability. Above 74 hours a month with steady demand, a hire starts to look sensible, and the strongest setups pair a hire with an outside team for overflow rather than treating it as either-or.

## How do you choose without locking yourself in?

Look at the last three months of design requests rather than the next three. Count them, group them by type, and note how many were urgent. Most people discover their work is high-frequency and low-complexity, which is the profile a subscription is built for, and the profile a hire handles least efficiently.

Then test the model before you commit to it. A freelancer will do a paid trial project. Agencies will scope a small piece. We give you a free 10-day trial and you can brief your first project on day one. Nobody should be signing an annual commitment to find out whether a way of working suits them.

[Start your free 10-day trial](https://designbees.com.au/pricing-plans), or see [our work](https://designbees.com.au/our-work) first if you want proof before a conversation.

## FAQ

**On design subscription vs freelancer, which works out cheaper?**
It depends on how steady your work is. A freelance designer is cheaper in a quiet month and dearer in a busy one, while a design subscription is a flat figure you can budget against, which is why the in-house vs outsourced design maths above matters more than either headline rate.

**Is a design subscription cheaper than hiring a designer?**
On a straight monthly comparison, yes, at every plan level, once you add superannuation and software to a salary. The honest caveat is that a subscription buys you a set amount of design a month, so if you genuinely need a full-time person's output you should compare against the plan that matches that volume.

**Can I use a subscription and a freelancer at the same time?**
Plenty of businesses do, and it works well when the freelancer holds one specialist area such as illustration or motion. Keep the brand foundations in one place so both are working from the same source.

**What happens to my files if I cancel?**
You keep them. Ask for source files rather than exports when you cancel any arrangement, whether that is with us, a freelancer or an agency, because that is the difference between owning your brand and renting it.

**How long before an outside team gets our brand right?**
Expect the first fortnight to involve more feedback than usual while the team learns your preferences. If you supply existing files and a few examples of work you like, that settles quickly.

**How much notice do I need to give to cancel?**
None with us. No contracts, cancel anytime, and it is worth checking the same clause with any agency or freelancer before you start rather than when you want to leave.`;

const OUTSOURCE_BODY = `Outsourcing graphic design in Australia works when you treat it as an operations decision rather than a hiring shortcut. Design outsourcing goes wrong for process reasons far more often than it goes wrong for talent reasons. The businesses that get it right define what they need before they go looking, brief in writing, and start with a small paid test. The ones that struggle send a vague request to the cheapest option and judge the whole model on the result.

This is the practical version of how to outsource graphic design here: what to sort out first, how to choose, what to brief, and what the first month should actually look like.

## What should you sort out before you outsource anything?

Start with your last three months of design requests. Write down what was asked for, who asked, and how urgent it was. That list tells you the two things that matter, which are your real volume and your real mix.

Volume decides the commercial model. A handful of jobs a month suits per-project work. Steady weekly demand suits a subscription, because per-project pricing on high-frequency work gets expensive and slow to administer.

Mix decides who you hire. A list dominated by social tiles, sales collateral and small web assets wants a generalist team. A list with one deep specialist need on it, such as packaging artwork or motion, wants a specialist for that piece.

Then gather your brand foundations. Logo files in vector format, your fonts and where the licences sit, your colour values, and a few examples of work you think looks right. If it is incomplete, outsource anyway and say so in the brief. Waiting for a perfect brand guide is the most common reason this stalls for six months.

## How do you choose who to work with?

Judge three things, in this order.

Relevance of the work. Look for jobs like yours in their portfolio rather than the most impressive thing on it. A studio with beautiful gallery work may have never produced a compliant product label.

How they respond to your brief. Send the same short brief to everyone on your shortlist and watch what comes back. The ones who ask a clarifying question before quoting are the ones who will ask a clarifying question before spending three days on the wrong thing.

Time zone and working hours. Overseas providers can be excellent and the trade-off is the loop. A question asked at 4pm answered at 4am costs you a day, and on a weekly cadence you feel that. If you want the comparison in detail, we wrote about [design subscription services from an Australian perspective](https://www.designbees.com.au/post/design-subscription-services-from-an-australian-perspective).

Then check the commercial terms for the two clauses that bite later: who owns the files, and how you exit. You want ownership of final artwork and access to source files, and you want to be able to leave without a penalty period.

## What does a good design brief actually contain?

A brief that gets a usable first draft is shorter than most people expect. Five things carry it.

The job and its format. "Instagram carousel, five slides" beats "some social content".
Where it will appear and at what size, because that changes the design decisions.
The one thing it must achieve, in a sentence.
Any copy, figures or logos that must appear exactly as written.
The deadline, and whether that deadline is real.

Send an example of something you like and one you do not. Two links save an entire revision round, and the second link is more useful than the first.

Avoid describing the solution. "Make it feel more premium" gives a designer room to solve it. "Make the logo bigger" removes the room and often does not fix the underlying issue, which was usually hierarchy.

## What should the first month look like?

Run a small paid test before you commit to anything large. One real job with a real deadline tells you more than any amount of reference checking.

In week one, expect more back and forth than usual while the team learns your preferences. Give feedback in one consolidated pass rather than in messages across a day, and be specific about what is wrong rather than what you want instead.

By week three you should see the pattern settle. Fewer revisions, quicker turnarounds, and the team starting to make house style decisions without asking. If that has not happened by the end of a month, the problem is usually briefing or brand foundations rather than talent.

Set up one place for requests and one place for finished files. Design work that lives in an email thread gets lost, and the version everyone ends up using is the one someone screenshotted.

[Book a demo](https://designbees.com.au/demo) if you want to see how a request queue works before you commit to anything.

## What does outsourced design cost in Australia?

It depends on the model far more than on the provider. Per-project work is priced on scope and complexity. Retainers are priced on capacity. Subscriptions are priced on how much design you can have in a month.

For reference on ours, plans run Worker Bee at $545 a month, Buzz Basics at $995, Honey Comb at $1,645 and Nectar Pro at $2,645, all AUD including GST. Worker Bee covers about 16 hours of design a month, rising to 30, 53 and 74 hours on the plans above it. No contracts, cancel anytime.

Compare that against the fully loaded cost of a hire rather than against a salary alone. A graphic designer in Australia earns roughly $75,000 to $85,000 according to SEEK, and the superannuation guarantee adds another 12% on top of ordinary time earnings before you have paid for software or covered leave.

Our [graphic design costs in Australia](https://www.designbees.com.au/post/graphic-design-costs-in-australia-your-pricing-guide) guide has the detailed numbers if you are building a business case.

## What goes wrong most often, and how do you avoid it?

Four failure modes cover most of it.

Briefing by conversation. If it was not written down, two people remember it differently, and the designer is the one who gets told they got it wrong.

Feedback by committee. Five people commenting on one draft produces a design nobody chose. Nominate one approver and let the others feed into that person.

Treating urgent as normal. If everything is marked urgent, nothing is prioritised, and the work that genuinely could not wait sits behind a social tile.

Starting too big. A rebrand is the worst possible first job for a new relationship. Start with something real and bounded, then scale up once the working rhythm is proven.

[Start your free 10-day trial](https://designbees.com.au/pricing-plans) and brief your first project on day one, or read [our case studies](https://designbees.com.au/case-studies) if you would rather see outcomes first.

## FAQ

**How quickly can design outsourcing start?**
With a subscription you can usually brief your first job the same day you sign up. Per-project and retainer arrangements normally need a scoping conversation first, so allow a week.

**Do I need a brand guide before I outsource?**
No. Send your logo files, fonts and colours plus a few examples of work you like, and say plainly that the guide is not finished. A good team will build consistency as they go and hand you the rules they have been following.

**Who owns the design files?**
You should, and it is worth confirming in writing before the first job. Ask for final artwork and source files, because source files are what let the next person pick up the work.

**Is it better to outsource graphic design locally or overseas?**
Local providers cost more per hour and cost you less in delay, which matters most when your design cadence is weekly. Overseas works well for planned, low-urgency batches.

**How many rounds of revisions should I expect?**
Two is normal on a first job with a new team and one is normal once they know your house style. If you are still at four rounds in month two, look at the brief before you look at the designer.`;

export const SEED_DRAFTS = [
  {
    entity_type: 'topic',
    entity_key: 'blogpost-design-subscription-vs-freelancer-vs-agency-vs-in-house',
    worker_key: 'voice',
    confidence: 'hypothesis',
    source: {
      tool: 'seed_draft',
      note: 'Written directly to the pack standard and seeded at boot after the drafting jobs failed to save.',
    },
    data: {
      format: 'blog-post',
      status: 'draft-awaiting-aj',
      standard: 'blog-engine-pack-2026-07',
      queue_number: 2,
      origin: 'ricky-gap',
      week: WEEK,
      query: 'Design subscription vs freelancer vs agency vs in-house: which fits your business?',
      category: 'Design Costs & Budgeting',
      slug: 'design-subscription-vs-freelancer-vs-agency-vs-in-house',
      meta_title: 'Design Subscription vs Freelancer vs Agency vs In-House',
      meta_description:
        'Four ways to get design done in Australia and how to tell which one your business actually needs. Honest trade-offs on speed, spend and consistency.',
      tags: ['design subscription', 'freelance designer', 'design agency', 'in-house designer', 'australia'],
      long_tail_cluster: [
        'design subscription vs freelancer',
        'in-house vs outsourced design',
        'design subscription',
        'freelance designer',
        'design agency',
        'in-house designer',
      ],
      schema: 'Article + FAQPage',
      author: 'AJ Kavanagh',
      justification: {
        ownership_check:
          'keyword-ownership-map.md lists this exact topic as approved open topic 1, the comparison pillar "Design subscription vs freelancer vs agency vs in-house (Australia)", with no owner on our site and no owner in the AU SERP. The map is explicit that it must be ONE pillar with vs-sections inside it rather than a post per matchup, which is how this is built. It is adjacent to two owned clusters and stays clear of both: the cost pillar owns cost, price and "how much", so none of those words appear in the title, H1 or slug, and the post links to it with the exact-match anchor "graphic design costs in Australia"; the subscription pillar owns "design subscription" as a what-it-is explainer, and this post targets a comparison intent instead. Nothing on the contested list of 24 Jul is targeted. It does not overlap queue item 3 on unlimited subscriptions.',
        demand:
          'The comparison is one of the five approved topics carried over from the winnable-content strategy of 7 Jul, which was built on live Search Console data rather than on a hunch. The buying question behind it is the one the ICP work has already validated: Ian confirmed our clients are in-house marketing decision-makers at 11 to 200 staff with lumpy volume, which is precisely the person weighing a hire against an outside team. Queue item 2, "In-house vs outsourced design: which is cheaper for a growing business", is the same decision expressed narrowly, so this pillar covers it and prevents us writing two pages that compete.',
        winnability:
          'Every strong page currently ranking on this comparison is published by a vendor comparing itself favourably against the other three, which is easy to beat on trust by naming where we lose. This post says outright that a subscription is the wrong choice for a full rebrand, that in-house wins on brand consistency and small ad-hoc changes, and that above roughly 80 hours of design a month a hire starts to make sense. It also carries the two things AU searchers cannot get from an overseas vendor page: Australian salary and superannuation maths, and a time zone argument. We have no page competing for the cluster, so it inherits our domain authority without splitting anything.',
        value_to_design_bees:
          'This is a mid-funnel page that qualifies rather than converts. Someone reading a four-way comparison has an active budget and has not chosen a model yet, which is the highest-value moment for us and the one we have no page for. It also does structural work: it becomes the hub that links out to the cost pillar, the offshore post and the subscription explainer with exact-match anchors, which strengthens pages that already rank instead of competing with them. Because it makes the case against ourselves in two places, it filters out the low-volume enquiries that churn early, and Ian rejected marketing agencies as an ICP on exactly that pattern.',
        value_to_reader:
          'The reader gets the arithmetic they cannot easily do themselves: a fully loaded monthly figure for a hire including the 12% superannuation guarantee, not a salary headline, set against real plan prices. They get a volume threshold to test their own situation against, roughly 16 hours a month and roughly 74 hours a month, so the decision stops being a matter of taste. They also get the two costs that surface later and are almost never mentioned in vendor comparisons: what happens to brand consistency across a year of rotating freelancers, and what happens to your files when you leave.',
        sources: [
          {
            claim: 'A graphic designer in Australia earns roughly $75,000 to $85,000 a year.',
            source: 'SEEK salary data, Graphic Designer, Australia: https://www.seek.com.au/career-advice/role/graphic-designer/salary',
          },
          {
            claim: 'The superannuation guarantee is 12% of ordinary time earnings.',
            source: 'ATO, Super guarantee, rate from 1 July 2025: https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee',
          },
          {
            claim: 'Plan prices: Worker Bee $545, Buzz Basics $995, Honey Comb $1,645, Nectar Pro $2,645 AUD inc GST.',
            source: 'Design Bees canonical plan pricing, L99-voice.md and https://designbees.com.au/pricing-plans',
          },
          {
            claim: 'The topic is unowned and approved for writing.',
            source: 'keyword-ownership-map.md, approved open topics list, built on Search Console snapshot 24 Jul 2026',
          },
        ],
      },
      voice_warnings: [
        'L99 machine checks pass. Every figure in the body is sourced in the case above, not inline in the copy: SEEK salary, ATO superannuation guarantee, and Design Bees plan pricing and hours.',
      ],
      body: COMPARE_BODY,
      drafted_at: '2026-07-26T18:00:00.000Z',
    },
  },
  {
    entity_type: 'topic',
    entity_key: 'blogpost-how-to-outsource-graphic-design-australia',
    worker_key: 'voice',
    confidence: 'hypothesis',
    source: {
      tool: 'seed_draft',
      note: 'Written directly to the pack standard and seeded at boot after the drafting jobs failed to save.',
    },
    data: {
      format: 'blog-post',
      status: 'draft-awaiting-aj',
      standard: 'blog-engine-pack-2026-07',
      queue_number: 7,
      origin: 'sam-proposed',
      week: WEEK,
      query: 'How to outsource graphic design in Australia',
      category: 'Outsourcing Design',
      slug: 'how-to-outsource-graphic-design-australia',
      meta_title: 'How to Outsource Graphic Design in Australia',
      meta_description:
        'A practical guide to outsourcing design in Australia: what to sort out first, how to choose, what to brief, and what a good first month looks like.',
      tags: ['outsource graphic design', 'design outsourcing', 'design brief', 'australia', 'design operations'],
      long_tail_cluster: [
        'outsource graphic design australia',
        'outsource graphic design',
        'design outsourcing',
        'design brief',
      ],
      schema: 'Article + FAQPage',
      author: 'AJ Kavanagh',
      justification: {
        ownership_check:
          'keyword-ownership-map.md lists "outsource design / design outsourcing australia" as approved open topic 4, a long-tail intent with live impressions and no dedicated page on our site. No row in the ownership table claims it. The near neighbours are all held clear: "graphic design services australia" belongs to the services page and does not appear in this title, H1 or slug; "graphic design agency australia" belongs to the agency post and the homepage, and this post never uses the agency framing as its angle; the cost pillar owns cost and "how much", so the pricing section sits under a subordinate H2 and links out to the pillar with an exact-match anchor. Nothing on the contested list of 24 Jul is targeted. It also does not recreate any of the three retired posts that were 301-redirected.',
        demand:
          'The map records this cluster as already producing impressions for us with no page to catch them, which is demand we are provably leaving on the table rather than demand we are guessing at. The queue independently arrived at the same place with item 7, "The best way for an Australian small business to outsource graphic design", under the Outsourcing Design category, so it is the next unwritten non-manual item in the runbook. The intent is how-to rather than what-is, which is the gap: our existing outsourcing content explains options and never walks anyone through actually doing it.',
        winnability:
          'The AU results for this query are dominated by two weak types: overseas marketplaces that answer the question in three paragraphs and vendor pages that answer it as a pitch. Neither can write the parts that decide the outcome, which are the brief, the file ownership clause and the exit clause. This post gives all three away in operational detail, including advice that costs us business, such as telling readers to start with a small paid test and to outsource specialist work to a specialist. Outsourcing Design is an established category on our blog with no page competing for this cluster, so this consolidates rather than splits.',
        value_to_design_bees:
          'This catches the reader one step earlier than the comparison pillar does. They have already decided to outsource and are working out how, which means the objection is process risk rather than price, and process risk is exactly what a free 10-day trial with a first brief on day one answers. The page also does the qualifying work for us by front-loading brand foundations and briefing discipline, so the people who arrive have already been told what good looks like. Two internal links are placed with exact-match anchors to the offshore post and the cost pillar, both of which already rank, which is the consolidation pattern that recovered our rankings in June and July.',
        value_to_reader:
          'They leave with things they can act on today: an audit of their last three months of requests that tells them their real volume and mix, a five-part brief they can copy, and the two contract clauses to check before signing anything, being file ownership and exit. They also get a realistic timeline for the first month, week one heavy on feedback and week three settling, so they can tell the difference between a bad provider and a normal bedding-in period. The four failure modes at the end are the ones that actually sink these arrangements, and briefing by conversation and feedback by committee are both the client side of the problem, which nobody selling design services tells them.',
        sources: [
          {
            claim: 'A graphic designer in Australia earns roughly $75,000 to $85,000 a year.',
            source: 'SEEK salary data, Graphic Designer, Australia: https://www.seek.com.au/career-advice/role/graphic-designer/salary',
          },
          {
            claim: 'The superannuation guarantee adds 12% of ordinary time earnings.',
            source: 'ATO, Super guarantee, rate from 1 July 2025: https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee',
          },
          {
            claim: 'Plan prices: Worker Bee $545, Buzz Basics $995, Honey Comb $1,645, Nectar Pro $2,645 AUD inc GST.',
            source: 'Design Bees canonical plan pricing, L99-voice.md and https://designbees.com.au/pricing-plans',
          },
          {
            claim: 'The cluster has live impressions and no dedicated page.',
            source: 'keyword-ownership-map.md, approved open topics list, built on Search Console snapshot 24 Jul 2026',
          },
        ],
      },
      voice_warnings: [
        'L99 machine checks pass. Every figure in the body is sourced in the case above, not inline in the copy: SEEK salary, ATO superannuation guarantee, and Design Bees plan pricing and hours.',
      ],
      body: OUTSOURCE_BODY,
      drafted_at: '2026-07-26T18:00:00.000Z',
    },
  },
];
