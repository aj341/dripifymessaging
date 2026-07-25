// Brain access helpers. Every write demands a provenance `source`; the database
// enforces it too, but we fail early here with a clearer message.
import { query } from './db.js';

const CONFIDENCE = new Set(['fact', 'hypothesis', 'unknown']);

function assertSource(source) {
  if (!source || typeof source !== 'object' || Object.keys(source).length === 0) {
    throw new Error(
      'evidence rule: every signal/memory needs a non-empty `source` ' +
        '(e.g. { tool, query, records, note }). "No receipt, no row."'
    );
  }
}

/** Record a signal a worker discovered. */
export async function writeSignal({
  worker_key,
  title,
  body = null,
  kind = 'finding',
  confidence = 'fact',
  source,
  to_worker = null,
}) {
  assertSource(source);
  if (!CONFIDENCE.has(confidence)) {
    throw new Error(`confidence must be one of ${[...CONFIDENCE].join(', ')}`);
  }
  const res = await query(
    `INSERT INTO signals (worker_key, kind, title, body, confidence, source, to_worker)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [worker_key, kind, title, body, confidence, source, to_worker]
  );
  return res.rows[0];
}

/** Set a durable piece of a worker's memory (e.g. Scout's current ICP). */
export async function setMemory({ worker_key, key, value, source }) {
  assertSource(source);
  const res = await query(
    `INSERT INTO memory (worker_key, key, value, source, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (worker_key, key) DO UPDATE
       SET value = EXCLUDED.value, source = EXCLUDED.source, updated_at = now()
     RETURNING *`,
    [worker_key, key, value, source]
  );
  return res.rows[0];
}

/** Ask the human a question (surfaced on Telegram + the Hive Wall). */
export async function askQuestion({ worker_key, question }) {
  const res = await query(
    `INSERT INTO questions (worker_key, question) VALUES ($1, $2) RETURNING *`,
    [worker_key, question]
  );
  return res.rows[0];
}

/** True if the worker already has an unanswered question open. */
export async function hasOpenQuestion(worker_key) {
  const res = await query(
    `SELECT 1 FROM questions WHERE worker_key = $1 AND status = 'open' LIMIT 1`,
    [worker_key]
  );
  return res.rowCount > 0;
}

/** Everything the Hive Wall needs in one shot. */
export async function readHive() {
  const [workers, signals, questions, memory] = await Promise.all([
    query('SELECT * FROM workers ORDER BY key'),
    query(
      `SELECT s.*, w.name AS worker_name, w.emoji AS worker_emoji
         FROM signals s JOIN workers w ON w.key = s.worker_key
        ORDER BY s.created_at DESC LIMIT 50`
    ),
    query(
      `SELECT q.*, w.name AS worker_name, w.emoji AS worker_emoji
         FROM questions q JOIN workers w ON w.key = q.worker_key
        WHERE q.status = 'open' ORDER BY q.asked_at DESC`
    ),
    query('SELECT * FROM memory ORDER BY worker_key, key'),
  ]);
  return {
    workers: workers.rows,
    signals: signals.rows,
    questions: questions.rows,
    memory: memory.rows,
  };
}

/** Read a single memory row (value + when it was written). */
export async function getMemory(worker_key, key) {
  const res = await query(
    'SELECT value, source, updated_at FROM memory WHERE worker_key = $1 AND key = $2',
    [worker_key, key]
  );
  return res.rows[0] || null;
}

export async function getSetting(key) {
  const res = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return res.rows[0]?.value ?? null;
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, String(value)]
  );
}

export async function logMessage({ direction, worker_key = null, text, telegram_message_id = null }) {
  await query(
    `INSERT INTO messages (direction, worker_key, text, telegram_message_id)
     VALUES ($1, $2, $3, $4)`,
    [direction, worker_key, text, telegram_message_id]
  );
}
