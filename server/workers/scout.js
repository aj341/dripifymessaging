// Ian — ICP & Sourcing (worker key: scout). Three views on the client base:
//   cohorts   — Nectar 2025+, Honeycomb 2026+, active >3 months (from Wix)
//   salesnav  — persona / company type / headcount / industry, for Sales Nav
//               targeting (Wix spend × Clay enrichment)
//   demos     — demo→conversion since March (from a Google Calendar scan)
// The formatters are exported so their output can be rendered in a test without
// touching Telegram or the database.
import { writeSignal, setMemory, getSetting, setSetting } from '../brain.js';
import { send } from '../telegram.js';
import { wixReady, getCohorts, getDemos, money, WIX_SITE_ID } from '../wix.js';

const WORKER = { key: 'scout', name: 'Ian', emoji: '🔭' };

export function scoutReady() {
  return wixReady();
}

function line(m) {
  // Enriched members (from the Clay-verified snapshot) carry a title and
  // industry; raw Wix members don't. Show whatever we actually have.
  const who = m.title ? ` · ${m.title}` : '';
  const firmo = m.industry ? ` · ${m.industry}${m.employeeCount ? ` (${m.employeeCount})` : ''}` : '';
  return `• *${m.name}* — ${m.domain || 'no email'}${who}${firmo} · ${m.tenureMonths}mo · $${money(m.spend)}`;
}
function block(title, arr) {
  const rows = arr.slice(0, 6).map(line).join('\n') || '• _none_';
  const more = arr.length > 6 ? `\n_…and ${arr.length - 6} more_` : '';
  return `*${title}:* ${arr.length}\n${rows}${more}`;
}
export function cohortsText(c) {
  return (
    `🔭 *Ian — customer cohorts* (from Wix)\n\n` +
    `${block('Nectar (2025+)', c.nectar2025)}\n\n` +
    `${block('Honeycomb (2026+)', c.honeycomb2026)}\n\n` +
    `${block('Active >3 months', c.active3mo)}\n\n` +
    `_Type_ \`salesnav\` _for the founder / marketing / agency split ·_ \`demos\` _for demo→conversion._`
  );
}

// The unique client set across all three cohorts — the basis for segmentation.
function uniqueMembers(c) {
  const byKey = new Map();
  for (const k of ['nectar2025', 'honeycomb2026', 'active3mo']) {
    for (const m of c[k] || []) byKey.set(m.email || m.name, m);
  }
  return [...byKey.values()];
}

function headcountBand(n) {
  if (!n) return 'unknown';
  if (n < 11) return '2-10';
  if (n < 51) return '11-50';
  if (n < 201) return '51-200';
  if (n < 501) return '201-500';
  return '500+';
}

