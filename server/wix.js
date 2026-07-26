// Shared Wix client for the hive. Source of truth for money & subscribers.
// Ian (ICP) and Fred (Finance) both read subscription orders through here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const SITE_ID = process.env.WIX_SITE_ID || 'aa112b96-b980-49fa-8f7f-202343661708'; // Design Bees
const API_KEY = process.env.WIX_API_KEY;

export const WIX_SITE_ID = SITE_ID;
export const WIX_CURRENCY = 'AUD';

export function wixReady() {
  return Boolean(API_KEY);
}

export async function wixGet(path) {
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

/** Page through all Pricing Plans orders (50 per page). */
export async function fetchAllPricingOrders(maxPages = 60) {
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

// --- Order field helpers (shared) ------------------------------------------
export function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Real order shape: price is under pricing.prices[].price.total (there is no
// top-level priceDetails). Use the last price entry = the ongoing rate.
export function orderAmount(o) {
  const prices = o.pricing && o.pricing.prices;
  if (Array.isArray(prices) && prices.length) {
    const p = prices[prices.length - 1].price || {};
    return num(p.total ?? p.subtotal);
  }
  return num(o.planPrice);
}

// Months per billing cycle, or null for a one-time / non-recurring order.
export function orderCycleMonths(o) {
  const cd = o.pricing && o.pricing.subscription && o.pricing.subscription.cycleDuration;
  if (!cd || !cd.count || !cd.unit) return null;
  const u = String(cd.unit).toUpperCase();
  if (u === 'DAY') return cd.count / 30.44;
  if (u === 'WEEK') return cd.count / 4.345;
  if (u === 'MONTH') return cd.count;
  if (u === 'YEAR') return cd.count * 12;
  return null;
}

export function orderMonthly(o) {
  const m = orderCycleMonths(o);
  return m ? orderAmount(o) / m : 0;
}

export function money(n) {
  return Number(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// --- Wix Payments transactions (the real revenue source) -------------------
// Each paid invoice / plan / pay-link becomes a transaction with the plan name,
// amount, and customer. This is where Design Bees' actual money lives.
export async function fetchAllTransactions(maxPages = 40) {
  const all = [];
  let offset = 0;
  for (let p = 0; p < maxPages; p++) {
    // Documented public Payments endpoint. The internal `/payments/api/merchant/v2/`
    // path returns 403 permission_denied for account API keys; the public
    // `/payments/v2/transactions` surface honors the key's granted permission and
    // returns the identical transaction shape.
    const data = await wixGet(`/payments/v2/transactions?limit=100&offset=${offset}`);
    const batch = data.transactions || [];
    all.push(...batch);
    const total = data.pagination && data.pagination.total;
    offset += 100;
    if (!batch.length || (total != null && all.length >= total)) break;
  }
  return all;
}

// "(Upgrade)" / "Upgrade" is just how Design Bees moves someone between plans —
// it is not a distinct plan, so strip it and merge.
export function normalizePlan(name) {
  if (!name) return 'Unknown';
  return (
    String(name)
      .replace(/\(\s*upgrade\s*\)/gi, '')
      .replace(/\bupgrade\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Unknown'
  );
}

function txAmount(t) {
  return num(t.amount && t.amount.amount);
}
function txPlan(t) {
  const items = t.order && t.order.description && t.order.description.items;
  return normalizePlan(items && items[0] && items[0].name);
}
function txCustomer(t) {
  const b = t.order && t.order.description && t.order.description.billingAddress;
  if (!b) return { name: 'Unknown', email: null };
  const name = `${b.firstName || ''} ${b.lastName || ''}`.trim() || b.company || b.email || 'Unknown';
  return { name, email: b.email || null };
}

// Internal / staff — excluded from client and revenue analysis. The email
// domain is the robust catch-all; names cover anyone who used a personal email.
const EXCLUDE_EMAIL_DOMAINS = ['designbees.com.au'];
const EXCLUDE_NAMES = new Set([
  'miguel gutierrez',
  'rae mckenzie', 'rae mackenzie',
  'nathan azouz',
  'liz lord', 'elizabeth lord',
  'joyce mary', 'mary joyce',
  'a k', 'ak',
]);
function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}
export function isExcludedCustomer(cust) {
  if (!cust) return false;
  const email = (cust.email || '').toLowerCase();
  if (EXCLUDE_EMAIL_DOMAINS.some((d) => email.endsWith('@' + d))) return true;
  const n = normName(cust.name);
  if (EXCLUDE_NAMES.has(n)) return true;
  const parts = n.split(' ');
  if (parts.length === 2 && EXCLUDE_NAMES.has(`${parts[1]} ${parts[0]}`)) return true; // reversed order
  return false;
}

// Revenue picture from transactions. Gross = APPROVED sales (fully-refunded
// sales carry a REFUND status and are already excluded). Internal contacts are
// filtered out. Used by Fred & Ian.
export function summarizeRevenue(txns, now = new Date()) {
  const DAY = 86400000;
  const mStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const elapsed = now.getTime() - mStart.getTime();
  const lastMStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMPoint = new Date(lastMStart.getTime() + elapsed);
  const since90 = new Date(now.getTime() - 90 * DAY);

  const statusCounts = {};
  let mSum = 0, mCount = 0, lmSum = 0, lmCount = 0, rev90 = 0, ytd = 0, ytdCount = 0;
  const plans = {}, clients = {};

  for (const t of txns) {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    if (String(t.type).toUpperCase() !== 'SALE') continue;
    if (String(t.status).toUpperCase() !== 'APPROVED') continue;

    const cust = txCustomer(t);
    if (isExcludedCustomer(cust)) continue; // internal / staff

    const amount = txAmount(t);
    const d = t.createdAt ? new Date(t.createdAt) : null;
    const plan = txPlan(t);

    if (d && d.getUTCFullYear() === now.getUTCFullYear()) { ytd += amount; ytdCount += 1; }
    if (d && d >= mStart && d <= now) {
      mSum += amount; mCount += 1;
      plans[plan] = plans[plan] || { count: 0, revenue: 0 };
      plans[plan].count += 1; plans[plan].revenue += amount;
    }
    if (d && d >= lastMStart && d < lastMPoint) { lmSum += amount; lmCount += 1; }

    if (d && d >= since90) {
      rev90 += amount;
      const key = cust.email || cust.name;
      clients[key] = clients[key] || { name: cust.name, email: cust.email, total: 0, payments: 0, plans: new Set(), last: null };
      clients[key].total += amount;
      clients[key].payments += 1;
      clients[key].plans.add(plan);
      if (!clients[key].last || d > new Date(clients[key].last)) clients[key].last = t.createdAt;
    }
  }

  const planRows = Object.entries(plans)
    .map(([plan, v]) => ({ plan, count: v.count, revenue: Math.round(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);
  const named = Object.values(clients).filter((c) => c.name && c.name !== 'Unknown');
  const unattributed90 = Math.round(
    Object.values(clients).filter((c) => !c.name || c.name === 'Unknown').reduce((a, c) => a + c.total, 0)
  );
  const clientRows = named
    .map((c) => ({ name: c.name, email: c.email, total: Math.round(c.total), payments: c.payments, plans: [...c.plans], last: c.last }))
    .sort((a, b) => b.total - a.total);

  return {
    fetched: txns.length,
    statusCounts,
    monthRevenue: Math.round(mSum),
    monthCount: mCount,
    lastMonthRevenue: Math.round(lmSum),
    lastMonthCount: lmCount,
    delta: Math.round(mSum - lmSum),
    revenue90: Math.round(rev90),
    ytd: Math.round(ytd),
    ytdCount,
    year: now.getUTCFullYear(),
    planRows,
    clientRows,
    activeClients90: clientRows.length,
    unattributed90,
  };
}

// One shared, correct summary of the order book. DRAFT orders (abandoned
// checkouts) are ignored entirely. Recurring MRR and one-time revenue are kept
// separate. Used by both Ian and Fred so their numbers always agree.
export function summarizeOrders(orders, now = new Date()) {
  const DAY = 86400000;
  const since90 = new Date(now.getTime() - 90 * DAY);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const elapsed = now.getTime() - monthStart.getTime();
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthPoint = new Date(lastMonthStart.getTime() + elapsed);

  const statusCounts = {};
  const plans = {};
  let mrr = 0, recurringCount = 0, oneTimeCount = 0, oneTimeValue = 0, activeFree = 0;
  let newCount = 0, newValue = 0, lastNewCount = 0, lastNewValue = 0, new90 = 0, churn90 = 0;

  for (const o of orders) {
    const status = String(o.status || '').toUpperCase();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (status === 'DRAFT') continue; // abandoned checkout — not a real order

    const amount = orderAmount(o);
    const months = orderCycleMonths(o);
    const monthly = months ? amount / months : 0;

    if (status === 'ACTIVE') {
      if (amount <= 0) {
        activeFree += 1;
      } else {
        const plan = o.planName || 'Unnamed plan';
        plans[plan] = plans[plan] || { count: 0, monthly: 0, oneTime: 0, recurring: Boolean(months) };
        plans[plan].count += 1;
        if (months) {
          plans[plan].monthly += monthly;
          mrr += monthly;
          recurringCount += 1;
        } else {
          plans[plan].oneTime += amount;
          oneTimeCount += 1;
          oneTimeValue += amount;
        }
      }
    }

    const created = o.createdDate ? new Date(o.createdDate) : null;
    if (created && amount > 0) {
      if (created >= monthStart) { newCount += 1; newValue += amount; }
      if (created >= lastMonthStart && created < lastMonthPoint) { lastNewCount += 1; lastNewValue += amount; }
      if (created >= since90) new90 += 1;
    }
    if ((status === 'CANCELED' || status === 'ENDED') && o.updatedDate && new Date(o.updatedDate) >= since90) {
      churn90 += 1;
    }
  }

  const planRows = Object.entries(plans)
    .map(([plan, v]) => ({
      plan,
      count: v.count,
      monthlyAud: Math.round(v.monthly),
      oneTimeAud: Math.round(v.oneTime),
      recurring: v.recurring,
    }))
    .sort((a, b) => b.monthlyAud + b.oneTimeAud - (a.monthlyAud + a.oneTimeAud));

  return {
    ordersScanned: orders.length,
    statusCounts,
    activePaying: recurringCount + oneTimeCount,
    activeFree,
    recurringCount,
    mrr: Math.round(mrr),
    oneTimeCount,
    oneTimeValue: Math.round(oneTimeValue),
    planRows,
    new90,
    churn90,
    newMTD: { count: newCount, value: Math.round(newValue) },
    lastMonthMTD: { count: lastNewCount, value: Math.round(lastNewValue) },
    salesDelta: Math.round(newValue - lastNewValue),
  };
}

// --- Reconciliation: standard price vs prepayments/discounts ----------------
// Base monthly prices per plan (some have changed over time). Used to classify
// every payment as: a standard month, a multi-month prepayment (named or
// inferred), or a one-off/project payment.
// Current standard monthly prices (AJ): anything else in-window is non-standard.
const STANDARD_PRICES = [545, 995, 1645, 2645];
const PRICE_PLAN = { 545: 'Worker Bee', 995: 'Buzz Basics', 1645: 'Honeycomb Plus', 2645: 'Nectar' };
const planForPrice = (p) => PRICE_PLAN[p] || `$${p}/mo plan`;
// Known single-month prices incl. recent historical — a match here is one month
// (possibly at an old rate), NOT a prepayment; keeps recurring old-price
// payments from being mis-read as multi-month prepayments.
const KNOWN_MONTHLY = [499, 545, 745, 845, 945, 995, 1195, 1495, 1645, 2495, 2645];
// AJ only cares about prepayments from April 2026 onward.
const RECONCILE_FROM = new Date('2026-04-01T00:00:00Z');

export function reconcilePayments(txns, { from = RECONCILE_FROM } = {}) {
  const prepayments = [], oneOffs = [];
  let standard = 0, scanned = 0;
  const isStandard = (a) => STANDARD_PRICES.some((p) => Math.abs(a - p) <= 1.5);

  for (const t of txns) {
    if (String(t.type).toUpperCase() !== 'SALE' || String(t.status).toUpperCase() !== 'APPROVED') continue;
    const cust = txCustomer(t);
    if (isExcludedCustomer(cust)) continue;
    const d = t.createdAt ? new Date(t.createdAt) : null;
    if (!d || d < from) continue; // April 2026 → today only
    const amount = txAmount(t);
    if (amount < 100) continue; // disregard anything under $100 (AJ)

    scanned += 1;
    const items = t.order && t.order.description && t.order.description.items;
    const rawName = (items && items[0] && items[0].name) || '';
    const name = normalizePlan(rawName);

    // A standard plan month — not a prepayment.
    if (isStandard(amount)) { standard += 1; continue; }

    // Prepayment stated in the plan name (e.g. "Prepaid Honeycomb 3 months - 10% off")
    const mMonths = rawName.match(/(\d+)\s*months?/i);
    if (/prepaid|prepay/i.test(rawName) && mMonths) {
      const mDisc = rawName.match(/(\d+)\s*%\s*off/i);
      prepayments.push({ client: cust.name, email: cust.email, plan: name, amount, months: +mMonths[1], discountPct: mDisc ? +mDisc[1] : null, basis: 'named', confidence: 'fact', date: t.createdAt });
      continue;
    }

    // A single month at a known (possibly old) price — not a prepayment.
    if (KNOWN_MONTHLY.some((p) => Math.abs(amount - p) <= 1.5)) {
      oneOffs.push({ client: cust.name, email: cust.email, label: name || rawName || 'single month', amount, date: t.createdAt });
      continue;
    }

    // Infer a multi-month prepayment: amount ≈ standard price × months × (1 − discount)
    let best = null;
    for (const price of STANDARD_PRICES) {
      for (let n = 2; n <= 12; n++) {
        const disc = 1 - amount / (price * n);
        if (disc < -0.02 || disc > 0.16) continue;
        const roundErr = Math.abs(disc - Math.round(disc / 0.05) * 0.05);
        if (!best || roundErr < best.roundErr || (Math.abs(roundErr - best.roundErr) < 1e-9 && n < best.months)) {
          best = { price, months: n, discountPct: Math.round(disc * 100), roundErr };
        }
      }
    }
    if (best && best.roundErr <= 0.02) {
      prepayments.push({ client: cust.name, email: cust.email, plan: planForPrice(best.price), amount, months: best.months, discountPct: best.discountPct, basis: 'inferred', confidence: 'hypothesis', date: t.createdAt });
    } else {
      oneOffs.push({ client: cust.name, email: cust.email, label: name || rawName || 'payment', amount, date: t.createdAt });
    }
  }
  prepayments.sort((a, b) => b.amount - a.amount);
  oneOffs.sort((a, b) => b.amount - a.amount);
  return { scanned, standard, prepayments, oneOffs, from: from.toISOString().slice(0, 10) };
}

// --- Snapshot fallback ------------------------------------------------------
// Wix's Cashier transactions API is an admin-only endpoint: an account API key
// cannot read it at any permission level (the site-owner session can). Until a
// Wix OAuth app is wired up, the hive falls back to a snapshot of the real
// figures committed alongside the code, so Fred and Ian still answer with true
// numbers instead of failing. Every fallback is labelled with its as-of date so
// a cached figure is never passed off as live.
const __dir = path.dirname(fileURLToPath(import.meta.url));
let _snapshot;
export function loadSnapshot() {
  if (_snapshot !== undefined) return _snapshot;
  try {
    _snapshot = JSON.parse(fs.readFileSync(path.join(__dir, 'data', 'snapshot.json'), 'utf8'));
  } catch (err) {
    console.error('[wix] no snapshot available:', err.message);
    _snapshot = null;
  }
  return _snapshot;
}

// Try live Wix first; on failure fall back to the snapshot. Returns
// { data, live, asOf, error } so callers can label the reply honestly.
async function liveOrSnapshot(compute, key) {
  try {
    return { data: await compute(), live: true };
  } catch (err) {
    const snap = loadSnapshot();
    if (snap && snap[key]) {
      console.warn(`[wix] live read failed (${err.message.slice(0, 80)}) — serving ${key} snapshot`);
      return { data: snap[key], live: false, asOf: snap.generatedAt, error: err.message };
    }
    throw err;
  }
}

export function getRevenue(now = new Date()) {
  return liveOrSnapshot(async () => summarizeRevenue(await fetchAllTransactions(), now), 'revenue');
}
export function getReconcile() {
  return liveOrSnapshot(async () => reconcilePayments(await fetchAllTransactions()), 'reconcile');
}
export function getCohorts(now = new Date()) {
  return liveOrSnapshot(async () => buildCohorts(await fetchAllTransactions(), now), 'cohorts');
}
// Demo→conversion comes from a Google Calendar scan, not from Wix, so there is
// no live path here — it is refreshed by re-running the scan and updating the
// snapshot. Returns null if the snapshot predates the demo data.
export function getDemos() {
  const snap = loadSnapshot();
  return (snap && snap.demos) || null;
}

// --- Customer cohorts (for Ian) --------------------------------------------
// Deterministic customer segments from Wix payments. The founder/marketing/
// agency breakdown is a later step (needs enrichment); this gives the lists.
export function buildCohorts(txns, now = new Date()) {
  const DAY = 86400000;
  const Y2025 = new Date('2025-01-01T00:00:00Z');
  const Y2026 = new Date('2026-01-01T00:00:00Z');
  const clients = {};

  for (const t of txns) {
    if (String(t.type).toUpperCase() !== 'SALE' || String(t.status).toUpperCase() !== 'APPROVED') continue;
    const cust = txCustomer(t);
    if (isExcludedCustomer(cust)) continue;
    const amount = txAmount(t);
    if (amount < 100) continue;
    const d = t.createdAt ? new Date(t.createdAt) : null;
    if (!d) continue;

    const items = t.order && t.order.description && t.order.description.items;
    const plan = normalizePlan((items && items[0] && items[0].name) || '');
    const key = (cust.email || cust.name || 'unknown').toLowerCase();
    const c = clients[key] || (clients[key] = {
      name: cust.name, email: cust.email,
      domain: cust.email ? cust.email.split('@')[1] : null,
      plans: new Set(), first: d, last: d, spend: 0, nectar2025: false, honey2026: false,
    });
    c.plans.add(plan);
    c.spend += amount;
    if (d < c.first) c.first = d;
    if (d > c.last) c.last = d;
    if (/nectar/i.test(plan) && d >= Y2025) c.nectar2025 = true;
    if (/honeycomb/i.test(plan) && d >= Y2026) c.honey2026 = true;
  }

  const member = (c) => ({
    name: c.name,
    email: c.email,
    domain: c.domain,
    plans: [...c.plans].filter(Boolean),
    tenureMonths: +((now.getTime() - c.first.getTime()) / (30.44 * DAY)).toFixed(1),
    spend: Math.round(c.spend),
    lastActive: c.last.toISOString().slice(0, 10),
  });
  const list = Object.values(clients);
  const bySpend = (a, b) => b.spend - a.spend;

  return {
    totalClients: list.length,
    nectar2025: list.filter((c) => c.nectar2025).map(member).sort(bySpend),
    honeycomb2026: list.filter((c) => c.honey2026).map(member).sort(bySpend),
    active3mo: list
      .filter((c) => now.getTime() - c.first.getTime() > 90 * DAY && now.getTime() - c.last.getTime() <= 45 * DAY)
      .map(member).sort(bySpend),
    builtAt: now.toISOString(),
  };
}
