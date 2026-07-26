// The content library — AJ's designbees-website-content repo, live.
//
// This is the hive's real memory of the website: strategy docs, live-data
// audits, cannibalisation reports, the performance tracker, schema, and the
// pages and articles themselves.
//
// Reached through the GitHub REST API, not a clone: the Railway container has
// no git binary (the first deploy failed with `spawn git ENOENT`), and an API
// client has no binary dependency, no disk to keep in sync, and no working copy
// that can drift. Contents are cached in memory for 30 minutes, so AJ's edits
// reach Sam, Ricky and Tom without a redeploy.
//
// WRITES ARE APPEND-ONLY, BY CONSTRUCTION (AJ's condition, 2026-07-26: "as long
// as they don't delete anything that's there"):
//   - only PUT /contents, only under hive-drafts/ — a path outside that prefix
//     is rewritten into it, so a tracked file can never be targeted
//   - the request never carries a `sha`, which is GitHub's own rule for
//     create-only: updating an existing file REQUIRES its sha, so an overwrite
//     is rejected by GitHub (422) even if this code tried
//   - there is no DELETE call anywhere in this module
// The worst a worker can do is add a file in its own drafts folder.
const REPO = process.env.CONTENT_REPO || 'aj341/designbees-website-content';
const BRANCH = process.env.CONTENT_REPO_BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN; // reads work without it on a public repo
const WRITE_PREFIX = 'hive-drafts/';
const CACHE_MS = 30 * 60 * 1000;
const MAX_READ = 60000;
const API = 'https://api.github.com';

let tree = { at: 0, files: [] };
const fileCache = new Map(); // path -> { at, text }

export function contentLibraryConfigured() {
  return Boolean(REPO);
}
export function contentLibraryWritable() {
  return Boolean(TOKEN);
}

