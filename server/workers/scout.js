// Ian — ICP & Sourcing (worker key: scout). Builds deterministic customer
// cohorts from Wix (Nectar 2025+, Honeycomb 2026+, active >3 months). The
// founder/marketing/agency breakdown and demo→conversion are later steps that
// need enrichment (Clay) and Google Calendar respectively.
import { writeSignal, setMemory, getSetting, setSetting } from '../brain.js';
import { send } from '../telegram.js';
import { wixReady, fetchAllTransactions, buildCohorts, money, WIX_SITE_ID } from '../wix.js';

const WORKER = { key: 'scout', name: 'Ian', emoji: '🔭' };

export function scoutReady() {
  return wixReady();
}

function line(m) {
  return `• *${m.name}* — ${m.domain || 'no email'} · ${m.tenureMonths}mo · $${money(m.spend)}`;
}
function block(title, arr) {
  const rows = arr.slice(0, 6).map(line).join('\n') || '• _none_';
  const more = arr.length > 6 ? `\n_…and ${arr.length - 6} more_` : '';
  return `*${title}:* ${arr.length}\n${rows}${more}`;
}
function cohortsText(c) {
  return (
    `🔭 *Ian — customer cohorts* (from Wix)\n\n` +
    `${block('Nectar (2025+)', c.nectar2025)}\n\n` +
    `${block('Honeycomb (2026+)', c.honeycomb2026)}\n\n` +
    `${block('Active >3 months', c.active3mo)}\n\n` +
    `_Next: enrich these into Sales Nav filters — founder / marketing / agency (needs Clay). Demo→conversion since March needs Google Calendar._`
  );
}

export async function runScout({ notify = true } = {}) {
  if (!scoutReady()) {
    if (notify) await send('🔭 Ian needs the Wix key to build your cohorts.', { worker: WORKER }).catch(() => {});
    return { skipped: 'no WIX_API_KEY' };
  }
  const now = new Date();
  const c = buildCohorts(await fetchAllTransactions(), now);
  const source = {
    tool: 'wix:payments/api/merchant/v2/transactions',
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

export async function scoutHasRun() {
  return Boolean(await getSetting('scout_last_run'));
}
