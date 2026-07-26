// The hive's nervous system.
//
// A worker publishes a signal on a topic; every worker subscribed to that topic
// gets a job; running a job can publish further signals. That loop is what turns
// six separate reporters into a team where one teammate's finding makes the next
// one go and look. Depth is capped so a cascade converges instead of ringing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { query as _q } from './db.js';
import { writeSignal, saveKnowledge, getKnowledge, allKnowledge, askQuestion, getSetting, setSetting } from './brain.js';
import { applyKnowledge } from './wix.js';
import { send } from './telegram.js';
import { approveUrl } from './dashboard-link.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
// Model tiering (AJ, after the first Opus-priced day emptied the API credit):
// routine background work — scans, validations, health checks — runs on the
// Sonnet tier; a spec that genuinely needs top-tier judgment (Sam writing
// customer-facing copy, George synthesising the brief) opts up with
// `model: PREMIUM_MODEL` in its spec. Same evidence rules either way.
const DEFAULT_MODEL = 'claude-sonnet-5';
export const PREMIUM_MODEL = 'claude-opus-5';
const MAX_DEPTH = 3;        // a finding may cascade at most three hops
const MAX_JOBS_PER_TICK = 4;
// The longest a single teammate update may be in Telegram. Long enough for a
// headline and the reason it matters; far too short to paste a blog post into.
const NOTIFY_MAX = 600;
// Background work runs by default (AJ's call, 2026-07-26) — HIVE_AUTORUN=0
// turns it off. The cost controls that made this safe to switch back on are
// the reply gate and the quiet window below, not the off switch.
export function autorunEnabled() {
  return process.env.HIVE_AUTORUN !== '0';
}
// The hive speaks once, then waits. Nothing else is sent until AJ has replied —
// his answer usually removes the need for the next message anyway.
export async function awaitingReply() {
  return Boolean(await getSetting('hive_awaiting_reply'));
}
// When AJ replies, jobs resume immediately but the NEXT outbound message holds
// for five minutes. That window is how his one answer reaches all six teammates
// before anyone can ask a follow-up — the queued jobs run against the updated
// question log first, and whatever still needs saying goes out as one message
// after the window closes.
const QUIET_MS = 5 * 60 * 1000;
export async function clearAwaitingReply() {
  await setSetting('hive_awaiting_reply', '');
  await setSetting('hive_quiet_until', String(Date.now() + QUIET_MS));
}
async function quietUntil() {
  return Number(await getSetting('hive_quiet_until')) || 0;
}
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// --- Spec registry -----------------------------------------------------------
const specs = new Map();

export async function loadSpecs() {
  const dir = path.join(__dir, 'workers', 'specs');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  } catch {
    return specs; // no specs yet — the hive still runs, it just doesn't cascade
  }
  for (const f of files) {
    try {
      const mod = await import(path.join(dir, f));
      const spec = mod.default;
      if (spec?.key) specs.set(spec.key, spec);
      else console.error(`[bus] ${f} has no default export with a key`);
    } catch (err) {
      console.error(`[bus] failed to load ${f}:`, err.message);
    }
  }
  console.log(
    `[bus] ${specs.size} teammates online: ${allSpecs().map((s) => `${s.name} (${s.title})`).join(', ')}`
  );
  return specs;
}

export function getSpec(key) {
  return specs.get(key);
}
export function allSpecs() {
  return [...specs.values()];
}

// --- Topic matching ----------------------------------------------------------
// 'pain:*' matches 'pain:industry=construction'; '*' matches everything.
export function topicMatches(pattern, topic) {
  if (!pattern || !topic) return false;
  if (pattern === '*') return true;
  if (pattern === topic) return true;
  if (pattern.endsWith(':*')) return topic.startsWith(pattern.slice(0, -1));
  if (pattern.endsWith('*')) return topic.startsWith(pattern.slice(0, -1));
  return false;
}

function subscribersOf(topic, exceptKey) {
  return allSpecs().filter(
    (s) => s.key !== exceptKey && (s.subscribes || []).some((p) => topicMatches(p, topic))
  );
}

// --- Publishing --------------------------------------------------------------
/**
 * Record a finding and wake whoever cares about it. Returns the created signal.
 * `depth` carries the cascade position so a chain terminates.
 */
