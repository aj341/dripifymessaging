// The bridge between the work AJ has already paid for and the hive.
//
// AJ pays for a Max plan and, separately, pays this hive by the token on his
// Anthropic API key. Tonight's session cost him $50 on top of the $340 he had
// already spent, which is the wrong way round: the expensive thinking — research
// passes, drafting, analysis — should happen in a Claude Code session on the
// plan he already owns, and the hive should be the hands and the memory.
//
// This endpoint is what makes that split work. A session outside Railway files
// a finished draft, and it lands on /approve looking exactly like one a teammate
// filed, with the same gates applied. Nothing here bypasses AJ's approval: a
// filed draft is a draft, awaiting his decision like any other.
//
// POST /file/draft?t=<DASHBOARD_TOKEN>
// Body: JSON, the same shape Sam's draft_blog_post builds.
import { saveKnowledge } from './brain.js';
import { publish } from './bus.js';
import { l99Warnings } from './workers/blog-engine.js';
import { approveUrl } from './dashboard-link.js';

const TOKEN = process.env.DASHBOARD_TOKEN;

const clean = (v) => String(v == null ? '' : v).trim();
const slug = (s) =>
  clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

/** ISO week, matching the stamp drafts already carry. */
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - start) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const CASE_FIELDS = [
  'ownership_check',
  'demand',
  'winnability',
  'value_to_design_bees',
  'value_to_reader',
];

/**
 * The same case AJ demands of Sam. A draft filed from outside is held to the
 * identical standard — he rejected "two urls" once and should not have to do it
 * again because the draft arrived through a different door.
 */
function checkCase(j) {
  if (!j || typeof j !== 'object') {
    return `Needs a justification object with: ${CASE_FIELDS.join(', ')}, and sources[] of {claim, source}.`;
  }
  const thin = CASE_FIELDS.filter((f) => clean(j[f]).length < 80);
  if (thin.length) {
    return `These read as placeholders rather than a case (under 80 characters): ${thin.join(', ')}. ` +
      `AJ decides from this block, so it carries the reasoning and the proof of value.`;
  }
  const sources = Array.isArray(j.sources) ? j.sources.filter((s) => clean(s?.claim) && clean(s?.source)) : [];
  if (!sources.length) {
    return 'Every figure needs a source. sources[] must hold at least one {claim, source} pair.';
  }
  return null;
}

export function mountFiling(app) {
  app.post('/file/draft', async (req, res) => {
    if (!TOKEN) return res.status(503).json({ error: 'Set DASHBOARD_TOKEN on the Railway service first.' });
    if (req.query.t !== TOKEN) return res.status(403).json({ error: 'Wrong or missing token (?t=...).' });

    try {
      const b = req.body || {};
      const query = clean(b.query);
      const body = clean(b.body);
      if (!query) return res.status(400).json({ error: 'No query given. The query is what the post targets.' });
      if (!body) return res.status(400).json({ error: 'No body given. This takes the finished post.' });

      const bad = checkCase(b.justification);
      if (bad) return res.status(400).json({ error: bad });

      const words = body.split(/\s+/).filter(Boolean).length;
      const warnings = [...l99Warnings(body, { blog: true })];
      if (words < 1200 || words > 1800) warnings.push(`${words} words — the pack's range is 1,200 to 1,800.`);
      if (!/^##\s/m.test(body)) warnings.push('No H2 sections found.');
      if (!/faq/i.test(body)) warnings.push('No FAQ section found — the FAQ block feeds FAQPage schema.');

      const key = `blogpost-${slug(b.slug || query)}`;
      const j = b.justification;
      const data = {
        format: 'blog-post',
        status: 'draft-awaiting-aj',
        standard: 'blog-engine-pack-2026-07',
        origin: clean(b.origin) || 'aj-request',
        week: isoWeek(),
        query,
        category: clean(b.category),
        slug: clean(b.slug) || slug(query),
        meta_title: clean(b.meta_title),
        meta_description: clean(b.meta_description),
        tags: Array.isArray(b.tags) ? b.tags.map(clean).filter(Boolean) : [],
        long_tail_cluster: Array.isArray(b.long_tail_cluster) ? b.long_tail_cluster.map(clean).filter(Boolean) : [],
        schema: 'Article + FAQPage',
        author: 'AJ Kavanagh',
        word_count: words,
        body,
        justification: {
          ...Object.fromEntries(CASE_FIELDS.map((f) => [f, clean(j[f])])),
          sources: j.sources.map((s) => ({ claim: clean(s.claim), source: clean(s.source) })),
        },
        voice_warnings: warnings,
        filed_by: clean(b.filed_by) || 'claude-code session',
        drafted_at: new Date().toISOString(),
      };

      await saveKnowledge({
        entity_type: 'topic',
        entity_key: key,
        data,
        source: { tool: 'file_draft', filed_by: data.filed_by, at: data.drafted_at },
        worker_key: 'voice',
      });

      // Sam and Ricky should know a draft exists that they did not write, so it
      // counts in the week's tally and in future cannibalisation checks.
      await publish({
        worker_key: 'voice',
        topic: 'content:draft',
        title: `Blog draft filed: ${query.slice(0, 90)}`,
        body:
          `${query}\n${data.category} · ${words} words · ${data.origin}\n\n` +
          `${warnings.length ? `Flags to check: ${warnings.length}` : 'Voice checks passed.'}\n\n` +
          `Read and approve it here:\n${approveUrl(key)}\n\nDraft only — nothing goes near Wix until you approve.`,
        data: { knowledge_key: key, query, word_count: words },
        confidence: 'hypothesis',
      });

      console.log(`[file] draft ${key} filed by ${data.filed_by} — ${words} words, ${warnings.length} flag(s)`);
      res.json({ ok: true, key, words, warnings, url: approveUrl(key) });
    } catch (e) {
      console.error('[file] draft failed:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // What a session outside Railway needs before it can do useful work: what is
  // already live, what is already drafted, and what AJ has already decided.
  app.get('/file/state', async (req, res) => {
    if (!TOKEN) return res.status(503).json({ error: 'Set DASHBOARD_TOKEN first.' });
    if (req.query.t !== TOKEN) return res.status(403).json({ error: 'Wrong or missing token (?t=...).' });
    try {
      const { query: dbQuery } = await import('./db.js');
      const drafts = await dbQuery(
        `SELECT entity_key, data->>'status' AS status, data->>'query' AS query,
                data->>'origin' AS origin, data->>'week' AS week, updated_at
           FROM knowledge
          WHERE entity_type = 'topic' AND data->>'standard' = 'blog-engine-pack-2026-07'
          ORDER BY updated_at DESC LIMIT 60`
      );
      const health = await dbQuery(
        `SELECT status, count(*)::int AS n FROM jobs
          WHERE created_at > now() - interval '24 hours' GROUP BY status`
      );
      res.json({ drafts: drafts.rows, jobs_24h: health.rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
