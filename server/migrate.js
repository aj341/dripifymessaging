// Schema for the hive brain. Idempotent — runs on every boot.
//
// The evidence rule is enforced at the database level: a signal or a memory
// row physically cannot exist without a non-empty `source` (its provenance).
// "No receipt, no row."
import { query } from './db.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workers (
  key        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  emoji      TEXT,
  role       TEXT,
  status     TEXT NOT NULL DEFAULT 'idle',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signals (
  id         BIGSERIAL PRIMARY KEY,
  worker_key TEXT NOT NULL REFERENCES workers(key),
  kind       TEXT NOT NULL DEFAULT 'finding',   -- finding | handoff | alert
  title      TEXT NOT NULL,
  body       TEXT,
  confidence TEXT NOT NULL DEFAULT 'fact',       -- fact | hypothesis | unknown
  source     JSONB NOT NULL,                     -- provenance receipt
  to_worker  TEXT REFERENCES workers(key),       -- set for hand-offs
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT signals_confidence_valid
    CHECK (confidence IN ('fact','hypothesis','unknown')),
  CONSTRAINT signals_source_present
    CHECK (source IS NOT NULL AND source <> '{}'::jsonb)
);
CREATE INDEX IF NOT EXISTS signals_worker_idx ON signals(worker_key, created_at DESC);

CREATE TABLE IF NOT EXISTS memory (
  worker_key TEXT NOT NULL REFERENCES workers(key),
  key        TEXT NOT NULL,
  value      JSONB NOT NULL,
  source     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_key, key),
  CONSTRAINT memory_source_present
    CHECK (source IS NOT NULL AND source <> '{}'::jsonb)
);

CREATE TABLE IF NOT EXISTS questions (
  id          BIGSERIAL PRIMARY KEY,
  worker_key  TEXT NOT NULL REFERENCES workers(key),
  question    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',       -- open | answered
  answer      TEXT,
  asked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS questions_open_idx ON questions(status, asked_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id                  BIGSERIAL PRIMARY KEY,
  direction           TEXT NOT NULL,             -- out | in
  worker_key          TEXT,
  text                TEXT,
  telegram_message_id BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

const WORKERS = [
  ['scout', 'Scout', '🔭', 'ICP & Sourcing'],
  ['voice', 'Voice', '🎙️', 'Social Content'],
  ['radar', 'Radar', '📡', 'Research & Trends'],
  ['forge', 'Forge', '🛠️', 'Internal Tools & Analytics'],
  ['ledger', 'Ledger', '📊', 'Revenue & Churn'],
  ['queen', 'Queen', '👑', 'Chief of Staff'],
];

export async function migrate() {
  await query(SCHEMA);
  for (const [key, name, emoji, role] of WORKERS) {
    await query(
      `INSERT INTO workers (key, name, emoji, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE
         SET name = EXCLUDED.name, emoji = EXCLUDED.emoji, role = EXCLUDED.role`,
      [key, name, emoji, role]
    );
  }
  console.log('[migrate] schema ready, workers seeded');
}
