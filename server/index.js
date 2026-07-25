// Design Bees Hive — server entry (Phase 0).
// Serves the existing Messaging Editor, the new Hive Wall dashboard, and the
// brain API; connects the Telegram bridge; runs migrations on boot.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from './migrate.js';
import { ping } from './db.js';
import { readHive, writeSignal, askQuestion, setMemory } from './brain.js';
import { startPolling, telegramReady, send } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '1mb' }));

// --- Optional write auth for workers ---------------------------------------
function requireWorkerKey(req, res, next) {
  const key = process.env.WORKER_API_KEY;
  if (!key) return next(); // open while everything is internal to Railway
  if (req.get('x-worker-key') === key) return next();
  return res.status(401).json({ error: 'bad or missing x-worker-key' });
}

// --- Health ----------------------------------------------------------------
// Liveness check — always 200 so Railway won't fail a deploy over a brief DB
// blip; the body reports whether the brain and Telegram are actually up.
app.get('/health', async (_req, res) => {
  let db = false;
  try {
    db = await ping();
  } catch {
    db = false;
  }
  res.json({ ok: true, db, telegram: telegramReady() });
});

// --- Brain API -------------------------------------------------------------
app.get('/api/hive', async (_req, res) => {
  try {
    res.json(await readHive());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/signals', requireWorkerKey, async (req, res) => {
  try {
    res.json(await writeSignal(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/memory', requireWorkerKey, async (req, res) => {
  try {
    res.json(await setMemory(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/questions', requireWorkerKey, async (req, res) => {
  try {
    const q = await askQuestion(req.body);
    // Surface the question in the hive thread too.
    await send(`❓ ${req.body.question}`, {
      worker: { key: req.body.worker_key, name: req.body.worker_key, emoji: '' },
    }).catch(() => {});
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Pages -----------------------------------------------------------------
// The Hive Wall — the place to see everyone's thoughts.
app.get('/hive', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'hive.html')));
// The existing Dripify Messaging Editor stays at the root.
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// --- Boot ------------------------------------------------------------------
async function boot() {
  try {
    await migrate();
  } catch (err) {
    console.error('[boot] migration failed:', err.message);
  }
  app.listen(PORT, () => console.log(`[hive] listening on :${PORT}`));
  startPolling().catch((err) => console.error('[boot] telegram:', err.message));
}

boot();
