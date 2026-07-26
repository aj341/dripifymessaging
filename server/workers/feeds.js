// The hive's window on the world: RSS and Atom.
//
// AJ's ask (2026-07-26): how do Ricky and Sam stay on top of what is going on —
// the latest news, what is interesting in the subs he follows — now that
// Reddit's API needs approval he cannot get?
//
// The answer is deliberately NOT Reddit-specific. Every source worth watching
// publishes a feed: subreddits (.rss), industry blogs, Google News for any
// query, Hacker News. One reader covers all of them, needs no API key, no
// approval and no vendor, and adding a source later is one line rather than a
// new integration.
//
// ON REDDIT'S LIMITS, EXPLICITLY: Reddit throttled feed readers in mid-2026 to
// roughly one request a minute. This module PACES to that limit rather than
// working around it — requests to a host are queued a minimum interval apart,
// so an hourly sweep of eight subs takes eight quiet minutes and never exceeds
// what Reddit allows. No rotating agents, no unofficial endpoints. If a feed
// refuses us anyway, that is reported as a refusal, never as "nothing found".
import { getKnowledge, saveKnowledge, getSetting, setSetting } from '../brain.js';
import { publish } from '../bus.js';

const UA = 'designbees-hive/1.0 (market research; contact aj@designbees.com.au)';
const TIMEOUT_MS = 15000;
const SEEN_KEY = 'feed-seen-items';
const MAX_SEEN = 1500;

// Minimum gap between requests to the same host. Reddit's published throttle is
// the binding one; everything else is ordinary politeness.
const HOST_INTERVAL_MS = { 'www.reddit.com': 62000 };
const DEFAULT_INTERVAL_MS = 1500;
const lastHit = new Map();

/**
 * The default watchlist. Subreddits AJ follows, the trade press, and standing
 * news queries. Overridable at runtime so a source can be added without a
 * deploy — see setFeeds().
 */
export const DEFAULT_FEEDS = [
  // The communities where the buyers are
  { name: 'r/Entrepreneur', url: 'https://www.reddit.com/r/Entrepreneur/.rss', kind: 'community' },
  { name: 'r/business', url: 'https://www.reddit.com/r/business/.rss', kind: 'community' },
  { name: 'r/design', url: 'https://www.reddit.com/r/design/.rss', kind: 'community' },
  { name: 'r/graphic_design', url: 'https://www.reddit.com/r/graphic_design/.rss', kind: 'community' },
  { name: 'r/smallbusiness', url: 'https://www.reddit.com/r/smallbusiness/.rss', kind: 'community' },
  { name: 'r/marketing', url: 'https://www.reddit.com/r/marketing/.rss', kind: 'community' },
  { name: 'r/SEO', url: 'https://www.reddit.com/r/SEO/.rss', kind: 'community' },
  { name: 'r/advertising', url: 'https://www.reddit.com/r/advertising/.rss', kind: 'community' },

  // The trade press — what the industry itself is saying
  { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', kind: 'industry' },
  { name: 'Search Engine Land', url: 'https://searchengineland.com/feed', kind: 'industry' },
  { name: 'Creative Bloq', url: 'https://www.creativebloq.com/feeds.xml', kind: 'industry' },

  // Standing news queries — Google News turns any search into a feed, free
  {
    name: 'News: design agency Australia',
    url: 'https://news.google.com/rss/search?q=%22design+agency%22+Australia&hl=en-AU&gl=AU&ceid=AU:en',
    kind: 'news',
  },
  {
    name: 'News: AI and graphic design',
    url: 'https://news.google.com/rss/search?q=%22graphic+design%22+AI+when:7d&hl=en-AU&gl=AU&ceid=AU:en',
    kind: 'news',
  },
];

// What makes an item worth waking someone for. Close to the ICP on purpose: a
// generic design word matches half the internet.
const WATCH_TERMS = [
  'design subscription', 'unlimited design', 'graphic design agency', 'hire a designer',
  'hiring a designer', 'in-house designer', 'freelance designer', 'design retainer',
  'brand guidelines', 'brand consistency', 'design turnaround', 'canva',
  'need a designer', 'design cost', 'outsource design', 'outsourcing design',
  'marketing budget', 'design agency', 'rebrand',
];

async function paced(url) {
  const host = new URL(url).host;
  const gap = HOST_INTERVAL_MS[host] ?? DEFAULT_INTERVAL_MS;
  const since = Date.now() - (lastHit.get(host) || 0);
  if (since < gap) await new Promise((r) => setTimeout(r, gap - since));
  lastHit.set(host, Date.now());
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const strip = (s) =>
  String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? strip(m[1]) : '';
}

/** RSS <item> and Atom <entry>, one parser. */
export function parseFeed(xml) {
  const blocks = [
    ...(xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []),
    ...(xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []),
  ];
  return blocks
    .map((b) => {
      let link = tag(b, 'link');
      if (!link) {
        const href = b.match(/<link[^>]*href=["']([^"']+)["']/i); // Atom
        link = href ? strip(href[1]) : '';
      }
      return {
        title: tag(b, 'title'),
        link,
        published: tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published') || '',
        summary: (tag(b, 'description') || tag(b, 'content') || tag(b, 'summary')).slice(0, 600),
        id: tag(b, 'guid') || tag(b, 'id') || link,
      };
    })
    .filter((i) => i.title && i.link);
}

export async function getFeeds() {
  const raw = await getSetting('hive_feeds').catch(() => null);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      /* fall through to defaults */
    }
  }
  return DEFAULT_FEEDS;
}