function groupRows(members, keyFn, { limit = 8 } = {}) {
  const g = {};
  for (const m of members) {
    const k = keyFn(m) || 'unknown';
    g[k] = g[k] || { n: 0, spend: 0 };
    g[k].n += 1;
    g[k].spend += m.spend || 0;
  }
  return Object.entries(g)
    .map(([k, v]) => ({ k, n: v.n, spend: Math.round(v.spend) }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
}

// The Sales Nav targeting view: who these clients ARE, so the filters can be
// built from evidence rather than guesswork.
export function salesNavText(c) {
  const u = uniqueMembers(c);
  const enriched = u.filter((m) => m.roleType);
  if (!enriched.length) {
    return `🔭 *Ian — Sales Nav filters*\n\n_No enrichment on the current cohort data._`;
  }
  const fmt = (rows) => rows.map((r) => `• *${r.k}* — ${r.n} · $${money(r.spend)}`).join('\n');
  return (
    `🔭 *Ian — Sales Nav filters* (${enriched.length} clients, enriched)\n\n` +
    `*By persona (job function):*\n${fmt(groupRows(enriched, (m) => m.roleType))}\n\n` +
    `*By company type:*\n${fmt(groupRows(enriched, (m) => m.companyType))}\n\n` +
    `*By headcount:*\n${fmt(groupRows(enriched, (m) => headcountBand(m.employeeCount)))}\n\n` +
    `*Top industries:*\n${fmt(groupRows(enriched, (m) => m.industry, { limit: 6 }))}\n\n` +
    `_Source: Wix spend × Clay enrichment._`
  );
}

const shortDate = (iso) => (iso ? iso.slice(5).replace('-', '/') : '?');

export function demosText(d) {
  if (!d) return `🔭 *Ian* — no demo data loaded yet.`;
  const conv = d.conversions.map((x) => {
    const co = x.company ? ` (${x.company})` : '';
    const when = `${shortDate(x.demoDate)} → ${x.paidDate ? shortDate(x.paidDate) : 'paid'}`;
    const note = x.note ? `\n   _${x.note}_` : '';
    return `• *${x.client}*${co} · ${when} · ${x.plan} · $${money(x.spend)}${note}`;
  });
  const total = d.conversions.reduce((a, c) => a + (c.spend || 0), 0);
  const rate = d.totalDemosInWindow
    ? ` (${Math.round((d.conversions.length / d.totalDemosInWindow) * 100)}%)`
    : '';
  const excl = (d.excluded || []).map((x) => `• ${x.who} — _${x.reason}_`);
  return (
    `🔭 *Ian — demo → conversion* (${d.window.from} → ${d.window.to})\n\n` +
    `*Demos booked:* ${d.totalDemosInWindow}\n` +
    `*Converted:* ${d.conversions.length}${rate} · *$${money(total)}*\n\n` +
    `${conv.join('\n')}\n\n` +
    (excl.length ? `*Excluded:*\n${excl.join('\n')}\n\n` : '') +
    `_Source: ${d.source}._\n_${d.note}_`
  );
}

export async function runScout({ notify = true } = {}) {
  if (!scoutReady()) {
    if (notify) await send('🔭 Ian needs the Wix key to build your cohorts.', { worker: WORKER }).catch(() => {});
    return { skipped: 'no WIX_API_KEY' };
  }
  const now = new Date();
  const { data: c, live, asOf } = await getCohorts(now);
  const source = {
    tool: live ? 'wix:payments/v2/transactions' : `snapshot@${asOf}`,
    live,
    siteId: WIX_SITE_ID,
    totalClients: c.totalClients,
    nectar2025: c.nectar2025.length,
    honeycomb2026: c.honeycomb2026.length,
    active3mo: c.active3mo.length,
    fetchedAt: now.toISOString(),
  };
  await writeSignal({
    worker_key: 'scout',
    kind: 'finding',
    title: `Cohorts: Nectar(2025+) ${c.nectar2025.length}, Honeycomb(2026+) ${c.honeycomb2026.length}, active>3mo ${c.active3mo.length}`,
    body: cohortsText(c).replace(/\*/g, ''),
    confidence: 'fact',
    source,
  });
  await setMemory({ worker_key: 'scout', key: 'cohorts', value: c, source });
  await setSetting('scout_last_run', now.toISOString());

  if (notify) await send(cohortsText(c), { worker: WORKER }).catch((e) => console.error('[ian] send failed:', e.message));
  console.log(`[ian] cohorts: Nectar ${c.nectar2025.length}, Honeycomb ${c.honeycomb2026.length}, active3mo ${c.active3mo.length}`);
  return c;
}

/** The founder / marketing / agency breakdown — the Sales Nav filter basis. */
export async function runScoutSalesNav({ notify = true } = {}) {
  const now = new Date();
  const { data: c, live, asOf } = await getCohorts(now);
  const text = salesNavText(c);
  await writeSignal({
    worker_key: 'scout',
    kind: 'finding',
    title: 'Sales Nav filters: persona / company type / headcount / industry',
    body: text.replace(/\*/g, ''),
    confidence: 'fact',
    source: { tool: live ? 'wix+clay' : `snapshot@${asOf}`, live, fetchedAt: now.toISOString() },
  });
  if (notify) await send(text, { worker: WORKER }).catch((e) => console.error('[ian] send failed:', e.message));
  return c;
}

/** Demo → conversion since March, from the Google Calendar scan. */
export async function runScoutDemos({ notify = true } = {}) {
  const d = getDemos();
  const text = demosText(d);
  if (d) {
    await writeSignal({
      worker_key: 'scout',
      kind: 'finding',
      title: `Demos: ${d.conversions.length} of ${d.totalDemosInWindow} booked converted (${d.window.from}→${d.window.to})`,
      body: text.replace(/\*/g, ''),
      confidence: 'fact',
      source: { tool: d.source, window: d.window, builtAt: d.builtAt },
    });
    await setMemory({ worker_key: 'scout', key: 'demos', value: d, source: { tool: d.source, builtAt: d.builtAt } });
  }
  if (notify) await send(text, { worker: WORKER }).catch((e) => console.error('[ian] send failed:', e.message));
  return d;
}

export async function scoutHasRun() {
  return Boolean(await getSetting('scout_last_run'));
}