export async function publish({ worker_key, topic, title, body, data, confidence = 'hypothesis', source, depth = 0 }) {
  const sig = await writeSignal({
    worker_key,
    kind: 'finding',
    title,
    body: body || '',
    confidence,
    source: source || { tool: `hive:${worker_key}`, topic, at: new Date().toISOString() },
  });
  if (topic) {
    await _q(`UPDATE signals SET topic = $1 WHERE id = $2`, [topic, sig.id]);
  }

  if (depth >= MAX_DEPTH) {
    console.log(`[bus] ${topic} reached max depth ${MAX_DEPTH} — not cascading further`);
    return sig;
  }

  const subs = subscribersOf(topic, worker_key);
  for (const s of subs) {
    await _q(
      `INSERT INTO jobs (worker_key, trigger_signal_id, topic, prompt, depth)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        s.key,
        sig.id,
        topic,
        `${title}\n\n${body || ''}${data ? `\n\nData: ${JSON.stringify(data)}` : ''}`,
        depth + 1,
      ]
    );
  }
  if (subs.length) {
    console.log(`[bus] ${worker_key} published ${topic} → woke ${subs.map((s) => s.name).join(', ')}`);
  }
  return sig;
}

// --- What AJ has already been asked -----------------------------------------
// Questions are hive-wide, not per-worker. Without this, three teammates ask the
// same thing in a row and a fourth re-asks something AJ already answered to
// someone else — which is exactly what happened on the first real run.
// Facts AJ has stated. Loaded once — these are settled, and a worker asking
// about them again wastes his time. He should never have to say a thing twice.
let _facts;
export function settledFacts() {
  if (_facts !== undefined) return _facts;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dir, 'data', 'facts.json'), 'utf8'));
    _facts = (raw.facts || []).map((f) => `- ${f.topic}: ${f.fact}`).join('\n');
  } catch {
    _facts = '';
  }
  return _facts;
}

async function questionLog() {
  const r = await _q(
    `SELECT worker_key, question, status, answer, asked_at
       FROM questions WHERE asked_at > now() - interval '7 days'
      ORDER BY asked_at DESC LIMIT 40`
  );
  return r.rows;
}

const stop = new Set(['the','a','an','is','was','were','of','to','for','and','or','in','on','it','that','this','with','did','do','does','be','been','are','as','at','by','from','he','she','they','you','i','we','what','why','how','when','who','which','their','his','her']);
function keywords(text) {
  return new Set(
    String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w))
      // crude singularise so "3 months" matches "3 month"
      .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
  );
}
/** Rough overlap — enough to catch "why did X churn" asked three ways. */
function similar(a, b) {
  const A = keywords(a), B = keywords(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit += 1;
  return hit / Math.min(A.size, B.size);
}

// --- Outbox -----------------------------------------------------------------
// Six teammates each posting their own updates and questions turned into a wall
// of notifications. Everything a tick produces is collected here and sent as a
// single message instead.
let outbox = [];
function queueOut(line) {
  outbox.push(line);
}
async function flushOutbox() {
  if (!outbox.length) return;
  // Inside the quiet window the outbox holds: jobs keep running and their
  // output accumulates here, then goes out as one message once the window
  // closes. Sending early would defeat the point of the window.
  if (Date.now() < (await quietUntil())) {
    console.log(`[bus] holding ${outbox.length} update(s) — quiet window after AJ's reply`);
    return;
  }
  const body = outbox.join('\n\n');
  // Do NOT clear the outbox until the send succeeds. A failed send used to
  // discard the text AND still set the awaiting-reply flag, which left the hive
  // holding every job while waiting for a reply to a message AJ never received.
  // That deadlock is silent and only visible in the logs, so: keep the content,
  // and only stop work if AJ actually has something to reply to.
  try {
    await send(body);
  } catch (err) {
    console.error(`[bus] flush FAILED, keeping ${outbox.length} update(s) for the next tick:`, err.message);
    return; // outbox intact, awaiting_reply not set — work continues
  }
  outbox = [];
  await setSetting('hive_awaiting_reply', new Date().toISOString());
  console.log('[bus] message sent — holding all work until AJ replies');
}

// --- The context every worker gets ------------------------------------------
function buildCtx(spec, depth) {
  return {
    workerKey: spec.key,
    saveKnowledge: async (args) => {
      const row = await saveKnowledge({ worker_key: spec.key, ...args });
      applyKnowledge(await allKnowledge()); // usable immediately, not after a restart
      return row;
    },
    getKnowledge,
    allKnowledge,
    publish: (args) => publish({ worker_key: spec.key, depth, ...args }),
    requestData: async ({ what, source, why }) =>
      publish({
        worker_key: spec.key,
        topic: `request:${source || 'any'}`,
        title: `Needs data: ${what}`,
        body: `Source: ${source}\nWhy: ${why}`,
        confidence: 'unknown',
        depth,
      }),
    recentSignals: async (hours = 24) => {
      const r = await _q(
        `SELECT worker_key, kind, title, body, topic, confidence, source, created_at
           FROM signals WHERE created_at > now() - ($1 || ' hours')::interval
          ORDER BY created_at DESC LIMIT 200`,
        [String(hours)]
      );
      return r.rows;
    },
    // Telegram is a notification channel, not a reading surface. A teammate who
    // pastes a draft into the thread has put the decision in the wrong place —
    // the work belongs on the dashboard, where the case, the evidence and the
    // approve buttons sit, and the thread should only say "go and look". The
    // briefs asked for this and were ignored, so it is enforced here instead.
    notify: async (text) => {
      const t = String(text || '').trim();
      if (!t) return 'Nothing to send.';
      if (t.length <= NOTIFY_MAX) {
        queueOut(`${spec.emoji} *${spec.name}*\n${t}`);
        return 'Sent to the thread.';
      }
      const head = t.slice(0, NOTIFY_MAX).replace(/\s+\S*$/, '');
      queueOut(`${spec.emoji} *${spec.name}*\n${head}…\n\nThe rest is on the dashboard: ${approveUrl()}`);
      return (
        `That was ${t.length} characters — the thread carries a headline, not the work. It was trimmed to ` +
        `${NOTIFY_MAX} and pointed at the dashboard. Anything AJ has to read properly (a draft, a case, a ` +
        `table) goes to the dashboard via the right tool; notify() tells him it is there and why it matters.`
      );
    },
    askAJ: async ({ question, why, assumption }) => {
      const log = await questionLog();

      // Already answered — to anyone. Hand back the answer instead of re-asking.
      const answered = log.find((q) => q.status === 'answered' && q.answer && similar(question, q.question) >= 0.45);
      if (answered) {
        return `AJ has already answered this. He said: "${answered.answer}". Use that and carry on — do not ask again.`;
      }

      // Already open — from anyone. Don't queue a duplicate.
      const pending = log.find((q) => q.status === 'open' && similar(question, q.question) >= 0.45);
      if (pending) {
        const who = getSpec(pending.worker_key)?.name || pending.worker_key;
        return `${who} has already asked AJ this and is waiting. Don't ask again and don't say you're blocked — ` +
          `record what the evidence plainly supports, leave the uncertain part unrecorded, and finish your work.`;
      }

      // One question at a time, hive-wide, then everything waits for an answer.
      if (log.some((q) => q.status === 'open')) {
        return 'A question is already waiting with AJ. Do not ask another. Record what the evidence ' +
          'plainly supports, leave the uncertain part out, and finish.';
      }
      await askQuestion({ worker_key: spec.key, question });
      queueOut(
        `❓ *${spec.name}* — ${question}` +
          (assumption ? `\n_Otherwise I'll assume:_ ${assumption}` : '')
      );

      return 'Asked AJ — he answers everything, in his own time. Do NOT wait, do NOT ask again, and do NOT ' +
        'report yourself as blocked. Record what the evidence plainly supports, leave the uncertain part out, ' +
        'and finish the rest of your work now.';
    },
  };
}

// --- Running one job ---------------------------------------------------------
const WEB_SEARCH = { type: 'web_search_20260209', name: 'web_search' };

/**
 * Strip server-side tool calls that never produced a result in the same turn.
 *
 * When a teammate calls web_search and one of their own tools in the same turn,
 * the search can still be in flight when the turn comes back. Handing that
 * unfinished call back to the API is what killed jobs with "container_id is
 * required when there are pending tool uses generated by code execution" — and
 * a killed job means the draft AJ was waiting on never reaches the dashboard.
 * Completed searches keep their results; only the pending stub is dropped.
 */
function settled(content) {
  const done = new Set(content.filter((b) => b.tool_use_id).map((b) => b.tool_use_id));
  return content.filter((b) => b.type !== 'server_tool_use' || done.has(b.id));
}

// Every worker can check with AJ. Records are cheap to write and expensive to
// unpick — a wrong interpretation stored as fact quietly poisons everything
// downstream, so the cost of asking is far lower than the cost of assuming.
const ASK_AJ = {
  name: 'ask_aj',
  description:
    'Ask AJ to confirm before you record an interpretation the hive will act on. Use it whenever the ' +
    'evidence supports more than one reading and the readings would lead to different decisions — ' +
    'why a client left, whether an engagement was always meant to be short, whether a demo converted, ' +
    'what someone actually meant. He answers in Telegram. Asking is cheap; a wrong fact recorded as ' +
    'true is expensive and spreads.',
  input_schema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The specific question, with the evidence you are working from.' },
      assumption: { type: 'string', description: "What you would conclude if he doesn't correct you." },
      why: { type: 'string', description: 'What changes depending on his answer.' },
    },
    required: ['question'],
  },
};

