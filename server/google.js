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
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
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
  return true;
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

/** A doc as plain text. Google Docs must be exported, not downloaded. */
export async function readTranscript(fileId) {
  const res = await driveGet(`files/${fileId}/export`, { mimeType: 'text/plain' });
  return res.text();
}
