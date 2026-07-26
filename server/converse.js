// The hive's reasoning layer. Turns a plain Telegram message into a reply from
// the right teammate, grounded in the hive's real numbers.
//
// The evidence rule is enforced structurally, not by good intentions: every
// figure the model is allowed to use is injected into the prompt from the same
// snapshot the deterministic commands read. The model is told it has no other
// source of numbers, so "I don't have that" is the only honest answer when a
// figure isn't in the briefing.
import Anthropic from '@anthropic-ai/sdk';
import { getRevenue, getReconcile, getCohorts, getDemos, money, applyKnowledge } from './wix.js';
import { setMemory, getMemory, writeSignal, saveKnowledge, allKnowledge } from './brain.js';
import { query as _q } from './db.js';

const MODEL = 'claude-opus-5';
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

export function brainReady() {
  return Boolean(client);
}

// --- Who is speaking ---------------------------------------------------------
export const TEAM = {
  scout: {
    key: 'scout', name: 'Ian', emoji: '🔭', title: 'ICP & Sourcing',
    brief:
      'You own the ideal customer profile and prospecting. You know who Design Bees\' best ' +
      'clients are, why, and how to turn that into LinkedIn Sales Navigator filters and ' +
      'target lists. You think in personas, firmographics and cohorts.',
  },
  ledger: {
    key: 'ledger', name: 'Fred', emoji: '📊', title: 'Finance',
    brief:
      'You own revenue and finance. Wix is the source of truth for money, and since 2026-07-26 your ' +
      'background self reads it LIVE through the read-only app: pricing-plan orders (the churn ledger), ' +
      'store orders and contacts. The briefing below may still be snapshot figures — when AJ wants live ' +
      'numbers or churn detail, queue yourself with ask_teammate rather than answering from the snapshot, ' +
      'and always say which source a figure came from.',
  },
};

TEAM.radar = {
  key: 'radar', name: 'Ricky', emoji: '📡', title: 'Research',
  brief: 'You own research AND the whole AEO/SEO demand pipeline (this moved to you from Tom on ' +
    '2026-07-26 — never say Tom holds it). You hunt Reddit, forums, news and the web for pain points and ' +
    'trends, and you judge which search queries are worth competing for. Your background self holds the ' +
    'live tools: Google Search Console and GA4 (read-only), keyword volumes via DataForSEO when configured, ' +
    'the query-verdict tools, demo transcripts and the blog engine pack. This chat cannot run those tools ' +
    'directly — when AJ wants that data, use ask_teammate to queue Ricky (yourself) with the specific ask, ' +
    'and never claim you lack the access.',
};
TEAM.forge = {
  key: 'forge', name: 'Tom', emoji: '🛠️', title: 'Tools & Analytics',
  brief: 'You own the platform the hive runs on — NOT search research; that is Ricky\'s since 2026-07-26. ' +
    'You watch hive health (job failures, stuck queues, question flow), you own the /approve content ' +
    'dashboard, and you evaluate candidate tools and integrations for AJ. Your background self holds the ' +
    'hive_health and analytics tools; queue yourself with ask_teammate when AJ wants those numbers.',
};
TEAM.voice = {
  key: 'voice', name: 'Sam', emoji: '📣', title: 'Socials & Content',
  brief: "You own content, governed by AJ's blog engine pack (the operator pack, content queue and L99 " +
    'voice spec in the repo). You draft only when demand is verified — a gap Ricky judged winnable, an ' +
    'evidenced pain, or a queue item — and you draft only; you never publish, AJ approves everything at ' +
    '/approve or in this thread. Customer quotes and client-shaped hypotheticals need AJ\'s approval ' +
    'before they appear in any draft.',
};
TEAM.queen = {
  key: 'queen', name: 'George', emoji: '👑', title: 'GM',
  brief: 'You are the general manager. You see every teammate\'s findings and tell AJ what actually ' +
    'matters, what changed, and what needs his decision.',
};

const NAME_TO_WORKER = {
  ian: 'scout', icpian: 'scout', scout: 'scout',
  fred: 'ledger', financefred: 'ledger', ledger: 'ledger',
  ricky: 'radar', researchricky: 'radar', radar: 'radar',
  tom: 'forge', toolstom: 'forge', forge: 'forge',
  sam: 'voice', socialssam: 'voice', voice: 'voice',
  george: 'queen', gmgeorge: 'queen', queen: 'queen',
};

