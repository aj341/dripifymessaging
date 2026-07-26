// Ricky's standing brief to keep the hive's own capabilities growing.
//
// The teammates are only as good as the tools and instructions they carry. The
// Claude ecosystem publishes a lot of skills — prompt packs, workflows, agent
// definitions — and most of it is public on GitHub. Finding one that fits a
// teammate is cheaper than building it, so this is a recurring job, not a
// one-off. Ricky proposes; AJ decides. Nothing is installed automatically.
export const tools = [
  {
    name: 'record_skill_candidate',
    description:
      'Record a Claude skill, agent or prompt pack you found that could make one of the teammates ' +
      'better, and put it in front of AJ. Only record ones you have actually seen — give the real ' +
      'repo URL. Say plainly which teammate it would help and what it would let them do that they ' +
      "cannot do today. Do not record something just because it exists; if it doesn't beat what the " +
      'teammate already has, skip it.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What the skill is called.' },
        repoUrl: { type: 'string', description: 'The GitHub URL you actually found it at.' },
        forTeammate: {
          type: 'string',
          enum: ['Ian', 'Fred', 'Ricky', 'Tom', 'Sam', 'George'],
          description: 'Who it would help.',
        },
        whatItDoes: { type: 'string', description: 'What it does, in a sentence.' },
        whyItHelps: { type: 'string', description: "What it unlocks that the teammate can't do today." },
        stars: { type: 'number', description: 'GitHub stars, if you saw them. Omit rather than guess.' },
        risk: { type: 'string', description: 'Anything AJ should weigh — unmaintained, needs a paid API, broad permissions.' },
      },
      required: ['name', 'repoUrl', 'forTeammate', 'whatItDoes', 'whyItHelps'],
    },
  },
];

export const handlers = {
  record_skill_candidate: async (input, ctx) => {
    const { name, repoUrl, forTeammate, whatItDoes, whyItHelps, stars, risk } = input;
    try {
      const key = repoUrl.replace(/^https?:\/\//, '').toLowerCase();
      await ctx.saveKnowledge({
        entity_type: 'topic',
        entity_key: `skill:${key}`,
        data: { name, repoUrl, forTeammate, whatItDoes, whyItHelps, stars, risk, status: 'proposed' },
        source: { tool: 'web-search:github', url: repoUrl, foundAt: new Date().toISOString() },
      });
      await ctx.publish({
        topic: 'capability:proposed',
        title: `Skill for ${forTeammate}: ${name}`,
        body:
          `${whatItDoes}\n\nWould give ${forTeammate}: ${whyItHelps}\n` +
          (stars ? `Stars: ${stars}\n` : '') +
          (risk ? `Worth weighing: ${risk}\n` : '') +
          `${repoUrl}\n\nAJ decides whether to adopt — nothing is installed automatically.`,
        confidence: 'hypothesis',
      });
      return `Recorded ${name} as a candidate for ${forTeammate} and flagged it for AJ.`;
    } catch (err) {
      return `Could not record: ${err.message}`;
    }
  },
};
