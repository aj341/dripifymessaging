// Outreach results ingest — the feedback loop Ian was missing.
//
// A weekly Dripify export (CSV) is POSTed here — by AJ's scheduled Cowork task
// or by hand. The rows are summarised per campaign, stored as knowledge, and
// published as outreach:results so Ian learns which segments actually reply and
// convert, and Sam learns which messaging landed. Without this, every split Ian
// proposes is grounded in client history alone; with it, every campaign makes
// the next one smarter.
//
// POST /ingest/dripify?t=<DASHBOARD_TOKEN>&campaign=<optional name>
// Body: the CSV, content-type text/csv (or text/plain).
import { query as dbQuery } from './db.js';
import { saveKnowledge } from './brain.js';
import { publish } from './bus.js';

const TOKEN = process.env.DASHBOARD_TOKEN;

/** Minimal CSV parser: quoted fields, commas, CRLF. Returns array of rows. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f.trim() !== '')) rows.push(row); }
  return rows;
}

const truthy = (v) => {
  const t = String(v || '').trim().toLowerCase();
  return t !== '' && t !== '0' && t !== 'no' && t !== 'false' && t !== 'n/a' && t !== '-';
};

/** Column indexes whose header matches any of the given fragments. */
function colsMatching(headers, fragments) {
  return headers
    .map((h, i) => ({ h: h.toLowerCase(), i }))
    .filter(({ h }) => fragments.some((f) => h.includes(f)))
    .map(({ i }) => i);
}

export function mountIngest(app) {
  app.post('/ingest/dripify', async (req, res) => {
    if (!TOKEN) return res.status(503).json({ error: 'Set DASHBOARD_TOKEN on the Railway service first.' });
    if (req.query.t !== TOKEN) return res.status(403).json({ error: 'Wrong or missing token (?t=...).' });
    try {
      const csv = typeof req.body === 'string' ? req.body : '';
      const rows = parseCsv(csv);
      if (rows.length < 2) {
        return res.status(400).json({ error: 'Body must be a Dripify CSV export with a header row and at least one lead row. Send content-type text/csv.' });
      }
      const headers = rows[0].map((h) => String(h || '').trim());
      const leads = rows.slice(1);

      // Column discovery by name — Dripify exports vary, so match loosely and
      // report what was matched rather than assuming a fixed layout.
      const campaignCols = colsMatching(headers, ['campaign']);
      const replyCols = colsMatching(headers, ['repl']);
      const acceptCols = colsMatching(headers, ['accept', 'connect']);
      const openCols = colsMatching(headers, ['open']);

      const perCampaign = new Map();
      const bump = (name, field) => {
        const c = perCampaign.get(name) || { leads: 0, replied: 0, accepted: 0, opened: 0 };
        c[field] += 1;
        perCampaign.set(name, c);
      };
      for (const r of leads) {
        const name = campaignCols.length ? String(r[campaignCols[0]] || 'unnamed').trim() || 'unnamed' : 'all';
        bump(name, 'leads');
        if (replyCols.some((i) => truthy(r[i]))) bump(name, 'replied');
        if (acceptCols.some((i) => truthy(r[i]))) bump(name, 'accepted');
        if (openCols.some((i) => truthy(r[i]))) bump(name, 'opened');
      }

      const importedAt = new Date().toISOString();
      const summary = [...perCampaign.entries()].map(([name, c]) => ({
        campaign: name,
        leads: c.leads,
        accepted: c.accepted,
        replied: c.replied,
        opened: c.opened,
        reply_rate: c.leads ? +(100 * c.replied / c.leads).toFixed(1) : 0,
        accept_rate: c.leads ? +(100 * c.accepted / c.leads).toFixed(1) : 0,
      }));

      const label = String(req.query.campaign || '').trim() || `dripify-${importedAt.slice(0, 10)}`;
      await saveKnowledge({
        entity_type: 'campaign',
        entity_key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80),
        data: {
          source: 'dripify-export',
          imported_at: importedAt,
          headers,
          matched_columns: {
            campaign: campaignCols.map((i) => headers[i]),
            replied: replyCols.map((i) => headers[i]),
            accepted: acceptCols.map((i) => headers[i]),
            opened: openCols.map((i) => headers[i]),
          },
          total_leads: leads.length,
          per_campaign: summary,
          // Raw rows capped so one giant export can't bloat the knowledge table.
          raw_csv: csv.length > 200000 ? csv.slice(0, 200000) + '\n[truncated]' : csv,
        },
        source: { tool: 'ingest:dripify', imported_at: importedAt, rows: leads.length },
        worker_key: 'scout',
      });

      const lines = summary
        .map((c) => `• ${c.campaign}: ${c.leads} leads, ${c.accepted} accepted (${c.accept_rate}%), ${c.replied} replied (${c.reply_rate}%)`)
        .join('\n');
      await publish({
        worker_key: 'scout',
        topic: 'outreach:results',
        title: `Dripify results imported: ${leads.length} leads across ${summary.length} campaign(s)`,
        body:
          `Imported ${importedAt.slice(0, 16)} as campaign/${label}.\n\n${lines}\n\n` +
          `Columns matched — replied: [${replyCols.map((i) => headers[i]).join(', ') || 'none found'}], ` +
          `accepted: [${acceptCols.map((i) => headers[i]).join(', ') || 'none found'}]. ` +
          `If a column list says "none found", the rates above under-count — say so rather than treating them as truth.\n\n` +
          `Ian: join these against ICP segments and update what converts. Sam: the campaigns with replies show which messaging landed.`,
        data: { knowledge_key: label, per_campaign: summary },
        confidence: 'fact',
      });

      res.json({ ok: true, imported: leads.length, campaigns: summary, stored_as: `campaign/${label}` });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
