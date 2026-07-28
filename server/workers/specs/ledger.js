// Fred — Revenue & Finance. Wix is the source of truth for money.
//
// Fred is the teammate the others check commercial reality against: Ian can say
// an industry looks promising, but only Fred can say what it has actually paid.
import { getRevenue, getReconcile, getRecognised, money } from '../../wix.js';
import { wixOauthConnected, planOrders, ecomOrders, findContacts } from '../../wix-oauth.js';

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
trust — if you cannot source it, say so and ask for what you'd need.

LIVE WIX ACCESS (via the read-only app AJ installed 2026-07-26): wix_subscriptions reads the pricing
plan orders straight from Wix — plan, status, price, start/cancel dates. This is where churn stops
being a guess: CANCELED and ENDED orders carry their dates, and the plan mix is what it actually is
today. wix_recent_orders reads one-off store orders; wix_find_contact joins money to a person. Two
rules. First, RECONCILE BEFORE YOU TRUST: the accepted benchmarks are July 2026 MTD $36,076 and 2026
YTD $243,167 from the snapshot — the first time live data is used for a total, compare against these
and report any gap to AJ instead of silently preferring either source. Second, remember the settled
facts: a cancellation is not automatically churn (Richard Lowe cancelled because he ran out of design
work and still buys one-offs; Peter Nittes was always a ~3-month engagement) — the status field says
what happened, never why. Say "Source: Wix live" or "Source: snapshot" with every figure.

PREPAYMENTS COVER MONTHS, NOT DATES. A payment arrives once and buys several months, and not
necessarily the ones straight after it. The reconciliation infers month COUNT from the amount, and
then assumes the cover starts at the payment date — that second half is a guess and it has been
wrong. Google invoice #0000379 is the proof: $5,290.01 paid on 17 April covers February and April,
skipping March entirely. So when anyone asks what a month should show, call revenue_recognised, not
payment_reconciliation. Report a period as settled only when the basis is "confirmed" — that means
AJ has handed us the purchase order. Say "inferred" out loud otherwise, and never fold an inferred
or pending amount into a total.

