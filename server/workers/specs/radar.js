import { tools as transcriptTools, handlers as transcriptHandlers } from '../transcript-tools.js';
import { tools as skillTools, handlers as skillHandlers } from '../skill-scout.js';
import {
  tools as blogEngineTools,
  handlers as blogEngineHandlers,
  PLAN_LINE,
  ANALYTICS_STATUS,
} from '../blog-engine.js';
import { tools as libraryTools, handlers as libraryHandlers } from '../../content-library.js';
import { tools as analyticsTools, handlers as analyticsHandlers } from '../analytics-tools.js';
import { tools as queryTools, handlers as queryHandlers } from '../query-tools.js';
// Ricky — Research (worker key: radar). The entry point of the hive's cascade:
// he goes looking for pain in the market, and every finding he records is
// published as a signal so the teammates downstream (Ian on ICP, then the rest)
// wake up and act on it. Nothing he finds is allowed to exist without a URL
// attached — the whole chain inherits his sourcing, so a guess here poisons
// everything after it.

// Reddit's public JSON endpoints are unauthenticated but they hard-block the
// default Node UA, so every request must carry a real one.
const UA = 'designbees-hive/1.0 (research worker; contact aj@designbees.com.au)';
const REDDIT_TIMEOUT_MS = 12000;

// Where the buyers actually complain. Not a whitelist — just the shortlist
// Ricky is pointed at when he has no better idea.
const HOME_SUBS = [
  'graphic_design',
  'marketing',
  'Entrepreneur',
  'smallbusiness',
  'SEO',
  'advertising',
];

const CONFIDENCE = new Set(['fact', 'hypothesis', 'unknown']);

const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** Reddit JSON with a UA, a timeout, and no throwing. Returns {ok, data|error}. */
async function redditJson(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(REDDIT_TIMEOUT_MS),
    });
    if (!res.ok) {
      // 403/429 here almost always means rate-limiting, not a bad subreddit.
      return { ok: false, error: `Reddit returned HTTP ${res.status} for ${url}` };
    }
    const json = await res.json();
    const children = json?.data?.children;
    if (!Array.isArray(children)) return { ok: false, error: `Unexpected Reddit payload from ${url}` };
    return { ok: true, posts: children.map((c) => c?.data).filter(Boolean) };
  } catch (err) {
    return { ok: false, error: `Reddit fetch failed (${url}): ${err?.message || err}` };
  }
}

function formatPosts(posts, { limit = 25 } = {}) {
  return posts
    .filter((p) => !p.stickied)
    .slice(0, limit)
    .map((p, i) => {
      const body = p.selftext ? `\n   ${clip(p.selftext, 320)}` : '';
      const flair = p.link_flair_text ? ` [${p.link_flair_text}]` : '';
      return (
        `${i + 1}. ${clip(p.title, 180)}${flair}\n` +
        `   r/${p.subreddit} · ${p.score} upvotes · ${p.num_comments} comments · ` +
        `https://www.reddit.com${p.permalink}${body}`
      );
    })
    .join('\n\n');
}

/** Shared write path for pains and trends: merge into knowledge, then publish. */
async function recordAndPublish(ctx, { entityType, entityKey, bucket, record, topic, title, body, confidence }) {
  const existing = await ctx.getKnowledge(entityType, entityKey).catch(() => null);
  const prior = existing?.data?.[bucket] && typeof existing.data[bucket] === 'object' ? existing.data[bucket] : {};

  // knowledge writes merge shallowly, so the whole bucket has to be rewritten
  // with the previous entries carried across or earlier findings vanish.
  await ctx.saveKnowledge({
    entity_type: entityType,
    entity_key: entityKey,
    data: { [bucket]: { ...prior, [record.id]: record } },
    source: { tool: 'radar', evidence: record.evidence, recorded_at: record.recorded_at },
    worker_key: ctx.workerKey,
  });

  await ctx.publish({ topic, title, body, data: record, confidence });
  return Object.keys(prior).length;
}

