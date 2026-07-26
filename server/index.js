// Design Bees Hive — server entry (Phase 0).
// Serves the existing Messaging Editor, the new Hive Wall dashboard, and the
// brain API; connects the Telegram bridge; runs migrations on boot.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from './migrate.js';
import { ping, query as dbQuery } from './db.js';
import { readHive, writeSignal, askQuestion, setMemory, seedKnowledge, allKnowledge, getSetting, setSetting } from './brain.js';
import { enrichmentSeed, applyKnowledge } from './wix.js';
import { startPolling, telegramReady, send, commands } from './telegram.js';
import {
  runLedger,
  sendPulse,
  runLedgerClients,
  runLedgerReconcile,
  ledgerReady,
  hoursSinceLastRun,
  hoursSinceReconcile,
} from './workers/ledger.js';
import { runScout, runScoutSalesNav, runScoutDemos, scoutReady, scoutHasRun } from './workers/scout.js';
import { loadSpecs, allSpecs, processJobs, queueDaily, queueJob, publish, autorunEnabled } from './bus.js';
import { authUrl, completeAuth, googleConfigured, googleConnected, grantedScopes } from './google.js';
import { mountApprove } from './approve.js';
import { mountIngest } from './ingest.js';
import { ensureLibrary, contentLibraryWritable } from './content-library.js';
import {
  wixOauthConfigured,
  wixOauthConnected,
  extractInstanceId,
  storeInstanceId as storeWixInstanceId,
  testConnection as testWixConnection,
} from './wix-oauth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false })); // the approval dashboard's forms
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' })); // Dripify CSV ingest

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
  fred: () => sendPulse(), financefred: () => sendPulse(), ledger: () => sendPulse(),
};
for (const [alias, fn] of Object.entries(LIVE)) commands[alias] = fn;

// The bus-driven teammates. Messaging a name queues that worker's standing task
// and lets the cascade run — anything they publish wakes whoever subscribes.
const BUS_ALIASES = {
  ricky: 'radar', researchricky: 'radar', radar: 'radar',
  tom: 'forge', toolstom: 'forge', forge: 'forge',
  sam: 'voice', socialssam: 'voice',
  george: 'queen', gmgeorge: 'queen', queen: 'queen',
};
for (const [alias, key] of Object.entries(BUS_ALIASES)) {
  commands[alias] = async () => {
    const spec = allSpecs().find((s) => s.key === key);
    if (!spec) return send(`🐝 That teammate isn't online yet.`);
    await queueJob(key, spec.daily?.prompt || `Do your standing job now and report what you find.`);
  };
}

// Kick the whole chain: Ian assesses an industry, and whatever he concludes
// wakes the rest of the team. `cascade construction` is the end-to-end test.
commands.cascade = async (text) => {
  const industry = String(text || '').split(/\s+/).slice(1).join(' ').trim();
  if (!industry) return send('Give me an industry to start from, e.g. `cascade construction`.');
  await publish({
    worker_key: 'queen',
    topic: `pain:industry=${industry.toLowerCase().replace(/\s+/g, '-')}`,
    title: `AJ asked the hive to look at ${industry}`,
    body: `AJ wants the team to work through ${industry}: is it a fit for us, is there a search gap, and is there content worth writing?`,
    confidence: 'unknown',
  });
  await send(`🐝 Started the chain on *${industry}* — Ian first, then whoever he wakes.`);
};
commands.transcripts = async (text) => {
  const arg = String(text || '').split(/\s+/)[1];
  const all = /^(all|backfill)$/i.test(arg || '');
  await queueJob(
    'radar',
    (all
      ? 'Work through every demo transcript since 1 March 2026. '
      : 'Work through any demo transcripts you have not already recorded. ') +
      'For each: list them, check your knowledge so you skip ones already done, read the ones that are ' +
      'left, and record what the call revealed with record_demo_insight — what they came with, what ' +
      'held them back, who decided, and their most revealing line quoted. Do the oldest first. ' +
      "Where you cannot tell whether they became a client, mark it unclear rather than guessing."
  );
  await send(
    `📡 *Ricky* is reading your demo transcripts${all ? ' (full backfill)' : ''}. ` +
      "He'll post what he finds, and each one wakes Ian to check it against who actually pays."
  );
};
commands.skills = async () => {
  await queueJob(
    'radar',
    'Search GitHub and the web for Claude skills, agents, prompt packs or MCP servers published in the ' +
      'last few months that would make one of the teammates materially better — Ian (ICP/prospecting), ' +
      'Fred (finance), Ricky (research), Tom (SEO/AEO), Sam (content), George (synthesis). For each ' +
      'genuine candidate use record_skill_candidate with the real repo URL. Only propose things that ' +
      'beat what the teammate already has; skip anything unmaintained or that needs a paid API AJ does ' +
      'not have. Three good ones are worth more than ten weak ones.'
  );
  await send('📡 *Ricky* is looking for skills worth adopting — he\'ll put candidates to you, and nothing gets installed without your say-so.');
};
commands.stop = async () => {
  await _qJobs();
  await send('🛑 Stopped. Queued work cleared and background running is off. Nothing will message you until you send `go`.');
};
commands.go = async () =>
  send(
    autorunEnabled()
      ? '✅ Background running is on. Everything the team produces comes as one message per cycle.'
      : '⏸ Background running is off at the service level. Set HIVE_AUTORUN=1 in Railway to enable it.'
  );
