// Ian — ICP & Sourcing (worker key: scout). Source of truth: Wix Pricing Plans
// (subscribers) — and, once a demo source is connected, demo→subscriber
// conversion. Ian never invents an ICP: it reads the evidence, drafts, and asks.
import { writeSignal, setMemory, askQuestion, getSetting, setSetting } from '../brain.js';
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

const WORKER = { key: 'scout', name: 'Ian', emoji: '🔭' };
const DAY = 86400000;

export function scoutReady() {
  return wixReady();
}

/** Summarise the subscriber base into ICP raw material. */
function analyze(orders, now = new Date()) {
  const since90 = new Date(now.getTime() - 90 * DAY);
  const plans = {}; // planName -> { active, monthlyValue }
  let active = 0;
  let newer90 = 0;
  let churn90 = 0;
  const recent = [];

  for (const o of orders) {
    const status = String(o.status || '').toUpperCase();
    const plan = o.planName || 'Unnamed plan';
    const months = orderCycleMonths(o);
    const monthly = months ? orderAmount(o) / months : 0;

    if (status === 'ACTIVE') {
      active += 1;
      plans[plan] = plans[plan] || { active: 0, monthlyValue: 0 };
      plans[plan].active += 1;
      plans[plan].monthlyValue += monthly;
    }
    if (o.createdDate && new Date(o.createdDate) >= since90) {
      newer90 += 1;
      recent.push({ plan, date: o.createdDate, status });
    }
    if ((status === 'CANCELED' || status === 'ENDED') &&
        (o.endDate || o.updatedDate) &&
        new Date(o.endDate || o.updatedDate) >= since90) {
      churn90 += 1;
    }
  }

  const planRows = Object.entries(plans)
    .map(([name, v]) => ({ name, active: v.active, monthlyValue: Math.round(v.monthlyValue) }))
    .sort((a, b) => b.active - a.active);

  return { active, newer90, churn90, planRows, ordersScanned: orders.length };
}

function summaryText(m) {
  const planLines = m.planRows.length
    ? m.planRows
        .slice(0, 6)
        .map((p) => `• *${p.name}* — ${p.active} active (~$${money(p.monthlyValue)}/mo)`)
        .join('\n')
    : '• _no active plans found_';
  return (
    `🔭 *Ian — ICP onboarding* (from Wix)\n\n` +
    `Here's what your subscribers actually look like right now:\n` +
    `*Active subscribers:* ${m.active}\n` +
    `*New (last 90 days):* ${m.newer90}  ·  *Churned:* ${m.churn90}\n\n` +
    `*By plan:*\n${planLines}\n\n` +
    `To shape our ICP from evidence, one question to start:\n` +
    `*Which client type — industry, business size, or category — are your best-fit, highest-value clients?* ` +
    `I'll match your answer against who's actually subscribing.\n\n` +
    `_Next: once we connect your demo calendar, I'll also track which demo-bookers became subscribers — your real conversion rate._`
  );
}

const PRIMARY_QUESTION =
  'Which client type — industry, business size, or category — are your best-fit, highest-value clients? (Ian will match this against who is actually subscribing.)';

/** Run Ian: read subscribers → draft ICP evidence → ask AJ the first question. */
export async function runScout() {
  if (!scoutReady()) {
    await send('🔭 Ian needs the Wix key to see your subscribers — add WIX_API_KEY and I can start.', {
      worker: WORKER,
    }).catch(() => {});
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
    newLast90: m.newer90,
    churnLast90: m.churn90,
    currency: WIX_CURRENCY,
    fetchedAt: now.toISOString(),
  };

  // Draft ICP observations are a hypothesis until AJ confirms — labelled as such.
  await writeSignal({
    worker_key: 'scout',
    kind: 'finding',
    title: `ICP draft: ${m.active} active subs across ${m.planRows.length} plans; top plan "${m.planRows[0]?.name ?? 'n/a'}"`,
    body: summaryText(m).replace(/\*/g, ''),
    confidence: 'hypothesis',
    source,
  });

  await setMemory({
    worker_key: 'scout',
    key: 'icp:draft',
    value: { planRows: m.planRows, active: m.active, newer90: m.newer90, churn90: m.churn90 },
    source,
  });

  // Record the open question (so it shows on the Hive Wall), then send once.
  await askQuestion({ worker_key: 'scout', question: PRIMARY_QUESTION }).catch(() => {});
  await send(summaryText(m), { worker: WORKER }).catch((e) =>
    console.error('[ian] telegram send failed:', e.message)
  );

  await setSetting('scout_last_run', now.toISOString());
  console.log(`[ian] onboarding sent: ${m.active} active, ${m.planRows.length} plans`);
  return m;
}

export async function scoutHasRun() {
  return Boolean(await getSetting('scout_last_run'));
}
