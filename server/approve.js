// The content approval dashboard — Tom's page.
//
// Every draft Sam files lands here with its full justification: demand
// evidence, voice-check flags, the keyword cluster, word count, and where any
// proof came from. AJ approves or rejects in one click; the decision is written
// back to knowledge and published as a signal, so the hive learns from what he
// rejects as well as what he approves. Nothing here publishes outward — an
// approval marks the draft ready, it does not post it anywhere.
//
// Access: /approve?t=<DASHBOARD_TOKEN>. Set DASHBOARD_TOKEN on the Railway
// service; without it the page refuses to serve.
import { query as dbQuery } from './db.js';
import { publish } from './bus.js';

const TOKEN = process.env.DASHBOARD_TOKEN;

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const oneLine = (v, n) => {
  const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

function authed(req) {
  return Boolean(TOKEN) && req.query.t === TOKEN;
}

function deny(res) {
  if (!TOKEN) {
    return res
      .status(503)
      .send('The approval dashboard needs DASHBOARD_TOKEN set on the Railway service. Pick any long random string, set it, redeploy, then open /approve?t=<that string>.');
  }
  return res.status(403).send('Wrong or missing token. Open /approve?t=<DASHBOARD_TOKEN>.');
}

function asData(row) {
  const d = row?.data;
  if (typeof d === 'string') { try { return JSON.parse(d); } catch { return {}; } }
  return d && typeof d === 'object' ? d : {};
}

const STATUS_LABELS = {
  'draft-awaiting-aj': 'Awaiting your call',
  'approved-by-aj': 'Approved',
  'rejected-by-aj': 'Rejected',
  'superseded-pre-blog-engine': 'Superseded (pre-pack)',
};

const PAGE_CSS = `
  body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;background:#faf8f3;color:#26221a;margin:0;padding:24px;line-height:1.55}
  .wrap{max-width:860px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px} .sub{color:#6e6553;font-size:14px;margin:0 0 24px}
  .card{background:#fff;border:1px solid #e6dfcf;border-radius:10px;padding:18px 20px;margin:14px 0}
  .k{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#b97a0e;font-weight:700;margin:14px 0 2px}
  .pill{display:inline-block;font-size:12px;font-weight:700;padding:2px 10px;border-radius:99px;margin-left:8px;vertical-align:2px}
  .p-wait{background:#f6e8cc;color:#8a5a0b}.p-ok{background:#e4efe2;color:#3d7a44}.p-no{background:#f5e4dc;color:#a64b2a}.p-old{background:#eee;color:#777}
  .flag{background:#f5e4dc;color:#a64b2a;border-radius:6px;padding:6px 10px;font-size:13px;margin:4px 0}
  pre{white-space:pre-wrap;background:#f3efe6;border:1px solid #e6dfcf;border-radius:8px;padding:14px;font-size:14px;overflow-x:auto}
  a{color:#8a5a0b} .btn{display:inline-block;border:0;border-radius:8px;padding:10px 22px;font-size:15px;font-weight:700;cursor:pointer;margin-right:10px}
  .b-ok{background:#3d7a44;color:#fff}.b-no{background:#a64b2a;color:#fff}
  .meta{font-size:13px;color:#6e6553}
  .case{background:#f9f6ef;border:1px solid #e6dfcf;border-left:4px solid #b97a0e;border-radius:0 10px 10px 0;padding:6px 18px 16px;margin:14px 0}
  .case-head{font-size:15px;font-weight:750;margin:12px 0 2px}
  .reason{font-size:14.5px;line-height:1.6;margin:2px 0 4px}
  ul.src{margin:4px 0 0;padding-left:20px;font-size:14px}
  ul.src li{margin:6px 0}
  .tabs{display:flex;gap:8px;margin:0 0 18px;border-bottom:1px solid #e6dfcf;padding-bottom:10px}
  .tab{display:inline-flex;align-items:center;gap:7px;text-decoration:none;font-size:14px;font-weight:650;color:#6e6553;padding:7px 14px;border-radius:99px}
  .tab:hover{background:#f3efe6}
  .tab.on{background:#26221a;color:#faf8f3}
  .badge{font-size:11.5px;font-weight:700;background:#f6e8cc;color:#8a5a0b;border-radius:99px;padding:1px 8px}
  .tab.on .badge{background:#b97a0e;color:#fff}
  .why{font-size:13.5px;color:#4a4436;margin-top:7px;padding-left:10px;border-left:2px solid #e6dfcf}
  form{display:inline}
`;

function statusPill(status) {
  const cls =
    status === 'approved-by-aj' ? 'p-ok' : status === 'rejected-by-aj' ? 'p-no' : status === 'draft-awaiting-aj' ? 'p-wait' : 'p-old';
  return `<span class="pill ${cls}">${esc(STATUS_LABELS[status] || status || 'unknown')}</span>`;
}

// Only drafts written to the blog engine pack's standard appear. Everything
// Sam produced before the pack is superseded history — AJ confirmed it is not
// up to scratch, so it never shows here and can never be approved.
async function draftRows() {
  const r = await dbQuery(
    `SELECT entity_key, data, updated_at FROM knowledge
      WHERE entity_type = 'topic'
        AND data->>'format' IN ('blog-post', 'blog-outline', 'linkedin-post')
        AND data->>'standard' = 'blog-engine-pack-2026-07'
      ORDER BY (data->>'status' = 'draft-awaiting-aj') DESC, updated_at DESC
      LIMIT 100`
  );
  return r.rows;
}

export function mountApprove(app) {
  app.get('/approve', async (req, res) => {
    if (!authed(req)) return deny(res);
    try {
      const t = encodeURIComponent(req.query.t);
      const rows = await draftRows();

      // Blog and social are different decisions — a blog post is a ranking
      // commitment, a LinkedIn post is a day's voice — so the page splits them.
      const isSocial = (d) => d.format === 'linkedin-post';
      const view = ['blog', 'social'].includes(String(req.query.view)) ? req.query.view : 'all';
      const decided = (d) => d.status !== 'draft-awaiting-aj';

      const inView = rows.filter((row) => {
        const d = asData(row);
        if (view === 'blog') return !isSocial(d);
        if (view === 'social') return isSocial(d);
        return true;
      });
      const waitingAll = rows.filter((r) => !decided(asData(r)));
      const blogWaiting = waitingAll.filter((r) => !isSocial(asData(r))).length;
      const socialWaiting = waitingAll.filter((r) => isSocial(asData(r))).length;

      const card = (row) => {
        const d = asData(row);
        const title = d.query || d.working_title || d.hook || row.entity_key;
        const flags = Array.isArray(d.voice_warnings) ? d.voice_warnings.length : 0;
        const kind = isSocial(d) ? 'LinkedIn' : d.format === 'blog-outline' ? 'Blog outline' : 'Blog post';
        // A one-line reason at list level, so the queue is scannable without
        // opening every draft.
        const why = d.justification?.value_to_design_bees || d.why_this_lands || d.demand_evidence || '';
        return (
          `<div class="card"><b><a href="/approve/${encodeURIComponent(row.entity_key)}?t=${t}">${esc(title)}</a></b>` +
          statusPill(d.status) +
          `<div class="meta">${esc(kind)}${d.category ? ` · ${esc(d.category)}` : ''}${d.word_count ? ` · ${d.word_count} words` : ''}${
            flags ? ` · <b>${flags} voice flag(s)</b>` : ' · voice-clean'
          } · ${esc(String(row.updated_at).slice(0, 10))}</div>` +
          (why ? `<div class="why">${esc(oneLine(why, 190))}</div>` : '') +
          `</div>`
        );
      };

      const tab = (key, label, count) =>
        `<a class="tab${view === key ? ' on' : ''}" href="/approve?t=${t}${key === 'all' ? '' : `&view=${key}`}">${label}` +
        `${count ? `<span class="badge">${count}</span>` : ''}</a>`;

      const pending = inView.filter((r) => !decided(asData(r)));
      const done = inView.filter((r) => decided(asData(r)));

      res.send(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Approvals — Design Bees hive</title><style>${PAGE_CSS}</style>` +
          `<div class="wrap"><h1>Content approvals</h1>` +
          `<p class="sub">${waitingAll.length} draft(s) waiting · approving marks a draft ready, it never posts anything</p>` +
          `<div class="tabs">${tab('all', 'All', waitingAll.length)}${tab('blog', 'Blog', blogWaiting)}${tab('social', 'Socials', socialWaiting)}</div>` +
          (pending.length
            ? pending.map(card).join('') +
              `<form method="post" action="/approve/reject-all?t=${t}${view === 'all' ? '' : `&view=${view}`}" ` +
              `onsubmit="return confirm('Reject all ${pending.length} waiting draft(s) and send Sam back to re-justify?')">` +
              `<button class="btn b-no" style="margin-top:14px">Reject all ${pending.length} and require re-justification</button>` +
              `</form><p class="meta">Rejecting keeps the drafts on record and tells Sam to run the cannibalisation check and build a full case before re-filing.</p>`
            : `<p class="meta">Nothing waiting in this view.</p>`) +
          (done.length
            ? `<div class="k" style="margin-top:28px">Already decided</div>${done.map(card).join('')}`
            : '') +
          `</div>`
      );
    } catch (e) {
      res.status(500).send(`Dashboard error: ${esc(e.message)}`);
    }
  });

  app.get('/approve/:key', async (req, res) => {
    if (!authed(req)) return deny(res);
    try {
      const r = await dbQuery(`SELECT entity_key, data, updated_at FROM knowledge WHERE entity_type='topic' AND entity_key=$1`, [
        req.params.key,
      ]);
      const row = r.rows[0];
      if (!row) return res.status(404).send('No such draft.');
      const d = asData(row);
      const t = encodeURIComponent(req.query.t);
      const title = d.query || d.working_title || d.hook || row.entity_key;

      const sections = [];
      sections.push(`<div class="k">Status</div>${statusPill(d.status)}`);

      // The case for the post, first — AJ decides from this before reading a word
      // of the draft, so it gets the top of the page and the most space.
      const j = d.justification && typeof d.justification === 'object' ? d.justification : null;
      if (j) {
        const field = (label, value) =>
          value ? `<div class="k">${esc(label)}</div><div class="reason">${esc(value)}</div>` : '';
        sections.push(
          '<div class="case">' +
            '<div class="case-head">The case for this post</div>' +
            field('Cannibalisation check', j.ownership_check) +
            field('Demand evidence', j.demand) +
            field('Why we can win it', j.winnability) +
            field('Value to Design Bees', j.value_to_design_bees) +
            field('Value to the reader', j.value_to_reader) +
            `<div class="k">Sources</div>` +
            (Array.isArray(j.sources) && j.sources.length
              ? `<ul class="src">${j.sources
                  .map((s) => `<li><b>${esc(s.claim)}</b><br><span class="meta">${esc(s.source)}</span></li>`)
                  .join('')}</ul>`
              : '<div class="meta">No outside figures used beyond Design Bees plan pricing.</div>') +
            '</div>'
        );
      } else if (d.why_this_lands) {
        sections.push(`<div class="case"><div class="case-head">Why this lands</div><div class="reason">${esc(d.why_this_lands)}</div></div>`);
      } else if (d.demand_evidence) {
        sections.push(`<div class="k">Demand evidence (pre-justification format)</div><div class="reason">${esc(d.demand_evidence)}</div>`);
      }
      if (d.queue_number) sections.push(`<div class="k">Queue item</div><div>#${esc(d.queue_number)} from content-queue.md</div>`);
      if (Array.isArray(d.long_tail_cluster) && d.long_tail_cluster.length)
        sections.push(`<div class="k">Keyword cluster</div><div>${d.long_tail_cluster.map(esc).join(' · ')}</div>`);
      if (d.category || d.slug || d.meta_title) {
        sections.push(
          `<div class="k">Metadata</div><div class="meta">${esc(d.category || '')}${d.slug ? ` · slug: ${esc(d.slug)}` : ''}${
            d.meta_title ? `<br>Meta title: ${esc(d.meta_title)}` : ''
          }${d.meta_description ? `<br>Meta description: ${esc(d.meta_description)}` : ''}${
            Array.isArray(d.tags) && d.tags.length ? `<br>Tags: ${d.tags.map(esc).join(', ')}` : ''
          }</div>`
        );
      }
      const flags = Array.isArray(d.voice_warnings) ? d.voice_warnings : [];
      sections.push(
        `<div class="k">Voice check</div>` +
          (flags.length ? flags.map((f) => `<div class="flag">${esc(f)}</div>`).join('') : '<div>Machine checks passed.</div>')
      );
      const body = d.body || d.text || (d.sections ? d.sections.map((s, i) => `${i + 1}. ${s.h2}\n   ${s.covers}`).join('\n') : '');
      sections.push(`<div class="k">The draft</div><pre>${esc(body)}</pre>`);

      const actions =
        d.status === 'draft-awaiting-aj'
          ? `<form method="post" action="/approve/${encodeURIComponent(row.entity_key)}/decision?t=${t}">
               <button class="btn b-ok" name="action" value="approve">Approve</button>
               <button class="btn b-no" name="action" value="reject">Reject</button>
             </form>
             <p class="meta">Approve = ready for you to post/publish (nothing is posted automatically). Reject = Sam is told, with the draft kept for the record.</p>`
          : '';

      res.send(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${PAGE_CSS}</style>` +
          `<div class="wrap"><p><a href="/approve?t=${t}">← all drafts</a></p><h1>${esc(title)}</h1><div class="card">${sections.join('')}</div>${actions}</div>`
      );
    } catch (e) {
      res.status(500).send(`Dashboard error: ${esc(e.message)}`);
    }
  });

  app.post('/approve/:key/decision', async (req, res) => {
    if (!authed(req)) return deny(res);
    try {
      const action = String(req.body?.action || '');
      if (!['approve', 'reject'].includes(action)) return res.status(400).send('Unknown action.');
      const status = action === 'approve' ? 'approved-by-aj' : 'rejected-by-aj';

      const r = await dbQuery(
        `UPDATE knowledge
            SET data = data || jsonb_build_object('status', $1::text, 'decided_at', now()::text)
          WHERE entity_type='topic' AND entity_key=$2 AND data->>'status' = 'draft-awaiting-aj'
            AND data->>'standard' = 'blog-engine-pack-2026-07'
          RETURNING data`,
        [status, req.params.key]
      );
      if (!r.rows[0]) return res.status(409).send('That draft is not awaiting a decision (already decided, or missing).');

      const d = asData(r.rows[0]);
      const title = d.query || d.working_title || d.hook || req.params.key;
      await publish({
        worker_key: 'forge',
        topic: action === 'approve' ? 'content:approved' : 'content:rejected',
        title: `AJ ${action}d: ${String(title).slice(0, 100)}`,
        body:
          action === 'approve'
            ? `AJ approved "${title}" on the dashboard. It is ready for him to post — nothing publishes automatically.`
            : `AJ rejected "${title}" on the dashboard. Sam: read the draft's voice flags and demand evidence before proposing anything similar.`,
        data: { knowledge_key: req.params.key, decision: status },
        confidence: 'fact',
      });

      const t = encodeURIComponent(req.query.t);
      res.redirect(`/approve?t=${t}`);
    } catch (e) {
      res.status(500).send(`Decision failed: ${esc(e.message)}`);
    }
  });

  // Bulk reject with a re-justify instruction. AJ's call on the first batch:
  // those drafts predate the justification gate, and several collided with
  // pages the live blog already owns, so judging them as-is wastes his time.
  // Rejecting sends Sam back to make the real case rather than deleting work —
  // the drafts stay in knowledge as the record.
  app.post('/approve/reject-all', async (req, res) => {
    if (!authed(req)) return deny(res);
    try {
      const t = encodeURIComponent(req.query.t);
      const view = ['blog', 'social'].includes(String(req.query.view)) ? req.query.view : 'all';
      const formats =
        view === 'social' ? ['linkedin-post'] : view === 'blog' ? ['blog-post', 'blog-outline'] : ['blog-post', 'blog-outline', 'linkedin-post'];

      const r = await dbQuery(
        `UPDATE knowledge
            SET data = data || jsonb_build_object(
              'status', 'rejected-by-aj',
              'decided_at', now()::text,
              'rejection_reason', 'Rejected in bulk by AJ: written before the justification gate. Re-justify from scratch.'
            )
          WHERE entity_type='topic'
            AND data->>'status' = 'draft-awaiting-aj'
            AND data->>'standard' = 'blog-engine-pack-2026-07'
            AND data->>'format' = ANY($1::text[])
          RETURNING entity_key, data`,
        [formats]
      );
      const rejected = r.rows.map((row) => {
        const d = asData(row);
        return { key: row.entity_key, title: d.query || d.working_title || d.hook || row.entity_key, format: d.format };
      });

      if (rejected.length) {
        await publish({
          worker_key: 'forge',
          topic: 'content:rejected',
          title: `AJ rejected ${rejected.length} draft(s) — re-justify before re-filing`,
          body:
            `AJ rejected every draft awaiting his decision${view === 'all' ? '' : ` in the ${view} view`} ` +
            `because they were written before the justification gate existed, and at least one targeted a query ` +
            `a live page already owns.\n\n` +
            rejected.map((x) => `• ${x.title} (${x.format})`).join('\n') +
            `\n\nSam — what has to be different before any of these is re-filed:\n` +
            `1. Run the cannibalisation check FIRST: read keyword-ownership-map.md and engine-content-map.md, ` +
            `and call list_live_blog_posts. If a live page or engine draft owns the query or its cluster, the ` +
            `answer is to propose strengthening THAT page to AJ, not to re-file this one.\n` +
            `2. Only re-file what survives that check, and only with a full justification: what you checked and ` +
            `what it said, the demand evidence with figures quoted to their source, who ranks today and the ` +
            `specific weakness you are attacking, the commercial bridge to a demo or trial, and what the reader ` +
            `can do afterwards that they could not before. A source per claim for every figure.\n` +
            `3. Do NOT re-file the same text with a padded case. If the case does not genuinely hold, the post ` +
            `should not exist — say so and move on.\n` +
            `4. One at a time. A queue of six thin drafts is worse than one AJ can approve in two minutes.\n\n` +
            `The rejected drafts stay on record; their topics count as unwritten.`,
          data: { decision: 'rejected-by-aj', bulk: true, view, count: rejected.length, keys: rejected.map((x) => x.key) },
          confidence: 'fact',
        });
      }
      res.redirect(`/approve?t=${t}${view === 'all' ? '' : `&view=${view}`}`);
    } catch (e) {
      res.status(500).send(`Bulk reject failed: ${esc(e.message)}`);
    }
  });
}
