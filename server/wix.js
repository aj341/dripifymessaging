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

export function orderAmount(o) {
  const pd = o.priceDetails || {};
  return num(pd.total ?? pd.subtotal ?? pd.planPrice);
}

export function orderCycleMonths(o) {
  const pd = o.priceDetails || {};
  const cd =
    (pd.subscription && pd.subscription.cycleDuration) ||
    (o.pricing && o.pricing.subscription && o.pricing.subscription.cycleDuration) ||
    null;
  if (!cd || !cd.count || !cd.unit) return null;
  const u = String(cd.unit).toUpperCase();
  if (u === 'DAY') return cd.count / 30.44;
  if (u === 'WEEK') return cd.count / 4.345;
  if (u === 'MONTH') return cd.count;
  if (u === 'YEAR') return cd.count * 12;
  return null;
}

export function money(n) {
  return Number(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
