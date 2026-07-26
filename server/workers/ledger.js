// Fred — Revenue & Finance (worker key: ledger). Source of truth: Wix Payments
// transactions. Serves the revenue pulse from cached memory (refreshed on a
// schedule / on demand) and runs a background reconciliation that flags
// prepayments and one-off payments that aren't a standard plan price.
import { writeSignal, setMemory, getMemory, getSetting, setSetting } from '../brain.js';
import { send } from '../telegram.js';
import {
  wixReady,
  getRevenue,
  getReconcile,
  money,
  WIX_SITE_ID,
  WIX_CURRENCY,
} from '../wix.js';

const WORKER = { key: 'ledger', name: 'Fred', emoji: '📊' };
const CACHE_MAX_AGE_H = 6;

export function ledgerReady() {
  return wixReady();
}

// ---- pulse formatting ------------------------------------------------------
function pulseText(s, asOf) {
  const trend =
    s.delta > 0 ? `📈 up $${money(s.delta)} vs last month` :
    s.delta < 0 ? `📉 down $${money(-s.delta)} vs last month` :
    `level with last month`;
  const plans = s.planRows.length
    ? s.planRows.slice(0, 8).map((p) => `• *${p.plan}* — ${p.count} · $${money(p.revenue)}`).join('\n')
    : '• _no payments yet this month_';
  const stamp = asOf ? `\n_as of ${asOf} · type_ \`refresh\` _to update_` : '';
  return (
    `📊 *Fred — revenue pulse* (${WIX_CURRENCY})\n\n` +
    `*This month:* $${money(s.monthRevenue)}  (${s.monthCount} payments)\n` +
    `*Same point last month:* $${money(s.lastMonthRevenue)}  (${s.lastMonthCount})\n` +
    `*Trend:* ${trend}\n` +
    `*${s.year} YTD:* $${money(s.ytd)}  (${s.ytdCount} payments)\n` +
    `*Active clients (90d):* ${s.activeClients90}\n\n` +
    `*Top plans this month:*\n${plans}\n\n` +
    `_Source: Wix Payments · type_ \`clients\` _for who paid what_${stamp}`
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

function reconcileText(r) {
  const pre = r.prepayments.slice(0, 12).map((p) => {
    const disc = p.discountPct != null ? ` (~${p.discountPct}% off)` : '';
    const tag = p.basis === 'named' ? '' : ' _[inferred]_';
    return `• *${p.client}* — $${money(p.amount)} · ~${p.months}mo ${p.plan}${disc}${tag}`;
  });
  const off = r.oneOffs.slice(0, 6).map((o) => `• *${o.client}* — $${money(o.amount)} · ${o.label}`);
  return (
    `📊 *Fred — payment reconciliation* (${WIX_CURRENCY}, since ${r.from})\n\n` +
    `Standard plan payments: *${r.standard}* of ${r.scanned}\n\n` +
    `*Prepayments / multi-month* (${r.prepayments.length}):\n${pre.join('\n') || '• _none found_'}\n\n` +
    `*One-off / project payments* (${r.oneOffs.length}):\n${off.join('\n') || '• _none_'}\n\n` +
    `_Inferred items are best-guess from the amount — reply to confirm or correct._`
  );
}

// ---- data ------------------------------------------------------------------
async function computeAndStore() {
  const now = new Date();
  const { data: s, live, asOf } = await getRevenue(now);
  const source = {
    tool: live ? 'wix:payments/v2/transactions' : `snapshot@${asOf}`,
    live,
    siteId: WIX_SITE_ID,
    transactionsScanned: s.fetched,
    monthRevenueAud: s.monthRevenue,
    ytdAud: s.ytd,
    activeClients90: s.activeClients90,
    fetchedAt: now.toISOString(),
  };
  const trendWord = s.delta > 0 ? 'up' : s.delta < 0 ? 'down' : 'level';
  await writeSignal({
    worker_key: 'ledger',
    kind: s.delta < 0 ? 'alert' : 'finding',
    title: `Revenue $${money(s.monthRevenue)} ${WIX_CURRENCY} MTD · YTD $${money(s.ytd)} · ${trendWord} vs last month`,
    body: pulseText(s).replace(/\*/g, ''),
    confidence: 'fact',
    source,
  });
  await setMemory({ worker_key: 'ledger', key: 'latest', value: s, source });
  await setSetting('ledger_last_run', now.toISOString());
  // Label snapshot-sourced figures so a cached number never reads as live.
  if (!live) s._asOf = `snapshot ${String(asOf).slice(0, 10)} · Wix key can't read Payments`;
  return s;
}

/** Refresh + send the pulse (used by `refresh` and the daily schedule). */
export async function runLedger() {
  if (!ledgerReady()) { console.warn('[fred] WIX_API_KEY not set.'); return { skipped: 'no WIX_API_KEY' }; }
  const s = await computeAndStore();
  await send(pulseText(s, s._asOf), { worker: WORKER }).catch((e) => console.error('[fred] send failed:', e.message));
  console.log(`[fred] pulse refreshed: $${s.monthRevenue} MTD, YTD $${s.ytd}`);
  return s;
}

/** Send the pulse from cache when fresh, else refresh — used by `fred`. */
export async function sendPulse() {
  if (!ledgerReady()) { await send('📊 Fred needs the Wix key.', { worker: WORKER }).catch(() => {}); return; }
  const cached = await getMemory('ledger', 'latest');
  if (cached) {
    const ageH = (Date.now() - new Date(cached.updated_at).getTime()) / 3.6e6;
    if (ageH <= CACHE_MAX_AGE_H) {
      const asOf = ageH < 1 ? `${Math.round(ageH * 60)} min ago` : `${ageH.toFixed(1)}h ago`;
      await send(pulseText(cached.value, asOf), { worker: WORKER }).catch(() => {});
      return cached.value;
    }
  }
  return runLedger();
}

export async function runLedgerClients() {
  if (!ledgerReady()) return { skipped: 'no WIX_API_KEY' };
  const { data: s } = await getRevenue(new Date());
  await send(clientsText(s), { worker: WORKER }).catch((e) => console.error('[fred] send failed:', e.message));
  return s;
}

/** Background reconciliation — flag prepayments and one-offs. */
export async function runLedgerReconcile({ notify = true } = {}) {
  if (!ledgerReady()) return { skipped: 'no WIX_API_KEY' };
  const now = new Date();
  const { data: r, live, asOf } = await getReconcile();
  const source = {
    tool: live ? 'wix:payments/v2/transactions' : `snapshot@${asOf}`,
    live,
    siteId: WIX_SITE_ID,
    scanned: r.scanned,
    standard: r.standard,
    prepayments: r.prepayments.length,
    oneOffs: r.oneOffs.length,
    fetchedAt: now.toISOString(),
  };
  await setMemory({ worker_key: 'ledger', key: 'reconcile', value: r, source });
  await writeSignal({
    worker_key: 'ledger',
    kind: 'finding',
    title: `Reconcile: ${r.prepayments.length} prepayments, ${r.oneOffs.length} one-offs, ${r.standard} standard`,
    body: reconcileText(r).replace(/\*/g, ''),
    confidence: 'hypothesis',
    source,
  });
  await setSetting('ledger_reconcile_last_run', now.toISOString());
  if (notify) await send(reconcileText(r), { worker: WORKER }).catch((e) => console.error('[fred] send failed:', e.message));
  console.log(`[fred] reconcile: ${r.prepayments.length} prepay, ${r.oneOffs.length} one-off, ${r.standard} standard`);
  return r;
}

export async function hoursSinceLastRun() {
  const last = await getSetting('ledger_last_run');
  return last ? (Date.now() - new Date(last).getTime()) / 3.6e6 : Infinity;
}
export async function hoursSinceReconcile() {
  const last = await getSetting('ledger_reconcile_last_run');
  return last ? (Date.now() - new Date(last).getTime()) / 3.6e6 : Infinity;
}
