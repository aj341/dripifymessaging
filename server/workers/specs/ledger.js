// Fred — Revenue & Finance. Wix is the source of truth for money.
//
// Fred is the teammate the others check commercial reality against: Ian can say
// an industry looks promising, but only Fred can say what it has actually paid.
import { getRevenue, getReconcile, money } from '../../wix.js';

export default {
  key: 'ledger',
  name: 'Fred',
  emoji: '📊',
  title: 'Revenue & Finance',
  brief: `You own revenue and finance for Design Bees. Wix is the source of truth for money — every
figure you give comes from there, never from memory or estimation. You care about what came in this
month, how it compares to last, the plan mix, prepayments and one-off payments that aren't a standard
plan price, and which clients carry the most revenue.

You are the commercial reality check for the rest of the hive. When a teammate says a segment looks
promising, you are the one who can say whether it has actually paid. Answer with the number and the
period it covers, and say plainly when a figure is a cached snapshot rather than live.

Never invent or extrapolate a number. AJ has been given wrong revenue figures before and it cost
trust — if you cannot source it, say so and ask for what you'd need.`,

  subscribes: ['request:wix', 'request:revenue', 'finance:*'],
  emits: ['finance:pulse', 'finance:anomaly'],
  useWebSearch: false,

  tools: [
    {
      name: 'revenue_snapshot',
      description:
        'The current revenue picture from Wix: this month, same point last month, YTD, active clients, ' +
        'plan mix and top clients by spend. Use this before answering anything about money.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'payment_reconciliation',
      description:
        'Payments since April 2026 classified as standard plan months, multi-month prepayments, or ' +
        "one-offs. Use when asked about prepayments, discounts, or payments that don't match a plan price.",
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'report_finding',
      description:
        'Publish a finance finding so the rest of the hive gets it — a revenue anomaly, a churn risk, ' +
        'or an answer a teammate asked you for.',
      input_schema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'finance:pulse for routine, finance:anomaly for something that needs attention.' },
          title: { type: 'string' },
          detail: { type: 'string', description: 'The finding, with the figures and the period they cover.' },
        },
        required: ['topic', 'title', 'detail'],
      },
    },
  ],

  handlers: {
    revenue_snapshot: async (_input, ctx) => {
      try {
        const { data: s, live, asOf } = await getRevenue(new Date());
        return (
          `Source: Wix ${live ? '(live)' : `(snapshot as of ${asOf})`}\n` +
          `This month: $${money(s.monthRevenue)} across ${s.monthCount} payments\n` +
          `Same point last month: $${money(s.lastMonthRevenue)} (${s.lastMonthCount})\n` +
          `${s.year} YTD: $${money(s.ytd)} (${s.ytdCount} payments)\n` +
          `Active clients, 90d: ${s.activeClients90}\n` +
          `Plan mix: ${s.planRows.map((p) => `${p.plan} ${p.count}× $${money(p.revenue)}`).join('; ')}\n` +
          `Top clients 90d: ${s.clientRows.slice(0, 15).map((c) => `${c.name} $${money(c.total)}`).join('; ')}`
        );
      } catch (err) {
        return `Couldn't read Wix: ${err.message}. Report this rather than estimating.`;
      }
    },

    payment_reconciliation: async (_input, ctx) => {
      try {
        const { data: r, live, asOf } = await getReconcile();
        return (
          `Source: Wix ${live ? '(live)' : `(snapshot as of ${asOf})`}, since ${r.from}\n` +
          `${r.standard} of ${r.scanned} payments are standard plan months.\n` +
          `Prepayments: ${r.prepayments.map((p) => `${p.client} $${money(p.amount)} ≈${p.months}mo ${p.plan}`).join('; ') || 'none'}\n` +
          `One-offs: ${r.oneOffs.slice(0, 12).map((o) => `${o.client} $${money(o.amount)} ${o.label}`).join('; ') || 'none'}`
        );
      } catch (err) {
        return `Couldn't read Wix: ${err.message}. Report this rather than estimating.`;
      }
    },

    report_finding: async ({ topic, title, detail }, ctx) => {
      try {
        await ctx.publish({ topic, title, body: detail, confidence: 'fact' });
        return `Published ${topic} — the hive has it.`;
      } catch (err) {
        return `Couldn't publish: ${err.message}`;
      }
    },
  },
};
