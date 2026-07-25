// Fred — Revenue & Finance (worker key: ledger). Source of truth: Wix Pricing Plans.
// Numbers come straight from the order book via the shared summariser; the only
// estimate (MRR cycle-normalisation) is disclosed in the provenance.
import { writeSignal, setMemory, getSetting, setSetting } from '../brain.js';
import { send } from '../telegram.js';
import {
  wixReady,
  fetchAllPricingOrders,
  summarizeOrders,
  money,
  WIX_SITE_ID,
  WIX_CURRENCY,
} from '../wix.js';

const WORKER = { key: 'ledger', name: 'Fred', emoji: '📊' };

export function ledgerReady() {
  return wixReady();
}

function report(s) {
  const trend =
    s.salesDelta > 0 ? `📈 up $${money(s.salesDelta)} vs last month` :
    s.salesDelta < 0 ? `📉 down $${money(-s.salesDelta)} vs last month` :
    `level with last month`;
  const drafts = s.statusCounts.DRAFT || 0;
  return (
    `📊 *Fred — revenue pulse* (${WIX_CURRENCY})\n\n` +
    `*Active paying clients:* ${s.activePaying}  ·  *Recurring MRR:* ~$${money(s.mrr)}/mo\n` +
    `*One-time / prepaid (active):* $${money(s.oneTimeValue)} (${s.oneTimeCount})\n` +
    `*New this month:* ${s.newMTD.count} ($${money(s.newMTD.value)})\n` +
    `*Same point last month:* ${s.lastMonthMTD.count} ($${money(s.lastMonthMTD.value)})\n` +
    `*Trend:* ${trend}\n` +
    `*Churned (90d):* ${s.churn90}\n\n` +
    `_Source: Wix Pricing Plans · ${s.ordersScanned} orders (${drafts} drafts ignored)_`
  );
}

export async function runLedger() {
  if (!ledgerReady()) {
    console.warn('[fred] WIX_API_KEY not set — skipping.');
    return { skipped: 'no WIX_API_KEY' };
  }
  const now = new Date();
  const orders = await fetchAllPricingOrders();
  const s = summarizeOrders(orders, now);

  const source = {
    tool: 'wix:pricing-plans/v2/orders',
    siteId: WIX_SITE_ID,
    ordersScanned: s.ordersScanned,
    statusCounts: s.statusCounts,
    activePaying: s.activePaying,
    recurringMrrAud: s.mrr,
    oneTimeActiveAud: s.oneTimeValue,
    newMTD: s.newMTD,
    lastMonthMTD: s.lastMonthMTD,
    churn90: s.churn90,
    window: 'MTD vs same day-of-month last month, UTC; DRAFT excluded',
    fetchedAt: now.toISOString(),
  };

  const trendWord = s.salesDelta > 0 ? 'up' : s.salesDelta < 0 ? 'down' : 'level';
  await writeSignal({
    worker_key: 'ledger',
    kind: s.churn90 > 0 || s.salesDelta < 0 ? 'alert' : 'finding',
    title: `MRR ~$${money(s.mrr)} ${WIX_CURRENCY} · ${s.activePaying} paying · sales ${trendWord} vs last month · ${s.churn90} churned (90d)`,
    body: report(s).replace(/\*/g, ''),
    confidence: 'fact',
    source,
  });

  const dateKey = now.toISOString().slice(0, 10);
  await setMemory({ worker_key: 'ledger', key: `snapshot:${dateKey}`, value: s, source });
  await setMemory({ worker_key: 'ledger', key: 'latest', value: s, source });
  await setSetting('ledger_last_run', now.toISOString());

  await send(report(s), { worker: WORKER }).catch((e) =>
    console.error('[fred] telegram send failed:', e.message)
  );

  console.log(`[fred] pulse: ${s.activePaying} paying, MRR ~$${s.mrr}, ${s.churn90} churned`);
  return s;
}

export async function hoursSinceLastRun() {
  const last = await getSetting('ledger_last_run');
  if (!last) return Infinity;
  return (Date.now() - new Date(last).getTime()) / 3.6e6;
}