/** Work out who AJ is talking to: an explicit name, or whoever he replied to. */
export function routeWorker(text, replyToText) {
  const first = String(text || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  if (NAME_TO_WORKER[first]) return TEAM[NAME_TO_WORKER[first]];
  const body = String(text || '').toLowerCase();
  for (const [alias, key] of Object.entries(NAME_TO_WORKER)) {
    if (new RegExp(`\\b${alias}\\b`).test(body)) return TEAM[key];
  }
  // Replying to a worker's message continues that conversation.
  const prior = String(replyToText || '');
  for (const w of Object.values(TEAM)) {
    if (prior.includes(w.name)) return w;
  }
  return null;
}

// --- The evidence briefing ---------------------------------------------------
function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Everything the hive actually knows, as compact text. */
export async function buildBriefing() {
  const now = new Date();
  const out = [];

  const rev = await getRevenue(now).catch(() => null);
  if (rev) {
    const s = rev.data;
    out.push(
      `## Revenue (Wix${rev.live ? ', live' : `, snapshot as of ${rev.asOf}`})\n` +
        `This month: $${money(s.monthRevenue)} (${s.monthCount} payments). ` +
        `Same point last month: $${money(s.lastMonthRevenue)}. ` +
        `${s.year} YTD: $${money(s.ytd)} (${s.ytdCount} payments). ` +
        `Active clients (90d): ${s.activeClients90}.\n` +
        `Plans this month: ${s.planRows.map((p) => `${p.plan} ${p.count}x $${money(p.revenue)}`).join('; ')}\n` +
        `Top clients (90d): ${s.clientRows.slice(0, 12).map((c) => `${c.name} $${money(c.total)}`).join('; ')}`
    );
  }

  const rec = await getReconcile().catch(() => null);
  if (rec) {
    const r = rec.data;
    out.push(
      `## Payment reconciliation (since ${r.from})\n` +
        `${r.standard} of ${r.scanned} are standard plan months. ` +
        `Prepayments: ${r.prepayments.map((p) => `${p.client} $${money(p.amount)} ~${p.months}mo ${p.plan}`).join('; ') || 'none'}. ` +
        `One-offs: ${r.oneOffs.slice(0, 8).map((o) => `${o.client} $${money(o.amount)} ${o.label}`).join('; ') || 'none'}`
    );
  }

  const co = await getCohorts(now).catch(() => null);
  if (co) {
    const c = co.data;
    const seen = new Map();
    for (const k of ['nectar2025', 'honeycomb2026', 'active3mo']) {
      for (const m of c[k] || []) seen.set(m.email || m.name, m);
    }
    const all = [...seen.values()];
    out.push(
      `## Clients & ICP (${all.length} unique across the 3 cohorts)\n` +
        `Cohort sizes: Nectar 2025+ ${c.nectar2025.length}, Honeycomb 2026+ ${c.honeycomb2026.length}, active >3mo ${c.active3mo.length}.\n` +
        all
          .sort((a, b) => b.spend - a.spend)
          .map(
            (m) =>
              `- ${m.name} (${m.domain}) · ${m.title || 'title unknown'} · ${m.roleType || '?'} · ` +
              `${m.companyType || '?'} · ${m.industry || 'industry unknown'}` +
              `${m.employeeCount ? ` · ${m.employeeCount} staff` : ''} · ${m.tenureMonths}mo · $${money(m.spend)} · ${(m.plans || []).join('/')}`
          )
          .join('\n')
    );
  }

  const d = safe(() => getDemos());
  if (d) {
    out.push(
      `## Demo → conversion (${d.window.from} → ${d.window.to})\n` +
        `${d.totalDemosInWindow} demos booked, ${d.conversions.length} converted.\n` +
        d.conversions
          .map(
            (x) =>
              `- ${x.client}${x.company ? ` (${x.company})` : ''} demo ${x.demoDate} → paid ${x.paidDate || '?'} · ${x.plan} · $${money(x.spend)}${x.note ? ` [${x.note}]` : ''}`
          )
          .join('\n') +
        (d.excluded?.length ? `\nExcluded: ${d.excluded.map((e) => `${e.who} (${e.reason})`).join('; ')}` : '')
    );
  }

  // Anything AJ has told a worker to remember, in his own words.
  for (const w of Object.values(TEAM)) {
    const dir = await getMemory(w.key, 'directives').catch(() => null);
    if (dir?.value?.length) {
      out.push(
        `## Standing instructions AJ gave ${w.name}\n` +
          dir.value.map((x) => `- (${String(x.at).slice(0, 10)}) ${x.note}`).join('\n')
      );
    }
  }

  // What AJ has stated outright. First in the briefing because it overrides
  // anything a worker might otherwise infer from the numbers.
  try {
    const { settledFacts } = await import('./bus.js');
    const f = settledFacts();
    if (f) out.unshift(`## Settled facts AJ has stated — treat as true, never ask about these\n${f}`);
  } catch { /* bus not loaded — briefing still works */ }

  return out.join('\n\n');
}

// --- Conversation memory -----------------------------------------------------
async function recentTurns(limit = 14) {
  const r = await _q(
    `SELECT direction, worker_key, text FROM messages
      WHERE text IS NOT NULL AND text <> ''
      ORDER BY id DESC LIMIT $1`,
    [limit]
  );
  return r.rows.reverse().map((m) => ({
    role: m.direction === 'in' ? 'user' : 'assistant',
    content: m.text.slice(0, 2000),
  }));
}

// Consecutive same-role turns are allowed by the API, but a leading assistant
// turn is not — trim until the history starts with AJ.
function normalise(turns) {
  const t = [...turns];
  while (t.length && t[0].role !== 'user') t.shift();
  return t;
}

// --- Tools -------------------------------------------------------------------
const TOOLS = [
  {
    name: 'ask_teammate',
    description:
      'Hand a task to another teammate. They run in the background and report into this same ' +
      'Telegram thread when done — so use this instead of telling AJ to go and ask them, and instead ' +
      'of saying you have no way to reach anyone. Give them the full ask; they cannot see this conversation.',
    input_schema: {
      type: 'object',
      properties: {
        teammate: { type: 'string', enum: ['Ricky', 'Tom', 'Sam', 'George', 'Ian', 'Fred'], description: 'Who should do it.' },
        task: { type: 'string', description: 'The complete request, self-contained, including any context they need.' },
      },
      required: ['teammate', 'task'],
    },
  },
  {
    name: 'save_knowledge',
    description:
      'Persist a FACT about a company or person so the whole hive has it from now on — ' +
      'job title, industry, headcount, size band, company type. Use this whenever AJ tells you ' +
      'something factual about a client or prospect, or you learn it from a source. ' +
      'This is different from remember: remember stores how AJ wants you to work, ' +
      'save_knowledge stores what is true about the world. Always save what you learn — ' +
      "don't ask AJ to repeat it later.",
    input_schema: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', enum: ['person', 'company'], description: 'person when you have an email, company when you only have a domain' },
        entity_key: { type: 'string', description: 'Their email for a person, or the company domain (e.g. lekielectric.com) for a company.' },
        name: { type: 'string', description: 'Person or company name.' },
        domain: { type: 'string', description: 'Company domain, always include it — it is how this joins to payments.' },
        company: { type: 'string' },
        title: { type: 'string', description: 'Job title (person only).' },
        roleType: { type: 'string', description: 'Marketing | Founder | Exec | Other (person only).' },
        companyType: { type: 'string', description: 'In-house | Agency.' },
        industry: { type: 'string' },
        subIndustry: { type: 'string' },
        employeeCount: { type: 'number' },
        sizeBand: { type: 'string', description: 'e.g. 2-10, 11-50, 51-200, 201-500, 500+' },
        heardFrom: { type: 'string', description: 'Where this came from — "AJ in Telegram", "Clay", a URL. Required: nothing is stored without a source.' },
      },
      required: ['entity_type', 'entity_key', 'heardFrom'],
    },
  },
  {
    name: 'remember',
    description:
      "Save a standing instruction or decision AJ has given you, so it survives restarts and " +
      'shapes your future work. Use it when AJ tells you how he wants something done, corrects ' +
      'you, or sets a target — not for small talk or for facts already in your briefing.',
    input_schema: {
      type: 'object',
      properties: {
        note: {
          type: 'string',
          description: "The instruction, in AJ's terms, phrased so it still makes sense weeks later.",
        },
      },
      required: ['note'],
    },
  },
];