export async function setFeeds(feeds) {
  await setSetting('hive_feeds', JSON.stringify(feeds));
  return feeds.length;
}

async function seenIds() {
  const row = await getKnowledge('topic', SEEN_KEY).catch(() => null);
  return new Set(Array.isArray(row?.data?.ids) ? row.data.ids : []);
}

function matched(item) {
  const hay = `${item.title} ${item.summary}`.toLowerCase();
  return WATCH_TERMS.filter((t) => hay.includes(t));
}

/**
 * One pass over every feed. Publishes only what matches our topics — the point
 * is to be across the world without drowning in it, so a quiet sweep is the
 * normal outcome and is reported as such rather than padded.
 */
export async function sweepFeeds({ only = null, publishSignals = true } = {}) {
  const feeds = (await getFeeds()).filter((f) => !only || f.kind === only);
  const seen = await seenIds();
  const fresh = [];
  const hits = [];
  const errors = [];
  let scanned = 0;

  for (const feed of feeds) {
    try {
      const items = parseFeed(await paced(feed.url));
      for (const item of items) {
        scanned += 1;
        const key = `${feed.name}::${item.id}`.slice(0, 300);
        if (seen.has(key)) continue;
        fresh.push(key);
        const terms = matched(item);
        if (terms.length) hits.push({ feed, item, terms });
      }
    } catch (err) {
      errors.push(`${feed.name}: ${err.message}`);
    }
  }

  if (fresh.length) {
    await saveKnowledge({
      entity_type: 'topic',
      entity_key: SEEN_KEY,
      data: { ids: [...seen, ...fresh].slice(-MAX_SEEN), updated_at: new Date().toISOString() },
      source: { tool: 'feeds' },
      worker_key: 'radar',
    }).catch(() => {});
  }

  // Cap what gets raised. Five items is a briefing; fifty is a firehose nobody
  // reads, and the teammates can always pull more with read_feeds.
  const raised = hits.slice(0, 5);
  if (publishSignals) {
    for (const { feed, item, terms } of raised) {
      await publish({
        worker_key: 'radar',
        topic: feed.kind === 'community' ? `community:mention:${feed.name.replace(/^r\//, '')}` : `world:${feed.kind}`,
        title: `${feed.name}: ${item.title.slice(0, 110)}`,
        body:
          `${item.title}\n\n${item.link}\n\n` +
          (item.summary ? `${item.summary}\n\n` : '') +
          `Source: ${feed.name}${item.published ? ` · ${item.published}` : ''}\n` +
          `Matched our topics: ${terms.join(', ')}\n\n` +
          (feed.kind === 'community'
            ? 'Someone describing our problem in their own words. Ricky: record it if it is specific and quotable, with the link as evidence. Sam: this is the phrasing to write in.'
            : 'Industry movement. Ricky: judge whether it changes anything for us before recording it — most news does not.'),
        data: { feed: feed.name, kind: feed.kind, link: item.link, terms },
        confidence: 'fact',
      });
    }
  }

  const summary = { feeds: feeds.length, scanned, newItems: fresh.length, matched: hits.length, raised: raised.length, errors };
  await setSetting('feeds_last_sweep', JSON.stringify({ at: new Date().toISOString(), ...summary })).catch(() => {});
  console.log(
    `[feeds] ${feeds.length} feed(s): ${fresh.length} new item(s), ${hits.length} on our topics, ${raised.length} raised` +
      `${errors.length ? `, ${errors.length} error(s): ${errors[0]}` : ''}`
  );
  return { ...summary, hits };
}

