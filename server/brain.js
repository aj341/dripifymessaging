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

// --- Knowledge ---------------------------------------------------------------
// The hive's shared facts. Writes merge rather than replace, so a worker adding
// one field doesn't wipe what another already learned about the same entity.
export async function saveKnowledge({ entity_type, entity_key, data, source, confidence = 'fact', worker_key = null }) {
  if (!entity_type || !entity_key) throw new Error('entity_type and entity_key are required');
  if (!source) throw new Error('knowledge needs a source — where did this come from?');
  const key = String(entity_key).toLowerCase().trim();
  const r = await query(
    `INSERT INTO knowledge (entity_type, entity_key, data, source, confidence, worker_key)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (entity_type, entity_key) DO UPDATE
       SET data = knowledge.data || EXCLUDED.data,
           source = EXCLUDED.source,
           confidence = EXCLUDED.confidence,
           worker_key = COALESCE(EXCLUDED.worker_key, knowledge.worker_key),
           updated_at = now()
     RETURNING *`,
    [entity_type, key, JSON.stringify(data || {}), JSON.stringify(source), confidence, worker_key]
  );
  return r.rows[0];
}

export async function getKnowledge(entity_type, entity_key) {
  const r = await query(
    `SELECT * FROM knowledge WHERE entity_type = $1 AND entity_key = $2`,
    [entity_type, String(entity_key).toLowerCase().trim()]
  );
  return r.rows[0] || null;
}

export async function allKnowledge(entity_type) {
  const r = entity_type
    ? await query(`SELECT * FROM knowledge WHERE entity_type = $1`, [entity_type])
    : await query(`SELECT * FROM knowledge`);
  return r.rows;
}

/** Insert only if absent — used to seed the file-based enrichment once. */
export async function seedKnowledge(rows) {
  let added = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO knowledge (entity_type, entity_key, data, source, confidence, worker_key)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (entity_type, entity_key) DO NOTHING
       RETURNING id`,
      [r.entity_type, String(r.entity_key).toLowerCase().trim(), JSON.stringify(r.data),
       JSON.stringify(r.source), r.confidence || 'fact', r.worker_key || null]
    );
    if (res.rows[0]) added += 1;
  }
  return added;
}

/**
 * Refresh a seeded row, but ONLY while AJ has not ruled on it.
 *
 * seedKnowledge above never overwrites, which protects his decisions and is
 * right. It also meant a correction to a seeded draft could never reach the
 * database: the copy was fixed in the repo and the dashboard kept serving the
 * old text. This is the narrow escape hatch — an undecided draft is still ours
 * to correct; the moment it is approved, rejected or published it is his, and
 * this leaves it alone.
 */
export async function refreshUndecided(rows) {
  let updated = 0;
  for (const r of rows) {
    if (r.data?.status !== 'draft-awaiting-aj') continue;
    const res = await query(
      `UPDATE knowledge SET data = $3, source = $4, updated_at = now()
        WHERE entity_type = $1 AND entity_key = $2
          AND data->>'status' = 'draft-awaiting-aj'
          AND data IS DISTINCT FROM $3::jsonb
        RETURNING id`,
      [r.entity_type, String(r.entity_key).toLowerCase().trim(),
       JSON.stringify(r.data), JSON.stringify(r.source)]
    );
    if (res.rows[0]) updated += 1;
  }
  return updated;
}
