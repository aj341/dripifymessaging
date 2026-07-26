// Wix custom-app OAuth — the hive's live, read-only line into the money.
//
// AJ built a custom app in the Wix dev centre with read-only permissions
// (pricing plans, orders, contacts) and installed it on the Design Bees site.
// This module holds the token plumbing: AJ consents once at /auth/wix, the
// refresh token lives in the settings table, and access tokens are minted on
// demand. Same pattern, same guarantees as google.js — read, never write.
//
// Why OAuth and not the account API key: the payments endpoints that matter are
// admin-gated in ways account keys structurally cannot satisfy (the 403s that
// started all this). An installed app's tokens carry the app's granted
// permissions instead.
import { getSetting, setSetting } from './brain.js';

const APP_ID = process.env.WIX_APP_ID;
const APP_SECRET = process.env.WIX_APP_SECRET;
const REDIRECT = `${process.env.PUBLIC_URL || 'https://dripifymessaging-production.up.railway.app'}/auth/wix/callback`;

export function wixOauthConfigured() {
  return Boolean(APP_ID && APP_SECRET);
}

export async function wixOauthConnected() {
  return Boolean(await getSetting('wix_refresh_token'));
}

/**
 * Where AJ goes to consent. The Wix installer handles both fresh installs and
 * already-installed apps — either way it comes back to the callback with a code.
 */
export function wixInstallUrl() {
  const p = new URLSearchParams({ appId: APP_ID, redirectUrl: REDIRECT });
  return `https://www.wix.com/installer/install?${p}`;
}

async function tokenRequest(body) {
  const res = await fetch('https://www.wixapis.com/oauth/access', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: APP_ID, client_secret: APP_SECRET, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`wix token ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}

/** Exchange the installer's code for tokens and store the refresh token. */
export async function completeWixAuth(code) {
  const data = await tokenRequest({ grant_type: 'authorization_code', code });
  if (!data.refresh_token) throw new Error('Wix returned no refresh token — retry the install link.');
  await setSetting('wix_refresh_token', data.refresh_token);
  await setSetting('wix_access_token', data.access_token || '');
  // Wix app access tokens are short-lived (minutes); expire early to be safe.
  await setSetting('wix_token_expiry', String(Date.now() + 4 * 60 * 1000));
  return true;
}

async function accessToken() {
  const expiry = Number(await getSetting('wix_token_expiry')) || 0;
  const cached = await getSetting('wix_access_token');
  if (cached && Date.now() < expiry) return cached;

  const refresh = await getSetting('wix_refresh_token');
  if (!refresh) throw new Error('Wix app not connected — AJ visits /auth/wix once.');
  const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  await setSetting('wix_access_token', data.access_token);
  if (data.refresh_token) await setSetting('wix_refresh_token', data.refresh_token);
  await setSetting('wix_token_expiry', String(Date.now() + 4 * 60 * 1000));
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

/** Contacts lookup by email or name fragment — for joining money to people. */
export async function findContacts({ search, limit = 20 } = {}) {
  const data = await wixApi('/contacts/v4/contacts/query', {
    method: 'POST',
    body: {
      query: { paging: { limit: Math.min(limit, 50) } },
      search: search ? String(search) : undefined,
    },
  });
  return (data.contacts || []).map((c) => ({
    id: c.id,
    name: [c.info?.name?.first, c.info?.name?.last].filter(Boolean).join(' ') || null,
    email: c.primaryInfo?.email || c.info?.emails?.items?.[0]?.email || null,
    company: c.info?.company || null,
    createdDate: c.createdDate,
  }));
}
