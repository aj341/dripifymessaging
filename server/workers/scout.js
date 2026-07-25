// Ian — ICP & Sourcing (worker key: scout). Reads real paying clients from Wix
// Payments transactions (who paid, how much, which plan), drafts ICP evidence,
// and asks AJ the first best-fit-client question. Never invents an ICP.
import { writeSignal, setMemory, askQuestion, hasOpenQuestion, getSetting, setSetting } from '../brain.js';
import { send } from '../telegram.js';
import { wixReady, fetchAllTransactions, summarizeRevenue, money, WIX_SITE_ID } from '../wix.js';

const WORKER = { key: 'scout', name: 'Ian', emoji: '🔭' };

export function scoutReady() {
  return wixReady();
}

function summaryText(s, rev90) {
  const clients = s.clientRows.slice(0, 8).map((c) => {
    const plan = c.plans.filter((p) => p !== 'Unknown')[0] || '';
    return `• *${c.name}* — $${money(c.total)}${plan ? ` · ${plan}` : ''}`;
  });
  const plans = s.planRows.slice(0, 6).map((p) => `• *${p.plan}* — ${p.count} · $${money(p.revenue)}`);
  return (
    `🔭 *Ian — ICP onboarding* (from Wix Payments)\n\n` +
    `Your paying clients (last 90 days):\n` +
    `*Active clients:* ${s.activeClients90}  ·  *Revenue (90d):* $${money(rev90)}\n` +
    `*This month:* $${money(s.monthRevenue)} (${s.monthCount} payments)\n\n` +
    `*Top clients by spend:*\n${clients.join('\n') || '• _none yet_'}\n` +
    (s.unattributed90 ? `_(+$${money(s.unattributed90)} from payments without a name attached)_\n` : '') +
    `\n` +
    `*Top plans:*\n${plans.join('\n') || '• _none yet_'}\n\n` +
    `To shape our ICP from evidence, one question to start:\n` +
    `*Which client type — industry, business size, or category — are your best-fit, highest-value clients?* ` +
    `I'll match your answer against who's actually paying.\n\n` +
    `_Next: connect your demo calendar and I'll track which demo-bookers became paying clients._`
  );
}

const PRIMARY_QUESTION =
  'Which client type — industry, business size, or category — are your best-fit, highest-value clients? (Ian will match this against who is actually paying.)';

export async function runScout() {
  if (!scoutReady()) {
    await send('🔭 Ian needs the Wix key to see your clients — add WIX_API_KEY and I can start.', { worker: WORKER }).catch(() => {});
    return { skipped: 'no WIX_API_KEY' };
  }
  const now = new Date();
  const txns = await fetchAllTransactions();
  const s = summarizeRevenue(txns, now);
  const rev90 = s.revenue90;

  const source = {
    tool: 'wix:payments/api/merchant/v2/transactions',
    siteId: WIX_SITE_ID,
    transactionsScanned: s.fetched,
    activeClients90: s.activeClients90,
    revenue90Aud: rev90,
    monthRevenueAud: s.monthRevenue,
    fetchedAt: now.toISOString(),
  };

  await writeSignal({
    worker_key: 'scout',
    kind: 'finding',
    title: `ICP draft: ${s.activeClients90} active clients (90d), $${money(rev90)} · top client "${s.clientRows[0]?.name ?? 'n/a'}"`,
    body: summaryText(s, rev90).replace(/\*/g, ''),
    confidence: 'hypothesis',
    source,
  });
  await setMemory({
    worker_key: 'scout',
    key: 'icp:draft',
    value: { topClients: s.clientRows.slice(0, 15), planRows: s.planRows, activeClients90: s.activeClients90, revenue90: rev90 },
    source,
  });

  if (!(await hasOpenQuestion('scout'))) {
    await askQuestion({ worker_key: 'scout', question: PRIMARY_QUESTION }).catch(() => {});
  }
  await send(summaryText(s, rev90), { worker: WORKER }).catch((e) => console.error('[ian] send failed:', e.message));

  await setSetting('scout_last_run', now.toISOString());
  console.log(`[ian] onboarding sent: ${s.activeClients90} clients (90d), $${rev90}`);
  return s;
}

export async function scoutHasRun() {
  return Boolean(await getSetting('scout_last_run'));
}
