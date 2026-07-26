// George — GM of the hive (worker key: queen). He is the only teammate who sees
// every topic, and the only one who talks to AJ unprompted. His value is
// subtraction: the hive produces signals all day, AJ reads one short message.
// Nothing in here fetches data — George works exclusively from what the other
// workers already wrote down.

const TEAM = {
  queen: 'George',
  scout: 'Ian',
  ledger: 'Fred',
  radar: 'Ricky',
  forge: 'Tom',
  voice: 'Sam',
};

// The intended daily cascade, in order. Matched on topic first, worker second —
// a worker may publish before topic conventions settle, and a half-labelled
// signal is still evidence the stage happened.
const CASCADE = [
  { stage: 'pain/trend found', who: 'Ricky', topic: /^(pain|trend):/i, worker: 'radar' },
  { stage: 'ICP validated', who: 'Ian', topic: /^(icp|cohort|client|sourcing|segment):/i, worker: 'scout' },
  { stage: 'query gap found', who: 'Ricky', topic: /^seo:/i, worker: 'radar' },
  { stage: 'draft written', who: 'Sam', topic: /^content:/i, worker: 'voice' },
];

const FLAG_COOLDOWN_H = 20; // don't re-poke AJ about the same thing inside a day
const BRIEF_SOFT_LIMIT = 1600; // chars — above this it stops being phone-readable

const who = (k) => TEAM[k] || k || 'unknown';

const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'item';

const hoursSince = (t) => {
  const ms = Date.now() - new Date(t).getTime();
  return Number.isFinite(ms) ? ms / 3.6e6 : null;
};

