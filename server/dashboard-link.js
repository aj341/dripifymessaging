// The dashboard link, in its own module on purpose.
//
// Drafts live on /approve; Telegram carries a pointer, never the draft itself —
// pasting 1,500 words into a chat is what blew Telegram's 4096-character limit
// and lost a whole tick's work. Kept out of approve.js so the specs can link to
// the dashboard without importing it (approve.js imports bus.js, and bus.js
// loads the specs — that would be a cycle).
export function approveUrl(key) {
  const base = process.env.PUBLIC_URL || 'https://dripifymessaging-production.up.railway.app';
  const token = process.env.DASHBOARD_TOKEN;
  const q = token ? `?t=${encodeURIComponent(token)}` : '';
  return key ? `${base}/approve/${encodeURIComponent(key)}${q}` : `${base}/approve${q}`;
}
