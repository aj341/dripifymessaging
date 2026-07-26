// Telegram bridge: the hive's single thread to AJ.
// - send(): any worker (or the Queen) posts into the hive thread.
// - poll(): long-polls for AJ's replies, captures the chat id on first contact,
//   and marks the most recent open question answered.
//
// Runs on Railway (open internet). The build sandbox blocks api.telegram.org,
// which is exactly why this lives on the deploy host, not in an AI session.
import { getSetting, setSetting, logMessage } from './brain.js';
import { query as _q } from './db.js';
import { converse, brainReady } from './converse.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

let started = false;

// Command registry: an inbound message like "/ledger" or "ledger" runs
// commands.ledger(). index.js populates this after the workers are imported.
export const commands = {};

export function telegramReady() {
  return Boolean(TOKEN);
}

async function api(method, payload) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description}`);
  return data.result;
}

async function chatId() {
  return process.env.TELEGRAM_CHAT_ID || (await getSetting('telegram_chat_id'));
}

/** Post a message into the hive thread. Prefixes the worker's name/emoji. */
export async function send(text, { worker } = {}) {
  if (!API) {
    console.warn('[telegram] no TELEGRAM_BOT_TOKEN set — cannot send.');
    return null;
  }
  const id = await chatId();
  if (!id) {
    console.warn('[telegram] no chat id yet — message the bot once so it can learn the thread.');
    return null;
  }
  const prefix = worker ? `${worker.emoji || ''} *${worker.name}*\n` : '';
  // Telegram hard-caps a message at 4096 characters and rejects the whole thing
  // if you exceed it. A busy tick easily writes more than that, and the failure
  // used to lose the entire message — so split on paragraph boundaries and send
  // in parts rather than dropping the lot.
  const parts = chunk(prefix + text, 3900);
  let result = null;
  for (let i = 0; i < parts.length; i++) {
    const body = parts.length > 1 ? `${parts[i]}${i < parts.length - 1 ? '\n…' : ''}` : parts[i];
    // Send as Markdown, but fall back to plain text if Telegram can't parse the
    // entities. Error messages often carry stray underscores/braces (e.g. a Wix
    // "permission_denied" payload) that break Markdown — without this fallback
    // the reply fails silently and looks like the bot ignored you.
    try {
      result = await api('sendMessage', { chat_id: id, text: body, parse_mode: 'Markdown' });
    } catch (err) {
      result = await api('sendMessage', { chat_id: id, text: body });
    }
  }
  await logMessage({
    direction: 'out',
    worker_key: worker?.key || null,
    text,
    telegram_message_id: result?.message_id,
  });
  return result;
}

/** Split text into Telegram-sized pieces, preferring paragraph then line breaks. */
function chunk(text, max) {
  const s = String(text || '');
  if (s.length <= max) return [s];
  const out = [];
  let rest = s;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    // Break at the last paragraph gap, then the last newline, then hard-cut.
    let cut = window.lastIndexOf('\n\n');
    if (cut < max * 0.5) cut = window.lastIndexOf('\n');
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  // Learn the thread on first contact.
  const known = await chatId();
  if (!known && msg.chat?.id) {
    await setSetting('telegram_chat_id', msg.chat.id);
    console.log(`[telegram] captured chat id ${msg.chat.id}`);
    await api('sendMessage', {
      chat_id: msg.chat.id,
      text: "🐝 Hive connected. This is the thread I'll talk to you in.",
    });
  }

  await logMessage({ direction: 'in', text: msg.text, telegram_message_id: msg.message_id });

  // AJ has spoken — the hive may work and speak again.
  try {
    const { clearAwaitingReply } = await import('./bus.js');
    await clearAwaitingReply();
  } catch { /* bus not loaded yet */ }

  const text = msg.text.trim();
  // A bare name or keyword runs the report: "Ian", "/ledger", "FinanceFred".
  // Anything with more to it — "Ian, what should we target?" — is a question for
  // that teammate, so it falls through to the conversation below.
  const words = text.split(/\s+/);
  const cmd = words[0].replace(/^\//, '').toLowerCase().replace(/[^a-z]/g, '');
  const isBareCommand = words.length === 1 || (words.length === 2 && /^[^a-z0-9]*$/i.test(words[1]));
  if (commands[cmd] && isBareCommand) {
    try {
      await commands[cmd](text);
    } catch (err) {
      console.error(`[telegram] command ${cmd} failed:`, err.message);
      await send(`⚠️ ${cmd} failed: ${err.message}`).catch(() => {});
    }
    return;
  }

  // Record the answer to whatever the hive last asked, so a question doesn't
  // stay open once AJ has replied to it.
  const open = await _q(
    `SELECT id FROM questions WHERE status = 'open' ORDER BY asked_at DESC LIMIT 1`
  );
  if (open.rows[0]) {
    await _q(
      `UPDATE questions SET status='answered', answer=$1, answered_at=now() WHERE id=$2`,
      [msg.text, open.rows[0].id]
    );
  }

  // Anything that isn't a command is a conversation. Route it to the teammate
  // AJ named or replied to, and let them think about it.
  if (!brainReady()) {
    await send(
      "🐝 I can run the reports (`help` lists them), but I can't hold a conversation yet — " +
        'that needs an Anthropic API key on the service.'
    ).catch(() => {});
    return;
  }
  try {
    // If the teammate has to go and do real work, AJ hears that immediately
    // rather than staring at silence while a research pass runs. A question
    // answered straight from the briefing never triggers this.
    const out = await converse({
      text,
      replyToText: msg.reply_to_message?.text,
      onWork: async (worker) => {
        await send('On it. Give me a few minutes and I will come back with what I find.', {
          worker: worker || undefined,
        });
      },
    });
    if (out) await send(out.reply, { worker: out.worker || undefined });
  } catch (err) {
    console.error('[brain] converse failed:', err.message);
    await send(`⚠️ I couldn't think that through: ${err.message}`).catch(() => {});
  }
}

/** Long-poll loop. Non-blocking; resolves immediately after starting. */
export async function startPolling() {
  if (!API || started) return;
  started = true;
  console.log('[telegram] polling for replies…');

  (async function loop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const offset = Number(await getSetting('telegram_offset')) || 0;
        const updates = await api('getUpdates', { offset, timeout: 50 });
        for (const u of updates) {
          await handleUpdate(u);
          await setSetting('telegram_offset', u.update_id + 1);
        }
      } catch (err) {
        console.error('[telegram] poll error:', err.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
}
