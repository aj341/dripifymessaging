// The pull direction: Sam asking Ricky, rather than only being handed work.
//
// Until AJ pointed it out (2026-07-26) the chain was one-way — Ricky published a
// gap, Sam wrote it, and Sam had no way to initiate. These two tools give the
// writer a voice: propose a topic for a demand verdict, or ask for research he
// cannot do himself. Both land on topics Ricky already subscribes to, so the
// request wakes him the same way any other signal does.
//
// A proposal is a hypothesis, not a commission: Ricky can come back with
// "saturated" or "already owned", and that is a good outcome — it costs one
// research pass instead of a wasted article.
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

export const tools = [
  {
    name: 'propose_topic',
    description:
      'Put a topic YOU think is worth writing to Ricky for a demand verdict. Use this when your reading of ' +
      'the customer — a transcript, a Reddit thread, a pattern in what buyers ask — suggests a piece the ' +
      'gap list has not surfaced. He checks it against the ownership maps, the live blog and real search ' +
      'data, then publishes a gap verdict or tells you it is owned or saturated. You do NOT write it until ' +
      'that verdict comes back: a proposal is a hypothesis, and a "no" here costs one research pass instead ' +
      'of a wasted article. Say what you saw that made you think of it — the evidence is the proposal.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The buyer query in full question form, as a reader would type or ask it.' },
        why_you_think_it_matters: {
          type: 'string',
          description:
            'What you actually saw: the transcript moment, the Reddit thread and its phrasing, the pattern ' +
            'across demos. Quote the language buyers used. This is what Ricky researches against.',
        },
        angle: { type: 'string', description: 'The angle you would take, and what Design Bees knows that the current answers do not say.' },
        evidence_seen: {
          type: 'array',
          items: { type: 'string' },
          description: 'URLs or knowledge keys for what prompted this — Reddit permalinks, a transcript key, a GSC query you saw.',
        },
      },
      required: ['query', 'why_you_think_it_matters'],
    },
  },
  {
    name: 'request_research',
    description:
      'Ask Ricky to go and find something you cannot: the current SERP for a phrase, what buyers say about ' +
      'a theme, whether a figure you want to use is real, what competitors claim. He runs it and publishes ' +
      'what he finds. Use it instead of writing around a gap in your knowledge or reaching for a number you ' +
      'cannot source. Do not wait on the answer — carry on with what you can do, and pick the finding up ' +
      'when it lands.',
    input_schema: {
      type: 'object',
      properties: {
        what: { type: 'string', description: 'Exactly what you need found, specific enough for him to act on without asking you back.' },
        why: { type: 'string', description: 'What it unblocks — which piece, which claim, which decision.' },
        scope: {
          type: 'string',
          enum: ['serp', 'competitor', 'community', 'figure', 'any'],
          description: 'What kind of research: the live SERP, a competitor, community/Reddit language, verifying a figure, or unscoped.',
        },
      },
      required: ['what', 'why'],
    },
  },
];

export const handlers = {
  propose_topic: async (input = {}, ctx = {}) => {
    try {
      const query = clean(input.query);
      const why = clean(input.why_you_think_it_matters);
      if (!query) return 'Nothing proposed: give the buyer query in full question form.';
      if (why.length < 80) {
        return (
          `Nothing proposed: why_you_think_it_matters is ${why.length} chars. Ricky researches against what ` +
          'you actually saw — the transcript moment, the thread, the phrasing buyers used. Give him that.'
        );
      }
      const evidence = Array.isArray(input.evidence_seen) ? input.evidence_seen.map(clean).filter(Boolean) : [];
      await ctx.publish?.({
        topic: 'topic:proposed',
        title: `Sam proposes: "${query.slice(0, 100)}"`,
        body:
          `Proposed query: ${query}\n\n` +
          `Why Sam thinks it matters:\n${why}\n\n` +
          (clean(input.angle) ? `Angle Sam would take:\n${clean(input.angle)}\n\n` : '') +
          (evidence.length ? `What he saw:\n${evidence.map((e) => `- ${e}`).join('\n')}\n\n` : '') +
          `Ricky: check this against keyword-ownership-map.md, engine-content-map.md and the live blog, then ` +
          `run it through the five gates. Publish a gap verdict if it clears, or say plainly that it is owned ` +
          `or saturated — a no here is worth as much as a yes. Sam does not write it until you have ruled.`,
        data: { origin: 'sam-proposed', query, angle: clean(input.angle) || null, evidence },
        confidence: 'hypothesis',
      });
      return (
        `Proposed "${query}" to Ricky for a demand verdict. Do NOT draft it yet — wait for his ruling. ` +
        `Carry on with work that already has a verdict behind it.`
      );
    } catch (err) {
      return `Could not propose the topic (${err.message}). Nothing was sent.`;
    }
  },

  request_research: async (input = {}, ctx = {}) => {
    try {
      const what = clean(input.what);
      const why = clean(input.why);
      if (!what || !why) return 'Nothing requested: say exactly what you need found and what it unblocks.';
      const scope = ['serp', 'competitor', 'community', 'figure', 'any'].includes(input.scope) ? input.scope : 'any';
      await ctx.publish?.({
        topic: scope === 'any' ? 'request:research' : `request:research:${scope}`,
        title: `Research request from Sam: ${what.slice(0, 90)}`,
        body: `What: ${what}\n\nWhy it matters: ${why}\n\nScope: ${scope}`,
        data: { requested_by: 'voice', scope, what, why },
        confidence: 'unknown',
      });
      return (
        `Asked Ricky for: "${what}". Do not wait on it and do not fill the gap with a guess — carry on with ` +
        `what you can source, and pick his finding up when it lands.`
      );
    } catch (err) {
      return `Could not send the research request (${err.message}). Say plainly in your write-up what you were missing.`;
    }
  },
};
