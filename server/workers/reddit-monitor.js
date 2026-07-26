// Standing watch on the subreddits where Design Bees' buyers talk.
//
// AJ's ask (2026-07-26): always be seeing the content in the subs that fit our
// ICP, and know straight away when something is performing exceptionally.
//
// Nothing off the shelf does this for us. Reddit's app directory is built for
// moderator tools that run inside a subreddit, not for watching several subs
// from outside and judging what is outperforming. What that needs is a
// baseline, and only we know which topics matter to us — so this is ours to
// run, and it is small.
//
// How "performing amazingly" is decided, honestly: velocity, not raw score. A
// post's score divided by its age in hours, compared against the median
// velocity of the same subreddit in the same pass. Three times the median (and
// past a floor, so a quiet hour cannot manufacture a breakout) is an outlier
// worth waking someone for. The median is computed per run, so it self-adjusts
// to each sub's size and the time of day rather than needing a stored history.
//
// Two kinds of alert, deliberately separate:
//   community:breakout — outperforming its sub right now, regardless of topic
//   community:mention  — matches a topic we care about, regardless of scores
// The first tells us what the audience is responding to. The second tells us
// someone is describing our problem. Conflating them would bury the second.
import { redditJson, redditAuthed, HOME_SUBS } from './reddit-tools.js';
import { getKnowledge, saveKnowledge, getSetting, setSetting } from '../brain.js';
import { publish } from '../bus.js';

const VELOCITY_MULTIPLE = 3;   // × the sub's median velocity this pass
const MIN_SCORE = 25;          // a floor, so a quiet listing can't fake a breakout
const MAX_AGE_HOURS = 48;      // older than this and it is not news
const SEEN_KEY = 'reddit-monitor-seen';
const MAX_SEEN = 600;

// The phrases that mean a buyer is describing what Design Bees sells. Kept
// deliberately close to the ICP: a generic design word matches half of Reddit.
const WATCH_TERMS = [
  'design subscription', 'unlimited design', 'graphic design agency', 'hire a designer',
  'hiring a designer', 'in-house designer', 'freelance designer', 'design retainer',
  'brand guidelines', 'brand consistency', 'design turnaround', 'canva vs',
  'need a designer', 'design costs', 'outsource design', 'outsourcing design',
];

