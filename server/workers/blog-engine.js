// The blog engine pack — Design Bees' authoritative content standard.
//
// AJ maintains three source documents: the operator pack (how a post gets
// researched, written and published), the content queue (what gets written and
// in what order) and the L99 voice spec (how it has to sound). They ship with
// the repo rather than being fetched from Drive, because a teammate that cannot
// read the standard must not fall back to writing from memory of it.
//
// Sam writes to these. Ricky and Tom research against them: the five gates in
// section 15 and the keyword rules in section 16 are theirs, not Sam's.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'blog-engine');
const MAX_CHARS = 40000;

/**
 * The four plans, exactly as they must appear in customer-facing copy.
 * Confirmed by AJ 2026-07-26. The old 20/33/55/88 hours ladder is retired.
 */
export const PLAN_LADDER = [
  { name: 'Worker Bee', price: 545, hours: 16, rate: 34 },
  { name: 'Buzz Basics', price: 995, hours: 30, rate: 33 },
  { name: 'Honey Comb', price: 1645, hours: 53, rate: 31 },
  { name: 'Nectar Pro', price: 2645, hours: 74, rate: 36 },
];

export const PLAN_LINE = PLAN_LADDER.map(
  (p) => `${p.name} $${p.price.toLocaleString()} (${p.hours} hrs, ~$${p.rate}/hr)`
).join(', ');

/**
 * What the hive can and cannot measure today. Stated here once so no teammate
 * has to guess, and so nobody quotes a number from a tool that isn't connected.
 * Update this the day the connections land — not before.
 */
export const ANALYTICS_STATUS =
  'ANALYTICS ACCESS — read this before you cite anything. GA4 and Search Console are wired into this ' +
  'service read-only, through the same Google OAuth as Drive, but access is real ONLY once AJ has ' +
  'consented to the new scopes and the properties are verified. If you have analytics tools, call ' +
  'get_analytics_status FIRST and believe what it says: a number exists only if gsc_search_analytics ' +
  'or ga4_report returned it this run, cited as such. Note the site-wide designbees.com.au Search ' +
  'Console property was still pending DNS verification at the June audit — zero rows may simply mean ' +
  'the property is not verified yet, and get_analytics_status will say so. Ahrefs, SEMrush and every ' +
  'keyword-volume tool remain UNCONNECTED, and Perplexity sonar-pro (named in the pack) is not ' +
  'available here — use web search instead and say which you used. So: NEVER state a search volume or ' +
  'keyword difficulty, and never state an impression, click, session or position figure unless one of ' +
  'your analytics tools returned it this run. Not as a range, not as "roughly". Everything else stays ' +
  'qualitative — live SERP results, autocomplete and People Also Ask phrasings, Reddit threads, what ' +
  'the AI answer engines already say — and is labelled as qualitative every time.';

// The pack itself says live files win and drift gets flagged. L99-voice.md still
// carries the retired hours framing, so anyone reading it gets told on the way in
// rather than quietly copying $30/hr and 20 hours into a post.
const DRIFT = {
  'L99-voice.md':
    '\n\n---\n[HIVE DRIFT NOTE, not part of the file]\nThe "Structure" section above still reads ' +
    '"$545/mo = roughly $30/hr = roughly 20 hours of design a month". That framing is RETIRED. ' +
    'Section 6 of the operator pack, confirmed by AJ on 2026-07-26, is the live ladder: ' +
    `${PLAN_LINE}. Use those hours and rates. Everything else in this file stands.`,
};

const DOCS = [
  {
    file: 'BLOG-ENGINE-OPERATOR-PACK.md',
    what:
      'The full operator pack: non-negotiables, the L99 voice, Wix site and category IDs, CTAs, the ' +
      'canonical pricing ladder, the per-run procedure, the draft metadata format, the five gates that ' +
      'decide whether a query is worth a post (s15), keyword research rules (s16) and the AEO/SEO ' +
      'principles this project has already paid for (s17).',
  },
  {
    file: 'content-queue.md',
    what:
      'The queue itself: which questions get written, in what order, in which category, what is already ' +
      'done, and which items are AJ-MANUAL and must be skipped. Also the cadence and the per-run steps.',
  },
  {
    file: 'L99-voice.md',
    what:
      'The voice spec: what L99 sounds like, the hard bans (em dashes, banned phrases, "ship", AI ' +
      'cadence, competitor names), structure rules and the quality check to run before anything is saved.',
  },
];

