// Reddit — where the buyers complain in their own words.
//
// Extracted from Ricky's spec so Sam can hear the customer too (AJ, 2026-07-26:
// Sam had only ever seen a one-line summary of a pain, never the phrasing behind
// it, which is a poor foundation for copy meant to resonate). Ricky records
// findings from it; Sam reads it for language.
//
// Reddit's public JSON endpoints are unauthenticated but they hard-block the
// default Node UA, so every request carries a real one.
const UA = 'designbees-hive/1.0 (research worker; contact aj@designbees.com.au)';
const TIMEOUT_MS = 12000;

export const HOME_SUBS = ['graphic_design', 'marketing', 'Entrepreneur', 'smallbusiness', 'SEO', 'advertising'];

const slug = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

async function redditJson(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `Reddit returned HTTP ${res.status} for ${url}` };
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
