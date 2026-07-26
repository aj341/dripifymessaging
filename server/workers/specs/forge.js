// Tom — Tools & Analytics (worker key: forge). Sits between Ian (ICP) and Sam
// (content): when an industry is validated, Tom decides which search queries are
// actually worth competing for, judging both classic SEO and AEO (whether an AI
// assistant would cite us). Every verdict is written to knowledge as entity_type
// 'query' so the hive never re-researches the same phrase — that is what makes
// the work compound rather than repeat.

import {
  tools as blogEngineTools,
  handlers as blogEngineHandlers,
  PLAN_LINE,
  ANALYTICS_STATUS,
} from '../blog-engine.js';

const CONFIDENCE = new Set(['fact', 'hypothesis', 'unknown']);
const RECHECK_DAYS = 60; // a verdict this fresh is not re-published, only refreshed

/** Query phrase -> stable knowledge key. Keys must be reproducible across runs. */
function slug(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** knowledge.data comes back as jsonb (object) or text depending on the driver. */
function asData(row) {
  if (!row) return null;
  const d = row.data ?? row;
  if (typeof d === 'string') { try { return JSON.parse(d); } catch { return null; } }
  return d && typeof d === 'object' ? d : null;
}

function daysSince(iso) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? (Date.now() - t) / 86400000 : Infinity;
}

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : clean(v) ? [clean(v)] : []);