/** Evidence gate — nothing gets written without at least one real URL. */
function checkEvidence(evidence) {
  const rows = Array.isArray(evidence) ? evidence.filter((e) => e && e.url) : [];
  if (!rows.length) {
    return {
      ok: false,
      message:
        'REJECTED — no evidence. Every pain point and trend needs at least one `evidence` entry ' +
        'with a real `url` (a Reddit permalink, an article, a search result you actually opened). ' +
        'Go and find the source, then call this again. Never invent one.',
    };
  }
  const bad = rows.find((e) => !/^https?:\/\//i.test(String(e.url)));
  if (bad) {
    return { ok: false, message: `REJECTED — "${bad.url}" is not a URL. Evidence must be a real http(s) link.` };
  }
  return {
    ok: true,
    rows: rows.map((e) => ({
      url: String(e.url),
      quote: clip(e.quote, 400) || null,
      source_type: e.source_type || 'web',
      observed_at: new Date().toISOString(),
    })),
  };
}

export default {
  key: 'radar',
  name: 'Ricky',
  emoji: '📡',
  title: 'Research',

  brief: `You are Ricky, the Research teammate in the Design Bees hive — an Australian design-subscription agency selling unlimited graphic design on a monthly plan (${PLAN_LINE} — in anything customer-facing the names are exactly Worker Bee, Buzz Basics, Honey Comb and Nectar Pro, four plans, never "Honeycomb Plus"). You own the outside world: Reddit, industry news, forums, competitor content and the open web, hunting for pain points around graphic design, branding and marketing collateral that Design Bees is genuinely positioned to solve, plus trends worth acting on this quarter. You are the first domino in the cascade — when you record a pain you publish a signal, which wakes Ian to check whether that industry or role has actually been good business for us historically, so a finding you keep to yourself is a finding that never happened. Aim your attention at in-house marketing decision-makers (Marketing Manager → Head of Marketing → CMO) at 11–200 staff companies and at small-business founders, and pay extra attention to IT services/software, health care, education, construction and insurance, where we already win. The hive's hard rule is evidence-only: every fact you save must carry a real source — a Reddit permalink, an article URL, the exact search you ran — and you never invent, round up, or "estimate" a number, a percentage or a quote; if you cannot link it, you do not save it, and if you need sourcing you cannot reach yourself you call request_sourcing instead of guessing. Prefer specific, quotable complaints over generic market commentary: one founder describing a three-week turnaround from their agency is worth more than a paragraph about the design industry. Check recall_knowledge before you go digging so you build on what the hive already knows rather than rediscovering it, and when a scan genuinely turns up nothing worth escalating, say so plainly instead of manufacturing a finding.

YOU ALSO OWN AEO/SEO DEMAND RESEARCH for the blog engine — the whole of it, including the verdicts. (This moved to you from Tom on 2026-07-26: demand judging is research, and you hold the tools.) AJ's content standard ships with the repo — read BLOG-ENGINE-OPERATOR-PACK.md with read_blog_engine_doc before doing any content-related research. Sections 15 to 17 are your job description on that front: run candidate queries through the five gates (intent, real demand, winnability, answer gap, honest fit), mine the demand signals — live SERP autocomplete, People Also Ask, related searches, what the AI answer engines already say, real impressions from gsc_search_analytics once connected, and real volumes from keyword_volume when configured — then record your verdict with assess_query. A "gap" verdict from you is what licenses Sam to write, so do not hand one over lightly: check recall_queries first so you never re-judge a fresh verdict, demand top_results you actually saw, and summarise each pass with record_landscape. Check whether the current AI answers miss Design Bees or quote a wrong price (competitor prices like $499 and $349 have bled in when the real floor is $545 — catching that is a high-value finding). Own the Australia angle; the global head terms are owned by entrenched incumbents and are a no-go.

${ANALYTICS_STATUS}`,

  subscribes: [
    'pain:demo:*',
    'request:research',       // AJ or a teammate explicitly asks for research
    'request:research:*',     // scoped asks, e.g. request:research:competitor
    'icp:validated',          // Ian confirmed a segment — judge its queries
    'icp:rejected',           // Ian killed a segment — stop and redirect
    'content:needs-evidence', // a writer needs a sourced stat or quote
    'topic:proposed',         // a candidate content topic needs a demand verdict
    'seo:recheck',            // a stale verdict is due for re-judging
  ],

  emits: [
    'pain:*',            // pain:industry=construction, pain:role=marketing-manager, pain:theme=slow-turnaround
    'trend:*',           // trend:ai-brand-guidelines
    'competitor:*',      // competitor:canva-enterprise
    'research:summary',  // a scan that produced findings
    'research:empty',    // a scan that honestly produced nothing
    'seo:gap',           // a winnable query — licenses Sam to write
    'seo:saturated',     // a dead end, recorded so nobody chases it again
    'seo:landscape',     // the topic-level picture after a research pass
  ],

  useWebSearch: true,

  tools: [
    ...transcriptTools,
    ...skillTools,
    ...blogEngineTools,
    ...libraryTools,
    ...analyticsTools,
    ...queryTools,
    {
      name: 'reddit_scan',
      description:
        'Fetch top/hot/new posts from a public subreddit via Reddit\'s free JSON API. Use this first — it is where ' +
        'buyers complain in their own words. Good subs: ' + HOME_SUBS.map((s) => `r/${s}`).join(', ') + '. ' +
        'Returns titles, scores, comment counts, permalinks and post text. Permalinks are valid evidence URLs.',
      input_schema: {
        type: 'object',
        properties: {
          subreddit: { type: 'string', description: 'Subreddit name without the r/ prefix, e.g. "smallbusiness".' },
          sort: { type: 'string', enum: ['top', 'hot', 'new'], description: 'Listing to read. Default "top".' },
          timeframe: {
            type: 'string',
            enum: ['day', 'week', 'month', 'year'],
            description: 'Only applies to sort="top". Default "week".',
          },
          limit: { type: 'integer', description: 'How many posts, 1-50. Default 25.' },
        },
        required: ['subreddit'],
      },
    },
    {
      name: 'reddit_search',
      description:
        'Search Reddit for a phrase, either site-wide or inside one subreddit. Use it to test a specific hypothesis ' +
        '("brand guidelines", "design turnaround", "hiring a designer") rather than browsing a whole listing.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search phrase. Quote it for an exact match.' },
          subreddit: { type: 'string', description: 'Optional — restrict the search to this subreddit.' },
          timeframe: { type: 'string', enum: ['week', 'month', 'year', 'all'], description: 'Default "year".' },
          limit: { type: 'integer', description: 'How many results, 1-50. Default 25.' },
        },
        required: ['query'],
      },
    },
    {
      name: 'record_pain',
      description:
        'Record a pain point as hive knowledge AND publish it as a signal that wakes the teammates downstream ' +
        '(Ian checks the segment against our real client history). Use this the moment you have a specific, ' +
        'sourced complaint that Design Bees could solve. Requires at least one evidence URL — calls without one ' +
        'are rejected.',
      input_schema: {
        type: 'object',
        properties: {
          segment_type: {
            type: 'string',
            enum: ['industry', 'role', 'company_size', 'theme'],
            description: 'How the pain is segmented. "theme" for a cross-cutting pain with no single segment.',
          },
          segment: {
            type: 'string',
            description: 'The segment itself, e.g. "construction", "marketing manager", "11-50", "slow turnaround".',
          },
          pain: { type: 'string', description: 'The pain in one plain sentence, in the buyer\'s language.' },
          why_design_bees: {
            type: 'string',
            description: 'How a Design Bees subscription answers this specific pain. Be concrete about the plan fit.',
          },
          strength: {
            type: 'string',
            enum: ['weak', 'moderate', 'strong'],
            description: 'How loud the signal is: one offhand comment vs. a recurring, heavily upvoted complaint.',
          },
          confidence: {
            type: 'string',
            enum: ['fact', 'hypothesis', 'unknown'],
            description: '"fact" only when the evidence directly states it. Read-between-the-lines is "hypothesis".',
          },
          evidence: {
            type: 'array',
            description: 'At least one real source. Never fabricate a URL or a quote.',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'Reddit permalink, article URL or search-result URL.' },
                quote: { type: 'string', description: 'The exact words that show the pain. Verbatim only.' },
                source_type: { type: 'string', enum: ['reddit', 'web', 'news', 'forum', 'competitor'] },
              },
              required: ['url'],
            },
          },
        },
        required: ['segment_type', 'segment', 'pain', 'evidence'],
      },
    },
    {
      name: 'record_trend',
      description:
        'Record a market trend as hive knowledge AND publish a trend signal. Use for shifts worth acting on ' +
        '(what buyers are asking for, what competitors are pushing, what is changing in how design gets bought) ' +
        'rather than for an individual complaint — that is record_pain. Requires at least one evidence URL.',
      input_schema: {
        type: 'object',
        properties: {
          trend: { type: 'string', description: 'The trend in one sentence.' },
          topic_key: { type: 'string', description: 'Short slug for the trend, e.g. "ai-brand-guidelines".' },
          why_it_matters: { type: 'string', description: 'What Design Bees should do differently because of it.' },
          horizon: {
            type: 'string',
            enum: ['now', 'quarter', 'year'],
            description: 'How soon this needs a response.',
          },
          is_competitor: {
            type: 'boolean',
            description: 'True if this is competitor movement — publishes on competitor:* instead of trend:*.',
          },
          confidence: { type: 'string', enum: ['fact', 'hypothesis', 'unknown'] },
          evidence: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                quote: { type: 'string' },
                source_type: { type: 'string', enum: ['reddit', 'web', 'news', 'forum', 'competitor'] },
              },
              required: ['url'],
            },
          },
        },
        required: ['trend', 'topic_key', 'evidence'],
      },
    },
    {
      name: 'recall_knowledge',
      description:
        'Read what the hive already knows before you research. Pass entity_type + entity_key for one entity, ' +
        'entity_type alone to list a category, or nothing for everything. Use it to avoid re-reporting a pain ' +
        'the hive recorded last week and to build on what Ian already validated.',
      input_schema: {
        type: 'object',
        properties: {
          entity_type: {
            type: 'string',
            enum: ['company', 'person', 'industry', 'query', 'topic'],
          },
          entity_key: { type: 'string', description: 'Domain, email or slug. Omit to list the whole type.' },
        },
      },
    },
    {
      name: 'request_sourcing',
      description:
        'Ask the hive for data you cannot get yourself — LinkedIn profiles, Clay enrichment, Wix revenue, inbox or ' +
        'calendar history. Use this instead of estimating. It queues the request; it does not return the data now.',
      input_schema: {
        type: 'object',
        properties: {
          what: { type: 'string', description: 'Exactly what you need, specific enough for someone to go and get it.' },
          source: {
            type: 'string',
            enum: ['web', 'linkedin', 'clay', 'reddit', 'wix', 'gmail', 'calendar'],
          },
          why: { type: 'string', description: 'What decision this unblocks.' },
        },
        required: ['what', 'source', 'why'],
      },
    },
  ],

  handlers: {
    ...transcriptHandlers,
    ...skillHandlers,
    ...blogEngineHandlers,
    ...libraryHandlers,
    ...analyticsHandlers,
    ...queryHandlers,
    reddit_scan: async (input = {}) => {
      try {
        const sub = slug(input.subreddit).replace(/-/g, '_');
        if (!sub) return 'No subreddit given. Try one of: ' + HOME_SUBS.join(', ');
        const sort = ['top', 'hot', 'new'].includes(input.sort) ? input.sort : 'top';
        const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 50);
        const t = ['day', 'week', 'month', 'year'].includes(input.timeframe) ? input.timeframe : 'week';
        const qs = sort === 'top' ? `?t=${t}&limit=${limit}` : `?limit=${limit}`;
        const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/${sort}.json${qs}`;

        const r = await redditJson(url);
        if (!r.ok) return `${r.error}\nTry a different subreddit or sort, or fall back to web search.`;
        if (!r.posts.length) return `r/${sub} returned no posts for ${sort}/${t}. Try a wider timeframe.`;

        return (
          `r/${sub} — ${sort}${sort === 'top' ? `/${t}` : ''} (${r.posts.length} posts, ${url})\n\n` +
          formatPosts(r.posts, { limit })
        );
      } catch (err) {
        return `reddit_scan failed: ${err?.message || err}. Nothing was saved.`;
      }
    },

    reddit_search: async (input = {}) => {
      try {
        const q = String(input.query || '').trim();
        if (!q) return 'No search phrase given.';
        const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 50);
        const t = ['week', 'month', 'year', 'all'].includes(input.timeframe) ? input.timeframe : 'year';
        const sub = input.subreddit ? slug(input.subreddit).replace(/-/g, '_') : '';
        const base = sub ? `https://www.reddit.com/r/${encodeURIComponent(sub)}/search.json` : 'https://www.reddit.com/search.json';
        const url =
          `${base}?q=${encodeURIComponent(q)}&sort=relevance&t=${t}&limit=${limit}` +
          (sub ? '&restrict_sr=1' : '');

        const r = await redditJson(url);
        if (!r.ok) return `${r.error}\nFall back to web search for this one.`;
        if (!r.posts.length) {
          return `No Reddit results for "${q}"${sub ? ` in r/${sub}` : ''} (${t}). Widen the timeframe or rephrase — do not treat silence as evidence.`;
        }
        return (
          `Reddit search "${q}"${sub ? ` in r/${sub}` : ''} · ${t} (${r.posts.length} results, ${url})\n\n` +
          formatPosts(r.posts, { limit })
        );
      } catch (err) {
        return `reddit_search failed: ${err?.message || err}. Nothing was saved.`;
      }
    },

    record_pain: async (input = {}, ctx) => {
      try {
        const gate = checkEvidence(input.evidence);
        if (!gate.ok) return gate.message;

        const segmentType = ['industry', 'role', 'company_size', 'theme'].includes(input.segment_type)
          ? input.segment_type
          : 'theme';
        const segment = slug(input.segment);
        if (!segment) return 'REJECTED — `segment` is empty. Name the industry, role, size band or theme.';
        const pain = String(input.pain || '').trim();
        if (!pain) return 'REJECTED — `pain` is empty. State the pain in one sentence.';

        const confidence = CONFIDENCE.has(input.confidence) ? input.confidence : 'hypothesis';
        const strength = ['weak', 'moderate', 'strong'].includes(input.strength) ? input.strength : 'moderate';

        const record = {
          id: `pain-${slug(pain).slice(0, 40)}-${Date.now().toString(36)}`,
          kind: 'pain',
          segment_type: segmentType,
          segment,
          pain,
          why_design_bees: input.why_design_bees || null,
          strength,
          confidence,
          evidence: gate.rows,
          recorded_at: new Date().toISOString(),
        };

        // Industries get their own entity so Ian can look one up directly.
        const entityType = segmentType === 'industry' ? 'industry' : 'topic';
        const entityKey = segmentType === 'industry' ? segment : `${segmentType}:${segment}`;
        const topic = `pain:${segmentType}=${segment}`;

        const priorCount = await recordAndPublish(ctx, {
          entityType,
          entityKey,
          bucket: 'pains',
          record,
          topic,
          title: `Pain (${segmentType}: ${segment}) — ${clip(pain, 110)}`,
          body:
            `${pain}\n\n` +
            (record.why_design_bees ? `Design Bees fit: ${record.why_design_bees}\n\n` : '') +
            `Strength: ${strength}\n` +
            `Evidence:\n${gate.rows.map((e) => `• ${e.url}${e.quote ? ` — "${e.quote}"` : ''}`).join('\n')}`,
          confidence,
        });

        return (
          `Recorded and published.\n` +
          `topic: ${topic}\nknowledge: ${entityType}/${entityKey} (${priorCount} pain(s) already on file)\n` +
          `evidence: ${gate.rows.length} source(s)\n` +
          `Ian and anyone subscribed to pain:* have been woken. Keep scanning, or record the next one.`
        );
      } catch (err) {
        return `record_pain failed: ${err?.message || err}. Nothing was published — fix the input and retry.`;
      }
    },

    record_trend: async (input = {}, ctx) => {
      try {
        const gate = checkEvidence(input.evidence);
        if (!gate.ok) return gate.message;

        const trend = String(input.trend || '').trim();
        if (!trend) return 'REJECTED — `trend` is empty.';
        const key = slug(input.topic_key || trend);
        if (!key) return 'REJECTED — `topic_key` could not be turned into a slug.';

        const confidence = CONFIDENCE.has(input.confidence) ? input.confidence : 'hypothesis';
        const horizon = ['now', 'quarter', 'year'].includes(input.horizon) ? input.horizon : 'quarter';
        const isCompetitor = input.is_competitor === true;

        const record = {
          id: `trend-${key}-${Date.now().toString(36)}`,
          kind: isCompetitor ? 'competitor' : 'trend',
          trend,
          topic_key: key,
          why_it_matters: input.why_it_matters || null,
          horizon,
          confidence,
          evidence: gate.rows,
          recorded_at: new Date().toISOString(),
        };

        const topic = `${isCompetitor ? 'competitor' : 'trend'}:${key}`;
        const priorCount = await recordAndPublish(ctx, {
          entityType: 'topic',
          entityKey: key,
          bucket: isCompetitor ? 'competitor_moves' : 'trends',
          record,
          topic,
          title: `${isCompetitor ? 'Competitor' : 'Trend'} — ${clip(trend, 110)}`,
          body:
            `${trend}\n\n` +
            (record.why_it_matters ? `Why it matters: ${record.why_it_matters}\n\n` : '') +
            `Horizon: ${horizon}\n` +
            `Evidence:\n${gate.rows.map((e) => `• ${e.url}${e.quote ? ` — "${e.quote}"` : ''}`).join('\n')}`,
          confidence,
        });

        return (
          `Recorded and published.\ntopic: ${topic}\nknowledge: topic/${key} ` +
          `(${priorCount} entry/entries already on file)\nevidence: ${gate.rows.length} source(s)`
        );
      } catch (err) {
        return `record_trend failed: ${err?.message || err}. Nothing was published.`;
      }
    },

    recall_knowledge: async (input = {}, ctx) => {
      try {
        if (input.entity_type && input.entity_key) {
          const row = await ctx.getKnowledge(input.entity_type, input.entity_key);
          if (!row) return `Nothing on file for ${input.entity_type}/${input.entity_key}. This is new ground.`;
          return `${input.entity_type}/${input.entity_key} (updated ${row.updated_at || 'unknown'}):\n` +
            clip(JSON.stringify(row.data ?? {}), 4000);
        }
        const rows = await ctx.allKnowledge(input.entity_type);
        if (!rows?.length) return `The hive has no knowledge${input.entity_type ? ` of type ${input.entity_type}` : ''} yet.`;
        const listed = rows.slice(0, 60).map((r) => {
          const d = r.data || {};
          const counts = ['pains', 'trends', 'competitor_moves']
            .map((b) => (d[b] ? `${Object.keys(d[b]).length} ${b}` : null))
            .filter(Boolean)
            .join(', ');
          return `• ${r.entity_type}/${r.entity_key}${counts ? ` — ${counts}` : ''}`;
        });
        const more = rows.length > 60 ? `\n…and ${rows.length - 60} more` : '';
        return `Hive knowledge (${rows.length} entities):\n${listed.join('\n')}${more}\n` +
          `Call recall_knowledge with entity_key for the detail on any one.`;
      } catch (err) {
        return `recall_knowledge failed: ${err?.message || err}. Carry on, but assume you know nothing yet.`;
      }
    },

    request_sourcing: async (input = {}, ctx) => {
      try {
        if (!input.what || !input.source) return 'Need both `what` and `source` to queue a request.';
        await ctx.requestData({ what: input.what, source: input.source, why: input.why || 'research' });
        return `Queued: "${clip(input.what, 160)}" via ${input.source}. Do not wait on it and do not estimate the answer — carry on with what you can source yourself.`;
      } catch (err) {
        return `request_sourcing failed: ${err?.message || err}. The request was not queued.`;
      }
    },
  },

  daily: {
    hourSydney: 7,
    prompt:
      `Morning sweep. Call recall_knowledge first so you do not re-report what the hive already has. ` +
      `Then scan two or three of r/${HOME_SUBS.join(', r/')} (top/week) and run one or two targeted reddit_search ` +
      `queries on themes that matter to us — design turnaround times, the cost of hiring an in-house designer, ` +
      `agency retainers, brand consistency, "we need a designer". Use web search for anything Australian, ` +
      `industry-specific (IT services/software, health care, education, construction, insurance) or competitor-related. ` +
      `Record every genuinely new, sourced pain with record_pain and every shift worth acting on with record_trend — ` +
      `aim for quality over volume: two well-evidenced findings beat ten thin ones. If the sweep turns up nothing new, ` +
      `say so honestly and record nothing. Finish with a short brief for AJ: what you found, which segments it points at, ` +
      `and the links.`,
  },
};