// --- The tool Ricky and Sam use on demand -------------------------------------
export const tools = [
  {
    name: 'read_feeds',
    description:
      'Read the latest from the hive watchlist: the subreddits AJ follows (r/Entrepreneur, r/business, ' +
      'r/design, r/graphic_design, r/smallbusiness, r/marketing, r/SEO, r/advertising), the trade press ' +
      '(Smashing Magazine, Search Engine Land, Creative Bloq) and standing news queries. This is how you ' +
      'stay across what is happening without the Reddit API. Titles, links and summaries come back — open ' +
      'anything worth quoting with web search or fetch before you use it as evidence, and never quote a ' +
      'summary as if you read the thread.',
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['community', 'industry', 'news', 'all'],
          description: 'community = the subreddits, industry = trade press, news = standing news queries. Default all.',
        },
        contains: { type: 'string', description: 'Optional filter — only items whose title or summary contains this.' },
        limit: { type: 'integer', description: 'Max items to return (default 25).' },
      },
    },
  },
];

export const handlers = {
  read_feeds: async (input = {}) => {
    try {
      const kind = ['community', 'industry', 'news'].includes(input.kind) ? input.kind : null;
      const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 60);
      const feeds = (await getFeeds()).filter((f) => !kind || f.kind === kind);
      const needle = String(input.contains || '').toLowerCase();
      const out = [];
      const errors = [];

      for (const feed of feeds) {
        try {
          const items = parseFeed(await paced(feed.url));
          for (const item of items) {
            if (needle && !`${item.title} ${item.summary}`.toLowerCase().includes(needle)) continue;
            out.push(`• [${feed.name}] ${item.title}\n  ${item.link}${item.published ? `\n  ${item.published}` : ''}`);
            if (out.length >= limit) break;
          }
        } catch (err) {
          errors.push(`${feed.name}: ${err.message}`);
        }
        if (out.length >= limit) break;
      }

      if (!out.length) {
        return (
          `Nothing came back from ${feeds.length} feed(s)${needle ? ` matching "${needle}"` : ''}.` +
          (errors.length
            ? `\nErrors (treat these as UNREAD sources, not as silence): ${errors.join('; ')}`
            : ' The feeds were readable and genuinely had nothing matching.')
        );
      }
      return (
        `${out.length} item(s) from the watchlist${kind ? ` (${kind})` : ''}:\n${out.join('\n')}` +
        (errors.length ? `\n\nUnread sources this pass (not silence, failures): ${errors.join('; ')}` : '')
      );
    } catch (err) {
      return `read_feeds failed: ${err.message}. Report the failure; do not treat it as nothing happening.`;
    }
  },
};
