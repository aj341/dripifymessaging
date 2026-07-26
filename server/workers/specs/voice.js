import {
  tools as blogEngineTools,
  handlers as blogEngineHandlers,
  l99Warnings,
  unsourcedFigures,
  PLAN_LINE,
  ANALYTICS_STATUS,
} from '../blog-engine.js';
import { tools as libraryTools, handlers as libraryHandlers } from '../../content-library.js';
// Sam — Socials & Content (worker key: voice). The output end of the cascade:
// Ricky's demand evidence and gap verdicts come in, drafts go out for AJ
// to approve.
//
// Sam's standard is AJ's blog engine pack, shipped with the repo — the operator
// pack, the content queue and the L99 voice spec. He reads them before writing,
// every time. The handlers below enforce the machine-checkable slice of that
// standard, refuse unsourced proof, file the draft as knowledge and raise a
// content:draft signal. Nothing in this file can post or publish anything.

const SLUG_MAX = 60;

const slug = (s) =>
  String(s || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX) || 'untitled';

const clean = (s) => String(s == null ? '' : s).trim();

// LinkedIn is AJ's personal voice, not L99 website copy, so it carries its own
// trap list on top of the shared hard bans. [pattern, why it fails].
const LINKEDIN_TRAPS = [
  [/\bwhat do you (think|reckon)\s*\?/i, 'Engagement-bait close. Land a clear point of view instead.'],
  [/\b(thoughts|agree)\s*\?\s*$/i, 'Engagement-bait close. End on the point, not a question.'],
  [/here'?s the thing/i, 'AI crutch phrase.'],
  [/\bthe truth is\b/i, 'AI crutch phrase.'],
  [/\bstop\b[^.!?\n]{1,40}\bstart\b/i, '"Stop doing X, start doing Y" command — reads as AI.'],
  [/\bi wish i (knew|had known) this earlier\b/i, 'Cliché.'],
  [/\bnobody (talks|is talking) about\b/i, 'Overclaim bait.'],
  [/\b(delve|unlock|harness|elevate|supercharge|revolutionis\w+|revolutioniz\w+)\b/i, 'AI-flavoured verb.'],
  [/\b(synergy|synergies|leverage|leveraging|disrupt|disruptive|seamless|game[-\s]?chang\w*)\b/i, 'Buzzword — plain language instead.'],
  [/\bin today'?s (fast[-\s]paced|digital|competitive)\b/i, 'Filler opener.'],
  [/\bas a (seasoned|passionate)\b/i, 'Brand-persona voice, not AJ.'],
  [/\b\d+\s+(proven|powerful)\s+\w+/i, "Listicle framing AJ doesn't use."],
];

function linkedinWarnings(text) {
  const warn = l99Warnings(text); // hard bans, plan names, cadence, AU spelling
  const t = clean(text);
  for (const [re, why] of LINKEDIN_TRAPS) {
    const hit = t.match(re);
    if (hit) warn.push(`"${hit[0].trim()}" — ${why}`);
  }
  if (!/[a-z]'(s|t|re|ve|ll|m|d)\b/i.test(t)) {
    warn.push('No contractions found — AJ always writes "I\'m", "you\'ve", "it\'s".');
  }
  return warn;
}

/** pg may hand back JSON as an object or a string; treat both the same. */
function asObject(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return { value: String(v) };
  }
}

const oneLine = (s, n = 160) => clean(s).replace(/\s+/g, ' ').slice(0, n);

// The justification gate (AJ, 2026-07-26: a proof source that "doesn't even
// make sense and then just has 2 urls" is not a case for publishing). AJ makes
// the approve/reject call from this block, so it has to be reasoning he can act
// on: what was checked, why the demand is real, why we can win it, what it earns
// Design Bees commercially, and what the reader leaves with. Thin or generic
// prose is refused at the tool boundary rather than queued for him to unpick.
const JUSTIFICATION_FIELDS = [
  ['ownership_check', 'what you checked for cannibalisation and what it said', 120],
  ['demand', 'the evidence buyers ask this, with figures and their source', 120],
  ['winnability', 'who ranks today and the specific weakness you are attacking', 120],
  ['value_to_design_bees', 'the commercial bridge — who it reaches and how it leads to a demo or trial', 120],
  ['value_to_reader', 'what the reader can do afterwards that they could not before', 100],
];

// Sentences that would fit any article on any topic. A justification made of
// these says nothing, however long it is.
const GENERIC_JUSTIFICATION = [
  /^(this|it) (post|piece|article) (will|would) (be )?(help|useful|valuable|good|great)/i,
  /\b(high|good) (search )?(volume|intent)\b(?![^.]*\b(gsc|search console|dataforseo|impressions|position)\b)/i,
  /\bdrives? (traffic|awareness|engagement)\b/i,
  /\bbuilds? (trust|authority|credibility)\b(?![^.]*\bbecause\b)/i,
  /\bgood for (seo|aeo)\b/i,
];

/**
 * Validate a justification block. Returns { ok, message } — a refusal names the
 * field and what is missing, so the next attempt is better rather than longer.
 */
function checkJustification(j, { bodyText = '', requireSources = true } = {}) {
  if (!j || typeof j !== 'object') {
    return {
      ok: false,
      message:
        'REJECTED — no justification. AJ approves from your reasoning, not from a link: give ownership_check, ' +
        'demand, winnability, value_to_design_bees and value_to_reader, each as real prose, plus a source per ' +
        'figure. Nothing was saved.',
    };
  }
  const missing = [];
  const thin = [];
  const generic = [];
  for (const [field, what, min] of JUSTIFICATION_FIELDS) {
    const v = clean(j[field]);
    if (!v) missing.push(`${field} (${what})`);
    else if (v.length < min) thin.push(`${field}: ${v.length} chars, needs ${min}+ — ${what}`);
    else if (GENERIC_JUSTIFICATION.some((re) => re.test(v))) {
      generic.push(`${field}: reads as boilerplate that would fit any post. Say what is true of THIS query.`);
    }
  }
  if (missing.length || thin.length || generic.length) {
    return {
      ok: false,
      message:
        'REJECTED — the justification is not strong enough for AJ to decide from. Nothing was saved.\n' +
        (missing.length ? `\nMissing:\n- ${missing.join('\n- ')}` : '') +
        (thin.length ? `\nToo thin:\n- ${thin.join('\n- ')}` : '') +
        (generic.length ? `\nToo generic:\n- ${generic.join('\n- ')}` : '') +
        '\n\nWrite each field as you would explain it to AJ in person, then call this again.',
    };
  }

  // Every figure in the body needs a claim-level source. Plan prices are public
  // and exempt; anything else has to be traceable.
  const sources = Array.isArray(j.sources) ? j.sources.filter((s) => clean(s?.claim) && clean(s?.source)) : [];
  if (requireSources) {
    const figures = unsourcedFigures(bodyText, false);
    if (figures.length && !sources.length) {
      return {
        ok: false,
        message:
          `REJECTED — the post states figures (${figures.slice(0, 6).join(', ')}) with no per-claim sources. ` +
          'Add a sources entry for each one naming the claim and exactly where it came from, or cut the figures. ' +
          'Nothing was saved.',
      };
    }
  }
  return { ok: true, sources };
}

/** The justification as readable prose, for the signal body and the dashboard. */
function justificationText(j, sources = []) {
  return [
    `Ownership check: ${clean(j.ownership_check)}`,
    `Demand: ${clean(j.demand)}`,
    `Winnability: ${clean(j.winnability)}`,
    `Value to Design Bees: ${clean(j.value_to_design_bees)}`,
    `Value to the reader: ${clean(j.value_to_reader)}`,
    sources.length
      ? `Sources:\n${sources.map((s) => `  • ${clean(s.claim)} → ${clean(s.source)}`).join('\n')}`
      : 'Sources: no outside figures used beyond Design Bees plan pricing.',
  ].join('\n\n');
}

// A client's words, or a client used as a worked example, never appears in a
// draft without AJ approving that specific use first. Machine side of the rule,
// tuned after the first live run flagged Sam's own definitional prose as a
// customer quote (Tom's proposal, approved by AJ): a quoted span only DEMANDS
// propose_customer_quote when it reads like attributed speech — an attribution
// cue (said/told/asked, "one of our clients", a name pattern) adjacent to it.
// Scare quotes around a term ("unlimited") and short spans of three words or
// fewer are ignored; longer unattributed quotes become an advisory note so AJ
// still sees them on /approve without being asked to act.
const ATTRIBUTION_NEAR =
  /\b(said|says|told (?:us|me)|asked|mentioned|wrote|put it|in (?:his|her|their) words|according to|one of our clients?|a client(?: of ours)?|our client|[A-Z][a-z]+ (?:from|at) [A-Z])\b/;

function quoteFlags(text) {
  const t = clean(text);
  const flags = [];
  const re = /["“]([^"”]+)["”]/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const span = m[1].trim();
    if (span.split(/\s+/).filter(Boolean).length <= 3) continue; // scare quotes on a term
    // Look at the sentence around the quote for an attribution cue.
    const before = t.slice(Math.max(0, m.index - 120), m.index);
    const after = t.slice(re.lastIndex, re.lastIndex + 120);
    const attributed = ATTRIBUTION_NEAR.test(before) || ATTRIBUTION_NEAR.test(after);
    if (attributed) {
      flags.push(
        `[quote-gate] Attributed quote found ("${oneLine(span, 60)}…"). If these are a customer's words, ` +
          'AJ has not approved this use — pull the quote and raise it with propose_customer_quote.'
      );
    } else {
      flags.push(
        `[quote-gate, advisory] Unattributed quoted span ("${oneLine(span, 60)}…") — reads as the writer's ` +
          "own phrasing, no action needed unless these are actually a customer's words."
      );
    }
  }
  if (/\b(one of our|a) clients?\b[^.!?\n]{0,60}\b(said|told|asked|mentioned)\b/i.test(t)) {
    flags.push(
      '[quote-gate] Reads like a client anecdote. Real client stories, even anonymised, go through ' +
        'propose_customer_quote for AJ to approve before they appear in a draft.'
    );
  }
  return flags;
}

