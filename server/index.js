// Design Bees Hive — server entry (Phase 0).
// Serves the existing Messaging Editor, the new Hive Wall dashboard, and the
// brain API; connects the Telegram bridge; runs migrations on boot.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from './migrate.js';
import { ping } from './db.js';
import { readHive, writeSignal, askQuestion, setMemory } from './brain.js';
import { startPolling, telegramReady, send, commands } from './telegram.js';
import { runLedger, ledgerReady, hoursSinceLastRun } from './workers/ledger.js';
import { runScout, scoutReady, scoutHasRun } from './workers/scout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

// --- Workers ---------------------------------------------------------------
// Each teammate answers to their name or title+name (e.g. "fred" or "financefred").
const LIVE = {
  ian: () => runScout(), icpian: () => runScout(), scout: () => runScout(),
  fred: () => runLedger(), financefred: () => runLedger(), ledger: () => runLedger(),
};
const COMING = {
  ricky: 'Ricky (Research)', researchricky: 'Ricky (Research)',
  tom: 'Tom (Tools)', toolstom: 'Tom (Tools)',
  sam: 'Sam (Socials)', socialssam: 'Sam (Socials)',
  george: 'George (GM)', gmgeorge: 'George (GM)',
};
for (const [alias, fn] of Object.entries(LIVE)) commands[alias] = fn;
for (const [alias, who] of Object.entries(COMING)) {
  commands[alias] = () => send(`🐝 ${who} isn't online yet — coming in a later phase.`);
}
commands.help = () =>
  send(
    '🐝 *The hive* — message a name or title+name:\n' +
      '• *Ian* / ICPIan — ICP & subscribers\n' +
      '• *Fred* / FinanceFred — revenue pulse\n' +
      '• *Ricky, Tom, Sam, George* — coming soon\n' +
      '• *help* — this list'
  );

async function runWorker(name, res) {
  const key = String(name || '').toLowerCase();
  try {
    if (['ledger', 'fred'].includes(key)) return res.json(await runLedger());
    if (['scout', 'ian'].includes(key)) return res.json(await runScout());
    return res.status(404).json({ error: `unknown worker "${name}"` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
app.post('/api/run/:worker', requireWorkerKey, (req, res) => runWorker(req.params.worker, res));
app.get('/api/run/:worker', requireWorkerKey, (req, res) => runWorker(req.params.worker, res));

// --- Pages -----------------------------------------------------------------
// The Hive Wall — the place to see everyone's thoughts — is the front door.
const hiveWall = (_req, res) => res.sendFile(path.join(__dirname, 'public', 'hive.html'));
app.get('/', hiveWall);
app.get('/hive', hiveWall);
app.use('/public', express.static(path.join(__dirname, 'public')));

// --- Boot ------------------------------------------------------------------
// Retry the migration a few times: on a fresh deploy the private database DNS
// can lag a moment, and a DB restart shouldn't leave the brain unbuilt.
async function migrateWithRetry(attempts = 6, delayMs = 3000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await migrate();
      return true;
    } catch (err) {
      console.error(`[boot] migration attempt ${i}/${attempts} failed: ${err.message}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error('[boot] migration gave up — brain not ready; still serving pages.');
  return false;
}

// Daily cadence: run Ledger at ~08:00 Australia/Sydney if it hasn't run in the
// last 12h, plus once shortly after boot so a fresh deploy surfaces a pulse
// (the 12h guard means redeploys don't spam the thread).
function sydneyHour() {
  return Number(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      hour: 'numeric',
      hour12: false,
    }).format(new Date())
  );
}

async function ledgerTick() {
  if (!ledgerReady()) return;
  if (sydneyHour() !== 8) return;
  if ((await hoursSinceLastRun()) < 12) return;
  await runLedger().catch((e) => console.error('[schedule] ledger:', e.message));
}

function scheduleWorkers() {
  // Fred: daily revenue pulse at ~08:00 Sydney.
  setInterval(() => ledgerTick().catch(() => {}), 60 * 60 * 1000); // hourly
  // Ian: onboarding once, the first time Wix is connected (Scout-first focus).
  setTimeout(async () => {
    try {
      if (scoutReady() && !(await scoutHasRun())) await runScout();
    } catch (e) {
      console.error('[boot] ian warmup:', e.message);
    }
  }, 20000);
}

async function boot() {
  console.log(
    `[hive] build: phase1-ian-fred-renames | wix:${scoutReady()} telegram:${telegramReady()}`
  );
  await migrateWithRetry();
  app.listen(PORT, () => console.log(`[hive] listening on :${PORT}`));
  startPolling().catch((err) => console.error('[boot] telegram:', err.message));
  scheduleWorkers();
}

boot();