commands.clients = () => runLedgerClients();
commands.refresh = () => runLedger();
commands.reconcile = () => runLedgerReconcile({ notify: true });
commands.prepay = () => runLedgerReconcile({ notify: true });
commands.prepayments = () => runLedgerReconcile({ notify: true });
commands.cohorts = () => runScout({ notify: true });
commands.salesnav = () => runScoutSalesNav({ notify: true });
commands.filters = () => runScoutSalesNav({ notify: true });
commands.demos = () => runScoutDemos({ notify: true });
commands.conversions = () => runScoutDemos({ notify: true });
commands.help = () =>
  send(
    '🐝 *The hive* — message a name or title+name:\n' +
      '• *Fred* / FinanceFred — revenue pulse (cached; `refresh` to update)\n' +
      '• *clients* — who paid what (last 90 days)\n' +
      '• *reconcile* / *prepay* — prepayments & one-offs (since Apr 2026)\n' +
      '• *Ian* / ICPIan / *cohorts* — customer cohorts (Nectar, Honeycomb, active)\n' +
      '• *salesnav* / *filters* — persona / company type / headcount / industry split\n' +
      '• *demos* / *conversions* — demo→conversion since March\n' +
      '• *Ricky* — research: pain points & trends (Reddit + web)\n' +
      '• *Tom* — search queries worth competing for (SEO/AEO)\n' +
      '• *Sam* — drafts posts (never publishes — you approve)\n' +
      '• *George* — the morning brief\n' +
      '• *transcripts* / *transcripts all* — Ricky reads your demo calls for real pain points\n' +
      '• *skills* — Ricky hunts GitHub for Claude skills worth giving a teammate\n' +
      '• *cascade <industry>* — run the whole chain: Ian → Tom → Sam\n' +
      '• *help* — this list'
  );

// Clear anything queued — the emergency stop.
async function _qJobs() {
  const { query } = await import('./db.js');
  await query(`UPDATE jobs SET status='skipped', finished_at=now() WHERE status='pending'`);
}

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


// --- Google consent -----------------------------------------------------------
// AJ visits /auth/google once; the refresh token is stored and the server
// re-authorises itself from then on. Scopes are drive.readonly plus
// analytics.readonly and webmasters.readonly — read, never write. Re-visiting
// after a scope change re-consents and replaces the stored token.
app.get('/auth/google', async (_req, res) => {
  if (!googleConfigured()) {
    return res
      .status(503)
      .send('Google isn\'t configured yet — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the Railway service, then reload this page.');
  }
  res.redirect(authUrl());
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.status(400).send(`Google returned an error: ${error}`);
  if (!code) return res.status(400).send('No authorisation code returned.');
  try {
    await completeAuth(String(code));
    res.send('<h2>Connected.</h2><p>The hive can now read your Drive transcripts, GA4 and Search Console — all read-only. You can close this tab — nothing else to do.</p>');
  } catch (err) {
    res.status(500).send(`Could not complete Google auth: ${err.message}`);
  }
});

