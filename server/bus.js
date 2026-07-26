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
import { writeSignal, saveKnowledge, getKnowledge, allKnowledge, askQuestion } from './brain.js';
import { applyKnowledge } from './wix.js';
import { send } from './telegram.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const MODEL = 'claude-opus-5';
const MAX_DEPTH = 3;        // a finding may cascade at most three hops
const MAX_JOBS_PER_TICK = 4;
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
    notify: (text) => send(text, { worker: { key: spec.key, name: spec.name, emoji: spec.emoji } }),
    askAJ: async ({ question, why, assumption }) => {
      await askQuestion({ worker_key: spec.key, question });
      await send(
        `❓ *${spec.name}* needs a steer before recording this:\n\n${question}` +
          (assumption ? `\n\n_What I'd otherwise assume:_ ${assumption}` : '') +
          (why ? `\n_Why it matters:_ ${why}` : ''),
        { worker: { key: spec.key, name: spec.name, emoji: spec.emoji } }
      );
      return 'Asked AJ. Do NOT record the assumption as fact — record only what you can see, note the open question, and move on.';
    },
  };
}

// --- Running one job ---------------------------------------------------------
const WEB_SEARCH = { type: 'web_search_20260209', name: 'web_search' };

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
    `and would have skewed everything built on top. Record what you can see; ask about what you are inferring.\n\n` +
    `When you find something another teammate should act on, publish it — that is how the hive compounds.\n\n` +
    `Finish with two or three sentences on what you actually did and what you found.`;

  const messages = [{ role: 'user', content: job.prompt }];
  let text = '';

  for (let turn = 0; turn < 8; turn++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system,
      tools,
      messages,
    });
    text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (res.stop_reason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: res.content });
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
  let done = 0;
  for (let i = 0; i < limit; i++) {
    // Claim one job atomically so overlapping ticks can't double-run it.
    const claim = await _q(
      `UPDATE jobs SET status = 'running', started_at = now()
        WHERE id = (SELECT id FROM jobs WHERE status = 'pending'
                     ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING *`
    );
    const job = claim.rows[0];
    if (!job) break;

    try {
      const result = await runJob(job);
      await _q(`UPDATE jobs SET status='done', result=$1, finished_at=now() WHERE id=$2`, [result, job.id]);
      console.log(`[bus] ${job.worker_key} finished job ${job.id} (${job.topic || 'direct'})`);
    } catch (err) {
      await _q(`UPDATE jobs SET status='failed', error=$1, finished_at=now() WHERE id=$2`, [err.message, job.id]);
      console.error(`[bus] job ${job.id} (${job.worker_key}) failed:`, err.message);
    }
    done += 1;
  }
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
