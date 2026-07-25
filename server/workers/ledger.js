// Ledger — Revenue & Churn. Source of truth: Wix Pricing Plans (subscriptions).
//
// Evidence rule: every number written to the brain carries its receipt (the Wix
// endpoint, order counts, and fetch time). Amounts come straight from the order
// priceDetails; nothing is estimated except the MRR cycle-normalisation, which
// is disclosed in the provenance.
import { writeSignal, setMemory, getSetting, setSetting } from '../brain.js';
import { send } from '../telegram.js';

const SITE_ID = process.env.WIX_SITE_ID || 'aa112b96-b980-49fa-8f7f-202343661708'; // Design Bees
const API_KEY = process.env.WIX_API_KEY;
const CURRENCY = 'AUD';

export function ledgerReady() {
  return Boolean(API_KEY);
}

async function wixGet(path) {
  const res = await fetch(`https://www.wixapis.com${path}`, {
    headers: {
      Authorization: API_KEY,
      'wix-site-id': SITE_ID,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Wix ${res.status} ${res.statusText} ${txt.slice(0, 200)}`);
  }
  return res.json();
}

/** Page through all pricing-plan orders (50 per page). */
async function fetchAllOrders(maxPages = 60) {
  const orders = [];
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const data = await wixGet(`/pricing-plans/v2/orders?limit=50&offset=${offset}`);
    const batch = data.orders || [];
    orders.push(...batch);
    const total = data.pagingMetadata?.total ?? orders.length;
    offset += 50;
    if (batch.length === 0 || orders.length >= total) break;
  }
  return orders;
}

// Months contained in one billing cycle, for MRR normalisation.
function cycleMonths(cd) {
  if (!cd || !cd.count || !cd.unit) return null;
  const u = String(cd.unit).toUpperCase();
  if (u === 'DAY') return cd.count / 30.44;
  if (u === 'WEEK') return cd.count / 4.345;
  if (u === 'MONTH') return cd.count;
  if (u === 'YEAR') return cd.count * 12;
  return null;
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function orderAmount(o) {
  const pd = o.priceDetails || {};
  return num(pd.total ?? pd.subtotal ?? pd.planPrice);
}

function orderCycle(o) {
  const pd = o.priceDetails || {};
  return (pd.subscription && pd.subscription.cycleDuration) ||
    (o.pricing && o.pricing.subscription && o.pricing.subscription.cycleDuration) ||
    null;
}

function inRange(iso, start, end) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

function money(n) {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Compute the metrics. All windows in UTC (disclosed in provenance). */
function analyze(orders, now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const elapsedMs = now.getTime() - monthStart.getTime();
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthSamePoint = new Date(lastMonthStart.getTime() + elapsedMs);

  let active = 0;
  let mrr = 0;
  let newCount = 0;
  let newValue = 0;
  let lastNewCount = 0;
  let lastNewValue = 0;
  let churnCount = 0;
  let churnMrrLost = 0;

  for (const o of orders) {
    const status = String(o.status || '').toUpperCase();
    const amount = orderAmount(o);
    const months = cycleMonths(orderCycle(o));
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
      const when = o.endDate || o.updatedDate;
      if (inRange(when, monthStart, now)) {
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
    `📊 *Ledger — revenue pulse* (${CURRENCY})\n\n` +
    `*Active subscribers:* ${m.active}  ·  *MRR:* ~$${money(m.mrr)}/mo\n` +
    `*New this month:* ${m.newCount} ($${money(m.newValue)})\n` +
    `*Same point last month:* ${m.lastNewCount} ($${money(m.lastNewValue)})\n` +
    `*Trend:* ${trend}\n` +
    `*Cancellations this month:* ${m.churnCount}` +
    (m.churnMrrLost ? ` (−$${money(m.churnMrrLost)}/mo)` : '') +
    `\n\n_Source: Wix Pricing Plans · ${m.ordersScanned} orders scanned_`
  );
}

/** Run Ledger: fetch → analyse → write signal → snapshot → Telegram. */
export async function runLedger() {
  if (!ledgerReady()) {
    console.warn('[ledger] WIX_API_KEY not set — skipping.');
    return { skipped: 'no WIX_API_KEY' };
  }
  const now = new Date();
  const orders = await fetchAllOrders();
  const m = analyze(orders, now);

  const source = {
    tool: 'wix:pricing-plans/v2/orders',
    siteId: SITE_ID,
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
    title: `MRR ~$${money(m.mrr)} ${CURRENCY} · ${m.active} active · sales ${trendWord} vs last month · ${m.churnCount} churned MTD`,
    body: report(m).replace(/\*/g, ''),
    confidence: 'fact',
    source,
  });

  const dateKey = now.toISOString().slice(0, 10);
  await setMemory({
    worker_key: 'ledger',
    key: `snapshot:${dateKey}`,
    value: m,
    source,
  });
  await setMemory({ worker_key: 'ledger', key: 'latest', value: m, source });
  await setSetting('ledger_last_run', now.toISOString());

  await send(report(m), { worker: { key: 'ledger', name: 'Ledger', emoji: '📊' } }).catch((e) =>
    console.error('[ledger] telegram send failed:', e.message)
  );

  console.log(`[ledger] pulse: ${m.active} active, MRR ~$${m.mrr}, ${m.churnCount} churned`);
  return m;
}

/** How long since the last run, in hours (Infinity if never). */
export async function hoursSinceLastRun() {
  const last = await getSetting('ledger_last_run');
  if (!last) return Infinity;
  return (Date.now() - new Date(last).getTime()) / 3.6e6;
}
