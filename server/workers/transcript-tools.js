// Demo-transcript tools. Ricky owns these, but they live apart from his spec so
// any teammate can be given them later.
//
// These transcripts are the only source in the business that records, verbatim,
// why a prospect bought or didn't. Everything else — plan, tenure, spend — says
// what happened, not why. So a fact extracted here always carries the document
// it came from, and the model is told to quote rather than paraphrase the
// decisive line.
import { listTranscripts, readTranscript, googleConnected } from '../google.js';

// A transcript is long; the model reads it in one go, so cap what we hand back.
const MAX_CHARS = 60000;

export const tools = [
  {
    name: 'list_demo_transcripts',
    description:
      "List meeting-note documents from AJ's Google Drive, newest first. Each is one demo or client " +
      'call, titled with the participant and date. Start here, then read the ones you have not ' +
      'already recorded — check your knowledge first so you do not redo work.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: "Optional ISO date, e.g. '2026-03-01T00:00:00Z', to only list meetings after it." },
        limit: { type: 'number', description: 'How many to list. Default 25.' },
      },
    },
  },
  {
    name: 'read_demo_transcript',
    description:
      'Read one meeting document in full — Gemini summary, decisions, next steps and the verbatim ' +
      'transcript with speaker names. Use it to find what the prospect actually said.',
    input_schema: {
      type: 'object',
      properties: { fileId: { type: 'string', description: 'The file id from list_demo_transcripts.' } },
      required: ['fileId'],
    },
  },
  {
    name: 'record_demo_insight',
    description:
      'Record what a call revealed, and tell the hive. Use it once per meeting after reading it. ' +
      'Quote the prospect where you can — their words are the evidence. This wakes Ian, who checks ' +
      'it against who actually pays us.',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'Who was on the call.' },
        company: { type: 'string' },
        domain: { type: 'string', description: 'Company domain if you can tell — it is how this joins to payments.' },
        meetingDate: { type: 'string', description: 'YYYY-MM-DD.' },
        outcome: {
          type: 'string',
          enum: ['converted', 'not_converted', 'existing_client', 'unclear'],
          description: 'Only mark converted if the transcript actually shows it. Otherwise unclear.',
        },
        openingProblem: { type: 'string', description: "The problem they came with, in their words where possible." },
        objection: { type: 'string', description: 'What held them back, quoted if stated.' },
        decisionMaker: { type: 'string', description: 'Who decides — them, or someone else they named.' },
        industry: { type: 'string' },
        quote: { type: 'string', description: 'The single most revealing line they said, verbatim.' },
        sourceUrl: { type: 'string', description: 'The document link, so the claim can be checked.' },
      },
      required: ['person', 'meetingDate', 'outcome', 'sourceUrl'],
    },
  },
];

export const handlers = {
  list_demo_transcripts: async ({ since, limit = 25 }, _ctx) => {
    try {
      if (!(await googleConnected())) return 'Google Drive is not connected. Ask AJ to visit /auth/google.';
      const files = await listTranscripts({ since, limit });
      if (!files.length) return 'No meeting documents found for that window.';
      return files.map((f) => `${f.id} | ${f.name} | modified ${f.modifiedTime}`).join('\n');
    } catch (err) {
      return `Could not list transcripts: ${err.message}`;
    }
  },

  read_demo_transcript: async ({ fileId }, _ctx) => {
    try {
      const text = await readTranscript(fileId);
      return text.length > MAX_CHARS
        ? `${text.slice(0, MAX_CHARS)}\n\n[truncated — ${text.length} chars total]`
        : text;
    } catch (err) {
      return `Could not read ${fileId}: ${err.message}`;
    }
  },

  record_demo_insight: async (input, ctx) => {
    const { person, company, domain, meetingDate, outcome, openingProblem, objection, decisionMaker, industry, quote, sourceUrl } = input;
    try {
      const source = { tool: 'google-drive:meeting-notes', document: sourceUrl, meetingDate, capturedBy: 'Ricky' };
      const key = (domain || `${person}-${meetingDate}`).toLowerCase().replace(/\s+/g, '-');

      await ctx.saveKnowledge({
        entity_type: domain ? 'company' : 'topic',
        entity_key: key,
        data: {
          name: person, company, domain, industry,
          demo: { date: meetingDate, outcome, openingProblem, objection, decisionMaker, quote, source: sourceUrl },
        },
        source,
      });

      // Only a real buying signal should wake the rest of the team; an
      // existing-client check-in is worth recording but not worth a cascade.
      if (outcome !== 'existing_client' && (openingProblem || objection)) {
        await ctx.publish({
          topic: `pain:demo:${key}`,
          title: `${person}${company ? ` (${company})` : ''} — ${outcome.replace('_', ' ')}`,
          body:
            `Industry: ${industry || 'unknown'}\n` +
            `Came with: ${openingProblem || 'not stated'}\n` +
            `Held back by: ${objection || 'not stated'}\n` +
            `Decision maker: ${decisionMaker || 'unknown'}\n` +
            (quote ? `Their words: "${quote}"\n` : '') +
            `Source: ${sourceUrl}`,
          confidence: 'fact',
        });
      }
      return `Recorded ${person} (${outcome}). The hive has it.`;
    } catch (err) {
      return `Could not record: ${err.message}`;
    }
  },
};