async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'designbees-hive',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const msg = data?.message || text.slice(0, 200);
    const err = new Error(`GitHub ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Every file path in the repo. Cached — the tree changes rarely. */
async function listFiles({ force = false } = {}) {
  if (!force && tree.files.length && Date.now() - tree.at < CACHE_MS) return tree.files;
  const data = await gh(`/repos/${REPO}/git/trees/${encodeURIComponent(BRANCH)}?recursive=1`);
  const files = (data.tree || []).filter((n) => n.type === 'blob').map((n) => n.path);
  tree = { at: Date.now(), files };
  return files;
}

const TEXTUAL = /\.(md|markdown|txt|json|csv|ya?ml|html?|js|py)$/i;

async function readFile(path) {
  const hit = fileCache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  const data = await gh(`/repos/${REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(BRANCH)}`);
  if (data.encoding !== 'base64' || typeof data.content !== 'string') {
    throw new Error('unexpected content encoding');
  }
  const text = Buffer.from(data.content, 'base64').toString('utf8');
  fileCache.set(path, { at: Date.now(), text });
  return text;
}

/** Force the write path inside the drafts prefix, whatever was passed. */
function draftPath(filename) {
  let name = String(filename || '').replace(/^\/+/, '');
  if (name.startsWith(WRITE_PREFIX)) name = name.slice(WRITE_PREFIX.length);
  if (name.includes('/')) name = name.split('/').pop();
  name = name.replace(/[^\w.\-]/g, '-');
  if (!/\.[a-z0-9]{1,6}$/i.test(name)) name += '.md';
  return `${WRITE_PREFIX}${name}`;
}

/** Boot-time reachability check; never throws upward. */
export async function ensureLibrary() {
  try {
    const files = await listFiles({ force: true });
    console.log(`[content] ${REPO}: ${files.length} file(s) reachable via the GitHub API`);
    return true;
  } catch (err) {
    console.error('[content] library unavailable:', err.message);
    return false;
  }
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
      "Add a NEW document to the content library, committed to AJ's repository so it lives with the rest " +
      `of the content work. Append-only by design: files go under ${WRITE_PREFIX} and nothing that already ` +
      'exists can be overwritten, moved or deleted — if the path is taken the call is refused and you pick ' +
      'a new name. Use it for finished drafts and reports worth keeping outside the hive database. AJ still ' +
      'approves anything customer-facing before it goes near the website.',
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
    try {
      const filter = String(input.contains || '').toLowerCase();
      let files = await listFiles();
      if (filter) files = files.filter((f) => f.toLowerCase().includes(filter));
      if (!files.length) return `No files${filter ? ` matching "${filter}"` : ''} in the content library.`;
      return `${files.length} document(s) in ${REPO}:\n${files.map((f) => `• ${f}`).join('\n')}\n\nRead any of them with read_content_doc.`;
    } catch (err) {
      return `Could not reach the content library (${err.message}). Say so rather than guessing what it contains.`;
    }
  },

  read_content_doc: async (input = {}) => {
    try {
      const file = String(input.file || '').replace(/^\/+/, '');
      if (!file) return 'Give the exact path from list_content_library.';
      const text = await readFile(file);
      return `# ${file}\n\n${text.length > MAX_READ ? `${text.slice(0, MAX_READ)}\n\n[truncated]` : text}`;
    } catch (err) {
      return `Could not read "${input.file}" (${err.message}). Check the exact path with list_content_library.`;
    }
  },

  search_content_library: async (input = {}) => {
    const q = String(input.query || '').trim();
    if (!q) return 'Give a phrase to search for.';
    const limit = Math.min(Math.max(Number(input.limit) || 40, 1), 200);
    try {
      const files = (await listFiles()).filter((f) => TEXTUAL.test(f));
      const needle = q.toLowerCase();
      const hits = [];
      for (const f of files) {
        let text;
        try {
          text = await readFile(f);
        } catch {
          continue; // one unreadable file must not kill the whole search
        }
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            hits.push(`${f}:${i + 1}: ${lines[i].trim().slice(0, 280)}`);
            if (hits.length >= limit * 3) break;
          }
        }
        if (hits.length >= limit * 3) break;
      }
      if (!hits.length) {
        return `No mention of "${q}" anywhere in the content library. That itself is useful: nothing written on it yet.`;
      }
      return (
        `${hits.length}${hits.length >= limit * 3 ? '+' : ''} matching line(s) for "${q}"` +
        `${hits.length > limit ? ` (showing ${limit})` : ''}:\n` +
        hits.slice(0, limit).map((h) => `• ${h}`).join('\n') +
        `\n\nRead the full file with read_content_doc before drawing conclusions.`
      );
    } catch (err) {
      return `Search failed: ${err.message}`;
    }
  },

  save_to_content_library: async (input = {}, ctx = {}) => {
    if (!contentLibraryWritable()) {
      return 'The content library is READ-ONLY this run (no GITHUB_TOKEN on the service). Keep the document in the hive knowledge base instead and tell AJ it could not be filed to the repo.';
    }
    const body = String(input.content || '');
    const why = String(input.why || '').trim();
    if (!body.trim()) return 'Nothing written: content is empty.';
    if (!why) return 'Nothing written: `why` is required — it becomes the commit message.';

    const path = draftPath(input.filename);
    try {
      // No `sha` in the payload: GitHub requires one to update an existing
      // file, so this call can only ever create. An existing path comes back
      // 422 and is reported as a refusal, not retried with a sha.
      await gh(`/repos/${REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'PUT',
        body: {
          message: `${ctx.workerKey || 'hive'}: ${why}`.slice(0, 200),
          content: Buffer.from(body, 'utf8').toString('base64'),
          branch: BRANCH,
        },
      });
      tree = { at: 0, files: [] }; // the listing is stale now
      return `Filed to ${REPO} as ${path}. Nothing else in the repository was touched — the hive can only add files under ${WRITE_PREFIX}.`;
    } catch (err) {
      if (err.status === 422) {
        return `REFUSED: ${path} already exists and nothing in the library may be overwritten. Choose a different name (add a date or a version suffix) and call again.`;
      }
      return `Could not file the document (${err.message}). Nothing was written; keep it in the hive knowledge base and report the failure.`;
    }
  },
};
