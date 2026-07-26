// Sam's access to how Design Bees actually sounds.
//
// AJ maintains a tone-of-voice messaging bible and content playbooks in Drive.
// Sam must read them before writing anything — a post in the wrong voice is
// worse than no post, because AJ has to rewrite it rather than just approve it.
import { listFolder, readDriveFile, BRAND_FOLDER, googleConnected } from '../google.js';

const MAX_CHARS = 40000;

export const tools = [
  {
    name: 'list_voice_guides',
    description:
      "List AJ's brand and voice documents — the tone-of-voice messaging bible, the social content " +
      'playbook, the reply playbook. Call this first, before writing anything.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_voice_guide',
    description:
      'Read one brand or voice document in full. Read the tone-of-voice messaging bible before you ' +
      'draft, every time — do not write from memory of it, and do not assume you already know the voice.',
    input_schema: {
      type: 'object',
      properties: {
        fileId: { type: 'string' },
        mimeType: { type: 'string', description: 'From list_voice_guides — decides how the file is fetched.' },
      },
      required: ['fileId'],
    },
  },
];

export const handlers = {
  list_voice_guides: async (_input, _ctx) => {
    try {
      if (!(await googleConnected())) return 'Google Drive is not connected.';
      const files = await listFolder(BRAND_FOLDER);
      if (!files.length) return 'No brand documents found.';
      return files.map((f) => `${f.id} | ${f.name} | ${f.mimeType}`).join('\n');
    } catch (err) {
      return `Could not list brand documents: ${err.message}`;
    }
  },

  read_voice_guide: async ({ fileId, mimeType }, _ctx) => {
    try {
      const text = await readDriveFile(fileId, mimeType);
      return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n\n[truncated]` : text;
    } catch (err) {
      return `Could not read ${fileId}: ${err.message}`;
    }
  },
};