async function runJob(job) {
  const spec = getSpec(job.worker_key);
  if (!spec) throw new Error(`no spec for ${job.worker_key}`);
  if (!client) throw new Error('ANTHROPIC_API_KEY not set');

  const ctx = buildCtx(spec, job.depth || 0);
  const tools = [...(spec.tools || []), ASK_AJ];
  if (spec.useWebSearch) tools.push(WEB_SEARCH);

  // Answers AJ gave anyone belong to everyone; open questions stop a second
  // teammate asking the same thing while the first is still waiting.
  const qlog = await questionLog().catch(() => []);
  const answered = qlog.filter((q) => q.status === 'answered' && q.answer);
  const open = qlog.filter((q) => q.status === 'open');
  const facts = settledFacts();
  const qa =
    (facts
      ? `\n\n# Settled facts about Design Bees — AJ has stated these\nTreat every one as true. Never ask about them, never contradict them, never re-derive them from data.\n${facts}`
      : '') +
    (answered.length
      ? `\n\n# What AJ has already told the team\nTreat these as settled — never ask them again.\n` +
        answered.map((q) => `- Q (${getSpec(q.worker_key)?.name || q.worker_key}): ${q.question}\n  A: ${q.answer}`).join('\n')
      : '') +
    (open.length
      ? `\n\n# Already asked, awaiting AJ\nDo not re-ask these or anything close to them, and do not report yourself blocked by them.\n` +
        open.map((q) => `- ${getSpec(q.worker_key)?.name || q.worker_key}: ${q.question}`).join('\n')
      : '');

  const system =
    `You are ${spec.name}, ${spec.title} at Design Bees, an Australian design subscription agency.\n\n` +
    `${spec.brief}\n\n` +
    `You are running as a background teammate, not in a chat — AJ is not watching. ` +
    `Do the work with your tools rather than describing what you would do.\n\n` +
    `EVIDENCE RULE: never state a number, name, company or result you cannot point to a source for. ` +
    `Record what you learn so the rest of the hive gets it. If you lack something, use your data-request tool ` +
    `rather than guessing or giving up.\n\n` +
    `CONFIRM BEFORE YOU CONCLUDE: a transcript or a number tells you what happened, not why. If a piece ` +
    `of evidence supports more than one reading, and those readings would lead the hive to target, message ` +
    `or price differently, use ask_aj before you record it. A worked example: a client whose retainer ended ` +
    `reads like churn, when in fact AJ deliberately signed them for three months to deliver one project and ` +
    `the final call was him trying to extend it. Recording that as "lost on budget" would have been wrong ` +
    `and would have skewed everything built on top. Record what you can see; ask about what you are inferring.\n` +
    `Calibrate it though — do NOT ask about things the evidence states plainly. If someone says outright ` +
    `why they didn't buy, record it and move on. Ask only when you are filling a gap the evidence leaves ` +
    `open: an outcome that isn't stated, a reason you are guessing at, an engagement whose shape you can't ` +
    `tell from the call alone. One good question beats five obvious ones — AJ is time-poor and being asked ` +
    `to confirm the obvious is worse than not asking at all.\n\n` +
    `When you find something another teammate should act on, publish it — that is how the hive compounds.\n\n` +
    `NEVER report yourself as blocked or held up waiting on AJ. He answers every question, in his own ` +
    `time, and a pending answer is not a reason to stop. Do the parts you can, leave the uncertain part ` +
    `unrecorded, and finish. Asking the same thing twice — or asking what a teammate has already asked — ` +
    `wastes his time and is worse than not asking.\n\n` +
    `Finish with two or three sentences on what you actually did and what you found.` + qa;

  const messages = [{ role: 'user', content: job.prompt }];
  let text = '';
  // The server-side web-search tool runs in a container; once a response has
  // used it, every follow-up request in the same conversation must name that
  // container or the API rejects the turn ("container_id is required...").
  let container = null;

  for (let turn = 0; turn < 8; turn++) {
    const res = await client.messages.create({
      model: spec.model || DEFAULT_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system,
      tools,
      messages,
      ...(container ? { container } : {}),
    });
    if (res.container?.id) container = res.container.id;
    text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    // pause_turn: the server-side search is mid-flight. Hand the turn straight
    // back so it can finish, rather than ending the job on a half-thought.
    if (res.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: settled(res.content) });
      continue;
    }
    if (res.stop_reason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: settled(res.content) });
    const results = [];
    for (const c of res.content.filter((b) => b.type === 'tool_use')) {
      const fn = c.name === 'ask_aj' ? (i) => ctx.askAJ(i) : spec.handlers?.[c.name];
      let out;
      try {
        out = fn ? await fn(c.input, ctx) : `No handler for ${c.name}`;
      } catch (err) {
        out = `Tool ${c.name} failed: ${err.message}`;
      }
      results.push({ type: 'tool_result', tool_use_id: c.id, content: String(out).slice(0, 8000) });
    }
    if (!results.length) break;
    messages.push({ role: 'user', content: results });
  }
  return text || '(no output)';
}

