// The content library — AJ's designbees-website-content repo, live.
//
// This is the hive's real memory of the website: strategy docs, live-data
// audits, cannibalisation reports, the performance tracker, schema, and the
// pages and articles themselves. It is cloned on boot and pulled periodically,
// so AJ's updates in that repo reach Sam and Ricky without a redeploy.
//
// WRITES ARE APPEND-ONLY, BY CONSTRUCTION (AJ's condition, 2026-07-26: "as long
// as they don't delete anything that's there"):
//   - new files only, under hive-drafts/ — a path outside that prefix is refused
//   - an existing path is refused rather than overwritten
//   - there is no delete, move or rmdir code path anywhere in this module, and
//     `git rm`/`git mv` are never invoked
// Everything AJ or anyone else put in that repo is therefore untouchable by the
// hive: the worst a worker can do is add a file in its own drafts folder.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const REPO = process.env.CONTENT_REPO || 'aj341/designbees-website-content';
const DIR = process.env.CONTENT_REPO_DIR || '/tmp/designbees-website-content';
const TOKEN = process.env.GITHUB_TOKEN; // only needed to push; reads work without it
const WRITE_PREFIX = 'hive-drafts/';    // the ONLY writable location
const PULL_EVERY_MS = 30 * 60 * 1000;
const MAX_READ = 60000;

let lastPull = 0;

function remote(withToken) {
  return withToken && TOKEN
    ? `https://x-access-token:${TOKEN}@github.com/${REPO}.git`
    : `https://github.com/${REPO}.git`;
}

async function git(args, opts = {}) {
  const { stdout } = await run('git', ['-C', DIR, ...args], { maxBuffer: 20 * 1024 * 1024, ...opts });
  return stdout;
}

export function contentLibraryConfigured() {
  return Boolean(REPO);
}
export function contentLibraryWritable() {
  return Boolean(TOKEN);
}
export function contentLibraryReady() {
  return fs.existsSync(path.join(DIR, '.git'));
}

/** Clone if absent, pull if stale. Safe to call often; never throws upward. */
export async function ensureLibrary({ force = false } = {}) {
  try {
    if (!contentLibraryReady()) {
      await fsp.mkdir(path.dirname(DIR), { recursive: true });
      await run('git', ['clone', '--depth', '50', remote(true), DIR], { maxBuffer: 20 * 1024 * 1024 });
      // Keep the token out of .git/config on disk; it is re-supplied per push.
      await git(['remote', 'set-url', 'origin', remote(false)]);
      await git(['config', 'user.email', 'hive@designbees.com.au']);
      await git(['config', 'user.name', 'Design Bees Hive']);
      lastPull = Date.now();
      console.log(`[content] cloned ${REPO} → ${DIR}`);
      return true;
    }
    if (force || Date.now() - lastPull > PULL_EVERY_MS) {
      await git(['pull', '--ff-only', remote(true), 'HEAD']).catch(async (e) => {
        // A diverged local branch must never be "fixed" by discarding files.
        console.warn('[content] pull failed, leaving the working copy alone:', e.message);
      });
      lastPull = Date.now();
    }
    return true;
  } catch (err) {
    console.error('[content] library unavailable:', err.message);
    return false;
  }
}

/** Resolve a repo-relative path, refusing anything that escapes the repo. */
function safePath(rel) {
  const clean = String(rel || '').replace(/^\/+/, '');
  const abs = path.resolve(DIR, clean);
  if (!abs.startsWith(path.resolve(DIR) + path.sep)) throw new Error('path escapes the repository');
  return { abs, rel: path.relative(DIR, abs) };
}

async function listFiles() {
  const out = await git(['ls-files']);
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

export const tools = [
  {
    name: 'list_content_library',
    description:
      "Every document in AJ's website-content repository — the real archive behind the site: growth and " +
      'web strategy, live-data audits (AEO/SEO impact report, blog impressions, page-by-page), the dated ' +
      'cannibalisation reports and performance tracker, remediation plans, schema, and the actual page and ' +
      'article copy. This is your library: read it before proposing or writing anything so you build on ' +
      'work already done instead of repeating it. Optionally filter by a path/name fragment.',
    input_schema: {
      type: 'object',
      properties: {
        contains: { type: 'string', description: 'Optional filter on the file path, e.g. "cannibalisation", "strategy", "page_".' },
      },
    },
  },
  {
    name: 'read_content_doc',
    description:
      'Read one document from the content library in full, by its exact path from list_content_library. ' +
      'Read the source rather than working from a summary of it — these documents carry the real Search ' +
      'Console figures, the ownership decisions and the reasoning behind them.',
    input_schema: {
      type: 'object',
      properties: { file: { type: 'string', description: 'Exact repo path, e.g. "AEO-SEO-impact-report-2026-07-24.md".' } },
      required: ['file'],
    },
  },
  {
    name: 'search_content_library',
    description:
      'Search the whole content library for a phrase and get the matching files with their matching lines. ' +
      'Use this to answer "have we already covered X?", "which document decided Y?", or to find every ' +
      'mention of a keyword across strategy, audits and page copy at once.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Phrase or keyword to find. Case-insensitive.' },
        limit: { type: 'integer', description: 'Max matching lines to return (default 40).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'save_to_content_library',
    description:
      "Add a NEW document to the content library, committed and pushed to AJ's repository so it lives with " +
      `the rest of the content work. Append-only by design: files go under ${WRITE_PREFIX} and nothing that ` +
      'already exists can be overwritten, moved or deleted — if the path is taken the call is refused and ' +
      'you pick a new name. Use it for finished drafts and reports worth keeping outside the hive database. ' +
      'AJ still approves anything customer-facing before it goes near the website.',
    input_schema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: `File name (a ${WRITE_PREFIX} prefix is added if you omit it). Kebab-case, dated where it helps, .md.`,
        },
        content: { type: 'string', description: 'The full document, markdown. Include a title and the date at the top.' },
        why: { type: 'string', description: 'One line for the commit message: what this document is and what produced it.' },
      },
      required: ['filename', 'content', 'why'],
    },
  },
];