// --- Wix app connection ---------------------------------------------------------
// Wix's current app auth needs no redirect and no consent screen — just the app
// credentials plus the instance ID of the install on the Design Bees site. AJ
// pastes anything containing that ID once; we extract it, mint a token, and
// prove the connection by reading the app instance back.
const WIX_FORM = (msg = '') => `
  <div style="font-family:sans-serif;max-width:560px;margin:40px auto;line-height:1.5">
    <h2>Connect Wix</h2>${msg}
    <p>Open your app's page in the site dashboard (Apps → Manage Apps → your custom app),
    copy the <b>full URL</b> from the browser, and paste it below. A bare instance ID or
    the signed <code>instance=</code> token works too.</p>
    <form method="post" action="/auth/wix">
      <input name="paste" style="width:100%;padding:10px;font-size:15px" placeholder="Paste the URL, token or instance ID here" />
      <button style="margin-top:12px;padding:10px 24px;font-size:15px">Connect</button>
    </form>
  </div>`;

app.get('/auth/wix', async (_req, res) => {
  if (!wixOauthConfigured()) {
    return res
      .status(503)
      .send('Wix app is not configured — set WIX_APP_ID and WIX_APP_SECRET on the Railway service, then reload this page.');
  }
  if (await wixOauthConnected()) {
    try {
      const t = await testWixConnection();
      return res.send(
        `<h2>Connected.</h2><p>App "${t.appName || 'custom app'}" on ${t.siteName || 'your site'} — token minted and verified. Read-only permissions: ${
          (t.permissions || []).join(', ') || '(not reported)'
        }</p>`
      );
    } catch (err) {
      return res.send(WIX_FORM(`<p style="color:#a00">Stored instance ID no longer works (${err.message}). Paste a fresh one:</p>`));
    }
  }
  res.send(WIX_FORM());
});

app.post('/auth/wix', async (req, res) => {
  try {
    const id = extractInstanceId(req.body?.paste);
    if (!id) return res.send(WIX_FORM('<p style="color:#a00">Could not find an instance ID in that paste. Try the full dashboard URL of the app.</p>'));
    await storeWixInstanceId(id);
    const t = await testWixConnection();
    res.send(
      `<h2>Connected.</h2><p>Instance ${id} verified — app "${t.appName || 'custom app'}" on ${t.siteName || 'your site'}, read-only. ` +
        `You can close this tab; Fred is live.</p>`
    );
  } catch (err) {
    res.send(WIX_FORM(`<p style="color:#a00">That instance ID did not verify: ${err.message}. Check the app is installed on the Design Bees site and try again.</p>`));
  }
});

app.get('/auth/wix/status', async (_req, res) => {
  res.json({ configured: wixOauthConfigured(), connected: await wixOauthConnected().catch(() => false) });
});

app.get('/auth/google/status', async (_req, res) => {
  res.json({
    configured: googleConfigured(),
    connected: await googleConnected().catch(() => false),
    scopes: await grantedScopes().catch(() => ''),
  });
});

// --- Pages -----------------------------------------------------------------
// The Hive Wall — the place to see everyone's thoughts — is the front door.
const hiveWall = (_req, res) => res.sendFile(path.join(__dirname, 'public', 'hive.html'));
app.get('/', hiveWall);
app.get('/hive', hiveWall);
app.use('/public', express.static(path.join(__dirname, 'public')));
mountApprove(app); // AJ's content approval dashboard (/approve?t=DASHBOARD_TOKEN)
mountIngest(app); // weekly Dripify results (/ingest/dripify?t=DASHBOARD_TOKEN)

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

// Fred's reconciliation runs quietly in the background (stored, not sent);
// AJ views it on demand with `reconcile`.
async function reconcileTick() {
  if (!ledgerReady()) return;
  if (sydneyHour() !== 8) return;
  if ((await hoursSinceReconcile()) < 20) return;
  await runLedgerReconcile({ notify: false }).catch((e) => console.error('[schedule] reconcile:', e.message));
}