function velocity(post) {
  const ageHours = Math.max((Date.now() / 1000 - (post.created_utc || 0)) / 3600, 0.5);
  return { ageHours, v: (post.score || 0) / ageHours };
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function matchedTerms(post) {
  const hay = `${post.title || ''} ${post.selftext || ''}`.toLowerCase();
  return WATCH_TERMS.filter((t) => hay.includes(t));
}

async function seenIds() {
  const row = await getKnowledge('topic', SEEN_KEY).catch(() => null);
  const ids = row?.data?.ids;
  return new Set(Array.isArray(ids) ? ids : []);
}

async function rememberSeen(seen, added) {
  const ids = [...seen, ...added].slice(-MAX_SEEN);
  await saveKnowledge({
    entity_type: 'topic',
    entity_key: SEEN_KEY,
    data: { ids, updated_at: new Date().toISOString() },
    source: { tool: 'reddit-monitor' },
    worker_key: 'radar',
  });
}

/**
 * One sweep across the watched subs. Publishes at most a handful of signals —
 * the point is the exceptional, so a pass that finds nothing is the normal
 * outcome and says so in the log rather than manufacturing interest.
 */
export async function sweepReddit({ subs = HOME_SUBS, force = false } = {}) {
  // Reddit closed self-service app registration in late 2025 and blocks
  // anonymous reads, so without approved credentials there is nothing to sweep.
  // Report that once and stand down rather than erroring on the hour forever —
  // a monitor that cannot see anything should say so and stop, not pretend.
  if (!redditAuthed()) {
    const already = await getSetting('reddit_monitor_blocked').catch(() => null);
    if (already && !force) return { blocked: true, scanned: 0, breakouts: 0, mentions: 0, published: 0, errors: [], authed: false };
    await setSetting('reddit_monitor_blocked', new Date().toISOString()).catch(() => {});
    console.warn(
      '[reddit] no REDDIT_CLIENT_ID/SECRET — Reddit API access now requires approval ' +
        '(self-service registration closed late 2025). Standing down; the team uses web search for ' +
        'Reddit content in the meantime.'
    );
    return { blocked: true, scanned: 0, breakouts: 0, mentions: 0, published: 0, errors: ['no credentials'], authed: false };
  }
  await setSetting('reddit_monitor_blocked', '').catch(() => {});
  const seen = await seenIds();
  const fresh = [];
  const breakouts = [];
  const mentions = [];
  const errors = [];

  for (const sub of subs) {
    const r = await redditJson(`https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=50`);
    if (!r.ok) {
      errors.push(`r/${sub}: ${r.error}`);
      continue;
    }
    const posts = r.posts
      .filter((p) => !p.stickied && p.id && !seen.has(p.id))
      .map((p) => ({ ...p, ...velocity(p) }))
      .filter((p) => p.ageHours <= MAX_AGE_HOURS);
    if (!posts.length) continue;

    const med = median(posts.map((p) => p.v));
    for (const p of posts) {
      fresh.push(p.id);
      const terms = matchedTerms(p);
      const isBreakout = med > 0 && p.v >= med * VELOCITY_MULTIPLE && (p.score || 0) >= MIN_SCORE;
      if (isBreakout) breakouts.push({ p, med, terms });
      else if (terms.length) mentions.push({ p, terms });
    }
  }

  if (fresh.length) await rememberSeen(seen, fresh).catch(() => {});

  // Loudest first, and capped — five alerts is a signal, fifty is noise.
  breakouts.sort((a, b) => b.p.v - a.p.v);
  mentions.sort((a, b) => (b.p.score || 0) - (a.p.score || 0));

  for (const { p, med, terms } of breakouts.slice(0, 3)) {
    await publish({
      worker_key: 'radar',
      topic: `community:breakout:${p.subreddit}`,
      title: `Outperforming in r/${p.subreddit}: ${String(p.title).slice(0, 110)}`,
      body:
        `${p.title}\n\nhttps://www.reddit.com${p.permalink}\n\n` +
        `${p.score} upvotes and ${p.num_comments} comments in ${p.ageHours.toFixed(1)}h — ` +
        `${(p.v / med).toFixed(1)}× the median velocity of r/${p.subreddit} in this pass.\n` +
        (terms.length ? `Matches our topics: ${terms.join(', ')}\n` : 'Not on our topics — read it for what the audience is responding to, not as a pain point.\n') +
        `\nRicky: if this is a real pain in our space, record it with the permalink as evidence. ` +
        `Sam: read the comments for the language people use, not just the post.\n` +
        `Velocity is a measure of attention, not of relevance — do not turn this into content on its own.`,
      data: { id: p.id, subreddit: p.subreddit, score: p.score, comments: p.num_comments, velocity: p.v, median: med, terms },
      confidence: 'fact',
    });
  }

  for (const { p, terms } of mentions.slice(0, 3)) {
    await publish({
      worker_key: 'radar',
      topic: `community:mention:${p.subreddit}`,
      title: `On our topics in r/${p.subreddit}: ${String(p.title).slice(0, 110)}`,
      body:
        `${p.title}\n\nhttps://www.reddit.com${p.permalink}\n\n` +
        `${p.score} upvotes, ${p.num_comments} comments, ${p.ageHours.toFixed(1)}h old.\n` +
        `Matched: ${terms.join(', ')}\n\n` +
        `Someone is describing our problem in their own words. Ricky: worth recording if it is specific ` +
        `and quotable. Sam: this is the phrasing to write in.`,
      data: { id: p.id, subreddit: p.subreddit, score: p.score, comments: p.num_comments, terms },
      confidence: 'fact',
    });
  }

  const summary = {
    scanned: fresh.length,
    breakouts: breakouts.length,
    mentions: mentions.length,
    published: Math.min(breakouts.length, 3) + Math.min(mentions.length, 3),
    errors,
    authed: redditAuthed(),
  };
  await setSetting('reddit_monitor_last', JSON.stringify({ at: new Date().toISOString(), ...summary })).catch(() => {});
  console.log(
    `[reddit] swept ${subs.length} sub(s): ${summary.scanned} new post(s), ${summary.breakouts} breakout(s), ` +
      `${summary.mentions} on-topic, ${summary.published} published${summary.errors.length ? `, ${summary.errors.length} error(s)` : ''}` +
      `${redditAuthed() ? '' : ' [UNAUTHENTICATED — set REDDIT_CLIENT_ID/SECRET]'}`
  );
  if (errors.length) console.warn('[reddit]', errors[0]);
  return summary;
}

export async function lastSweep() {
  const raw = await getSetting('reddit_monitor_last');
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
