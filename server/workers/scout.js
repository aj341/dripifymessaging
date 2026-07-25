// Ian — ICP & Sourcing (worker key: scout). Source of truth: Wix Pricing Plans
// (subscribers). Ian never invents an ICP: it reads the evidence, drafts, asks.
import { writeSignal, setMemory, askQuestion, hasOpenQuestion, getSetting, setSetting } from '../brain.js';
import { send } from '../telegram.js';
import {
  wixReady,
  fetchAllPricingOrders,
  summarizeOrders,
  money,
  WIX_SITE_ID,
} from '../wix.js';

const WORKER = { key: 'scout', name: 'Ian', emoji: '🔭' };

export function scoutReady() {
  return wixReady();
}

function planLine(p) {
  if (p.monthlyAud > 0) return `• *${p.plan}* — ${p.count} · $${money(p.monthlyAud)}/mo`;
  if (p.oneTimeAud > 0) return `• *${p.plan}* — ${p.count} · $${money(p.oneTimeAud)} one-time`;
  return `• *${p.plan}* — ${p.count}`;
}

function summaryText(s) {
  const plans = s.planRows.length
    ? s.planRows.slice(0, 8).map(planLine).join('\n')
    : '• _no active paying plans found_';
  const free = s.activeFree ? `  _(+${s.activeFree} free/test)_` : '';
  return (
    `🔭 *Ian — ICP onboarding* (from Wix)\n\n` +
    `Your paying client base right now (abandoned drafts excluded):\n` +
    `*Active paying clients:* ${s.activePaying}${free}  ` +
    `(${s.recurringCount} recurring, ${s.oneTimeCount} one-time/prepaid)\n` +
    `*Recurring MRR:* ~$${money(s.mrr)}/mo AUD\n` +
    `*New (90d):* ${s.new90}  ·  *Churned (90d):* ${s.churn90}\n\n` +
    `*By plan:*\n${plans}\n\n` +
    `To shape our ICP from evidence, one question to start:\n` +
    `*Which client type — industry, business size, or category — are your best-fit, highest-value clients?* ` +
    `I'll match your answer against who's actually subscribing.\n\n` +
    `_Next: once we connect your demo calendar, I'll also track which demo-bookers became subscribers._`
  );
}

const PRIMARY_QUESTION =
  'Which client type — industry, business size, or category — are your best-fit, highest-value clients? (Ian will match this against who is actually subscribing.)';

export async function runScout() {
  if (!scoutReady()) {
    await send('🔭 Ian needs the Wix key to see your subscribers — add WIX_API_KEY and I can start.', {
      worker: WORKER,
    }).catch(() => {});
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
    new90: s.new90,
    churn90: s.churn90,
    fetchedAt: now.toISOString(),
  };

  await writeSignal({
    worker_key: 'scout',
    kind: 'finding',
    title: `ICP draft: ${s.activePaying} paying clients · MRR ~$${money(s.mrr)} · top plan "${s.planRows[0]?.plan ?? 'n/a'}"`,
    body: summaryText(s).replace(/\*/g, ''),
    confidence: 'hypothesis',
    source,
  });

  await setMemory({
    worker_key: 'scout',
    key: 'icp:draft',
    value: { planRows: s.planRows, activePaying: s.activePaying, mrr: s.mrr, new90: s.new90, churn90: s.churn90 },
    source,
  });

  if (!(await hasOpenQuestion('scout'))) {
    await askQuestion({ worker_key: 'scout', question: PRIMARY_QUESTION }).catch(() => {});
  }
  await send(summaryText(s), { worker: WORKER }).catch((e) =>
    console.error('[ian] telegram send failed:', e.message)
  );

  await setSetting('scout_last_run', now.toISOString());
  console.log(`[ian] onboarding sent: ${s.activePaying} paying, MRR ~$${s.mrr}, ${s.planRows.length} plans`);
  return s;
}

export async function scoutHasRun() {
  return Boolean(await getSetting('scout_last_run'));
}