// --- The tick ----------------------------------------------------------------
export async function processJobs(limit = MAX_JOBS_PER_TICK) {
  if (!client || !specs.size) return 0;
  if (!autorunEnabled()) return 0;                 // stopped by default
  if (await awaitingReply()) return 0;             // said our piece; waiting on AJ
  let done = 0;
  for (let i = 0; i < limit; i++) {
    // Claim one job atomically so overlapping ticks can't double-run it. A
    // re-queued job waits for a fresh tick (started_at check) so retries get
    // the 3-minute spacing instead of hammering a struggling API.
    //
    // ORDERING MATTERS: what AJ asked for directly ('manual') goes first, then
    // the standing daily work, then everything else oldest-first. Without this,
    // a burst of cascade jobs buries a direct request behind them — which is
    // exactly what happened when he asked for proposals and waited half an hour
    // while George worked through a backlog of feed signals.
    const claim = await _q(
      `UPDATE jobs SET status = 'running', started_at = now()
        WHERE id = (SELECT id FROM jobs WHERE status = 'pending'
                     ORDER BY (topic = 'manual') DESC, (topic = 'daily') DESC, created_at
                     LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING *`
    );
    const job = claim.rows[0];
    if (!job) break;

    try {
      const result = await runJob(job);
      await _q(`UPDATE jobs SET status='done', result=$1, finished_at=now() WHERE id=$2`, [result, job.id]);
      console.log(`[bus] ${job.worker_key} finished job ${job.id} (${job.topic || 'direct'})`);
    } catch (err) {
      // Transient API failures re-queue instead of dying: empty credit,
      // overload and rate limits all clear on their own, and the 3-minute tick
      // spacing is the backoff. Three strikes and it's a real failure.
      const msg = String(err.message || err);
      const transient =
        /credit balance is too low|overloaded|rate.?limit|529|429|(?:^|\D)50[023](?:\D|$)/i.test(msg);
      const attempts = (job.attempts || 0) + 1;
      if (transient && attempts < 3) {
        await _q(`UPDATE jobs SET status='pending', attempts=$1, error=$2, started_at=NULL WHERE id=$3`, [
          attempts,
          `retryable (attempt ${attempts}): ${msg.slice(0, 300)}`,
          job.id,
        ]);
        console.warn(`[bus] job ${job.id} (${job.worker_key}) re-queued after transient error (attempt ${attempts}): ${msg.slice(0, 120)}`);
        break; // API is unhappy — stop this tick rather than burning through the queue
      } else {
        await _q(`UPDATE jobs SET status='failed', attempts=$1, error=$2, finished_at=now() WHERE id=$3`, [
          attempts,
          msg,
          job.id,
        ]);
        console.error(`[bus] job ${job.id} (${job.worker_key}) failed:`, msg);
      }
    }
    done += 1;
  }
  await flushOutbox(); // one message for the whole tick, not one per teammate
  return done;
}

/** Queue a worker's standing daily task. */
export async function queueDaily(hourSydney) {
  for (const spec of allSpecs()) {
    if (!spec.daily || spec.daily.hourSydney !== hourSydney) continue;
    const recent = await _q(
      `SELECT 1 FROM jobs WHERE worker_key=$1 AND topic='daily'
        AND created_at > now() - interval '20 hours' LIMIT 1`,
      [spec.key]
    );
    if (recent.rows[0]) continue;
    await _q(`INSERT INTO jobs (worker_key, topic, prompt, depth) VALUES ($1,'daily',$2,0)`, [
      spec.key,
      spec.daily.prompt,
    ]);
    console.log(`[bus] queued daily for ${spec.name}`);
  }
}

/** Kick a worker by hand — used by Telegram commands. */
export async function queueJob(workerKey, prompt) {
  const r = await _q(
    `INSERT INTO jobs (worker_key, topic, prompt, depth) VALUES ($1,'manual',$2,0) RETURNING id`,
    [workerKey, prompt]
  );
  return r.rows[0];
}
