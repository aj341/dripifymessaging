// Fred — Revenue & Finance (worker key: ledger). Source of truth: Wix Pricing Plans.
//
// Evidence rule: every number carries its receipt (the Wix endpoint, order
// counts, fetch time). Amounts come straight from order priceDetails; the only
// estimate (MRR cycle-normalisation) is disclosed in the provenance.
import { writeSignal, setMemory, getSetting, setSetting } from '../brain.js';
import { send } from '../telegram.js';
import {
  wixReady,
  fetchAllPricingOrders,
  orderAmount,
  orderCycleMonths,
  money,
  WIX_SITE_ID,
  WIX_CURRENCY,
} from '../wix.js';

const WORKER = { key: 'ledger', name: 'Fred', emoji: '📊' };

export function ledgerReady() {
  return wixReady();
}

function inRange(iso, start, end) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

/** Compute the metrics. Windows in UTC (disclosed in provenance). */
function analyze(orders, now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const elapsedMs = now.getTime() - monthStart.getTime();
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthSamePoint = new Date(lastMonthStart.getTime() + elapsedMs);

  let active = 0, mrr = 0, newCount = 0, newValue = 0;
  let lastNewCount = 0, lastNewValue = 0, churnCount = 0, churnMrrLost = 0;

  for (const o of orders) {
    const status = String(o.status || '').toUpperCase();
    const amount = orderAmount(o);
    const months = orderCycleMonths(o);
    const monthly = months ? amount / months : 0;

    if (status === 'ACTIVE') {
      active += 1;
      mrr += monthly;
    }
    if (inRange(o.createdDate, monthStart, now)) {
      newCount += 1;
      newValue += amount;
    }
    if (inRange(o.createdDate, lastMonthStart, lastMonthSamePoint)) {
      lastNewCount += 1;
      lastNewValue += amount;
    }
    if (status === 'CANCELED' || status === 'ENDED') {
      if (inRange(o.endDate || o.updatedDate, monthStart, now)) {
        churnCount += 1;
        churnMrrLost += monthly;
      }
    }
  }

  return {
    active,
    mrr: Math.round(mrr),
    newCount,
    newValue: Math.round(newValue),
    lastNewCount,
    lastNewValue: Math.round(lastNewValue),
    churnCount,
    churnMrrLost: Math.round(churnMrrLost),
    salesDelta: Math.round(newValue - lastNewValue),
    ordersScanned: orders.length,
    windowNote: 'month-to-date vs same day-of-month last month, UTC boundaries',
  };
}

function report(m) {
  const trend =
    m.salesDelta > 0 ? `📈 up $${money(m.salesDelta)} vs last month` :
    m.salesDelta < 0 ? `📉 down $${money(-m.salesDelta)} vs last month` :
    `level with last month`;
  return (
    `📊 *Fred — revenue pulse* (${WIX_CURRENCY})\n\n` +
    `*Active subscribers:* ${m.active}  ·  *MRR:* ~$${money(m.mrr)}/mo\n` +
    `*New this month:* ${m.newCount} ($${money(m.newValue)})\n` +
    `*Same point last month:* ${m.lastNewCount} ($${money(m.lastNewValue)})\n` +
    `*Trend:* ${trend}\n` +
    `*Cancellations this month:* ${m.churnCount}` +
    (m.churnMrrLost ? ` (−$${money(m.churnMrrLost)}/mo)` : '') +
    `\n\n_Source: Wix Pricing Plans · ${m.ordersScanned} orders scanned_`
  );
}

/** Run Fred: fetch → analyse → write signal → snapshot → Telegram. */
export async function runLedger() {
  if (!ledgerReady()) {
    console.warn('[fred] WIX_API_KEY not set — skipping.');
    return { skipped: 'no WIX_API_KEY' };
  }
  const now = new Date();
  const orders = await fetchAllPricingOrders();
  const m = analyze(orders, now);

  const source = {
    tool: 'wix:pricing-plans/v2/orders',
    siteId: WIX_SITE_ID,
    ordersScanned: m.ordersScanned,
    activeCount: m.active,
    mrrAud: m.mrr,
    newMTD: { count: m.newCount, value: m.newValue },
    lastMonthMTD: { count: m.lastNewCount, value: m.lastNewValue },
    churnMTD: m.churnCount,
    window: m.windowNote,
    fetchedAt: now.toISOString(),
  };

  const trendWord = m.salesDelta > 0 ? 'up' : m.salesDelta < 0 ? 'down' : 'level';
  await writeSignal({
    worker_key: 'ledger',
    kind: m.churnCount > 0 || m.salesDelta < 0 ? 'alert' : 'finding',
    title: `MRR ~$${money(m.mrr)} ${WIX_CURRENCY} · ${m.active} active · sales ${trendWord} vs last month · ${m.churnCount} churned MTD`,
    body: report(m).replace(/\*/g, ''),
    confidence: 'fact',
    source,
  });

  const dateKey = now.toISOString().slice(0, 10);
  await setMemory({ worker_key: 'ledger', key: `snapshot:${dateKey}`, value: m, source });
  await setMemory({ worker_key: 'ledger', key: 'latest', value: m, source });
  await setSetting('ledger_last_run', now.toISOString());

  await send(report(m), { worker: WORKER }).catch((e) =>
    console.error('[fred] telegram send failed:', e.message)
  );

  console.log(`[fred] pulse: ${m.active} active, MRR ~$${m.mrr}, ${m.churnCount} churned`);
  return m;
}

export async function hoursSinceLastRun() {
  const last = await getSetting('ledger_last_run');
  if (!last) return Infinity;
  return (Date.now() - new Date(last).getTime()) / 3.6e6;
}
