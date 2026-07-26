// Wix custom-app auth — the hive's live, read-only line into the money.
//
// Wix deprecated the redirect/refresh-token handshake for new apps; the current
// model is OAuth client credentials: POST /oauth2/token with the app ID, app
// secret and the INSTANCE ID of the app's installation on the Design Bees site,
// and back comes a 4-hour access token. No redirect URL, no consent screen, no
// refresh token to lose. Read-only still comes from the app's permission grant.
//
// The one awkward part is the instance ID. It arrives in webhooks and in the
// signed `instance` parameter Wix passes to the app's dashboard page — so
// /auth/wix accepts a paste of any of: the raw instance ID, the signed instance
// token, or a whole URL containing one, extracts the ID, stores it, and proves
// the connection by minting a token and reading the app instance back.
import { getSetting, setSetting } from './brain.js';

const APP_ID = process.env.WIX_APP_ID;
const APP_SECRET = process.env.WIX_APP_SECRET;

export function wixOauthConfigured() {
  return Boolean(APP_ID && APP_SECRET);
}

export async function wixInstanceId() {
  return process.env.WIX_INSTANCE_ID || (await getSetting('wix_instance_id')) || '';
}

export async function wixOauthConnected() {
  return wixOauthConfigured() && Boolean(await wixInstanceId());
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function b64urlJson(part) {
  try {
    const pad = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(pad, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Pull an instance ID out of whatever AJ pastes: a bare UUID, a signed Wix
 * `instance` token (signature.payload, payload JSON carries instanceId), a JWT,
 * or a full URL containing either. Returns '' when nothing usable is found.
 */
export function extractInstanceId(pasted) {
  const s = String(pasted || '').trim();
  if (!s) return '';

  // A URL: prefer an explicit instance/instanceId query param, else fall through.
  let candidate = s;
  try {
    const url = new URL(s);
    candidate = url.searchParams.get('instance') || url.searchParams.get('instanceId') || s;
  } catch {
    /* not a URL */
  }

  // Signed instance token or JWT: some dot-separated chunk decodes to JSON
  // holding instanceId.
  for (const part of String(candidate).split('.')) {
    const json = b64urlJson(part);
    if (json && typeof json === 'object') {
      const id = json.instanceId || json.instance_id || json.iid;
      if (id && UUID_RE.test(id)) return id.match(UUID_RE)[0];
    }
  }

  // A bare UUID anywhere in the paste. Guard: an appId is also a UUID, so if
  // the paste contains our own app id, skip that match.
  const uuids = s.match(new RegExp(UUID_RE, 'gi')) || [];
  const notAppId = uuids.find((u) => u.toLowerCase() !== String(APP_ID || '').toLowerCase());
  return notAppId || '';
}

export async function storeInstanceId(id) {
  if (!UUID_RE.test(id)) throw new Error('That does not look like an instance ID.');
  await setSetting('wix_instance_id', id);
}

// --- Tokens ---------------------------------------------------------------------
// Client-credentials tokens live 4 hours; cache for 3.5 and mint on demand.
async function accessToken() {
  const expiry = Number(await getSetting('wix_token_expiry')) || 0;
  const cached = await getSetting('wix_access_token');
  if (cached && Date.now() < expiry) return cached;

  if (!wixOauthConfigured()) throw new Error('WIX_APP_ID / WIX_APP_SECRET are not set on the Railway service.');
  const instanceId = await wixInstanceId();
  if (!instanceId) throw new Error('Wix instance ID not set — AJ completes the one-off step at /auth/wix.');

  const res = await fetch('https://www.wixapis.com/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: APP_ID,
      client_secret: APP_SECRET,
      instance_id: instanceId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`wix token ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  await setSetting('wix_access_token', data.access_token);
  await setSetting('wix_token_expiry', String(Date.now() + 3.5 * 60 * 60 * 1000));
  return data.access_token;
}

async function wixApi(path, { method = 'GET', body } = {}) {
  const token = await accessToken();
  const res = await fetch(`https://www.wixapis.com${path}`, {
    method,
    headers: { Authorization: token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`wix ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** Prove the connection end-to-end: mint a token and read the instance back. */
export async function testConnection() {
  const data = await wixApi('/apps/v1/instance');
  return {
    ok: true,
    appName: data.instance?.appName || null,
    siteName: data.site?.siteDisplayName || data.site?.url || null,
    permissions: data.instance?.permissions || [],
  };
}

// --- The reads Fred lives on ---------------------------------------------------

/**
 * Pricing-plan orders — the subscription ledger. Status tells the churn story:
 * ACTIVE, CANCELED, ENDED, PAUSED. Paged; returns up to `limit` newest first.
 */
export async function planOrders({ limit = 100 } = {}) {
  const out = [];
  let offset = 0;
  while (out.length < limit) {
    const page = await wixApi(
      `/pricing-plans/v2/orders?limit=${Math.min(50, limit - out.length)}&offset=${offset}&sort.fieldName=createdDate&sort.order=DESC`
    );
    const orders = page.orders || [];
    out.push(...orders);
    if (orders.length < 50) break;
    offset += orders.length;
  }
  return out.map((o) => ({
    id: o.id,
    planName: o.planName || o.planDescription?.name || null,
    status: o.status,
    buyerContactId: o.buyer?.contactId || null,
    buyerMemberId: o.buyer?.memberId || null,
    price: o.pricing?.prices?.[0]?.price?.total || o.pricing?.price?.total || null,
    currency: o.pricing?.prices?.[0]?.price?.currency || null,
    createdDate: o.createdDate,
    startDate: o.startDate,
    endDate: o.endDate,
    canceledDate: o.canceledDate || null,
    cancellationReason: o.cancellation?.cause || null,
    lastPaymentStatus: o.lastPaymentStatus || null,
  }));
}

/** eCommerce orders (one-off jobs, non-subscription payments). Newest first. */
export async function ecomOrders({ limit = 100 } = {}) {
  const data = await wixApi('/ecom/v1/orders/search', {
    method: 'POST',
    body: {
      search: {
        cursorPaging: { limit: Math.min(limit, 100) },
        sort: [{ fieldName: 'createdDate', order: 'DESC' }],
      },
    },
  });
  return (data.orders || []).map((o) => ({
    id: o.id,
    number: o.number,
    createdDate: o.createdDate,
    total: o.priceSummary?.total?.amount || null,
    currency: o.currency,
    paymentStatus: o.paymentStatus,
    buyerEmail: o.buyerInfo?.email || null,
    items: (o.lineItems || []).map((li) => li.productName?.original || li.itemType?.preset || 'item').slice(0, 5),
  }));
}

function mapContact(c) {
  const addr = c.info?.addresses?.items?.[0]?.address || {};
  return {
    id: c.id,
    name: [c.info?.name?.first, c.info?.name?.last].filter(Boolean).join(' ') || null,
    email: c.primaryInfo?.email || c.info?.emails?.items?.[0]?.email || null,
    phone: c.primaryInfo?.phone || c.info?.phones?.items?.[0]?.phone || null,
    company: c.info?.company || null,
    jobTitle: c.info?.jobTitle || null,
    city: addr.city || null,
    state: addr.subdivision || null,
    country: addr.country || null,
    postcode: addr.postalCode || null,
    createdDate: c.createdDate,
  };
}

/** Contacts lookup by email or name fragment — for joining money to people. */
export async function findContacts({ search, limit = 20 } = {}) {
  const data = await wixApi('/contacts/v4/contacts/query', {
    method: 'POST',
    body: {
      query: { paging: { limit: Math.min(limit, 50) } },
      search: search ? String(search) : undefined,
    },
  });
  return (data.contacts || []).map(mapContact);
}

/** One contact by id — used to join plan orders to people and places. */
export async function getContact(contactId) {
  const data = await wixApi(`/contacts/v4/contacts/${encodeURIComponent(contactId)}`);
  return data.contact ? mapContact(data.contact) : null;
}