// Ian refreshes the cohorts quietly each morning (stored, not sent).
async function scoutTick() {
  if (!scoutReady()) return;
  if (sydneyHour() !== 8) return;
  if (!(await scoutHasRun())) return; // first run is the boot warmup below
  await runScout({ notify: false }).catch((e) => console.error('[schedule] ian:', e.message));
}

function scheduleWorkers() {
  setInterval(() => {
    ledgerTick().catch(() => {});
    reconcileTick().catch(() => {});
    scoutTick().catch(() => {});
    queueDaily(sydneyHour()).catch((e) => console.error('[bus] daily:', e.message));
  }, 60 * 60 * 1000); // hourly

  // The cascade runs on its own clock. Every few minutes the bus drains a few
  // queued jobs, so a finding published at 07:00 has worked its way through the
  // team long before AJ reads George's brief — rather than waiting an hour per hop.
  setInterval(() => {
    processJobs().catch((e) => console.error('[bus] tick:', e.message));
  }, 3 * 60 * 1000);
  // Ian: onboarding once, the first time Wix is connected.
  setTimeout(async () => {
    try {
      if (scoutReady() && !(await scoutHasRun())) await runScout();
    } catch (e) {
      console.error('[boot] ian warmup:', e.message);
    }
  }, 20000);
  // Fred: reconcile once shortly after boot (silent), then daily.
  setTimeout(async () => {
    try {
      if (ledgerReady() && (await hoursSinceReconcile()) > 20) await runLedgerReconcile({ notify: false });
    } catch (e) {
      console.error('[boot] reconcile:', e.message);
    }
  }, 30000);
}

// One-time: AJ reset Sam's content on 2026-07-26 when the blog engine pack
// became the standard. Every draft written before it is marked superseded so
// Sam starts fresh against the pack — but ONLY knowledge rows are touched.
// Signals, jobs and questions are left exactly as they are: the evidence that
// triggered those drafts (pains, gaps, trends) must never be lost with them.
async function resetSamContentOnce() {
  const FLAG = 'sam_content_reset_v1';
  if (await getSetting(FLAG)) return;
  const r = await dbQuery(
    `UPDATE knowledge
        SET data = data || '{"status":"superseded-pre-blog-engine"}'::jsonb
      WHERE entity_type = 'topic'
        AND data->>'format' IN ('linkedin-post', 'blog-outline')
        AND COALESCE(data->>'standard', '') <> 'blog-engine-pack-2026-07'`
  );
  await setSetting(FLAG, new Date().toISOString());
  console.log(`[hive] Sam content reset: ${r.rowCount} pre-pack draft(s) marked superseded; signals untouched`);
}

async function boot() {
  console.log(
    `[hive] build: hive-v40-approve-tabs | wix:${scoutReady()} telegram:${telegramReady()}`
  );
  await migrateWithRetry();
  await resetSamContentOnce().catch((e) => console.error('[boot] sam reset:', e.message));
  // Seed the file-based enrichment once, then load everything the workers know
  // into the in-memory index the cohort builder reads.
  try {
    const added = await seedKnowledge(enrichmentSeed());
    const rows = await allKnowledge();
    applyKnowledge(rows);
    console.log(`[hive] knowledge: ${rows.length} entities (${added} seeded this boot)`);
    await loadSpecs();
  } catch (e) {
    console.error('[boot] knowledge load failed:', e.message);
  }
  // The content library: clone in the background so a slow clone never delays
  // boot, and report whether writes are possible.
  ensureLibrary()
    .then((ok) =>
      console.log(
        `[content] library ${ok ? 'ready' : 'unavailable'} — writes ${contentLibraryWritable() ? 'enabled (append-only)' : 'disabled (no GITHUB_TOKEN)'}`
      )
    )
    .catch((e) => console.error('[content]', e.message));
  app.listen(PORT, () => console.log(`[hive] listening on :${PORT}`));
  startPolling().catch((err) => console.error('[boot] telegram:', err.message));
  scheduleWorkers();
}

boot();