export const handlers = {
  list_content_library: async (input = {}) => {
    if (!(await ensureLibrary())) return 'The content library could not be reached this run. Say so rather than guessing what it contains.';
    try {
      const filter = String(input.contains || '').toLowerCase();
      let files = await listFiles();
      if (filter) files = files.filter((f) => f.toLowerCase().includes(filter));
      if (!files.length) return `No files${filter ? ` matching "${filter}"` : ''} in the content library.`;
      return `${files.length} document(s) in ${REPO}:\n${files.map((f) => `• ${f}`).join('\n')}\n\nRead any of them with read_content_doc.`;
    } catch (err) {
      return `Could not list the content library: ${err.message}`;
    }
  },

  read_content_doc: async (input = {}) => {
    if (!(await ensureLibrary())) return 'The content library could not be reached this run.';
    try {
      const { abs, rel } = safePath(input.file);
      const text = await fsp.readFile(abs, 'utf8');
      return `# ${rel}\n\n${text.length > MAX_READ ? `${text.slice(0, MAX_READ)}\n\n[truncated]` : text}`;
    } catch (err) {
      return `Could not read "${input.file}" (${err.message}). Check the exact path with list_content_library.`;
    }
  },

  search_content_library: async (input = {}) => {
    if (!(await ensureLibrary())) return 'The content library could not be reached this run.';
    const q = String(input.query || '').trim();
    if (!q) return 'Give a phrase to search for.';
    const limit = Math.min(Math.max(Number(input.limit) || 40, 1), 200);
    try {
      // -I skips binaries (the cover PNGs), -n gives line numbers.
      const out = await git(['grep', '-I', '-n', '-i', '--', q]).catch((e) => {
        if (e.code === 1) return ''; // git grep exits 1 on no match
        throw e;
      });
      const lines = String(out).split('\n').filter(Boolean);
      if (!lines.length) return `No mention of "${q}" anywhere in the content library. That itself is useful: nothing written on it yet.`;
      const shown = lines.slice(0, limit).map((l) => `• ${l.slice(0, 300)}`);
      return (
        `${lines.length} matching line(s) for "${q}"${lines.length > limit ? ` (showing ${limit})` : ''}:\n` +
        `${shown.join('\n')}\n\nRead the full file with read_content_doc before drawing conclusions.`
      );
    } catch (err) {
      return `Search failed: ${err.message}`;
    }
  },

  save_to_content_library: async (input = {}, ctx = {}) => {
    if (!contentLibraryWritable()) {
      return 'The content library is READ-ONLY this run (no GITHUB_TOKEN on the service). Keep the document in the hive knowledge base instead and tell AJ it could not be filed to the repo.';
    }
    if (!(await ensureLibrary())) return 'The content library could not be reached this run — nothing was written.';

    const body = String(input.content || '');
    const why = String(input.why || '').trim();
    if (!body.trim()) return 'Nothing written: content is empty.';
    if (!why) return 'Nothing written: `why` is required — it becomes the commit message.';

    // Force the write inside the drafts prefix, whatever was passed.
    let name = String(input.filename || '').replace(/^\/+/, '');
    if (name.startsWith(WRITE_PREFIX)) name = name.slice(WRITE_PREFIX.length);
    if (name.includes('/')) name = name.split('/').pop();
    if (!/\.[a-z0-9]{1,6}$/i.test(name)) name += '.md';
    const rel = `${WRITE_PREFIX}${name}`;

    try {
      const { abs } = safePath(rel);
      // Never overwrite. An existing path is a refusal, not a merge.
      if (fs.existsSync(abs)) {
        return `REFUSED: ${rel} already exists and nothing in the library may be overwritten. Choose a different name (add a date or a version suffix) and call again.`;
      }
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, body, 'utf8');

      // Stage ONLY this file — never `git add -A`, so an unrelated local change
      // can't ride along, and nothing already tracked is ever touched.
      await git(['add', '--', rel]);
      const worker = ctx.workerKey || 'hive';
      await git(['commit', '-m', `${worker}: ${why}`.slice(0, 200), '--', rel]);
      try {
        await git(['push', remote(true), 'HEAD']);
      } catch (pushErr) {
        // A push that fails must not leave a local commit behind: a diverged
        // branch stops every later --ff-only pull, and the library would go
        // quietly stale. Roll back exactly our own commit and remove exactly
        // the file we just created — nothing that was already in the repo is
        // ever staged, committed or removed by this path.
        await git(['reset', '--soft', 'HEAD~1']).catch(() => {});
        await git(['restore', '--staged', '--', rel]).catch(() => {});
        await fsp.unlink(abs).catch(() => {});
        return (
          `NOT filed: the push to ${REPO} failed (${pushErr.message.slice(0, 200)}). The local commit and ` +
          `the new file have been rolled back so the library stays in sync — nothing pre-existing was touched. ` +
          `Keep the document in the hive knowledge base and tell AJ the repo write failed.`
        );
      }
      return `Filed to ${REPO} as ${rel} and pushed. Nothing else in the repository was touched — the hive can only add files under ${WRITE_PREFIX}.`;
    } catch (err) {
      return `Could not file the document (${err.message}). It was NOT pushed; keep it in the hive knowledge base and report the failure.`;
    }
  },
};
