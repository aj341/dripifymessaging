// Fred — Revenue & Finance (worker key: ledger). Source of truth: Wix Payments
// transactions — the actual money behind Design Bees' invoices. Every number
// carries its receipt (endpoint, counts, fetch time) in the signal source.
import { writeSignal, setMemory, getSetting, setSetting } from '../brain.js';
import { send } from '../telegram.js';
import {
  wixReady,
  fetchAllTransactions,
  summarizeRevenue,
  money,
  WIX_SITE_ID,
  WIX_CURRENCY,
} from '../wix.js';

const WORKER = { key: 'ledger', name: 'Fred', emoji: '📊' };

export function ledgerReady() {
  return wixReady();
}

function pulseText(s) {
  const trend =
    s.delta > 0 ? `📈 up $${money(s.delta)} vs last month` :
    s.delta < 0 ? `📉 down $${money(-s.delta)} vs last month` :
    `level with last month`;
  const plans = s.planRows.length
    ? s.planRows.slice(0, 8).map((p) => `• *${p.plan}* — ${p.count} · $${money(p.revenue)}`).join('\n')
    : '• _no payments yet this month_';
  return (
    `📊 *Fred — revenue pulse* (${WIX_CURRENCY})\n\n` +
    `*This month:* $${money(s.monthRevenue)}  (${s.monthCount} payments)\n` +
    `*Same point last month:* $${money(s.lastMonthRevenue)}  (${s.lastMonthCount})\n` +
    `*Trend:* ${trend}\n` +
    `*${s.year} YTD:* $${money(s.ytd)}  (${s.ytdCount} payments)\n` +
    `*Active clients (90d):* ${s.activeClients90}\n\n` +
    `*Top plans this month:*\n${plans}\n\n` +
    `_Source: Wix Payments · type_ \`clients\` _for who paid what_`
  );
}

function clientsText(s) {
  const rows = s.clientRows.slice(0, 20).map((c) => {
    const plan = c.plans.filter((p) => p !== 'Unknown')[0] || c.plans[0] || '';
    return `• *${c.name}* — $${money(c.total)}${c.payments > 1 ? ` (${c.payments}×)` : ''}${plan ? ` · ${plan}` : ''}`;
  });
  return (
    `📊 *Fred — clients by spend* (last 90 days, ${WIX_CURRENCY})\n\n` +
    (rows.length ? rows.join('\n') : '_no client payments in the last 90 days_') +
    (s.clientRows.length > 20 ? `\n\n_…and ${s.clientRows.length - 20} more_` : '') +
    (s.unattributed90 ? `\n\n_+$${money(s.unattributed90)} from payments with no name on the transaction_` : '')
  );
}

async function load() {
  const now = new Date();
  const txns = await fetchAllTransactions();
  return { now, s: summarizeRevenue(txns, now) };
}

/** Fred's revenue pulse. */
export async function runLedger() {
  if (!ledgerReady()) {
    console.warn('[fred] WIX_API_KEY not set — skipping.');
    return { skipped: 'no WIX_API_KEY' };
  }
  const { now, s } = await load();
  const source = {
    tool: 'wix:payments/api/merchant/v2/transactions',
    siteId: WIX_SITE_ID,
    transactionsScanned: s.fetched,
    monthRevenueAud: s.monthRevenue,
    monthPayments: s.monthCount,
    ytdAud: s.ytd,
    lastMonthMTD: { revenue: s.lastMonthRevenue, payments: s.lastMonthCount },
    activeClients90: s.activeClients90,
    window: 'approved SALE transactions; MTD vs same day-of-month last month, UTC',
    fetchedAt: now.toISOString(),
  };
  const trendWord = s.delta > 0 ? 'up' : s.delta < 0 ? 'down' : 'level';
  await writeSignal({
    worker_key: 'ledger',
    kind: s.delta < 0 ? 'alert' : 'finding',
    title: `Revenue $${money(s.monthRevenue)} ${WIX_CURRENCY} MTD (${s.monthCount} payments) · ${trendWord} vs last month · ${s.activeClients90} active clients`,
    body: pulseText(s).replace(/\*/g, ''),
    confidence: 'fact',
    source,
  });
  const dateKey = now.toISOString().slice(0, 10);
  await setMemory({ worker_key: 'ledger', key: `snapshot:${dateKey}`, value: s, source });
  await setMemory({ worker_key: 'ledger', key: 'latest', value: s, source });
  await setSetting('ledger_last_run', now.toISOString());

  await send(pulseText(s), { worker: WORKER }).catch((e) => console.error('[fred] send failed:', e.message));
  console.log(`[fred] pulse: $${s.monthRevenue} MTD, ${s.monthCount} payments, ${s.activeClients90} clients`);
  return s;
}

/** Fred's per-client breakdown — who paid what. */
export async function runLedgerClients() {
  if (!ledgerReady()) return { skipped: 'no WIX_API_KEY' };
  const { s } = await load();
  await send(clientsText(s), { worker: WORKER }).catch((e) => console.error('[fred] send failed:', e.message));
  return s;
}

export async function hoursSinceLastRun() {
  const last = await getSetting('ledger_last_run');
  if (!last) return Infinity;
  return (Date.now() - new Date(last).getTime()) / 3.6e6;
}
