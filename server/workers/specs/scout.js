// Ian — ICP & Sourcing. The hinge of the cascade: Ricky finds a pain point in
// some industry, and Ian is the one who can say whether that industry has ever
// been good business for Design Bees. Nothing downstream should run until he
// has answered that, which is why he validates before Ricky judges the queries.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCohorts, money } from '../../wix.js';

const PACK_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'data', 'salesnav', 'SALES-NAV-OPERATOR-PACK.md'
);

const slug = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Every client we have, enriched, as one flat list. */
async function clients() {
  const { data } = await getCohorts(new Date());
  const seen = new Map();
  for (const k of ['nectar2025', 'honeycomb2026', 'active3mo']) {
    for (const m of data[k] || []) seen.set(m.email || m.name, m);
  }
  return [...seen.values()];
}

// Matching is deliberately loose — Ricky says "construction", our records say
// "Construction" or "Building & Construction". A missed match reads as "we have
// no history here", which is the one wrong answer that matters.
function matchIndustry(list, industry) {
  const want = slug(industry);
  if (!want) return [];
  const parts = want.split('-').filter((w) => w.length > 3);
  return list.filter((c) => {
    const hay = `${slug(c.industry)} ${slug(c.subIndustry)} ${slug(c.company)}`;
    return hay.includes(want) || parts.some((p) => hay.includes(p));
  });
}

