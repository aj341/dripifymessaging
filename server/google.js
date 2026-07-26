// Google Drive, read-only. This is how the hive gets at the meeting transcripts
// that land in AJ's Drive after every demo — the only source that says, in the
// client's own words, why they bought or didn't.
//
// Read-only by scope: drive.readonly can list and read, and cannot create,
// modify, move or delete anything. The refresh token lives in the settings
// table so the server re-authorises itself and AJ only consents once.
import { getSetting, setSetting } from './brain.js';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// Read-only across the board: Drive for transcripts and brand docs, GA4 and
// Search Console for the blog engine's scoreboard. None of these scopes can
// write, delete or configure anything in AJ's Google account.
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
];
const SCOPE = SCOPES.join(' ');
const REDIRECT = `${process.env.PUBLIC_URL || 'https://dripifymessaging-production.up.railway.app'}/auth/google/callback`;

// Where the Gemini meeting notes land. Overridable without a deploy.
export const TRANSCRIPT_FOLDER = process.env.GOOGLE_TRANSCRIPT_FOLDER || '1F3LlvKD3ak2Agj_BLpqcwmO5gPQ8T58w';

export function googleConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export async function googleConnected() {
  return Boolean(await getSetting('google_refresh_token'));
}

/** Where AJ goes to consent. access_type=offline is what yields a refresh token. */
export function authUrl() {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent', // force a refresh token even on re-consent
    include_granted_scopes: 'true',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(body) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`google token ${res.status}: ${data.error_description || data.error || ''}`);
  return data;
}

/** Exchange the one-time code for a refresh token and store it. */
export async function completeAuth(code) {
  const data = await tokenRequest({ code, redirect_uri: REDIRECT, grant_type: 'authorization_code' });
  if (!data.refresh_token) {
    throw new Error('Google returned no refresh token — revoke the app at myaccount.google.com/permissions and retry.');
  }
  await setSetting('google_refresh_token', data.refresh_token);
  await setSetting('google_access_token', data.access_token);
  await setSetting('google_token_expiry', String(Date.now() + (data.expires_in - 60) * 1000));
  // Google reports which scopes were actually granted — AJ can untick boxes on
  // the consent screen, so never assume a scope from the request alone.
  await setSetting('google_granted_scopes', data.scope || SCOPE);
  return true;
}

export async function grantedScopes() {
  return String((await getSetting('google_granted_scopes')) || '');
}

export async function analyticsGranted() {
  return (await grantedScopes()).includes('analytics.readonly');
}

export async function searchConsoleGranted() {
  return (await grantedScopes()).includes('webmasters.readonly');
}

/** A valid access token, refreshed on demand. */
async function accessToken() {
  const expiry = Number(await getSetting('google_token_expiry')) || 0;
  const cached = await getSetting('google_access_token');
  if (cached && Date.now() < expiry) return cached;

  const refresh = await getSetting('google_refresh_token');
  if (!refresh) throw new Error('Google not connected — visit /auth/google once.');
  const data = await tokenRequest({ refresh_token: refresh, grant_type: 'refresh_token' });
  await setSetting('google_access_token', data.access_token);
  await setSetting('google_token_expiry', String(Date.now() + (data.expires_in - 60) * 1000));
  return data.access_token;
}

