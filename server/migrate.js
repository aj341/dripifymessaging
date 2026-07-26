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
  title      TEXT,
  status     TEXT NOT NULL DEFAULT 'idle',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE workers ADD COLUMN IF NOT EXISTS title TEXT;

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

-- What the hive knows, as opposed to what it has said. Any worker can write
-- here, which is the point: a teammate who learns something should be able to
-- keep it without a human editing a file and redeploying.
CREATE TABLE IF NOT EXISTS knowledge (
  id          BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,              -- company | person | industry | query | topic
  entity_key  TEXT NOT NULL,              -- domain | email | slug — the join key
  data        JSONB NOT NULL,             -- merged facts about the entity
  source      JSONB NOT NULL,             -- evidence: who learned it, from where, when
  confidence  TEXT NOT NULL DEFAULT 'fact',
  worker_key  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_key)
);
CREATE INDEX IF NOT EXISTS knowledge_type_idx ON knowledge(entity_type, updated_at DESC);

-- Work waiting to be done. A signal on a topic a worker subscribes to becomes a
-- job for that worker; running it can publish further signals, which is how one
-- teammate's finding triggers the next.
CREATE TABLE IF NOT EXISTS jobs (
  id                BIGSERIAL PRIMARY KEY,
  worker_key        TEXT NOT NULL,
  trigger_signal_id BIGINT REFERENCES signals(id) ON DELETE SET NULL,
  topic             TEXT,
  prompt            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | failed | skipped
  depth             INT NOT NULL DEFAULT 0,           -- cascade depth, capped to stop runaway loops
  result            TEXT,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jobs_pending_idx ON jobs(status, created_at);

-- Topics turn signals from a log into a bus: a worker subscribes to topic
-- patterns and is woken by anything published on them. Added separately because
-- signals predates the bus and already holds rows in production.
ALTER TABLE signals ADD COLUMN IF NOT EXISTS topic TEXT;
CREATE INDEX IF NOT EXISTS signals_topic_idx ON signals(topic, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

// key stays stable internally; name/title are what AJ sees and addresses.
const WORKERS = [
  ['scout', 'Ian', '🔭', 'ICP & Sourcing', 'ICP'],
  ['voice', 'Sam', '🎙️', 'Socials & Content', 'Socials'],
  ['radar', 'Ricky', '📡', 'Research & Trends', 'Research'],
  ['forge', 'Tom', '🛠️', 'Tools & Analytics', 'Tools'],
  ['ledger', 'Fred', '📊', 'Revenue & Finance', 'Finance'],
  ['queen', 'George', '👑', 'General Manager', 'GM'],
];

export async function migrate() {
  await query(SCHEMA);
  for (const [key, name, emoji, role, title] of WORKERS) {
    await query(
      `INSERT INTO workers (key, name, emoji, role, title)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO UPDATE
         SET name = EXCLUDED.name, emoji = EXCLUDED.emoji,
             role = EXCLUDED.role, title = EXCLUDED.title`,
      [key, name, emoji, role, title]
    );
  }
  console.log('[migrate] schema ready, workers seeded');
}