async function askTeammate(fromKey, { teammate, task }) {
  const target = TEAM[NAME_TO_WORKER[String(teammate).toLowerCase()]];
  if (!target) return `No teammate called ${teammate}.`;
  const { queueJob } = await import('./bus.js');
  await queueJob(target.key, `${task}\n\n(Asked by ${TEAM[fromKey]?.name || fromKey} on AJ's behalf.)`);
  return `Queued for ${target.name}. They'll post into this thread when they're done — tell AJ you've asked them, don't repeat the request back to him.`;
}

async function storeKnowledge(workerKey, input) {
  const { entity_type, entity_key, heardFrom, ...facts } = input;
  const data = Object.fromEntries(Object.entries(facts).filter(([, v]) => v != null && v !== ''));
  const row = await saveKnowledge({
    entity_type,
    entity_key,
    data,
    source: { tool: 'telegram:aj', heardFrom, capturedAt: new Date().toISOString() },
    worker_key: workerKey,
  });
  // Make it usable immediately rather than at the next restart.
  applyKnowledge(await allKnowledge());
  await writeSignal({
    worker_key: workerKey,
    kind: 'finding',
    title: `Learned: ${data.name || entity_key} — ${[data.title, data.industry, data.employeeCount && `${data.employeeCount} staff`].filter(Boolean).join(', ') || 'details'}`,
    body: `${entity_type} ${entity_key}\n${JSON.stringify(data, null, 2)}\nHeard from: ${heardFrom}`,
    confidence: 'fact',
    source: row.source,
  });
  return `Saved and live now — ${entity_key} is in the hive's knowledge, so every teammate has it.`;
}