export default {
  key: 'scout',
  name: 'Ian',
  emoji: '🔭',
  title: 'ICP & Sourcing',
  brief: `You own the ideal customer profile and prospecting for Design Bees.

You know the client base cold: who pays, what they pay, what their title and industry
and headcount are, how long they have stayed. Design Bees' best clients are in-house
marketing decision-makers (Marketing Manager, Head of Marketing, CMO) at companies of
roughly 11-200 staff, plus small-business founders. Agencies have been a small and
low-value slice.

Your job in the hive is to be the reality check. When Ricky surfaces a pain point in
some industry, you answer one question with evidence: has this industry actually been
good business for us? You look at how many clients we have there, what they spend,
whether they stayed, and whether the buyer matches our persona. Then you either
validate it so the rest of the team invests effort there, or you reject it so they
don't.

Be willing to say no. A rejection with a reason is more valuable than a shrug, because
it stops four teammates chasing something that has never worked. Equally, if we have
no history in an industry, say exactly that — "no evidence either way" is a real
answer and different from "bad fit".

EVIDENCE RULE: every claim you make about a client, an industry or a number comes from
the hive's records. You never invent a company, a spend figure or a retention story.

YOUR CRAFT STANDARD IS THE SALES NAVIGATOR OPERATOR PACK. Read it with read_salesnav_pack
before building any search, split or sequence recommendation — every time, never from
memory. It holds the settled ICP, which filters and spotlights matter and what each
signal really means for our buyers, the tier doctrine (followers → changed jobs / news →
posted recently → cold, deduped forward), the 500-contact drill, Dripify's ~100
invites/week ceiling and the 25% acceptance safety line, and the rule that every split
is a recorded hypothesis until Dripify results score it. When AJ asks for contacts or a
split, your answer follows the pack's shape: filters per tier, pool sizes only if a
search was actually run, the hypothesis each tier tests, and a messaging note per tier
for Sam. You design the searches; AJ executes them in Sales Navigator — never claim you
ran one yourself.`,
  subscribes: ['pain:*', 'trend:*', 'request:icp', 'request:icp:*', 'outreach:*'],
  emits: ['icp:validated', 'icp:rejected', 'icp:unknown'],
  useWebSearch: false,
  tools: [
    {
      name: 'read_salesnav_pack',
      description:
        'Read the Sales Navigator operator pack — your authoritative playbook for ICP targeting, ' +
        'filters, spotlights, the tier doctrine, the 500-contact drill and Dripify safety limits. ' +
        'Read it before building any search or split, every time. If it conflicts with what you ' +
        'believe, the pack wins.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'check_industry_fit',
      description:
        'Look up our real client history in an industry and get the evidence back: how many clients, ' +
        'their combined spend, average tenure, their titles and company sizes. Call this FIRST, before ' +
        'forming any view. It reads our records — it does not guess.',
      input_schema: {
        type: 'object',
        properties: { industry: { type: 'string', description: 'Industry or sector, e.g. "construction", "software", "health care".' } },
        required: ['industry'],
      },
    },
    {
      name: 'publish_verdict',
      description:
        'Record your judgement on an industry and wake the rest of the hive. verdict "validated" tells ' +
        'Ricky to judge which search queries are worth competing for there; "rejected" stops the team spending ' +
        'effort on it; "unknown" records that we have no history either way. Always call check_industry_fit first.',
      input_schema: {
        type: 'object',
        properties: {
          industry: { type: 'string' },
          verdict: { type: 'string', enum: ['validated', 'rejected', 'unknown'] },
          reasoning: { type: 'string', description: 'Why, citing the actual clients and figures you saw.' },
          evidence: { type: 'string', description: 'The concrete numbers: client count, spend, tenure, titles.' },
          persona: { type: 'string', description: 'Who to target there if validated, e.g. "Head of Marketing at 50-200 staff".' },
        },
        required: ['industry', 'verdict', 'reasoning'],
      },
    },
    {
      name: 'recall',
      description: 'Read what the hive already knows about a company, person or industry before doing new work.',
      input_schema: {
        type: 'object',
        properties: {
          entity_type: { type: 'string', enum: ['company', 'person', 'industry', 'query', 'topic'] },
          entity_key: { type: 'string', description: 'Optional — omit to list everything of that type.' },
        },
        required: ['entity_type'],
      },
    },
  ],
  handlers: {
    read_salesnav_pack: async () => {
      try {
        return fs.readFileSync(PACK_PATH, 'utf8');
      } catch (err) {
        return (
          `Could not read the Sales Navigator pack (${err.message}). Do NOT build splits from memory ` +
          `of it — say the pack is unreadable and report it to AJ.`
        );
      }
    },
    check_industry_fit: async ({ industry }, ctx) => {
      try {
        const list = await clients();
        const hits = matchIndustry(list, industry);
        if (!hits.length) {
          return (
            `No clients on record in "${industry}" (checked all ${list.length} clients). ` +
            `That is genuinely no-evidence-either-way, not a bad fit — say so rather than guessing.`
          );
        }
        const spend = hits.reduce((a, c) => a + (c.spend || 0), 0);
        const tenure = hits.reduce((a, c) => a + (c.tenureMonths || 0), 0) / hits.length;
        const rows = hits
          .sort((a, b) => b.spend - a.spend)
          .map(
            (c) =>
              `- ${c.name} (${c.company || c.domain}) · ${c.title || 'title unknown'} · ` +
              `${c.employeeCount ? `${c.employeeCount} staff` : c.sizeBand || 'size unknown'} · ` +
              `${c.tenureMonths}mo · $${money(c.spend)} · ${(c.plans || []).join('/')}`
          );
        return (
          `${hits.length} client(s) in "${industry}" — combined $${money(spend)}, average tenure ${tenure.toFixed(1)} months.\n` +
          `${rows.join('\n')}\n\n` +
          `Compare against the book overall: ${list.length} clients. Judge fit on spend and retention, not count alone.`
        );
      } catch (err) {
        return `Could not read client records: ${err.message}. Do not guess — say the check failed.`;
      }
    },

    publish_verdict: async ({ industry, verdict, reasoning, evidence, persona }, ctx) => {
      try {
        if (!reasoning || reasoning.length < 20) {
          return 'REJECTED — a verdict needs reasoning that cites what you actually saw. Call check_industry_fit first.';
        }
        const key = slug(industry);
        await ctx.saveKnowledge({
          entity_type: 'industry',
          entity_key: key,
          data: {
            industry,
            icpVerdict: verdict,
            icpReasoning: reasoning,
            icpEvidence: evidence || null,
            targetPersona: persona || null,
            assessedAt: new Date().toISOString(),
          },
          source: { tool: 'ian:check_industry_fit', basis: 'Design Bees client records (Wix + Clay enrichment)' },
        });
        await ctx.publish({
          topic: `icp:${verdict}`,
          title: `${industry}: ${verdict}`,
          body: `${reasoning}\n\nEvidence: ${evidence || 'see client records'}${persona ? `\n\nTarget persona: ${persona}` : ''}`,
          data: { industry, key, verdict, persona },
          confidence: verdict === 'unknown' ? 'unknown' : 'fact',
        });
        return verdict === 'validated'
          ? `Validated "${industry}" and published — Ricky will now judge which search queries are worth competing for there.`
          : `Recorded "${industry}" as ${verdict}. The hive will not spend further effort on it unless you revisit.`;
      } catch (err) {
        return `Could not publish the verdict: ${err.message}`;
      }
    },

    recall: async ({ entity_type, entity_key }, ctx) => {
      try {
        if (entity_key) {
          const row = await ctx.getKnowledge(entity_type, entity_key);
          return row ? JSON.stringify(row.data) : `Nothing on record for ${entity_type} ${entity_key}.`;
        }
        const rows = await ctx.allKnowledge(entity_type);
        return rows.length
          ? rows.slice(0, 60).map((r) => `${r.entity_key}: ${JSON.stringify(r.data).slice(0, 200)}`).join('\n')
          : `Nothing on record of type ${entity_type}.`;
      } catch (err) {
        return `Could not read knowledge: ${err.message}`;
      }
    },
  },
};
