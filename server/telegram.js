// Telegram bridge: the hive's single thread to AJ.
// - send(): any worker (or the Queen) posts into the hive thread.
// - poll(): long-polls for AJ's replies, captures the chat id on first contact,
//   and marks the most recent open question answered.
//
// Runs on Railway (open internet). The build sandbox blocks api.telegram.org,
// which is exactly why this lives on the deploy host, not in an AI session.
import { getSetting, setSetting, logMessage } from './brain.js';
import { query as _q } from './db.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

let started = false;

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
  const result = await api('sendMessage', {
    chat_id: id,
    text: prefix + text,
    parse_mode: 'Markdown',
  });
  await logMessage({
    direction: 'out',
    worker_key: worker?.key || null,
    text,
    telegram_message_id: result.message_id,
  });
  return result;
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

  // Naive Phase-0 behaviour: treat a reply as the answer to the newest open
  // question. Phase 1 makes this properly conversational.
  const open = await _q(
    `SELECT id FROM questions WHERE status = 'open' ORDER BY asked_at DESC LIMIT 1`
  );
  if (open.rows[0]) {
    await _q(
      `UPDATE questions SET status='answered', answer=$1, answered_at=now() WHERE id=$2`,
      [msg.text, open.rows[0].id]
    );
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