async function remember(workerKey, note) {
  const existing = (await getMemory(workerKey, 'directives').catch(() => null))?.value || [];
  const value = [...existing, { note, at: new Date().toISOString() }].slice(-40);
  const source = { tool: 'telegram:aj', capturedAt: new Date().toISOString() };
  await setMemory({ worker_key: workerKey, key: 'directives', value, source });
  await writeSignal({
    worker_key: workerKey,
    kind: 'decision',
    title: `AJ: ${note.slice(0, 90)}`,
    body: note,
    confidence: 'fact',
    source,
  });
  return `Saved. You now have ${value.length} standing instruction(s) from AJ.`;
}

// --- The reply ---------------------------------------------------------------
function systemPrompt(worker, briefing) {
  const who = worker
    ? `You are ${worker.name}, ${worker.title} at Design Bees. ${worker.brief}`
    : `You are the Design Bees hive — answer as the teammate best suited to the question ` +
      `(Ian for ICP/prospecting, Fred for revenue/finance) and say which of you is speaking.`;
  return (
    `${who}\n\n` +
    `You work for AJ, who owns Design Bees, a design subscription agency in Australia. ` +
    `You talk to him in a single Telegram thread, so keep replies short enough to read on a phone — ` +
    `a few lines, or a short list. Plain, direct, no preamble and no sign-off.\n\n` +
    `THE EVIDENCE RULE — this is the whole point of you:\n` +
    `- The briefing below is your ONLY source of numbers and client facts. You have no other data.\n` +
    `- Never invent or estimate a figure, name, date or company detail that isn't in it. ` +
    `If AJ asks for something you don't have, say plainly what's missing and what would be needed to get it.\n` +
    `- You may reason, compare, rank and draw conclusions from these figures — that's your job. ` +
    `Just be clear about which parts are the data and which are your read of it.\n` +
    `- Where a figure is from a snapshot rather than live, say so if it matters to the answer.\n\n` +
    `# Your team\n` +
    Object.values(TEAM).map((w) => `- *${w.name}* (${w.title})`).join('\n') + `\n` +
    `They are real teammates running in the background, not people AJ has to chase. If something is ` +
    `another teammate's job, or you need data you don't have, use ask_teammate — never tell AJ to go ` +
    `and ask them himself, and never say you have no way to contact anyone.\n` +
    `Live data access, held by the background workers (not by this chat): Ricky — Search Console, GA4, ` +
    `keyword volumes, query verdicts, transcripts; Tom — hive health and the /approve dashboard; Fred — ` +
    `live Wix plan orders, store orders and contacts; Sam — the blog engine pack. When AJ asks for ` +
    `something needing those tools, ask_teammate the right worker (including yourself) with the specific ` +
    `request — never say the hive lacks the access, and never claim a teammate holds a tool the list ` +
    `above gives to someone else.\n\n` +
    `When AJ gives you a standing instruction, a correction, or a target, call the remember tool ` +
    `so it sticks. Don't announce that you're doing it — just do it and carry on.\n\n` +
    `Use *single asterisks* for bold (Telegram markdown), never **double**.\n\n` +
    `# Hive briefing\n${briefing || '(no data loaded — say so rather than guessing)'}`
  );
}

/**
 * Reason about AJ's message and return the reply plus who should say it.
 * Returns null when there is no LLM key configured.
 */
export async function converse({ text, replyToText }) {
  if (!client) return null;
  const worker = routeWorker(text, replyToText);
  const briefing = await buildBriefing().catch((e) => {
    console.error('[brain] briefing failed:', e.message);
    return '';
  });

  const history = normalise(await recentTurns().catch(() => []));
  const messages = [...history, { role: 'user', content: text }];
  const system = systemPrompt(worker, briefing);

  let reply = '';
  for (let turn = 0; turn < 4; turn++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      output_config: { effort: 'low' },
      system,
      tools: TOOLS,
      messages,
    });

    reply = res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (res.stop_reason !== 'tool_use') break;

    const calls = res.content.filter((b) => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: res.content });
    const results = [];
    for (const c of calls) {
      let out;
      try {
        const wk = (worker || TEAM.scout).key;
        if (c.name === 'ask_teammate') out = await askTeammate(wk, c.input);
        else if (c.name === 'remember') out = await remember(wk, c.input.note);
        else if (c.name === 'save_knowledge') out = await storeKnowledge(wk, c.input);
        else out = `Unknown tool ${c.name}`;
      } catch (err) {
        out = `Failed: ${err.message}`;
      }
      results.push({ type: 'tool_result', tool_use_id: c.id, content: out });
    }
    messages.push({ role: 'user', content: results });
  }

  return { reply: reply || "I didn't get anywhere with that — try asking another way.", worker };
}