async function driveGet(path, params = {}) {
  const token = await accessToken();
  const url = `https://www.googleapis.com/drive/v3/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

/** Meeting-note docs, newest first. */
export async function listTranscripts({ since, limit = 50 } = {}) {
  const clauses = [`'${TRANSCRIPT_FOLDER}' in parents`, `mimeType = 'application/vnd.google-apps.document'`, 'trashed = false'];
  if (since) clauses.push(`modifiedTime > '${since}'`);
  const res = await driveGet('files', {
    q: clauses.join(' and '),
    orderBy: 'modifiedTime desc',
    pageSize: String(limit),
    fields: 'files(id,name,modifiedTime,createdTime,webViewLink)',
  });
  const data = await res.json();
  return data.files || [];
}

// AJ's brand folder: tone of voice, messaging bible, content playbooks.
export const BRAND_FOLDER = process.env.GOOGLE_BRAND_FOLDER || '1TgZJdS8vwEOZFRQAebu5zzYO2E_cGrZS';

/** Everything in a folder, whatever the type. */
export async function listFolder(folderId, limit = 50) {
  const res = await driveGet('files', {
    q: `'${folderId}' in parents and trashed = false`,
    pageSize: String(limit),
    fields: 'files(id,name,mimeType,modifiedTime)',
  });
  return (await res.json()).files || [];
}

/**
 * Any Drive file as text. Google Docs have to be exported; everything else
 * (markdown, docx, plain text) is downloaded raw.
 */
export async function readDriveFile(fileId, mimeType) {
  if (mimeType && mimeType.includes('google-apps.document')) return readTranscript(fileId);
  const res = await driveGet(`files/${fileId}`, { alt: 'media' });
  return res.text();
}

/** A doc as plain text. Google Docs must be exported, not downloaded. */
export async function readTranscript(fileId) {
  const res = await driveGet(`files/${fileId}/export`, { mimeType: 'text/plain' });
  return res.text();
}

// --- GA4 and Search Console (read-only) ---------------------------------------
// Both APIs ride the same OAuth connection as Drive. Every number the hive
// quotes about search or site traffic must come from these calls — they are the
// only line between "measured" and "made up".

async function googleApi(url, { method = 'GET', body } = {}) {
  const token = await accessToken();
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`google api ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** Every GA4 property this Google account can see. How we find the property id. */
export async function ga4Properties() {
  const data = await googleApi('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=50');
  const out = [];
  for (const acc of data.accountSummaries || []) {
    for (const p of acc.propertySummaries || []) {
      out.push({
        property: p.property, // "properties/123456789"
        displayName: p.displayName,
        account: acc.displayName,
      });
    }
  }
  return out;
}

/**
 * A GA4 report. `property` is "properties/<id>"; if omitted, the stored setting
 * ga4_property is used (set once via the hive after ga4Properties confirms it).
 */
export async function ga4RunReport({ property, dimensions = [], metrics = [], startDate, endDate, dimensionFilter, limit = 50 }) {
  const prop = property || (await getSetting('ga4_property'));
  if (!prop) throw new Error('No GA4 property selected — run ga4Properties and store one first.');
  const body = {
    dateRanges: [{ startDate: startDate || '28daysAgo', endDate: endDate || 'today' }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    limit: String(Math.min(Math.max(Number(limit) || 50, 1), 250)),
  };
  if (dimensionFilter) body.dimensionFilter = dimensionFilter;
  return googleApi(`https://analyticsdata.googleapis.com/v1beta/${prop}:runReport`, { method: 'POST', body });
}

/** The sites this account can read in Search Console, with permission level. */
export async function gscSites() {
  const data = await googleApi('https://www.googleapis.com/webmasters/v3/sites');
  return (data.siteEntry || []).map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel }));
}

/**
 * Search analytics for a property. `siteUrl` may be a URL-prefix property
 * ("https://designbees.com.au/") or a domain property ("sc-domain:designbees.com.au");
 * if omitted, the stored setting gsc_site is used.
 */
export async function gscQuery({ siteUrl, startDate, endDate, dimensions = ['query'], rowLimit = 50, dimensionFilterGroups }) {
  const site = siteUrl || (await getSetting('gsc_site'));
  if (!site) throw new Error('No Search Console site selected — run gscSites and store one first.');
  const body = {
    startDate: startDate || isoDaysAgo(28),
    endDate: endDate || isoDaysAgo(1),
    dimensions,
    rowLimit: Math.min(Math.max(Number(rowLimit) || 50, 1), 500),
  };
  if (dimensionFilterGroups) body.dimensionFilterGroups = dimensionFilterGroups;
  const data = await googleApi(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    { method: 'POST', body }
  );
  return { site, rows: data.rows || [] };
}

function isoDaysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}