export default {
  key: 'voice',
  name: 'Sam',
  model: 'claude-opus-5', // customer-facing words earn the premium tier
  emoji: '📣',
  title: 'Socials & Content',

  brief: `YOUR STANDARD IS THE BLOG ENGINE PACK. Before you write anything, call list_blog_engine_docs and read BLOG-ENGINE-OPERATOR-PACK.md and L99-voice.md with read_blog_engine_doc — every time, never from memory. For blog work also read content-queue.md: it says what gets written, in what order, and which items are AJ-MANUAL and must be skipped. If anything you believe conflicts with those documents, the documents win. A post in the wrong voice costs AJ more than no post, because he has to rewrite it instead of approving it. You must also know the existing blog cold. Before drafting, every time: read keyword-ownership-map.md (which live page owns which keyword cluster — from real Search Console data) and engine-content-map.md (which of the 9 engine drafts owns which primary) with read_blog_engine_doc, and call list_live_blog_posts for the current live list. THE ONE RULE: one keyword cluster, one page. If any page or draft already owns your target query, do NOT write a competing page — propose strengthening or refreshing the owner to AJ instead, with both URLs so he picks. The money cluster is full at four posts; the contested-query list in the ownership map is radioactive. Earlier this year five of our ten posts fought over two clusters and Google ranked none of them.

DO NOT DRAFT ON SPECULATION. You only write when there is verified demand or clear buyer intent behind the topic — a query Ricky has assessed as a winnable gap (seo:gap), a pain point he evidenced from a real call or thread, or an item AJ has already curated into the content queue. Anything you propose yourself has to clear the five gates in section 15 of the operator pack (intent, real demand, winnability, answer gap, honest fit) with evidence attached. You have no volume or analytics tools of your own: never state a search volume, difficulty score or traffic number yourself — if Ricky's gap signal carries a tool-returned figure (DataForSEO or GSC), quote it with its source; otherwise the demand evidence stays qualitative. If you have neither a verified trigger nor a queue item, do not produce content: say what you would need and stop. One piece backed by evidence beats six written on a hunch.

You are Sam, the Socials & Content bee in AJ's hive at Design Bees — an Australian human-design subscription agency, Surry Hills based, no contracts, cancel anytime, free 10-day trial. The four plans, exactly as confirmed by AJ on 2026-07-26: ${PLAN_LINE}. Never call them three plans, never write "Honeycomb Plus" in copy, and never use the retired 20/33/55/88 hours ladder. You own the top of the funnel: LinkedIn posts in AJ's own voice, and blog posts to the operator pack's standard — answer-first opening with the key number in paragraph one, question-shaped H2s, 1,200 to 1,800 words, demo CTA then trial CTA, an FAQ block in the reader's voice, written for passage-level retrieval so an AI assistant can lift any paragraph and be correct. Own the Australia angle; never fight the global head terms.

The non-negotiables from the pack, which are also enforced by your tools: human design only, never promote or imply AI does the design; never name a client in body copy; never name a competitor in body copy; no em dashes, no double hyphens, ever — the single most common failure; fact-check every figure; you draft, AJ publishes.

CLIENT QUOTES AND HYPOTHETICALS — AJ's standing rule: a direct customer quote may only be used if it genuinely adds value, isn't revealing or negative, AND AJ has approved that specific use beforehand. The same applies to using a real client, or a thinly-veiled version of one (say, "a furniture company" when we have exactly one furniture client), as a hypothetical or worked example. Raise these with propose_customer_quote BEFORE the draft relies on them, and write the draft without the quote in the meantime. Generic hypotheticals that map to no real client are fine.

Evidence rule, no exceptions: you never invent a client name, a result, a statistic or a testimonial, and you never state a search volume or analytics figure — nothing is connected that could produce one. If you want a proof point, read it out of the hive with recall_hive_knowledge or ask AJ with request_proof_point and write the draft without it in the meantime. A post with no proof beats a post with a made-up one.

You draft, you never publish. You have no posting capability, no LinkedIn access, no Wix access, no scheduler. Never say or imply that anything has been posted, scheduled or sent. Finished drafts are saved to knowledge and published as content:draft so AJ can review, edit and approve them in Telegram — he is the only one who posts.

${ANALYTICS_STATUS}`,

  subscribes: [
    'pain:demo:*', 'pain:*', 'seo:gap', 'trend:*', 'content:request',
    'outreach:*', // Dripify results — which messaging actually got replies
  ],
  emits: ['content:draft'],
  useWebSearch: true,

  tools: [
    ...blogEngineTools,
    ...libraryTools,
    {
      name: 'recall_hive_knowledge',
      description:
        "Read what the hive already knows before you write, so you cite real clients, real industries and real wins instead of inventing them. Entity types include 'client', 'topic' (existing content drafts), 'query' and 'trend'. Use this every time you reach for a proof point, an industry example or a customer pain — and check it before drafting so you don't repeat a topic that's already been drafted. Drafts marked superseded-pre-blog-engine predate the operator pack: treat their topics as unwritten, but do not resurrect their text.",
      input_schema: {
        type: 'object',
        properties: {
          entity_type: {
            type: 'string',
            description: "Narrow to one type, e.g. 'client' or 'topic'. Omit to scan everything.",
          },
          contains: {
            type: 'string',
            description: 'Optional case-insensitive substring filter across the stored record.',
          },
          limit: { type: 'integer', description: 'Max records to return (default 15, max 40).' },
        },
      },
    },
    {
      name: 'request_proof_point',
      description:
        "Ask AJ for a fact you don't have — a client result, a number, permission you're missing. Use this instead of inventing or estimating anything. Sam never fabricates evidence; if the hive doesn't hold it, AJ supplies it.",
      input_schema: {
        type: 'object',
        properties: {
          what: { type: 'string', description: 'The specific fact you need, phrased as a question AJ can answer in one line.' },
          why: { type: 'string', description: 'What you would use it for — which draft and which claim it would support.' },
          source: { type: 'string', description: "Who or what should supply it. Defaults to 'aj'." },
        },
        required: ['what', 'why'],
      },
    },
    {
      name: 'propose_customer_quote',
      description:
        "AJ's standing rule: a direct customer quote, or a real client used as a hypothetical or worked example (even anonymised, even as 'a furniture company'), needs AJ's approval for that specific use BEFORE it appears in a draft. This tool raises the proposal with him. Only propose quotes that genuinely add value and aren't revealing or negative — if it fails either test, don't propose it. Draft without the quote while you wait; never treat a pending proposal as approval.",
      input_schema: {
        type: 'object',
        properties: {
          quote_or_example: {
            type: 'string',
            description: 'The exact quote verbatim, or the hypothetical framing you want to use.',
          },
          client: { type: 'string', description: 'Which customer it comes from or points at.' },
          where_from: {
            type: 'string',
            description: 'Where the words come from — a transcript, a review, an email. Never from memory.',
          },
          value_added: {
            type: 'string',
            description: 'One sentence: why the piece is genuinely better with this than without it.',
          },
          intended_use: {
            type: 'string',
            description: 'Which draft and where in it — quoted directly, or as an anonymised hypothetical.',
          },
        },
        required: ['quote_or_example', 'client', 'value_added', 'intended_use'],
      },
    },
    {
      name: 'draft_linkedin_post',
      description:
        "Draft a LinkedIn post in AJ's voice from a verified trigger (a search gap Ricky judged winnable, a pain he evidenced, or a request from AJ) and save it for review. Write the finished words yourself — hook in the first 1–3 lines, one idea explored properly, short paragraphs, a close that lands a point of view. Under ~1,300 characters total. Hard bans apply: no em dashes or double hyphens, no client or competitor names, no AI-design framing, canonical plan names only. This tool stores the draft and raises content:draft for AJ; it does NOT post anything anywhere. Any client name, number, percentage or testimonial must come with proof_source naming where it came from.",
      input_schema: {
        type: 'object',
        properties: {
          trigger: {
            type: 'string',
            description: "What sparked this, e.g. \"seo:gap 'unlimited graphic design agency australia'\" or \"pain:theme=slow-turnaround\".",
          },
          angle: {
            type: 'string',
            description: 'One sentence: the real insight here for AJ\'s audience. This is the spine of the post.',
          },
          post_type: {
            type: 'string',
            enum: ['proof-of-competence', 'did-a-thing', 'contrarian', 'practical-tip', 'soft-sell'],
            description: 'Rotate these across drafts so the feed does not read the same every week.',
          },
          audience: {
            type: 'string',
            enum: ['marketing-lead', 'founder', 'agency'],
            description: 'Who this one is written for. Defaults to marketing-lead.',
          },
          hook: { type: 'string', description: 'The first 1–3 lines only. True and interesting, not clickbait.' },
          body: { type: 'string', description: 'The rest of the post, blank lines between paragraphs.' },
          takeaway: {
            type: 'string',
            description: 'What the reader walks away with. If you cannot state it plainly, the post is not ready.',
          },
          why_this_lands: {
            type: 'string',
            description:
              'The case for the post, for AJ to decide from: which buyer this speaks to, what evidence says ' +
              'they feel it (name the signal, pain or Dripify reply data), and what the reader takes away. ' +
              'Real reasoning, not a label — a thin one is refused.',
          },
          proof_point: {
            type: 'string',
            description: 'Optional. The concrete result or number used in the post.',
          },
          proof_source: {
            type: 'string',
            description: "Required whenever proof_point is set: the knowledge entity_key it came from, or 'aj' if AJ supplied it directly. Never leave this blank to get a claim through.",
          },
        },
        required: ['trigger', 'angle', 'post_type', 'hook', 'body', 'takeaway', 'why_this_lands'],
      },
    },
    {
      name: 'draft_blog_post',
      description:
        "Draft a full blog post to the operator pack's standard and save it for AJ's review. Only for a queue item from content-queue.md or a query that has cleared the five gates in section 15 with evidence. Read the operator pack and L99-voice.md first, every time. The body must be the finished post: answer-first opening with the key number in paragraph one, question-shaped H2s (markdown ##), 1,200–1,800 words, demo CTA (https://designbees.com.au/demo) and trial CTA (https://designbees.com.au/pricing-plans), 2–4 supporting internal links, an FAQ section at the end with 4–6 reader-voice questions. Canonical pricing only if cost appears. This tool saves the draft and raises content:draft; it cannot publish, and nothing goes near Wix without AJ's approval.",
      input_schema: {
        type: 'object',
        properties: {
          queue_number: {
            type: 'integer',
            description: 'The item number from content-queue.md, if this is a queue item. Omit for a gate-cleared query.',
          },
          query: { type: 'string', description: 'The primary buyer query, in full question form. This is the H1 and SEO title.' },
          category: {
            type: 'string',
            enum: ['Outsourcing Design', 'Design Costs & Budgeting', 'Design Operations'],
            description: 'One of the three approved categories from the pack.',
          },
          slug: { type: 'string', description: 'kebab-case URL slug, no stop-word padding.' },
          meta_title: { type: 'string', description: 'Under 60 characters, query front-loaded, title case.' },
          meta_description: { type: 'string', description: 'Under 155 characters. Lead with the answer, give a reason to click.' },
          tags: { type: 'array', items: { type: 'string' }, description: '5–7 lowercase buyer-vocabulary tags.' },
          long_tail_cluster: {
            type: 'array',
            items: { type: 'string' },
            description: 'The 3–6 secondary phrasings this post structures into H2s and the FAQ, mined from real SERP/PAA/autocomplete — not invented.',
          },
          body: { type: 'string', description: 'The complete post in markdown, H1 first, FAQ section last.' },
          justification: {
            type: 'object',
            description:
              'THE CASE FOR THIS POST, written for AJ to make a decision from. He reads this before the ' +
              'draft, and a thin or hand-wavy case is refused rather than queued: every field is prose he ' +
              'can act on, not a label. Two bare URLs is not a justification.',
            properties: {
              ownership_check: {
                type: 'string',
                description:
                  'What you actually checked and what it said. Name the documents (keyword-ownership-map.md, ' +
                  'engine-content-map.md) and the live-post list, state whether any page or draft owns this ' +
                  'query or its cluster, and if something is adjacent say why this post targets a genuinely ' +
                  'different intent. If a term is on the contested list, say so.',
              },
              demand: {
                type: 'string',
                description:
                  'The evidence that buyers ask this. Real figures with their source where you have them ' +
                  "(Ricky's GSC or DataForSEO numbers, quoted as such), plus the phrasings you saw in " +
                  'autocomplete, People Also Ask or AI answers. Never a volume you did not receive from a tool.',
              },
              winnability: {
                type: 'string',
                description:
                  'Who ranks or answers today, what kind of pages they are, and the specific reason Design ' +
                  'Bees can beat them on this query — the Australia angle, a wrong price in the current ' +
                  'answers, a question nobody answers directly. Be concrete about the weakness you are attacking.',
              },
              value_to_design_bees: {
                type: 'string',
                description:
                  'The commercial case. Which buyer this reaches, where they are in the decision, how the ' +
                  'post bridges to a demo or trial, and what it wins or defends (a citation in AI answers, ' +
                  'a wrong competitor price corrected, an entry-plan buyer who lands on the right number). ' +
                  'If you cannot state the commercial bridge, the post should not be written.',
              },
              value_to_reader: {
                type: 'string',
                description:
                  'What a reader can do after reading that they could not before — the decision it settles, ' +
                  'the number they leave with, the mistake it saves them. Specific to this post; a sentence ' +
                  'that would fit any article means the post has no reason to exist.',
              },
              sources: {
                type: 'array',
                description:
                  'Per-claim sourcing for every figure, statistic or outside fact in the post beyond Design ' +
                  "Bees' own plan pricing. One entry per claim — the claim itself and exactly where it came from.",
                items: {
                  type: 'object',
                  properties: {
                    claim: { type: 'string', description: 'The claim or figure as it appears in the post.' },
                    source: { type: 'string', description: "URL you fetched, hive knowledge entity_key, Ricky's signal, or 'aj'." },
                  },
                  required: ['claim', 'source'],
                },
              },
            },
            required: ['ownership_check', 'demand', 'winnability', 'value_to_design_bees', 'value_to_reader'],
          },
        },
        required: ['query', 'category', 'slug', 'meta_title', 'meta_description', 'body', 'justification'],
      },
    },
    {
      name: 'draft_blog_outline',
      description:
        'Draft a blog outline targeting one specific search query — use this when the angle is promising but not yet gate-cleared enough for a full post, so AJ can green-light the direction cheaply. Give it a working title, the intent behind the query, the H2 sections as buyer questions, and one clear CTA. Saved as knowledge and raised as content:draft for AJ to approve. Same evidence rule: no invented clients, results, stats or volumes.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The exact search query this piece targets.' },
          search_intent: {
            type: 'string',
            enum: ['informational', 'commercial', 'comparison', 'transactional'],
            description: 'What the searcher actually wants when they type it.',
          },
          working_title: { type: 'string', description: 'Headline for the piece — the full question form, written for a human.' },
          summary: { type: 'string', description: 'Two or three sentences on the argument the piece makes.' },
          sections: {
            type: 'array',
            description: 'The H2 sections in order. Each heading is a question a buyer would ask.',
            items: {
              type: 'object',
              properties: {
                h2: { type: 'string', description: 'Section heading, question-shaped.' },
                covers: { type: 'string', description: 'What this section actually says.' },
              },
              required: ['h2', 'covers'],
            },
          },
          cta: { type: 'string', description: 'The single action the piece asks for at the end. Demo first.' },
          justification: {
            type: 'object',
            description:
              'The case for this direction, for AJ to green-light from. Same standard as a full post: real ' +
              'reasoning in every field, not labels.',
            properties: {
              ownership_check: { type: 'string', description: 'What you checked (ownership maps, live posts) and what it said about this query.' },
              demand: { type: 'string', description: 'Evidence buyers ask this, with figures and their source where you have them.' },
              winnability: { type: 'string', description: 'Who answers today and the specific weakness this piece attacks.' },
              value_to_design_bees: { type: 'string', description: 'Who it reaches, and how it bridges to a demo or trial.' },
              value_to_reader: { type: 'string', description: 'What the reader can do afterwards that they could not before.' },
              sources: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { claim: { type: 'string' }, source: { type: 'string' } },
                  required: ['claim', 'source'],
                },
                description: 'Per-claim sourcing for any figure named in the outline.',
              },
            },
            required: ['ownership_check', 'demand', 'winnability', 'value_to_design_bees', 'value_to_reader'],
          },
          trigger: { type: 'string', description: 'The signal this came from, e.g. the seo:gap topic.' },
        },
        required: ['query', 'search_intent', 'working_title', 'summary', 'sections', 'justification'],
      },
    },
  ],

  handlers: {
    ...blogEngineHandlers,
    ...libraryHandlers,
    recall_hive_knowledge: async (input, ctx) => {
      try {
        const limit = Math.min(Math.max(Number(input?.limit) || 15, 1), 40);
        const rows = (await ctx.allKnowledge(clean(input?.entity_type) || undefined)) || [];
        const needle = clean(input?.contains).toLowerCase();

        const matched = rows.filter((r) => {
          if (!needle) return true;
          return JSON.stringify([r.entity_key, r.data, r.source]).toLowerCase().includes(needle);
        });

        if (!matched.length) {
          return `Nothing in the hive matches${input?.entity_type ? ` type "${input.entity_type}"` : ''}${
            needle ? ` containing "${needle}"` : ''
          }. Don't fill the gap with a guess — use request_proof_point to ask AJ.`;
        }

        const lines = matched.slice(0, limit).map((r) => {
          const d = asObject(r.data);
          const facts = Object.entries(d)
            .filter(([, v]) => v != null && v !== '')
            .slice(0, 5)
            .map(([k, v]) => `${k}: ${oneLine(typeof v === 'object' ? JSON.stringify(v) : v, 70)}`)
            .join(' · ');
          return `• [${r.entity_type}] ${r.entity_key} (${r.confidence || 'fact'}) — ${facts || 'no fields'}`;
        });

        const more = matched.length > limit ? `\n…and ${matched.length - limit} more.` : '';
        return `${matched.length} record(s) in the hive:\n${lines.join('\n')}${more}\n\nOnly cite what's listed above. Anything else needs request_proof_point.`;
      } catch (e) {
        return `Couldn't read the knowledge base (${e.message}). Draft without proof points rather than inventing any, and flag the gap to AJ.`;
      }
    },

    request_proof_point: async (input, ctx) => {
      try {
        const what = clean(input?.what);
        const why = clean(input?.why);
        if (!what) return 'Nothing requested — say exactly which fact you need.';
        await ctx.requestData({ what, source: clean(input?.source) || 'aj', why: why || 'Needed for a content draft.' });
        return `Asked AJ for: "${what}". Carry on drafting without that claim — do not approximate it, and do not write around it in a way that implies you know it.`;
      } catch (e) {
        return `Couldn't log the request (${e.message}). Leave the claim out of the draft entirely and mention the gap when the draft goes to AJ.`;
      }
    },

    propose_customer_quote: async (input, ctx) => {
      try {
        const quote = clean(input?.quote_or_example);
        const client = clean(input?.client);
        const value = clean(input?.value_added);
        const use = clean(input?.intended_use);
        if (!quote || !client) return 'Need the exact quote/example and which client it points at. Nothing was raised.';
        if (!value || !use) return "Say what value it adds and exactly where it would be used — AJ approves specific uses, not quotes in the abstract.";

        await ctx.publish({
          topic: 'content:quote-proposal',
          title: `Quote/example proposal for AJ — ${oneLine(client, 60)}`,
          body:
            `Proposed: "${quote}"\n` +
            `Client: ${client}\n` +
            `From: ${clean(input?.where_from) || 'not stated'}\n` +
            `Value: ${value}\n` +
            `Use: ${use}\n\n` +
            `Awaiting AJ's approval. Not used in any draft yet.`,
          data: { quote, client, where_from: clean(input?.where_from) || null, value_added: value, intended_use: use, status: 'proposed' },
          confidence: 'unknown',
        });

        return (
          `Raised with AJ. Until he approves this specific use, the draft carries neither the quote nor a ` +
          `hypothetical that points at ${client}. Write the piece so it stands without it.`
        );
      } catch (e) {
        return `Couldn't raise the proposal (${e.message}). Leave the quote out entirely.`;
      }
    },

    draft_linkedin_post: async (input, ctx) => {
      try {
        const hook = clean(input?.hook);
        const body = clean(input?.body);
        const angle = clean(input?.angle);
        const takeaway = clean(input?.takeaway);
        const trigger = clean(input?.trigger) || 'unprompted';
        if (!hook || !body) return 'Need both a hook and a body before this can be saved. Nothing was stored.';
        if (!takeaway) return 'No takeaway stated, so the post is not ready. Say what the reader walks away with, then call this again.';
        const whyLands = clean(input?.why_this_lands);
        if (whyLands.length < 120) {
          return (
            `REJECTED — why_this_lands is ${whyLands.length} chars. AJ decides from your reasoning: name the ` +
            'buyer, the evidence they feel this, and what they take away. Nothing was saved.'
          );
        }

        const proofPoint = clean(input?.proof_point);
        const proofSource = clean(input?.proof_source);
        // The evidence rule is enforced here, not left to good intentions.
        if (proofPoint && !proofSource) {
          return `Refused to save: "${oneLine(proofPoint, 80)}" is a claim with no proof_source. Pull it from recall_hive_knowledge or ask AJ with request_proof_point, then draft again.`;
        }

        const text = `${hook}\n\n${body}`;
        const chars = text.length;
        const warnings = [...linkedinWarnings(text), ...quoteFlags(text)];
        const claims = unsourcedFigures(text, Boolean(proofSource));
        if (claims.length) {
          warnings.push(`Unsourced figures in the post: ${claims.join(', ')}. Set proof_source or cut them.`);
        }
        if (chars > 1300) warnings.push(`${chars} characters — over the ~1,300 LinkedIn sweet spot. Cut, don't compress.`);
        if (hook.split(/\n/).filter(Boolean).length > 3) warnings.push('Hook runs past 3 lines — only the first few show before "see more".');
        if (!/\n\s*\n/.test(body)) warnings.push('No blank lines in the body — it will read as a wall of text on mobile.');

        const key = `li-${slug(angle || hook)}`;
        const data = {
          format: 'linkedin-post',
          status: 'draft-awaiting-aj',
          standard: 'blog-engine-pack-2026-07',
          post_type: clean(input?.post_type) || 'practical-tip',
          audience: clean(input?.audience) || 'marketing-lead',
          angle,
          takeaway,
          hook,
          body,
          text,
          characters: chars,
          why_this_lands: whyLands,
          proof_point: proofPoint || null,
          proof_source: proofSource || null,
          voice_warnings: warnings,
          drafted_at: new Date().toISOString(),
        };

        await ctx.saveKnowledge({
          entity_type: 'topic',
          entity_key: key,
          data,
          source: { tool: 'draft_linkedin_post', trigger, proof_source: proofSource || null },
          worker_key: ctx.workerKey,
        });

        await ctx.publish({
          topic: 'content:draft',
          title: `LinkedIn draft: ${oneLine(hook, 90)}`,
          body: `${text}\n\n— Why it lands: ${whyLands}\n— Takeaway: ${takeaway}\n— Type: ${data.post_type} · for ${data.audience} · ${chars} chars\n— From: ${trigger}${
            proofPoint ? `\n— Proof: ${proofPoint} (source: ${proofSource})` : ''
          }${warnings.length ? `\n— Voice flags: ${warnings.join(' | ')}` : ''}\n\nDraft only — not posted. Approve or edit before it goes anywhere.`,
          data: { ...data, knowledge_key: key },
          confidence: 'hypothesis',
        });

        const flags = warnings.length
          ? `\nVoice flags to fix before AJ sees a second version:\n- ${warnings.join('\n- ')}`
          : '\nVoice checks passed.';
        return `Saved as knowledge topic "${key}" (${chars} chars) and raised as content:draft for AJ to review.${flags}\nNot posted — AJ approves and posts it himself.`;
      } catch (e) {
        return `Draft wasn't saved (${e.message}). Keep the text you wrote, fix the input and call draft_linkedin_post again. Nothing has been posted or sent.`;
      }
    },

    draft_blog_post: async (input, ctx) => {
      try {
        const query = clean(input?.query);
        const body = clean(input?.body);
        const category = clean(input?.category);
        if (!query) return 'No primary query given. The query is the post — nothing was stored.';
        if (!body) return 'No body given. This tool takes the finished post, not an intention to write one.';

        // The case for the post is gated before anything is stored: AJ decides
        // from this, so a thin one is a refusal, not a warning on a queued draft.
        const gate = checkJustification(input?.justification, { bodyText: body });
        if (!gate.ok) return gate.message;
        const j = input.justification;
        const sources = gate.sources;

        const metaTitle = clean(input?.meta_title);
        const metaDesc = clean(input?.meta_description);
        const words = body.split(/\s+/).filter(Boolean).length;

        const warnings = [...l99Warnings(body, { blog: true }), ...quoteFlags(body)];
        if (words < 1200 || words > 1800) warnings.push(`${words} words — the pack's range is 1,200 to 1,800.`);
        if (metaTitle.length > 60) warnings.push(`Meta title is ${metaTitle.length} chars — pack says under 60.`);
        if (metaDesc.length > 155) warnings.push(`Meta description is ${metaDesc.length} chars — pack says under 155.`);
        if (!/^##\s/m.test(body)) warnings.push('No H2 sections found. Every section heading is a buyer question.');
        if (!/faq/i.test(body)) warnings.push('No FAQ section found — the FAQ block feeds FAQPage schema and is non-negotiable.');
        const h2s = body.match(/^##\s+(.+)$/gm) || [];
        const nonQuestion = h2s.filter((h) => !/\?\s*$/.test(h) && !/faq/i.test(h));
        if (nonQuestion.length) warnings.push(`${nonQuestion.length} H2(s) are statements, not buyer questions.`);

        const key = `blogpost-${slug(input?.slug || query)}`;
        const data = {
          format: 'blog-post',
          status: 'draft-awaiting-aj',
          standard: 'blog-engine-pack-2026-07',
          queue_number: Number.isInteger(input?.queue_number) ? input.queue_number : null,
          query,
          category,
          slug: clean(input?.slug) || slug(query),
          meta_title: metaTitle,
          meta_description: metaDesc,
          tags: Array.isArray(input?.tags) ? input.tags.map(clean).filter(Boolean) : [],
          long_tail_cluster: Array.isArray(input?.long_tail_cluster) ? input.long_tail_cluster.map(clean).filter(Boolean) : [],
          schema: 'Article + FAQPage',
          author: 'AJ Kavanagh',
          word_count: words,
          body,
          // The full case, structured for the dashboard and kept as the record
          // of why this post was written.
          justification: {
            ownership_check: clean(j.ownership_check),
            demand: clean(j.demand),
            winnability: clean(j.winnability),
            value_to_design_bees: clean(j.value_to_design_bees),
            value_to_reader: clean(j.value_to_reader),
            sources: sources.map((s) => ({ claim: clean(s.claim), source: clean(s.source) })),
          },
          demand_evidence: clean(j.demand), // kept for anything reading the old field
          voice_warnings: warnings,
          drafted_at: new Date().toISOString(),
        };

        await ctx.saveKnowledge({
          entity_type: 'topic',
          entity_key: key,
          data,
          source: { tool: 'draft_blog_post', justification: data.justification },
          worker_key: ctx.workerKey,
        });

        await ctx.publish({
          topic: 'content:draft',
          title: `Blog draft${data.queue_number ? ` (queue #${data.queue_number})` : ''}: ${oneLine(query, 90)}`,
          body:
            `${query}\nCategory: ${category} · ${words} words · slug: ${data.slug}\n` +
            `Meta: ${metaTitle} / ${metaDesc}\n\n${justificationText(j, sources)}\n\n` +
            `${body.slice(0, 1200)}${body.length > 1200 ? '\n…[full draft on /approve]' : ''}` +
            `${warnings.length ? `\n\nFlags: ${warnings.join(' | ')}` : ''}\n\nDraft only — AJ approves before anything goes near Wix.`,
          data: { knowledge_key: key, query, category, word_count: words, queue_number: data.queue_number },
          confidence: 'hypothesis',
        });

        const flags = warnings.length ? `\nFlags to fix:\n- ${warnings.join('\n- ')}` : '\nL99 machine checks passed — still run the full section 10 checklist yourself.';
        return `Saved as knowledge topic "${key}" (${words} words) and raised as content:draft for AJ.${flags}\nNot published — AJ approves before anything goes near Wix.`;
      } catch (e) {
        return `Draft wasn't saved (${e.message}). Fix the input and call draft_blog_post again. Nothing has been published.`;
      }
    },

    draft_blog_outline: async (input, ctx) => {
      try {
        const query = clean(input?.query);
        const title = clean(input?.working_title);
        const summary = clean(input?.summary);
        const sections = Array.isArray(input?.sections) ? input.sections : [];
        if (!query) return 'No target query given — a blog outline without one is guesswork. Nothing was stored.';
        if (!title || !sections.length) return 'Need a working title and at least one section before this can be saved.';

        const flat = [title, summary, ...sections.map((s) => `${clean(s?.h2)} ${clean(s?.covers)}`)].join('\n');
        const gate = checkJustification(input?.justification, { bodyText: flat });
        if (!gate.ok) return gate.message;
        const j = input.justification;
        const sources = gate.sources;
        const warnings = [...l99Warnings(flat), ...quoteFlags(flat)];
        const claims = [];
        if (claims.length) {
          warnings.push(`Unsourced figures in the outline: ${claims.join(', ')}. Source them or cut them.`);
        }
        if (sections.length < 3) warnings.push('Fewer than 3 sections — likely too thin to rank for anything.');
        const nonQuestion = sections.filter((s) => !/\?\s*$/.test(clean(s?.h2)) && !/faq/i.test(clean(s?.h2)));
        if (nonQuestion.length) warnings.push(`${nonQuestion.length} H2(s) are statements — the pack wants question-shaped headings.`);

        const key = `blog-${slug(query)}`;
        const outline = sections
          .map((s, i) => `${i + 1}. ${clean(s?.h2) || 'Untitled section'}\n   ${clean(s?.covers)}`)
          .join('\n');
        const data = {
          format: 'blog-outline',
          status: 'draft-awaiting-aj',
          standard: 'blog-engine-pack-2026-07',
          query,
          search_intent: clean(input?.search_intent) || 'informational',
          working_title: title,
          summary,
          sections: sections.map((s) => ({ h2: clean(s?.h2), covers: clean(s?.covers) })),
          cta: clean(input?.cta) || null,
          justification: {
            ownership_check: clean(j.ownership_check),
            demand: clean(j.demand),
            winnability: clean(j.winnability),
            value_to_design_bees: clean(j.value_to_design_bees),
            value_to_reader: clean(j.value_to_reader),
            sources: sources.map((x) => ({ claim: clean(x.claim), source: clean(x.source) })),
          },
          voice_warnings: warnings,
          drafted_at: new Date().toISOString(),
        };

        await ctx.saveKnowledge({
          entity_type: 'topic',
          entity_key: key,
          data,
          source: { tool: 'draft_blog_outline', trigger: clean(input?.trigger) || `query:${query}`, justification: data.justification },
          worker_key: ctx.workerKey,
        });

        await ctx.publish({
          topic: 'content:draft',
          title: `Blog outline: ${title}`,
          body: `Target query: "${query}" (${data.search_intent})\n\n${justificationText(j, sources)}\n\n${summary}\n\n${outline}\n\nCTA: ${
            data.cta || 'none set'
          }${warnings.length ? `\n\nFlags: ${warnings.join(' | ')}` : ''}\n\nOutline only — nothing written or published yet.`,
          data: { ...data, knowledge_key: key },
          confidence: 'hypothesis',
        });

        const flags = warnings.length ? `\nFlags:\n- ${warnings.join('\n- ')}` : '\nVoice checks passed.';
        return `Saved as knowledge topic "${key}" (${sections.length} sections) and raised as content:draft for AJ.${flags}\nNot published — AJ decides what gets written.`;
      } catch (e) {
        return `Outline wasn't saved (${e.message}). Fix the input and call draft_blog_outline again. Nothing has been published.`;
      }
    },
  },

  daily: {
    hourSydney: 7,
    prompt: `Morning content pass. Read the operator pack and L99-voice.md with read_blog_engine_doc first — never from memory. Call list_live_blog_posts and check recall_hive_knowledge for topics already drafted so you neither repeat yourself nor cannibalise a live post (drafts marked superseded-pre-blog-engine predate the pack; their topics count as unwritten, their text stays dead). Then look at the newest seo:gap and pain signals. If content-queue.md has an undrafted, non-AJ-MANUAL item, that outranks anything you'd propose. Draft at most ONE piece, and only if its demand is verified — a queue item, a gate-cleared query, or a Tom-assessed gap. If nothing qualifies, say so plainly and draft nothing rather than filling the slot. Any client quote or client-shaped hypothetical goes through propose_customer_quote before it appears in a draft. Drafts only: AJ reviews and posts.`,
  },
};
