// Reddit — where the buyers complain in their own words.
//
// Extracted from Ricky's spec so Sam can hear the customer too (AJ, 2026-07-26:
// Sam had only ever seen a one-line summary of a pain, never the phrasing behind
// it, which is a poor foundation for copy meant to resonate). Ricky records
// findings from it; Sam reads it for language.
//
// AUTH (2026-07-26): Reddit tightened access — appending .json to a URL now
// returns 403 for unauthenticated callers, so the public path this started on
// is unreliable at best and dead at worst. A free "script" app at
// reddit.com/prefs/apps gives an OAuth client id/secret worth 100 queries a
// minute against oauth.reddit.com, versus 10 (or a 403) unauthenticated.
// Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET and every call routes through
// OAuth; without them it still tries the public path and says plainly when it
// is being refused, rather than reporting an empty scan as "nothing found".
const UA = 'designbees-hive/1.0 (research worker; contact aj@designbees.com.au)';
const TIMEOUT_MS = 12000;
const CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;

export function redditAuthed() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

let token = { value: null, expires: 0 };
async function accessToken() {
  if (token.value && Date.now() < token.expires) return token.value;
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      'content-type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Reddit token ${res.status}: ${data.error || 'no token returned'}`);
  }
  token = { value: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
  return token.value;
}

export const HOME_SUBS = ['graphic_design', 'marketing', 'Entrepreneur', 'smallbusiness', 'SEO', 'advertising'];

const slug = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

export async function redditJson(url) {
  try {
    let target = url;
    const headers = { 'User-Agent': UA, Accept: 'application/json' };
    if (redditAuthed()) {
      // oauth.reddit.com mirrors the public paths; the .json suffix is dropped.
      target = url.replace('https://www.reddit.com', 'https://oauth.reddit.com').replace('.json?', '?').replace(/\.json$/, '');
      headers.Authorization = `Bearer ${await accessToken()}`;
    }
    const res = await fetch(target, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 403 && !redditAuthed()) {
      return {
        ok: false,
        error:
          'Reddit refused the request (403). Unauthenticated .json access is blocked as of 2026 — this is a ' +
          'MISSING CREDENTIAL, not an empty result. Tell AJ that REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET ' +
          'need setting (a free script app at reddit.com/prefs/apps), and do not treat the silence as evidence ' +
          'that nobody is discussing the topic.',
      };
    }
    if (!res.ok) return { ok: false, error: `Reddit returned HTTP ${res.status} for ${target}` };
    const json = await res.json();
    const children = json?.data?.children;
    if (!Array.isArray(children)) return { ok: false, error: `Unexpected Reddit payload from ${url}` };
    return { ok: true, posts: children.map((c) => c?.data).filter(Boolean) };
  } catch (err) {
    return { ok: false, error: `Reddit fetch failed (${url}): ${err?.message || err}` };
  }
}

function formatPosts(posts, { limit = 25 } = {}) {
  return posts
    .filter((p) => !p.stickied)
    .slice(0, limit)
    .map((p, i) => {
      const body = p.selftext ? `\n   ${clip(p.selftext, 320)}` : '';
      const flair = p.link_flair_text ? ` [${p.link_flair_text}]` : '';
      return (
        `${i + 1}. ${clip(p.title, 180)}${flair}\n` +
        `   r/${p.subreddit} · ${p.score} upvotes · ${p.num_comments} comments · ` +
        `https://www.reddit.com${p.permalink}${body}`
      );
    })
    .join('\n\n');
}

export const tools = [
  {
    name: 'reddit_scan',
    description:
      "Fetch top/hot/new posts from a public subreddit via Reddit's free JSON API — where buyers complain " +
      'in their own words. Good subs: ' + HOME_SUBS.map((s) => `r/${s}`).join(', ') + '. ' +
      'Returns titles, scores, comment counts, permalinks and post text. Permalinks are valid evidence URLs.',
    input_schema: {
      type: 'object',
      properties: {
        subreddit: { type: 'string', description: 'Subreddit name without the r/ prefix, e.g. "smallbusiness".' },
        sort: { type: 'string', enum: ['top', 'hot', 'new'], description: 'Listing to read. Default "top".' },
        timeframe: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Only applies to sort="top". Default "week".' },
        limit: { type: 'integer', description: 'How many posts, 1-50. Default 25.' },
      },
      required: ['subreddit'],
    },
  },
  {
    name: 'reddit_search',
    description:
      'Search Reddit for a phrase, site-wide or inside one subreddit. Use it to test a specific hypothesis ' +
      '("brand guidelines", "design turnaround", "hiring a designer") and to hear the exact words buyers ' +
      'use about it, rather than browsing a whole listing.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search phrase. Quote it for an exact match.' },
        subreddit: { type: 'string', description: 'Optional — restrict the search to this subreddit.' },
        timeframe: { type: 'string', enum: ['week', 'month', 'year', 'all'], description: 'Default "year".' },
        limit: { type: 'integer', description: 'How many results, 1-50. Default 25.' },
      },
      required: ['query'],
    },
  },
];

export const handlers = {
  reddit_scan: async (input = {}) => {
    try {
      const sub = slug(input.subreddit).replace(/-/g, '_');
      if (!sub) return 'No subreddit given. Try one of: ' + HOME_SUBS.join(', ');
      const sort = ['top', 'hot', 'new'].includes(input.sort) ? input.sort : 'top';
      const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 50);
      const t = ['day', 'week', 'month', 'year'].includes(input.timeframe) ? input.timeframe : 'week';
      const qs = sort === 'top' ? `?t=${t}&limit=${limit}` : `?limit=${limit}`;
      const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/${sort}.json${qs}`;

      const r = await redditJson(url);
      if (!r.ok) return `${r.error}\nTry a different subreddit or sort, or fall back to web search.`;
      if (!r.posts.length) return `r/${sub} returned no posts for ${sort}/${t}. Try a wider timeframe.`;

      return `r/${sub} — ${sort}${sort === 'top' ? `/${t}` : ''} (${r.posts.length} posts, ${url})\n\n${formatPosts(r.posts, { limit })}`;
    } catch (err) {
      return `reddit_scan failed: ${err?.message || err}. Nothing was saved.`;
    }
  },

  reddit_search: async (input = {}) => {
    try {
      const q = String(input.query || '').trim();
      if (!q) return 'No search phrase given.';
      const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 50);
      const t = ['week', 'month', 'year', 'all'].includes(input.timeframe) ? input.timeframe : 'year';
      const sub = input.subreddit ? slug(input.subreddit).replace(/-/g, '_') : '';
      const base = sub
        ? `https://www.reddit.com/r/${encodeURIComponent(sub)}/search.json`
        : 'https://www.reddit.com/search.json';
      const url =
        `${base}?q=${encodeURIComponent(q)}&sort=relevance&t=${t}&limit=${limit}` + (sub ? '&restrict_sr=1' : '');

      const r = await redditJson(url);
      if (!r.ok) return `${r.error}\nFall back to web search for this one.`;
      if (!r.posts.length) {
        return `No Reddit results for "${q}"${sub ? ` in r/${sub}` : ''} (${t}). Widen the timeframe or rephrase — do not treat silence as evidence.`;
      }
      return (
        `Reddit search "${q}"${sub ? ` in r/${sub}` : ''} · ${t} (${r.posts.length} results, ${url})\n\n` +
        formatPosts(r.posts, { limit })
      );
    } catch (err) {
      return `reddit_search failed: ${err?.message || err}. Nothing was saved.`;
    }
  },
};
