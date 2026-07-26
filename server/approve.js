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
  form{display:inline}
`;

function statusPill(status) {
  const cls =
    status === 'approved-by-aj' ? 'p-ok' : status === 'rejected-by-aj' ? 'p-no' : status === 'draft-awaiting-aj' ? 'p-wait' : 'p-old';
  return `<span class="pill ${cls}">${esc(STATUS_LABELS[status] || status || 'unknown')}</span>`;
}

async function draftRows() {
  const r = await dbQuery(
    `SELECT entity_key, data, updated_at FROM knowledge
      WHERE entity_type = 'topic'
        AND data->>'format' IN ('blog-post', 'blog-outline', 'linkedin-post')
      ORDER BY (data->>'status' = 'draft-awaiting-aj') DESC, updated_at DESC
      LIMIT 100`
  );
  return r.rows;
}

export function mountApprove(app) {
  app.get('/approve', async (req, res) => {
    if (!authed(req)) return deny(res);
    try {
      const rows = await draftRows();
      const waiting = rows.filter((r) => asData(r).status === 'draft-awaiting-aj');
      const items = rows
        .map((row) => {
          const d = asData(row);
          const title = d.query || d.working_title || d.hook || row.entity_key;
          const flags = Array.isArray(d.voice_warnings) ? d.voice_warnings.length : 0;
          return (
            `<div class="card"><b><a href="/approve/${encodeURIComponent(row.entity_key)}?t=${encodeURIComponent(req.query.t)}">${esc(title)}</a></b>` +
            statusPill(d.status) +
            `<div class="meta">${esc(d.format || '')}${d.category ? ` · ${esc(d.category)}` : ''}${d.word_count ? ` · ${d.word_count} words` : ''}${
              flags ? ` · ${flags} voice flag(s)` : ' · voice-clean'
            } · updated ${esc(String(row.updated_at).slice(0, 16))}</div></div>`
          );
        })
        .join('');
      res.send(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Approvals — Design Bees hive</title><style>${PAGE_CSS}</style>` +
          `<div class="wrap"><h1>Content approvals</h1><p class="sub">${waiting.length} draft(s) waiting · approving marks a draft ready, it never posts anything</p>${
            items || '<p>No drafts yet. When Sam files one, it lands here with its full justification.</p>'
          }</div>`
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
      if (d.demand_evidence) sections.push(`<div class="k">Why this earns a post (demand evidence)</div><div>${esc(d.demand_evidence)}</div>`);
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
      if (d.proof_source) sections.push(`<div class="k">Proof source</div><div>${esc(d.proof_source)}</div>`);
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
}