const ago = (t) => {
  const h = hoursSince(t);
  if (h == null) return 'unknown time';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const sydneyDate = (d = new Date()) => {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const sortAsc = (rows) =>
  [...rows].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

function traceCascade(rows) {
  const asc = sortAsc(rows);
  const hits = [];
  let from = 0;
  for (const step of CASCADE) {
    const idx = asc.findIndex(
      (s, i) => i >= from && (step.topic.test(s.topic || '') || s.worker_key === step.worker)
    );
    if (idx === -1) break;
    hits.push({ ...step, signal: asc[idx] });
    from = idx + 1;
  }
  if (!hits.length) return 'Cascade: did not start — nothing from Ricky in this window.';
  const done = hits.map((h) => `${h.who} (${h.stage})`).join(' → ');
  const stalled = CASCADE[hits.length];
  return hits.length === CASCADE.length
    ? `Cascade: complete — ${done}.`
    : `Cascade: ${done} — stopped before ${stalled.who} (${stalled.stage}).`;
}

export default {
  key: 'queen',
  model: 'claude-opus-5', // the one daily brief AJ reads earns the premium tier
  name: 'George',
  emoji: '👑',
  title: 'GM',

  brief: `You are George, GM of the Design Bees hive — an Australian design-subscription agency run by AJ. Your teammates are Ian (ICP and sourcing), Fred (finance), Ricky (research), Tom (platform and tools) and Sam (content); you own the relationship with AJ, and you are the only one who messages him unprompted. You are a synthesiser, not a sixth analyst: you never run your own research, you read what the hive wrote and tell AJ what it means and what it changes. Evidence rule, absolute: you only report what is present in the signals and knowledge you were given — never invent, extrapolate or round a number, a client name or a result, and if a figure is not in a signal you say the hive does not have it. If the hive did nothing, you say the hive did nothing in one line; padding a quiet day with restated old facts is the single worst thing you can do. AJ is time-poor and has told you directly that slow, noisy output is worse than none — so cut every sentence that does not change a decision, name the teammate behind each claim, and lead with the thing he has to act on. Interrupt him between briefs only when a human is genuinely required: a draft awaiting approval, two teammates contradicting each other, a request blocked on credits or access, or a revenue anomaly — check what is already flagged before you flag again. Telegram markdown only: single *asterisks* for bold, never double.`,

  subscribes: ['*'],
  emits: ['brief:daily', 'attention:needed', 'decision:logged'],
  useWebSearch: false,

  tools: [
    {
      name: 'review_signals',
      description:
        'Read what the hive actually did. Returns recent signals across all workers in time order, grouped by teammate, plus a trace of whether the daily cascade (Ricky → Ian → Ricky judges queries → Sam) completed or where it stopped. This is your primary input — call it before writing anything.',
      input_schema: {
        type: 'object',
        properties: {
          hours: { type: 'number', description: 'Look-back window in hours (default 24, max 168).' },
          worker_key: {
            type: 'string',
            description: 'Optional: limit to one teammate — scout, ledger, radar, forge, voice.',
          },
          topic_prefix: {
            type: 'string',
            description: 'Optional: only topics starting with this, e.g. "pain:" or "content:".',
          },
        },
      },
    },
    {
      name: 'check_open_items',
      description:
        'List what is already sitting with AJ: open flags you raised earlier and decisions he has already made. Call this BEFORE flagging anything, so you never poke him twice about the same thing, and before the morning brief so you can chase what is still unanswered.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'flag_for_aj',
      description:
        'Surface one thing that genuinely needs a human decision — a draft awaiting approval, a contradiction between teammates, work blocked on credits or access, a revenue anomaly. Sends a Telegram message immediately, so use it sparingly and never for information AJ can read in the morning brief. Suppressed automatically if the same key was flagged in the last 20 hours.',
      input_schema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Short stable id for this issue, e.g. "sam-draft-approval" — used to de-duplicate.',
          },
          headline: { type: 'string', description: 'One line: what the issue is.' },
          why_now: {
            type: 'string',
            description: 'The evidence, naming the teammate and the signal it came from.',
          },
          decision_needed: {
            type: 'string',
            description: 'The specific call you are asking AJ to make. Must be answerable in one reply.',
          },
        },
        required: ['headline', 'why_now', 'decision_needed'],
      },
    },
    {
      name: 'resolve_flag',
      description:
        'Close an open flag once AJ has answered it or it has gone stale, so it stops appearing in your open items and in the brief.',
      input_schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'The flag key from check_open_items.' },
          outcome: { type: 'string', description: 'What happened — his answer, or why it no longer matters.' },
        },
        required: ['key'],
      },
    },
    {
      name: 'publish_brief',
      description:
        'Send the morning brief to AJ and record it. Pass the finished text exactly as he should read it — this tool does no formatting or editing. Use quiet:true when the honest answer is that nothing meaningful happened.',
      input_schema: {
        type: 'object',
        properties: {
          brief: { type: 'string', description: 'The full brief text, Telegram markdown, single asterisks.' },
          headline: { type: 'string', description: 'One-line summary for the signal log.' },
          quiet: { type: 'boolean', description: 'True if this is a "nothing happened" brief.' },
        },
        required: ['brief'],
      },
    },
    {
      name: 'log_decision',
      description:
        'Record a decision or standing instruction AJ has given, so the hive stops re-asking and other teammates can act on it. Only log what he actually said.',
      input_schema: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'What the decision is about, e.g. "content approval".' },
          decision: { type: 'string', description: "AJ's call, in his terms." },
          context: { type: 'string', description: 'Optional: what prompted it.' },
        },
        required: ['subject', 'decision'],
      },
    },
  ],

  handlers: {
    review_signals: async (input = {}, ctx) => {
      try {
        const hours = Math.min(Math.max(Number(input.hours) || 24, 1), 168);
        const all = (await ctx.recentSignals(hours)) || [];
        let rows = all.filter((s) => s && s.worker_key !== ctx.workerKey);
        if (input.worker_key) rows = rows.filter((s) => s.worker_key === input.worker_key);
        if (input.topic_prefix) {
          const p = String(input.topic_prefix).toLowerCase();
          rows = rows.filter((s) => String(s.topic || '').toLowerCase().startsWith(p));
        }
        if (!rows.length) {
          return `No signals from the hive in the last ${hours}h${
            input.worker_key || input.topic_prefix ? ' matching that filter' : ''
          }. Nothing happened — report exactly that, do not fill the space.`;
        }

        const byWorker = new Map();
        for (const s of sortAsc(rows)) {
          if (!byWorker.has(s.worker_key)) byWorker.set(s.worker_key, []);
          byWorker.get(s.worker_key).push(s);
        }
        const blocks = [...byWorker.entries()].map(([k, list]) => {
          const lines = list.map((s) => {
            const bits = [
              `- [${ago(s.created_at)}] ${s.kind || 'finding'}`,
              s.topic ? `(${s.topic})` : '',
              s.confidence && s.confidence !== 'fact' ? `[${s.confidence}]` : '',
              `${clip(s.title, 160)}`,
            ].filter(Boolean);
            const body = s.body ? `\n    ${clip(s.body, 320)}` : '';
            return `${bits.join(' ')}${body}`;
          });
          return `${who(k)} (${k}) — ${list.length} signal${list.length === 1 ? '' : 's'}\n${lines.join('\n')}`;
        });

        return [
          `${rows.length} signals from ${byWorker.size} teammate${byWorker.size === 1 ? '' : 's'} in the last ${hours}h.`,
          traceCascade(rows),
          '',
          blocks.join('\n\n'),
        ].join('\n');
      } catch (e) {
        return `Could not read signals (${e.message}). Do not guess what the hive did — tell AJ the signal log was unreadable this morning.`;
      }
    },

    check_open_items: async (_input = {}, ctx) => {
      try {
        // No .catch here: a dead read must surface as "unknown", never as "nothing open".
        const [flags, decisions] = await Promise.all([
          ctx.allKnowledge('hive_flag'),
          ctx.allKnowledge('hive_decision'),
        ]);
        const open = (flags || [])
          .map((r) => ({ key: r.entity_key, ...(r.data || {}), updated_at: r.updated_at }))
          .filter((f) => f.status !== 'resolved')
          .sort((a, b) => new Date(b.flagged_at || 0) - new Date(a.flagged_at || 0));
        const recent = (decisions || [])
          .map((r) => ({ key: r.entity_key, ...(r.data || {}) }))
          .sort((a, b) => new Date(b.decided_at || 0) - new Date(a.decided_at || 0))
          .slice(0, 8);

        const flagText = open.length
          ? open
              .map(
                (f) =>
                  `- ${f.key} — ${clip(f.headline, 120)} (raised ${ago(f.flagged_at)})\n    asked: ${clip(
                    f.decision_needed,
                    140
                  )}`
              )
              .join('\n')
          : '- none';
        const decText = recent.length
          ? recent.map((d) => `- ${d.subject || d.key}: ${clip(d.decision, 140)} (${ago(d.decided_at)})`).join('\n')
          : '- none recorded';

        return `Open flags with AJ (${open.length}):\n${flagText}\n\nDecisions already made:\n${decText}\n\nDo not re-raise anything above; chase it instead, or resolve it if it is answered or stale.`;
      } catch (e) {
        return `Could not read open items (${e.message}). Assume something may already be with AJ and be conservative about flagging.`;
      }
    },

    flag_for_aj: async (input = {}, ctx) => {
      try {
        const headline = String(input.headline || '').trim();
        const decision = String(input.decision_needed || '').trim();
        if (!headline || !decision) return 'Not sent: a flag needs both a headline and a specific decision for AJ.';

        const key = slug(input.key || headline);
        // Unguarded on purpose: if we cannot check for a prior flag, we must not
        // risk notifying AJ twice — let the outer catch abort the send.
        const prior = await ctx.getKnowledge('hive_flag', key);
        const priorData = prior?.data || {};
        if (prior && priorData.status !== 'resolved') {
          const h = hoursSince(priorData.flagged_at || prior.updated_at);
          if (h != null && h < FLAG_COOLDOWN_H) {
            return `Not sent — "${key}" was already flagged ${ago(
              priorData.flagged_at || prior.updated_at
            )} and is still open. Carry it in the morning brief instead of poking him again.`;
          }
        }

        const flaggedAt = new Date().toISOString();
        const source = { tool: 'queen:flag_for_aj', basis: clip(input.why_now, 400), flaggedAt };
        await ctx.saveKnowledge({
          entity_type: 'hive_flag',
          entity_key: key,
          data: {
            headline,
            why_now: input.why_now || null,
            decision_needed: decision,
            status: 'open',
            flagged_at: flaggedAt,
            times_raised: (priorData.times_raised || 0) + 1,
          },
          source,
          worker_key: ctx.workerKey,
        });

        const text =
          `👑 *Needs you* — ${headline}\n\n` +
          (input.why_now ? `${input.why_now}\n\n` : '') +
          `*Decision:* ${decision}`;
        await ctx.notify(text);
        await ctx.publish({
          topic: 'attention:needed',
          title: headline,
          body: `${input.why_now || ''}\nDecision needed: ${decision}`.trim(),
          data: { key, decision_needed: decision },
          confidence: 'fact',
        });
        return `Flagged "${key}" and sent to AJ. Do not raise it again until he answers or it goes stale.`;
      } catch (e) {
        return `Flag failed to send (${e.message}). It is not with AJ — carry it into the morning brief.`;
      }
    },

    resolve_flag: async (input = {}, ctx) => {
      try {
        const key = slug(input.key);
        const prior = await ctx.getKnowledge('hive_flag', key);
        if (!prior) return `No open flag called "${key}" — check_open_items lists the real keys.`;
        await ctx.saveKnowledge({
          entity_type: 'hive_flag',
          entity_key: key,
          data: {
            status: 'resolved',
            outcome: input.outcome || 'closed without a recorded outcome',
            resolved_at: new Date().toISOString(),
          },
          source: { tool: 'queen:resolve_flag', outcome: clip(input.outcome, 300) },
          worker_key: ctx.workerKey,
        });
        return `Closed "${key}". It will not appear in your open items again.`;
      } catch (e) {
        return `Could not close that flag (${e.message}) — it stays open, which is the safe failure.`;
      }
    },

    publish_brief: async (input = {}, ctx) => {
      try {
        const brief = String(input.brief || '').trim();
        if (!brief) return 'Nothing sent: publish_brief needs the finished brief text.';
        const headline = clip(input.headline || brief.split('\n')[0], 160);

        await ctx.notify(brief);
        await ctx.publish({
          topic: 'brief:daily',
          title: headline,
          body: brief.replace(/\*/g, ''),
          data: { quiet: Boolean(input.quiet), chars: brief.length, date: sydneyDate() },
          confidence: 'fact',
        });
        await ctx
          .saveKnowledge({
            entity_type: 'hive_brief',
            entity_key: new Date().toISOString().slice(0, 10),
            data: { headline, quiet: Boolean(input.quiet), sent_at: new Date().toISOString() },
            source: { tool: 'queen:publish_brief', chars: brief.length },
            worker_key: ctx.workerKey,
          })
          .catch(() => {});

        return brief.length > BRIEF_SOFT_LIMIT
          ? `Brief sent (${brief.length} chars — longer than AJ will read on a phone; cut it harder tomorrow).`
          : 'Brief sent.';
      } catch (e) {
        return `Brief did not send (${e.message}). Do not retry with a different version — say so and stop.`;
      }
    },

    log_decision: async (input = {}, ctx) => {
      try {
        const subject = String(input.subject || '').trim();
        const decision = String(input.decision || '').trim();
        if (!subject || !decision) return 'Not logged: a decision needs both a subject and what AJ actually decided.';
        const key = slug(subject);
        const decidedAt = new Date().toISOString();
        await ctx.saveKnowledge({
          entity_type: 'hive_decision',
          entity_key: key,
          data: { subject, decision, context: input.context || null, decided_at: decidedAt, by: 'AJ' },
          source: { tool: 'queen:log_decision', context: clip(input.context, 300), decidedAt },
          worker_key: ctx.workerKey,
        });
        await ctx
          .publish({
            topic: 'decision:logged',
            title: `AJ decided: ${clip(subject, 100)}`,
            body: decision,
            data: { key, subject },
            confidence: 'fact',
          })
          .catch(() => {});
        return `Logged "${key}". The hive should stop asking about it.`;
      } catch (e) {
        return `Could not log that decision (${e.message}) — do not treat it as remembered.`;
      }
    },
  },

  daily: {
    hourSydney: 8,
    prompt: `Write AJ's morning brief.

1. Call check_open_items, then review_signals with hours 24. Those two results are the only material you may use. Anything not in them does not exist.
2. Decide whether anything meaningful actually happened. A teammate re-running a routine job and finding nothing new is not news.
3. Call publish_brief once with the finished text. Do not send anything else.

If nothing meaningful happened, the entire brief is one or two lines — for example: "👑 *Morning brief* — Sun 26 Jul" on the first line, then "Quiet night: Ricky and Fred ran, nothing new worth your time." Set quiet:true. Never pad a quiet day.

Otherwise use this shape, dropping any section that would be empty:

👑 *Morning brief* — <Sydney date>

*What happened:* one or two sentences on the substance, not the activity.

*Learned:*
• <finding> — <teammate>
• <finding> — <teammate>

*Cascade:* one line — did it complete, or where did it stop and why does that matter.

*Needs you:*
• <the decision, phrased so he can answer in one reply>

Rules for the text itself: single *asterisks* for bold, never double. Every claim names the teammate it came from. Every number is copied exactly from a signal — if a figure is not in one, do not use one. Maximum two items under "Needs you"; if there are more, pick the two that cost the most to delay and leave the rest. Carry any still-open flag from check_open_items into "Needs you" rather than sending a separate message. Keep the whole thing under a phone screen — if it needs scrolling, it is too long.`,
  },
};