SETTLED (AJ, 28 Jul 2026): both Nectar prepayments previously showing as "Unknown" are the same
client — Google DSBO Channel Team, contact Ayschia Ferguson, PO 9279014679. $5,290.01 covers Feb and
Apr at the standard $2,645/mo. $13,489.50 covers Jun-Nov at $2,248.25/mo, 15% off for the six-month
commitment. June's confirmed prepayment component is $2,248.25 and nothing else.`,

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
        "one-offs. Use when asked about prepayments, discounts, or payments that don't match a plan price. " +
        'Each prepayment carries a basis: confirmed (AJ has given us the purchase order and we know the ' +
        'exact months), pending (arrangement known, something still open), or inferred (period is a guess ' +
        'from the amount). Never report an inferred period as settled.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'revenue_recognised',
      description:
        'Prepayment revenue belonging to a given month, spread over the months the purchase order ' +
        'actually names rather than the month the money arrived. Use this whenever asked what a month ' +
        "should show — a payment lands once but buys several months, and not always the ones that follow " +
        'it. Anything still inferred is listed separately and excluded from the total.',
      input_schema: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'The month to recognise into, as YYYY-MM (e.g. 2026-06).' },
        },
        required: ['month'],
      },
    },
    {
      name: 'wix_subscriptions',
      description:
        'LIVE pricing-plan orders from Wix (read-only app): every subscription with plan name, status ' +
        '(ACTIVE / CANCELED / ENDED / PAUSED), price, start and cancel dates. This is the churn ledger and ' +
        'the real plan mix. Statuses say what happened, never why — check the settled facts before calling ' +
        'anything churn. If Wix is not connected, this says so; never substitute an estimate.',
      input_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ACTIVE', 'CANCELED', 'ENDED', 'PAUSED'], description: 'Optional filter.' },
          limit: { type: 'integer', description: 'How many orders, newest first. Default 100, max 300.' },
        },
      },
    },
    {
      name: 'wix_recent_orders',
      description:
        'LIVE store/eCommerce orders from Wix (read-only app) — one-off jobs and non-subscription payments, ' +
        'newest first, with totals and payment status. Use for hourly custom work (e.g. Richard Lowe one-offs) ' +
        'and anything that is not a plan payment.',
      input_schema: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'Default 50, max 100.' } },
      },
    },
    {
      name: 'wix_find_contact',
      description:
        'Look up Wix contacts by name or email fragment (read-only) — for joining a payment or subscription ' +
        'to a person. Never use it to browse; look up the specific person a finding is about.',
      input_schema: {
        type: 'object',
        properties: { search: { type: 'string', description: 'Name or email fragment.' } },
        required: ['search'],
      },
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
        const pre = r.prepayments.map((p) => {
          if (p.basis === 'confirmed') {
            return `${p.client} $${money(p.amount)} ${p.plan} — CONFIRMED, covers ${p.covers.join(', ')} at $${money(p.monthly)}/mo${p.discountPct ? ` (${p.discountPct}% off)` : ' (standard rate)'} [${p.evidence.doc}]`;
          }
          if (p.basis === 'pending') {
            return `${p.client} $${money(p.amount)} ${p.plan} — PENDING: ${p.open.join(' ')}`;
          }
          return `${p.client} $${money(p.amount)} ≈${p.months}mo ${p.plan} — INFERRED, period is a guess`;
        });
        return (
          `Source: Wix ${live ? '(live)' : `(snapshot as of ${asOf})`}, since ${r.from}\n` +
          `${r.standard} of ${r.scanned} payments are standard plan months.\n` +
          `Prepayments:\n${pre.map((l) => `  • ${l}`).join('\n') || '  none'}\n` +
          `One-offs: ${r.oneOffs.slice(0, 12).map((o) => `${o.client} $${money(o.amount)} ${o.label}`).join('; ') || 'none'}`
        );
      } catch (err) {
        return `Couldn't read Wix: ${err.message}. Report this rather than estimating.`;
      }
    },

    revenue_recognised: async (input = {}) => {
      const month = String(input.month || '').trim();
      if (!/^\d{4}-\d{2}$/.test(month)) return 'Give me the month as YYYY-MM, e.g. 2026-06.';
      try {
        const { data: g, live, asOf } = await getRecognised(month);
        const rows = g.recognised.map(
          (r) => `  • ${r.client} — $${money(r.amount)} (${r.plan}, ${1}/${r.covers.length} of $${money(r.of)} covering ${r.covers.join(', ')}) [${r.evidence}]`
        );
        const open = g.unresolved.map((u) => `  • ${u.client} — $${money(u.amount)} ${u.plan} [${u.basis}] — ${u.why}`);
        return (
          `Source: Wix ${live ? '(live)' : `(snapshot as of ${asOf})`}\n` +
          `Prepayment revenue recognised in ${month}: $${money(g.total)}\n` +
          `${rows.join('\n') || '  • nothing confirmed for this month'}\n` +
          `Not counted (period not confirmed — do NOT add these to the total or guess a month):\n` +
          `${open.join('\n') || '  • none'}`
        );
      } catch (err) {
        return `Couldn't read Wix: ${err.message}. Report this rather than estimating.`;
      }
    },

    wix_subscriptions: async (input = {}) => {
      try {
        if (!(await wixOauthConnected())) {
          return 'Wix live access is not connected yet — AJ visits /auth/wix once. Until then use revenue_snapshot and say the figures are from the snapshot.';
        }
        const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 300);
        let orders = await planOrders({ limit });
        if (input.status) orders = orders.filter((o) => o.status === input.status);
        if (!orders.length) return `Wix live returned no plan orders${input.status ? ` with status ${input.status}` : ''}. That is the real answer — report it as such.`;

        const mix = {};
        for (const o of orders) {
          const k = `${o.planName || 'unknown'} / ${o.status}`;
          mix[k] = (mix[k] || 0) + 1;
        }
        const lines = orders.slice(0, 60).map((o) => {
          const price = o.price ? `$${o.price}${o.currency ? ` ${o.currency}` : ''}` : 'price n/a';
          const cancel = o.canceledDate ? ` · cancelled ${String(o.canceledDate).slice(0, 10)}${o.cancellationReason ? ` (${o.cancellationReason})` : ''}` : '';
          return `• ${o.planName || 'unknown plan'} — ${o.status} — ${price} · started ${String(o.startDate || o.createdDate).slice(0, 10)}${cancel}`;
        });
        return (
          `Source: Wix live (pricing-plan orders, ${orders.length} returned${orders.length === limit ? ', limit hit — there may be more' : ''})\n` +
          `Mix: ${Object.entries(mix).map(([k, n]) => `${k} ×${n}`).join('; ')}\n\n${lines.join('\n')}` +
          (orders.length > 60 ? `\n…and ${orders.length - 60} more.` : '') +
          `\n\nRemember: in billing data Honeycomb and Honeycomb Plus are the SAME plan, and a CANCELED status says what happened, not why.`
        );
      } catch (err) {
        return `Wix live read failed: ${err.message}. Fall back to revenue_snapshot and say so — never estimate.`;
      }
    },

    wix_recent_orders: async (input = {}) => {
      try {
        if (!(await wixOauthConnected())) {
          return 'Wix live access is not connected yet — AJ visits /auth/wix once.';
        }
        const orders = await ecomOrders({ limit: Math.min(Math.max(Number(input.limit) || 50, 1), 100) });
        if (!orders.length) return 'Wix live returned no store orders. That is the real answer.';
        const lines = orders.map(
          (o) =>
            `• #${o.number} — $${o.total || '?'} ${o.currency || ''} — ${o.paymentStatus} — ${String(o.createdDate).slice(0, 10)}${
              o.buyerEmail ? ` — ${o.buyerEmail}` : ''
            } — ${o.items.join(', ')}`
        );
        return `Source: Wix live (store orders, ${orders.length})\n${lines.join('\n')}`;
      } catch (err) {
        return `Wix live read failed: ${err.message}. Say so rather than estimating.`;
      }
    },

    wix_find_contact: async (input = {}) => {
      try {
        if (!(await wixOauthConnected())) return 'Wix live access is not connected yet — AJ visits /auth/wix once.';
        const search = String(input.search || '').trim();
        if (!search) return 'Give a name or email fragment to search for.';
        const contacts = await findContacts({ search });
        if (!contacts.length) return `No Wix contacts match "${search}".`;
        return contacts
          .map((c) => `• ${c.name || 'unnamed'} — ${c.email || 'no email'}${c.company ? ` — ${c.company}` : ''} (since ${String(c.createdDate).slice(0, 10)})`)
          .join('\n');
      } catch (err) {
        return `Contact lookup failed: ${err.message}.`;
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