function readDoc(name) {
  const doc = DOCS.find((d) => d.file.toLowerCase() === String(name || '').trim().toLowerCase());
  if (!doc) {
    return `No document called "${name}". Available: ${DOCS.map((d) => d.file).join(', ')}.`;
  }
  let text;
  try {
    text = fs.readFileSync(path.join(DIR, doc.file), 'utf8');
  } catch (err) {
    return (
      `Could not read ${doc.file} (${err.message}). Do NOT write from memory of the standard. ` +
      `Say the pack is unreadable and stop.`
    );
  }
  const body = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n\n[truncated]` : text;
  return body + (DRIFT[doc.file] || '');
}

export const tools = [
  {
    name: 'list_blog_engine_docs',
    description:
      "List AJ's blog engine documents — the operator pack, the content queue and the L99 voice spec. " +
      'These are the authoritative standard for every word Design Bees publishes. Call this first.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_blog_engine_doc',
    description:
      'Read one blog engine document in full. Read the operator pack and the L99 voice spec before you ' +
      'write or assess anything, every time, and do not write from memory of them. If these documents ' +
      'ever disagree with something you believe, they win.',
    input_schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          enum: DOCS.map((d) => d.file),
          description: 'Exact file name from list_blog_engine_docs.',
        },
      },
      required: ['file'],
    },
  },
];

export const handlers = {
  list_blog_engine_docs: async () =>
    `The Design Bees blog engine standard (${DOCS.length} documents, authoritative):\n\n` +
    DOCS.map((d) => `• ${d.file}\n  ${d.what}`).join('\n\n') +
    `\n\nRead the operator pack and L99-voice.md before writing or assessing anything. ` +
    `Canonical plans: ${PLAN_LINE}.`,

  read_blog_engine_doc: async ({ file } = {}) => readDoc(file),
};

// --- The machine-checkable slice of L99 --------------------------------------
// The quality check in section 10 of the pack, everything a regex can honestly
// catch. It does not replace reading the spec; it catches the failures that keep
// happening, em dashes first, because that is the one the pack calls out as the
// single most common failure.

const BANNED_PHRASES = [
  'happy to help',
  'let me know',
  'great question',
  'feel free to',
  'i hope this helps',
  'excited to share',
  'thrilled to announce',
  'humbled and honoured',
  'humbled and honored',
  'as a seasoned professional',
  'let us help you',
];

// Named in section 15 of the pack as the incumbents. Never in body copy.
const COMPETITORS = ['design pickle', 'kimp', 'manypixels', 'penji', 'superside', 'no issue'];

const RETIRED_HOURS = /\b(20|33|55|88)\s*hours?\b/i;

/**
 * L99 checks that a machine can make honestly. Returns an array of warning lines,
 * each naming what was found and why it fails.
 * @param {string} text
 * @param {{ blog?: boolean }} opts blog posts carry the structural checks too
 */
export function l99Warnings(text, opts = {}) {
  const warn = [];
  const t = String(text || '').trim();
  if (!t) return ['Empty text — nothing to check.'];
  const lower = t.toLowerCase();

  // The non-negotiables first.
  if (/[—–]/.test(t)) {
    warn.push('Em dash or en dash found. Hard ban. Use a comma, a full stop or a line break.');
  }
  if (/(?<!<)--(?!>)/.test(t)) {
    warn.push('Double hyphen found. Hard ban, same rule as the em dash.');
  }
  for (const p of BANNED_PHRASES) {
    if (lower.includes(p)) warn.push(`Banned phrase "${p}". Cut it.`);
  }
  if (/\bship(ping|ped|s)?\b/i.test(t)) {
    warn.push('"ship/shipping/shipped" is banned. Use "deliver".');
  }
  if (/\bstartup\b/i.test(t)) {
    warn.push('"startup" framing is banned for Design Bees.');
  }
  for (const c of COMPETITORS) {
    if (lower.includes(c)) {
      warn.push(`Competitor named in body copy ("${c}"). Hard ban. Comparison pages are AJ-MANUAL.`);
    }
  }
  if (/\b(ai|artificial intelligence|midjourney|dall[- ]?e|generative)\b/i.test(t)) {
    warn.push(
      'Mentions AI. Design Bees is human design only, and a post must never promote or imply AI does ' +
        'the design. If this is not about the design work itself, confirm the sentence cannot be read ' +
        'that way; otherwise cut it.'
    );
  }

  // Pricing has to be exact, because answer engines substitute a competitor's
  // number when ours is not stated unmissably.
  if (/honeycomb\s*plus/i.test(t)) {
    warn.push('"Honeycomb Plus" is a billing label, never customer-facing copy. The plan is "Honey Comb".');
  }
  if (/\bnectar\b/i.test(t) && !/nectar\s*pro/i.test(t)) {
    warn.push('The plan is "Nectar Pro", not "Nectar".');
  }
  if (/\bhoneycomb\b/i.test(t)) {
    warn.push('Write "Honey Comb" as two words in copy.');
  }
  if (/\bthree plans\b/i.test(t)) warn.push('There are four plans, not three.');
  if (RETIRED_HOURS.test(t) && /\$\s?(545|995|1,?645|2,?645)/.test(t)) {
    warn.push(
      'The 20/33/55/88 hours ladder is retired. Live hours are 16 / 30 / 53 / 74 for ' +
        'Worker Bee / Buzz Basics / Honey Comb / Nectar Pro.'
    );
  }

  // AI cadence.
  if (/^(crafting|delivering|empowering|unlocking|navigating|elevating)\b/im.test(t)) {
    warn.push('Generic gerund opener. Start with the insight instead.');
  }
  if (/\bit(?:'s| is) not\b[^.!?\n]{1,45}\bit(?:'s| is)\b/i.test(t)) {
    warn.push('X-not-Y symmetry. Reads as AI. Say the thing once.');
  }
  if (/\bnot (just )?(about )?[^.!?\n]{1,35}\bbut\b/i.test(t)) {
    warn.push('"Not X but Y" symmetry. Reads as AI.');
  }
  const adjList = t.match(/\b\w+ly?\b,\s*\w+,\s*and\s+\w+\b/g);
  if (adjList) warn.push(`Three-item comma list ("${adjList[0]}"). Break it up.`);

  // Three or more short billboard sentences in a row.
  const sentences = t
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().split(/\s+/).filter(Boolean).length)
    .filter(Boolean);
  let run = 0;
  for (const len of sentences) {
    run = len > 0 && len <= 6 ? run + 1 : 0;
    if (run >= 3) {
      warn.push('Three or more short billboard sentences in a row. Vary the lengths.');
      break;
    }
  }

  // Australian register.
  const US = [
    [/\bcolors?\b/i, 'colour'],
    [/\bfavorite\b/i, 'favourite'],
    [/\borganiz(e|ed|ing|ation)\b/i, 'organis-'],
    [/\boptimiz(e|ed|ing|ation)\b/i, 'optimis-'],
    [/\breali[z](e|ed|ing)\b/i, 'realis-'],
    [/\bcenter(ed|s)?\b/i, 'centre'],
    [/\bbehaviors?\b/i, 'behaviour'],
    [/\bspecializ(e|ed|ing)\b/i, 'specialis-'],
    [/\bprogram\b/i, 'programme (where it means a plan, not software)'],
  ];
  for (const [re, better] of US) {
    const hit = t.match(re);
    if (hit) warn.push(`"${hit[0].trim()}" — Design Bees writes Australian English (${better}).`);
  }

  if (opts.blog) {
    if (!/https:\/\/designbees\.com\.au\/demo/.test(t)) {
      warn.push('No demo CTA. Every post carries https://designbees.com.au/demo, bare, no tracking.');
    }
    if (!/https:\/\/designbees\.com\.au\/pricing-plans/.test(t)) {
      warn.push('No trial CTA. Every post carries https://designbees.com.au/pricing-plans.');
    }
    const bullets = t.split(/\n\s*\n/).filter((b) => (b.match(/^\s*[-*]\s+/gm) || []).length > 5);
    if (bullets.length) warn.push('A bullet list runs over 5 items. Cap at 5.');
  }

  return warn;
}

/** Figures with nothing behind them. Plan prices are public, so they pass. */
export function unsourcedFigures(text, sourced) {
  if (sourced) return [];
  const t = String(text || '').replace(/\$\s?(545|995|1,?645|2,?645)\b/g, '');
  const hits = [
    ...(t.match(/\b\d+(\.\d+)?\s?%/g) || []),
    ...(t.match(/\$\s?\d[\d,]*/g) || []),
    ...(t.match(/\b\d+(\.\d+)?x\b/gi) || []),
  ].map((h) => h.trim());
  return [...new Set(hits)];
}
