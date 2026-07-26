// Sam — Socials & Content (worker key: voice). The output end of the cascade:
// Tom's search gaps and Ricky's trends come in, drafts go out for AJ to approve.
//
// Sam (the model) writes the words inside the tool call. The handlers below are
// deliberately mechanical: they enforce the parts of AJ's voice doc that can be
// checked by machine, refuse unsourced proof, file the draft as knowledge and
// raise a content:draft signal. Nothing in this file can post anything.

const SLUG_MAX = 60;

const slug = (s) =>
  String(s || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX) || 'untitled';

const clean = (s) => String(s == null ? '' : s).trim();

// Plan prices are public facts from the website, so a figure that matches one of
// these isn't an unsourced claim. Anything else numeric needs a source.
const PLAN_PRICES = /\$\s?(545|995|1,?645|2,?645)\b/g;

// Each entry: [pattern, why it fails AJ's voice doc]. Warnings, not blockers —
// Sam gets told exactly what to rewrite and AJ still sees the draft.
const VOICE_TRAPS = [
  [/\bexcited to (share|announce)\b/i, 'Performative opener. Just say the thing.'],
  [/\b(humbled|honoured|honored|thrilled|delighted to announce)\b/i, 'Performative announcement language.'],
  [/\b(synergy|synergies|leverage|leveraging|disrupt|disruptive|seamless|game[-\s]?chang\w*)\b/i, 'Buzzword — plain language instead.'],
  [/what do you (think|reckon)\s*\?/i, 'Engagement-bait close. Land a clear point of view instead.'],
  [/\b(thoughts|agree)\s*\?\s*$/i, 'Engagement-bait close. End on the point, not a question.'],
  [/here'?s the thing/i, 'AI crutch phrase.'],
  [/\bthe truth is\b/i, 'AI crutch phrase.'],
  [/\bit(?:'s| is) not\b[^.!?\n]{1,40}\bit(?:'s| is)\b/i, '"It\'s not X, it\'s Y" contrast flip — reads as AI.'],
  [/\bstop\b[^.!?\n]{1,40}\bstart\b/i, '"Stop doing X, start doing Y" command — reads as AI.'],
  [/\bi wish i (knew|had known) this earlier\b/i, 'Cliché.'],
  [/\bnobody (talks|is talking) about\b/i, 'Overclaim bait.'],
  [/\b(delve|unlock|harness|elevate|supercharge|revolutionis\w+|revolutioniz\w+)\b/i, 'AI-flavoured verb.'],
  [/\bin today'?s (fast[-\s]paced|digital|competitive)\b/i, 'Filler opener.'],
  [/\bas a (seasoned|passionate)\b/i, 'Brand-persona voice, not AJ.'],
  [/\b\d+\s+(proven|powerful)\s+\w+/i, 'Listicle framing AJ doesn\'t use.'],
];

// AJ is Australian and writes that way.
const US_SPELLINGS = [
  [/\bcolors?\b/i, 'colour'],
  [/\bfavorite\b/i, 'favourite'],
  [/\borganiz(e|ed|ing|ation)\b/i, 'organis-'],
  [/\boptimiz(e|ed|ing|ation)\b/i, 'optimis-'],
  [/\breali[z](e|ed|ing)\b/i, 'realis-'],
  [/\bcenter(ed|s)?\b/i, 'centre'],
  [/\bbehaviors?\b/i, 'behaviour'],
  [/\bspecializ(e|ed|ing)\b/i, 'specialis-'],
];

/** Machine-checkable slice of AJ's tone doc. Returns an array of warning lines. */
function voiceWarnings(text) {
  const warn = [];
  const t = clean(text);
  if (!t) return ['Empty text — nothing to check.'];

  for (const [re, why] of VOICE_TRAPS) {
    const hit = t.match(re);
    if (hit) warn.push(`"${hit[0].trim()}" — ${why}`);
  }
  for (const [re, better] of US_SPELLINGS) {
    const hit = t.match(re);
    if (hit) warn.push(`"${hit[0].trim()}" — AJ writes Australian English (${better}).`);
  }
  if (!/[a-z]'(s|t|re|ve|ll|m|d)\b/i.test(t)) {
    warn.push('No contractions found — AJ always writes "I\'m", "you\'ve", "it\'s".');
  }
  const longest = t
    .split(/[.!?\n]+/)
    .map((s) => s.trim().split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => Math.max(a, b), 0);
  if (longest > 30) warn.push(`Longest sentence is ${longest} words — AJ writes short sentences.`);

  return warn;
}

/** Numbers/outcomes that look like claims but carry no source. */
function unsourcedClaims(text, sourced) {
  if (sourced) return [];
  const t = clean(text).replace(PLAN_PRICES, '');
  const hits = [];
  const pct = t.match(/\b\d+(\.\d+)?\s?%/g);
  const money = t.match(/\$\s?\d[\d,]*/g);
  const mult = t.match(/\b\d+(\.\d+)?x\b/gi);
  for (const h of [...(pct || []), ...(money || []), ...(mult || [])]) hits.push(h.trim());
  return [...new Set(hits)];
}

/** pg may hand back JSON as an object or a string; treat both the same. */
function asObject(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return { value: String(v) };
  }
}

const oneLine = (s, n = 160) => clean(s).replace(/\s+/g, ' ').slice(0, n);

export default {
  key: 'voice',
  name: 'Sam',
  emoji: '📣',
  title: 'Socials & Content',

  brief: `You are Sam, the Socials & Content bee in AJ's hive at Design Bees — an Australian unlimited-graphic-design subscription (Worker Bee $545, Buzz Basics $995, Honeycomb Plus $1,645, Nectar $2,645 a month, no lock-in). You own the top of the funnel: when Tom surfaces a search gap Design Bees can realistically win (seo:gap) or Ricky spots a trend worth riding (trend:*), you turn it into a LinkedIn post in AJ's own voice and/or a blog outline, aimed at the buyer — an in-house marketing decision-maker at an 11–200 staff company drowning in a design backlog, or a small-business founder still doing their own Canva work at 11pm.

AJ's voice in one line: useful first, warm always, always sounds like a person. Every post has to leave the reader better off — a reframe, a specific observation, something concrete they can use — not vague inspiration. Short sentences. Contractions always. First person, present tense. Say "you", not "businesses". The hook is lines 1–3 and it's the only part most people see, so make it true and interesting rather than clickbait; then one idea explored properly with real white space; then land the point instead of asking "What do you think?". Never performative ("excited to share", "humbled and honoured"), never buzzwords (synergy, leverage, disrupt, seamless, game-changer), never the AI tells ("Here's the thing", "It's not X, it's Y", "Stop doing X, start doing Y"). Under about 1,300 characters. Australian spelling. Rotate post types across drafts: proof of competence, contrarian take, practical tip or reframe, a thing you actually did, and the occasional soft sell.

Evidence rule, no exceptions: you never invent a client name, a result, a statistic or a testimonial. If you want a proof point, read it out of the hive with recall_hive_knowledge — real client industries, cohorts and wins live there — or ask AJ for it with request_proof_point and write the draft without it in the meantime. A post with no proof beats a post with a made-up one, and a fabricated client would cost AJ more than a quiet week.

You draft, you never publish. You have no posting capability, no LinkedIn access, no scheduler. Never say or imply that anything has been posted, scheduled or sent. Finished drafts are saved to knowledge and published as content:draft so AJ can review, edit and approve them in Telegram — he is the only one who posts.`,

  subscribes: ['seo:gap', 'trend:*', 'content:request'],
  emits: ['content:draft'],
  useWebSearch: true,

  tools: [
    {
      name: 'recall_hive_knowledge',
      description:
        "Read what the hive already knows before you write, so you cite real clients, real industries and real wins instead of inventing them. Entity types include 'client', 'topic' (existing content drafts), 'query' and 'trend'. Use this every time you reach for a proof point, an industry example or a customer pain — and check it before drafting so you don't repeat a topic that's already been drafted.",
      input_schema: {
        type: 'object',
        properties: {
          entity_type: {
            type: 'string',
            description: "Narrow to one type, e.g. 'client' or 'topic'. Omit to scan everything.",
          },
          contains: {
            type: 'string',
            description: 'Optional case-insensitive substring filter across the stored record.',
          },
          limit: { type: 'integer', description: 'Max records to return (default 15, max 40).' },
        },
      },
    },
    {
      name: 'request_proof_point',
      description:
        "Ask AJ for a fact you don't have — a client result, a testimonial, a number, permission to name a customer. Use this instead of inventing or estimating anything. Sam never fabricates evidence; if the hive doesn't hold it, AJ supplies it.",
      input_schema: {
        type: 'object',
        properties: {
          what: { type: 'string', description: 'The specific fact you need, phrased as a question AJ can answer in one line.' },
          why: { type: 'string', description: 'What you would use it for — which draft and which claim it would support.' },
          source: { type: 'string', description: "Who or what should supply it. Defaults to 'aj'." },
        },
        required: ['what', 'why'],
      },
    },
    {
      name: 'draft_linkedin_post',
      description:
        "Draft a LinkedIn post in AJ's voice from a trigger (a search gap Tom found, a trend Ricky spotted, or a request from AJ) and save it for review. Write the finished words yourself — hook in the first 1–3 lines, one idea explored properly, short paragraphs, a close that lands a point of view. Under ~1,300 characters total. This tool stores the draft and raises content:draft for AJ; it does NOT post anything anywhere. Any client name, number, percentage or testimonial must come with proof_source naming where it came from.",
      input_schema: {
        type: 'object',
        properties: {
          trigger: {
            type: 'string',
            description: "What sparked this, e.g. \"seo:gap 'unlimited graphic design agency australia'\" or \"trend:reddit designers vs AI briefs\".",
          },
          angle: {
            type: 'string',
            description: 'One sentence: the real insight here for AJ\'s audience. This is the spine of the post.',
          },
          post_type: {
            type: 'string',
            enum: ['proof-of-competence', 'did-a-thing', 'contrarian', 'practical-tip', 'soft-sell'],
            description: 'Rotate these across drafts so the feed does not read the same every week.',
          },
          audience: {
            type: 'string',
            enum: ['marketing-lead', 'founder', 'agency'],
            description: 'Who this one is written for. Defaults to marketing-lead.',
          },
          hook: { type: 'string', description: 'The first 1–3 lines only. True and interesting, not clickbait.' },
          body: { type: 'string', description: 'The rest of the post, blank lines between paragraphs.' },
          takeaway: {
            type: 'string',
            description: 'What the reader walks away with. If you cannot state it plainly, the post is not ready.',
          },
          proof_point: {
            type: 'string',
            description: 'Optional. The concrete client name, result or number used in the post.',
          },
          proof_source: {
            type: 'string',
            description: "Required whenever proof_point is set: the knowledge entity_key it came from, or 'aj' if AJ supplied it directly. Never leave this blank to get a claim through.",
          },
        },
        required: ['trigger', 'angle', 'post_type', 'hook', 'body', 'takeaway'],
      },
    },
    {
      name: 'draft_blog_outline',
      description:
        'Draft a blog outline targeting one specific search query — normally a gap Tom flagged as winnable. Give it a working title, the intent behind the query, the H2 sections with what each covers, and one clear CTA. Saved as knowledge and raised as content:draft for AJ to approve. Same evidence rule: no invented clients, results or stats.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The exact search query this piece targets.' },
          search_intent: {
            type: 'string',
            enum: ['informational', 'commercial', 'comparison', 'transactional'],
            description: 'What the searcher actually wants when they type it.',
          },
          working_title: { type: 'string', description: 'Headline for the piece — written for a human, not a keyword slot.' },
          summary: { type: 'string', description: 'Two or three sentences on the argument the piece makes.' },
          sections: {
            type: 'array',
            description: 'The H2 sections in order.',
            items: {
              type: 'object',
              properties: {
                h2: { type: 'string', description: 'Section heading.' },
                covers: { type: 'string', description: 'What this section actually says.' },
              },
              required: ['h2', 'covers'],
            },
          },
          cta: { type: 'string', description: 'The single action the piece asks for at the end.' },
          proof_source: {
            type: 'string',
            description: "Where any client example or number in the outline came from — a knowledge entity_key or 'aj'.",
          },
          trigger: { type: 'string', description: 'The signal this came from, e.g. the seo:gap topic.' },
        },
        required: ['query', 'search_intent', 'working_title', 'summary', 'sections'],
      },
    },
  ],

  handlers: {
    recall_hive_knowledge: async (input, ctx) => {
      try {
        const limit = Math.min(Math.max(Number(input?.limit) || 15, 1), 40);
        const rows = (await ctx.allKnowledge(clean(input?.entity_type) || undefined)) || [];
        const needle = clean(input?.contains).toLowerCase();

        const matched = rows.filter((r) => {
          if (!needle) return true;
          return JSON.stringify([r.entity_key, r.data, r.source]).toLowerCase().includes(needle);
        });

        if (!matched.length) {
          return `Nothing in the hive matches${input?.entity_type ? ` type "${input.entity_type}"` : ''}${
            needle ? ` containing "${needle}"` : ''
          }. Don't fill the gap with a guess — use request_proof_point to ask AJ.`;
        }

        const lines = matched.slice(0, limit).map((r) => {
          const d = asObject(r.data);
          const facts = Object.entries(d)
            .filter(([, v]) => v != null && v !== '')
            .slice(0, 5)
            .map(([k, v]) => `${k}: ${oneLine(typeof v === 'object' ? JSON.stringify(v) : v, 70)}`)
            .join(' · ');
          return `• [${r.entity_type}] ${r.entity_key} (${r.confidence || 'fact'}) — ${facts || 'no fields'}`;
        });

        const more = matched.length > limit ? `\n…and ${matched.length - limit} more.` : '';
        return `${matched.length} record(s) in the hive:\n${lines.join('\n')}${more}\n\nOnly cite what's listed above. Anything else needs request_proof_point.`;
      } catch (e) {
        return `Couldn't read the knowledge base (${e.message}). Draft without proof points rather than inventing any, and flag the gap to AJ.`;
      }
    },

    request_proof_point: async (input, ctx) => {
      try {
        const what = clean(input?.what);
        const why = clean(input?.why);
        if (!what) return 'Nothing requested — say exactly which fact you need.';
        await ctx.requestData({ what, source: clean(input?.source) || 'aj', why: why || 'Needed for a content draft.' });
        return `Asked AJ for: "${what}". Carry on drafting without that claim — do not approximate it, and do not write around it in a way that implies you know it.`;
      } catch (e) {
        return `Couldn't log the request (${e.message}). Leave the claim out of the draft entirely and mention the gap when the draft goes to AJ.`;
      }
    },

    draft_linkedin_post: async (input, ctx) => {
      try {
        const hook = clean(input?.hook);
        const body = clean(input?.body);
        const angle = clean(input?.angle);
        const takeaway = clean(input?.takeaway);
        const trigger = clean(input?.trigger) || 'unprompted';
        if (!hook || !body) return 'Need both a hook and a body before this can be saved. Nothing was stored.';
        if (!takeaway) return 'No takeaway stated, so the post is not ready. Say what the reader walks away with, then call this again.';

        const proofPoint = clean(input?.proof_point);
        const proofSource = clean(input?.proof_source);
        // The evidence rule is enforced here, not left to good intentions.
        if (proofPoint && !proofSource) {
          return `Refused to save: "${oneLine(proofPoint, 80)}" is a claim with no proof_source. Pull it from recall_hive_knowledge or ask AJ with request_proof_point, then draft again.`;
        }

        const text = `${hook}\n\n${body}`;
        const chars = text.length;
        const warnings = voiceWarnings(text);
        const claims = unsourcedClaims(text, Boolean(proofSource));
        if (claims.length) {
          warnings.push(`Unsourced figures in the post: ${claims.join(', ')}. Set proof_source or cut them.`);
        }
        if (chars > 1300) warnings.push(`${chars} characters — over the ~1,300 LinkedIn sweet spot. Cut, don't compress.`);
        if (hook.split(/\n/).filter(Boolean).length > 3) warnings.push('Hook runs past 3 lines — only the first few show before "see more".');
        if (!/\n\s*\n/.test(body)) warnings.push('No blank lines in the body — it will read as a wall of text on mobile.');

        const key = `li-${slug(angle || hook)}`;
        const data = {
          format: 'linkedin-post',
          status: 'draft-awaiting-aj',
          post_type: clean(input?.post_type) || 'practical-tip',
          audience: clean(input?.audience) || 'marketing-lead',
          angle,
          takeaway,
          hook,
          body,
          text,
          characters: chars,
          proof_point: proofPoint || null,
          proof_source: proofSource || null,
          voice_warnings: warnings,
          drafted_at: new Date().toISOString(),
        };

        await ctx.saveKnowledge({
          entity_type: 'topic',
          entity_key: key,
          data,
          source: { tool: 'draft_linkedin_post', trigger, proof_source: proofSource || null },
          worker_key: ctx.workerKey,
        });

        await ctx.publish({
          topic: 'content:draft',
          title: `LinkedIn draft: ${oneLine(hook, 90)}`,
          body: `${text}\n\n— Takeaway: ${takeaway}\n— Type: ${data.post_type} · for ${data.audience} · ${chars} chars\n— From: ${trigger}${
            proofPoint ? `\n— Proof: ${proofPoint} (source: ${proofSource})` : ''
          }${warnings.length ? `\n— Voice flags: ${warnings.join(' | ')}` : ''}\n\nDraft only — not posted. Approve or edit before it goes anywhere.`,
          data: { ...data, knowledge_key: key },
          confidence: 'hypothesis',
        });

        const flags = warnings.length
          ? `\nVoice flags to fix before AJ sees a second version:\n- ${warnings.join('\n- ')}`
          : '\nVoice checks passed.';
        return `Saved as knowledge topic "${key}" (${chars} chars) and raised as content:draft for AJ to review.${flags}\nNot posted — AJ approves and posts it himself.`;
      } catch (e) {
        return `Draft wasn't saved (${e.message}). Keep the text you wrote, fix the input and call draft_linkedin_post again. Nothing has been posted or sent.`;
      }
    },

    draft_blog_outline: async (input, ctx) => {
      try {
        const query = clean(input?.query);
        const title = clean(input?.working_title);
        const summary = clean(input?.summary);
        const sections = Array.isArray(input?.sections) ? input.sections : [];
        if (!query) return 'No target query given — a blog outline without one is guesswork. Nothing was stored.';
        if (!title || !sections.length) return 'Need a working title and at least one section before this can be saved.';

        const proofSource = clean(input?.proof_source);
        const flat = [title, summary, ...sections.map((s) => `${clean(s?.h2)} ${clean(s?.covers)}`)].join('\n');
        const warnings = voiceWarnings(flat);
        const claims = unsourcedClaims(flat, Boolean(proofSource));
        if (claims.length) {
          warnings.push(`Unsourced figures in the outline: ${claims.join(', ')}. Source them or cut them.`);
        }
        if (sections.length < 3) warnings.push('Fewer than 3 sections — likely too thin to rank for anything.');

        const key = `blog-${slug(query)}`;
        const outline = sections
          .map((s, i) => `${i + 1}. ${clean(s?.h2) || 'Untitled section'}\n   ${clean(s?.covers)}`)
          .join('\n');
        const data = {
          format: 'blog-outline',
          status: 'draft-awaiting-aj',
          query,
          search_intent: clean(input?.search_intent) || 'informational',
          working_title: title,
          summary,
          sections: sections.map((s) => ({ h2: clean(s?.h2), covers: clean(s?.covers) })),
          cta: clean(input?.cta) || null,
          proof_source: proofSource || null,
          voice_warnings: warnings,
          drafted_at: new Date().toISOString(),
        };

        await ctx.saveKnowledge({
          entity_type: 'topic',
          entity_key: key,
          data,
          source: { tool: 'draft_blog_outline', trigger: clean(input?.trigger) || `query:${query}`, proof_source: proofSource || null },
          worker_key: ctx.workerKey,
        });

        await ctx.publish({
          topic: 'content:draft',
          title: `Blog outline: ${title}`,
          body: `Target query: "${query}" (${data.search_intent})\n\n${summary}\n\n${outline}\n\nCTA: ${
            data.cta || 'none set'
          }${warnings.length ? `\n\nFlags: ${warnings.join(' | ')}` : ''}\n\nOutline only — nothing written or published yet.`,
          data: { ...data, knowledge_key: key },
          confidence: 'hypothesis',
        });

        const flags = warnings.length ? `\nFlags:\n- ${warnings.join('\n- ')}` : '\nVoice checks passed.';
        return `Saved as knowledge topic "${key}" (${sections.length} sections) and raised as content:draft for AJ.${flags}\nNot published — AJ decides what gets written.`;
      } catch (e) {
        return `Outline wasn't saved (${e.message}). Fix the input and call draft_blog_outline again. Nothing has been published.`;
      }
    },
  },

  daily: {
    hourSydney: 7,
    prompt: `Morning content pass. Check recall_hive_knowledge for topics already drafted so you don't repeat yourself, then look at the newest seo:gap and trend:* signals. Pick the single strongest angle for a buyer — a marketing lead with a design backlog, or a founder still doing their own Canva work — and draft one LinkedIn post in AJ's voice with draft_linkedin_post. If a search gap is genuinely winnable, add one blog outline with draft_blog_outline. If nothing new has landed overnight, say so plainly and draft nothing rather than filling the slot. Any client name, result or number must come from the hive or from request_proof_point — never from you. Drafts only: AJ reviews and posts.`,
  },
};