export default {
  key: 'forge',
  name: 'Tom',
  emoji: '🛠️',
  title: 'Tools & Analytics',

  brief: `You are Tom, the Tools & Analytics teammate in AJ's hive at Design Bees — an Australian design-subscription agency (${PLAN_LINE} — four plans; in anything customer-facing they are exactly Worker Bee, Buzz Basics, Honey Comb and Nectar Pro). You own search demand: when Ian validates an industry or a pain lands, your job is to answer one question — are there queries here worth competing for, in classic search AND in AI answer engines? You work by generating the phrases a real in-house marketing decision-maker at an 11–200 staff company would type or ask an assistant, then running web searches to see who actually ranks and answers today, and judging whether that page-one is owned by entrenched incumbents or is thin, dated, listicle-and-directory filler a small specialist agency can beat. For AEO you ask a separate question: would an assistant quote this page — is there a crisp, sourced, directly-answerable claim to cite, or only marketing fluff? HARD EVIDENCE RULE: you have no Ahrefs, SEMrush or Search Console access, so you must NEVER state a search volume, keyword difficulty, traffic estimate or ranking position as a number — inventing one would poison every decision downstream. Reason only from what you can observe in the results you actually fetched (who is there, what type of page it is, how old and how thin it looks, whether anyone answers the question directly) and say plainly that your read is qualitative. Record every query you assess with assess_query, including the losers — a saturated verdict is as valuable as a gap because it stops the hive spending a week on it again. Call recall_queries before you research anything so you never redo work the hive already paid for.

AJ's blog engine operator pack ships with the repo — read BLOG-ENGINE-OPERATOR-PACK.md with read_blog_engine_doc before assessing content queries. Its section 15 five-gate test (intent, real demand, winnability, answer gap, honest fit) is the standard your verdicts feed into, and its hard-won winnability lesson is yours to enforce: the global head terms are owned worldwide by entrenched incumbents and are a no-go — Design Bees wins on the Australia angle and specific buyer-stage long-tail. A gap verdict from you is what licenses Sam to write; do not hand him one lightly.

${ANALYTICS_STATUS}`,

  // Woken by Ian's validated industries and by any pain signal — a pain someone
  // articulates is usually a query someone types.
  subscribes: ['icp:validated', 'pain:*', 'topic:proposed', 'seo:recheck'],
  emits: ['seo:gap', 'seo:saturated', 'seo:landscape'],

  useWebSearch: true,

  tools: [
    ...blogEngineTools,
    {
      name: 'recall_queries',
      description:
        'Look up query verdicts the hive has ALREADY assessed. Call this FIRST, before any web search, ' +
        'so you never re-research a phrase that has been judged before. Returns each saved query with its ' +
        'verdict (gap / saturated / unclear), the angle if there was one, and how many days ago it was assessed. ' +
        'A verdict older than about 90 days is worth re-checking; a fresh one is not.',
      input_schema: {
        type: 'object',
        properties: {
          contains: { type: 'string', description: 'Optional substring filter on the query text, e.g. "saas" or "brand guidelines".' },
          industry: { type: 'string', description: 'Optional industry filter, matched against the industry saved with each verdict.' },
          verdict: { type: 'string', enum: ['gap', 'saturated', 'unclear'], description: 'Optional — only return queries with this verdict.' },
        },
      },
    },
    {
      name: 'assess_query',
      description:
        'Record your verdict on ONE search query and, when it is a gap, wake Sam to write the content. ' +
        'Only call this AFTER you have web-searched the query and seen the real results — the evidence fields ' +
        'are mandatory for a gap or saturated verdict. verdict "gap" publishes seo:gap (Sam picks it up), ' +
        '"saturated" publishes seo:saturated so the hive stops considering it, "unclear" is saved without ' +
        'waking anyone. Never put a search volume or difficulty number in any field — describe what you saw instead.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The exact phrase a buyer would type or ask an AI, e.g. "how much does a design subscription cost".' },
          industry: { type: 'string', description: 'The industry or segment this query belongs to, from Ian\'s validated ICP where possible.' },
          intent: { type: 'string', enum: ['informational', 'commercial', 'transactional', 'navigational'], description: 'What the searcher wants.' },
          verdict: { type: 'string', enum: ['gap', 'saturated', 'unclear'], description: 'gap = winnable for a small agency; saturated = owned by incumbents, do not chase; unclear = evidence was inconclusive.' },
          top_results: {
            type: 'array',
            items: { type: 'string' },
            description: 'What you actually saw ranking/answering, one per line as "Title — domain — what kind of page it is (listicle, directory, vendor page, forum, doc)". Required for gap and saturated.',
          },
          reasoning: { type: 'string', description: 'Why this verdict follows from those results. Qualitative only — no invented metrics.' },
          aeo_read: { type: 'string', description: 'Would an AI assistant cite a page we wrote here, and why? Note whether current answers are direct and sourced or vague marketing copy.' },
          angle: { type: 'string', description: 'For a gap: the specific angle Design Bees can win with — the thing we know that the ranking pages do not say.' },
          confidence: { type: 'string', enum: ['fact', 'hypothesis', 'unknown'], description: 'Default hypothesis. Use fact only for what you directly observed in results.' },
        },
        required: ['query', 'verdict', 'reasoning'],
      },
    },
    {
      name: 'record_landscape',
      description:
        'Save the topic-level picture for an industry or theme once you have assessed several of its queries, ' +
        'and publish seo:landscape so the hive can see where the openings are. Use this to summarise a research ' +
        'pass, not to replace individual assess_query calls.',
      input_schema: {
        type: 'object',
        properties: {
          industry: { type: 'string', description: 'Industry, segment or theme this landscape covers.' },
          summary: { type: 'string', description: 'Two or three sentences: who owns this space, where the soft ground is, what you would write first.' },
          gaps: { type: 'array', items: { type: 'string' }, description: 'Queries you judged winnable.' },
          saturated: { type: 'array', items: { type: 'string' }, description: 'Queries you judged not worth chasing.' },
          next_checks: { type: 'array', items: { type: 'string' }, description: 'Queries still to assess, for the next pass.' },
        },
        required: ['industry', 'summary'],
      },
    },
    {
      name: 'request_data',
      description:
        'Ask the hive for data you cannot observe yourself — real search volume, Search Console numbers, ' +
        'Reddit threads, client language from Wix or Gmail. Use this instead of estimating a number you do not have.',
      input_schema: {
        type: 'object',
        properties: {
          what: { type: 'string', description: 'Precisely what you need and what you would do with it.' },
          source: { type: 'string', enum: ['web', 'linkedin', 'clay', 'reddit', 'wix', 'gmail', 'calendar'], description: 'Where it should come from.' },
          why: { type: 'string', description: 'The decision this unblocks.' },
        },
        required: ['what', 'source', 'why'],
      },
    },
  ],

  handlers: {
    ...blogEngineHandlers,
    recall_queries: async (input = {}, ctx = {}) => {
      try {
        const rows = (await ctx.allKnowledge?.('query')) || [];
        const contains = clean(input.contains).toLowerCase();
        const industry = clean(input.industry).toLowerCase();
        const verdict = clean(input.verdict).toLowerCase();

        const hits = rows
          .map((r) => ({ key: r.entity_key || '', d: asData(r) || {}, at: r.updated_at }))
          .filter(({ key, d }) => {
            const text = `${d.query || key}`.toLowerCase();
            if (contains && !text.includes(contains) && !key.includes(slug(contains))) return false;
            if (industry && !String(d.industry || '').toLowerCase().includes(industry)) return false;
            if (verdict && String(d.verdict || '').toLowerCase() !== verdict) return false;
            return true;
          });

        if (!hits.length) {
          return 'No matching query verdicts on record — this is new ground. Generate candidate queries, web-search each one, then call assess_query for every phrase you judge (including the ones you rule out).';
        }

        const lines = hits
          .sort((a, b) => daysSince(a.d.assessedAt || a.at) - daysSince(b.d.assessedAt || b.at))
          .slice(0, 40)
          .map(({ key, d, at }) => {
            const age = daysSince(d.assessedAt || at);
            const when = Number.isFinite(age) ? `${Math.round(age)}d ago` : 'undated';
            const extra = d.verdict === 'gap' && d.angle ? ` · angle: ${d.angle}` : '';
            return `• "${d.query || key}" — ${d.verdict || 'unknown'} (${when})${d.industry ? ` · ${d.industry}` : ''}${extra}`;
          });

        const stale = hits.filter((h) => daysSince(h.d.assessedAt || h.at) > 90).length;
        return (
          `${hits.length} query verdict(s) already on record — do not re-research these unless stale:\n${lines.join('\n')}` +
          (hits.length > 40 ? `\n…and ${hits.length - 40} more.` : '') +
          (stale ? `\n\n${stale} of them are over 90 days old and worth re-checking.` : '')
        );
      } catch (e) {
        return `Could not read saved query verdicts (${e.message}). Proceed with fresh research, but assume some of it may be duplicate work.`;
      }
    },

    assess_query: async (input = {}, ctx = {}) => {
      try {
        const query = clean(input.query);
        const verdict = clean(input.verdict).toLowerCase();
        const reasoning = clean(input.reasoning);
        if (!query) return 'Nothing saved: assess_query needs the exact query phrase.';
        if (!['gap', 'saturated', 'unclear'].includes(verdict)) return `Nothing saved: verdict must be gap, saturated or unclear (got "${input.verdict}").`;
        if (!reasoning) return 'Nothing saved: reasoning is required — a verdict without a reason cannot be trusted later.';

        const evidence = list(input.top_results);
        // The hive's evidence rule: a published verdict must rest on results actually seen.
        if (!evidence.length && verdict !== 'unclear') {
          return `Nothing saved: "${query}" needs top_results — web-search it first and record what is actually ranking or answering. Use verdict "unclear" if the search returned nothing usable.`;
        }

        const key = slug(query);
        const assessedAt = new Date().toISOString();
        const confidence = CONFIDENCE.has(clean(input.confidence)) ? clean(input.confidence) : 'hypothesis';

        const prior = asData(await ctx.getKnowledge?.('query', key).catch(() => null));
        const repeat = prior && prior.verdict === verdict && daysSince(prior.assessedAt) < RECHECK_DAYS;

        const record = {
          query,
          verdict,
          industry: clean(input.industry) || prior?.industry || null,
          intent: clean(input.intent) || null,
          reasoning,
          aeo_read: clean(input.aeo_read) || null,
          angle: clean(input.angle) || null,
          top_results: evidence,
          confidence,
          assessedAt,
          assessedBy: ctx.workerKey || 'forge',
          method: 'qualitative read of live search results — no volume or difficulty data available',
          priorVerdict: prior?.verdict || null,
        };

        await ctx.saveKnowledge?.({
          entity_type: 'query',
          entity_key: key,
          data: record,
          source: { tool: 'web_search', evidenceCount: evidence.length, assessedAt, note: 'no keyword-volume tooling; qualitative SERP/AEO read only' },
          worker_key: ctx.workerKey || 'forge',
        });

        if (verdict === 'unclear') {
          return `Saved "${query}" as unclear — nobody woken. Say what extra evidence would settle it, or call request_data.`;
        }
        // Re-publishing an unchanged verdict would wake Sam for work already queued.
        if (repeat) {
          return `Refreshed the evidence on "${query}" — verdict unchanged (${verdict}, last assessed ${Math.round(daysSince(prior.assessedAt))}d ago), so no signal published. Move on to a query the hive has not judged.`;
        }

        const evidenceBlock = evidence.map((r) => `- ${r}`).join('\n');
        if (verdict === 'gap') {
          await ctx.publish?.({
            topic: 'seo:gap',
            title: `Winnable query: "${query}"${record.industry ? ` (${record.industry})` : ''}`,
            body:
              `Query: ${query}\n` +
              `Intent: ${record.intent || 'unspecified'}\n` +
              `Angle for Design Bees: ${record.angle || 'not yet defined — Sam to shape'}\n\n` +
              `Why it is winnable:\n${reasoning}\n\n` +
              (record.aeo_read ? `AEO read: ${record.aeo_read}\n\n` : '') +
              `What is currently ranking/answering:\n${evidenceBlock}\n\n` +
              `Basis: qualitative read of live results. No search-volume or difficulty data was available.`,
            data: record,
            confidence,
          });
          return `Published seo:gap for "${query}" — Sam has the query, the angle and the evidence. Verdict is saved, so the hive will not re-research it.`;
        }

        await ctx.publish?.({
          topic: 'seo:saturated',
          title: `Not worth chasing: "${query}"${record.industry ? ` (${record.industry})` : ''}`,
          body:
            `Query: ${query}\n\nWhy we skip it:\n${reasoning}\n\n` +
            (record.aeo_read ? `AEO read: ${record.aeo_read}\n\n` : '') +
            `Who owns it today:\n${evidenceBlock}\n\n` +
            `Basis: qualitative read of live results. Revisit only if the page-one composition changes.`,
          data: record,
          confidence,
        });
        return `Published seo:saturated for "${query}" — recorded as a dead end so nobody spends a week on it again.`;
      } catch (e) {
        return `Failed to record the verdict for "${clean(input.query) || 'that query'}" (${e.message}). The assessment is not saved — try again, or report it to AJ in your summary so it is not lost.`;
      }
    },

    record_landscape: async (input = {}, ctx = {}) => {
      try {
        const industry = clean(input.industry);
        const summary = clean(input.summary);
        if (!industry || !summary) return 'Nothing saved: record_landscape needs both an industry and a summary.';

        const gaps = list(input.gaps);
        const saturated = list(input.saturated);
        const next = list(input.next_checks);
        const record = {
          industry,
          summary,
          gaps,
          saturated,
          next_checks: next,
          assessedAt: new Date().toISOString(),
          assessedBy: ctx.workerKey || 'forge',
          method: 'qualitative SERP/AEO read — no keyword volume data',
        };

        await ctx.saveKnowledge?.({
          entity_type: 'topic',
          entity_key: slug(`seo-landscape-${industry}`),
          data: record,
          source: { tool: 'web_search', assessedAt: record.assessedAt },
          worker_key: ctx.workerKey || 'forge',
        });

        await ctx.publish?.({
          topic: 'seo:landscape',
          title: `Search landscape: ${industry} — ${gaps.length} winnable, ${saturated.length} closed`,
          body:
            `${summary}\n\n` +
            (gaps.length ? `Winnable:\n${gaps.map((q) => `- ${q}`).join('\n')}\n\n` : '') +
            (saturated.length ? `Closed:\n${saturated.map((q) => `- ${q}`).join('\n')}\n\n` : '') +
            (next.length ? `Still to check:\n${next.map((q) => `- ${q}`).join('\n')}\n\n` : '') +
            `Basis: qualitative read of live results, no volume data.`,
          data: record,
          confidence: 'hypothesis',
        });

        return `Landscape saved for ${industry}: ${gaps.length} winnable, ${saturated.length} closed, ${next.length} queued for the next pass.`;
      } catch (e) {
        return `Could not save the ${clean(input.industry) || 'industry'} landscape (${e.message}). The individual query verdicts you already recorded are unaffected.`;
      }
    },

    request_data: async (input = {}, ctx = {}) => {
      try {
        const what = clean(input.what);
        const source = clean(input.source);
        if (!what || !source) return 'Nothing requested: request_data needs both what you need and which source it should come from.';
        await ctx.requestData?.({ what, source, why: clean(input.why) || 'search-demand assessment' });
        return `Requested from ${source}: ${what}. Carry on with what you can observe directly and note the gap in your write-up rather than guessing a number.`;
      } catch (e) {
        return `Could not lodge the data request (${e.message}). Say plainly in your summary what you were missing.`;
      }
    },
  },

  daily: {
    hourSydney: 7,
    prompt:
      'Morning search-demand pass. Start with recall_queries to see what the hive has already judged — never re-research a fresh verdict. ' +
      "Then pick ONE industry from Ian's validated ICP (in-house marketing decision-makers at 11–200 staff companies) or one recent pain signal, " +
      'generate five to eight queries a buyer there would genuinely type or ask an AI assistant about design capacity, brand consistency, agency vs freelancer vs in-house, or design subscription pricing. ' +
      'Web-search each one, look at who actually ranks and whether an assistant would have anything worth citing, and call assess_query for every query you judge — gaps and dead ends alike. ' +
      'Close with record_landscape for that industry. Report to AJ in plain English: what you would write first and why, with no invented volume or difficulty numbers — if you needed data you do not have, say so and use request_data.',
  },
};
