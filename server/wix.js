// Shared Wix client for the hive. Source of truth for money & subscribers.
// Ian (ICP) and Fred (Finance) both read subscription orders through here.
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
