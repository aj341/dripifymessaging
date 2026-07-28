// Prepayments AJ has confirmed, with the months they actually cover.
//
// Why this file exists: `reconcilePayments` infers a prepayment from the amount
// alone — it solves `amount ≈ price × months × (1 − discount)` and then assumes
// the cover starts at the payment date. That second half is a guess, and it has
// been wrong twice over.
//
//   Google invoice #0000379 — $5,290.01 paid 17 April covers February and
//   April, skipping March. Only the purchase order says so.
//
//   Kristina Charchalis-Rana — $2,868 with no PO, no months on the invoice, and
//   a pro-rata credit baked into the number. Nothing on the document could have
//   told us it was July and August.
//
// So the rule (AJ, 28 Jul 2026) is: EVERY prepayment is confirmed by AJ
// personally. A purchase order is welcome evidence when one exists, but it is
// not the mechanism — his word is. Anything not in this file is unconfirmed by
// definition, gets reported as such, and never lands in a total.
//
// Matching is on `amount` (to the cent) plus `paidOn`, because the Wix
// transactions for these carry no customer name — which is exactly why they
// showed up as "Unknown" and started the whole thread.

export const CONFIRMED_PREPAYMENTS = [
  {
    // Two separate Nectar months billed on one invoice. Not a discounted block:
    // $2,645.01/mo is the standard Nectar price. The unusual part is the gap.
    amount: 5290.01,
    paidOn: '2026-04-17',
    client: 'Google DSBO Channel Team, Training & Advocacy Support',
    contact: 'Ayschia Ferguson',
    plan: 'Nectar',
    covers: ['2026-02', '2026-04'],
    discountPct: 0,
    evidence: {
      kind: 'purchase-order',
      doc: 'Google PO — invoice #0000379',
      po: '9279014679',
      issued: '2026-03-17',
      lineItems: ['Invoice Nectar Plan Feb A$2,404.55', 'Invoice Nectar Plan April A$2,404.55'],
      exGst: 4809.1,
      gst: 480.91,
    },
    confirmedBy: 'AJ',
    confirmedOn: '2026-07-28',
  },
  {
    // The six-month block at a reduced rate.
    // $13,489.50 / 6 = $2,248.25/mo against a $2,645 standard = exactly 15% off.
    amount: 13489.5,
    paidOn: '2026-06-12',
    client: 'Google DSBO Channel Team, Training & Advocacy Support',
    contact: 'Ayschia Ferguson',
    plan: 'Nectar',
    covers: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'],
    discountPct: 15,
    evidence: {
      kind: 'purchase-order',
      doc: 'Google PO — invoice #0000432',
      po: '9279014679',
      issued: '2026-05-15',
      lineItems: ['Nectar Plan x 6 Mths — Nectar Plan Jun-Nov (6 Months) A$12,263.18'],
      exGst: 12263.18,
      gst: 1226.32,
    },
    confirmedBy: 'AJ',
    confirmedOn: '2026-07-28',
  },
  {
    // No PO, no months on the invoice — confirmed by AJ directly, which is the
    // case this whole mechanism now assumes is normal.
    //
    // Cash and revenue differ here, so `recognise` carries the revenue and
    // `amount` stays the cash. She upgraded off Worker Bee after 7 days and the
    // unused remainder was credited against the upgrade:
    //
    //   2 × $1,645 Honeycomb Plus            $3,290.00
    //   less unused Worker Bee, 24 of 31d    −$421.94
    //   charge                                $2,868.06   (paid $2,868)
    //
    // The $545 Worker Bee payment therefore only earns $123.06 in its own
    // month — 7 of 31 days — with $421.94 carried into July. $123.06 + $421.94
    // = $545.00. AJ recalled the credit as roughly $410; the team's actual
    // figure reconciles to six cents, so no correction is needed.
    amount: 2868,
    client: 'Kristina Charchalis-Rana',
    plan: 'Honeycomb Plus',
    soldBy: 'Alder',
    covers: ['2026-07', '2026-08'],
    recognisePerMonth: 1645,
    creditApplied: 421.94,
    discountPct: 0,
    evidence: {
      kind: 'aj-confirmation',
      doc: 'AJ, Telegram/Claude Code, 28 Jul 2026',
      note:
        'Upgraded from Worker Bee after 7 days on the plan; the unused remainder ' +
        'was taken off the two Honeycomb months. Months are July and August.',
      linkedPayment: {
        amount: 545,
        plan: 'Worker Bee',
        earned: 123.06,
        creditedForward: 421.94,
        // Deliberately not auto-applied: a $545 Worker Bee payment is the
        // standard price and matching on the amount alone would capture other
        // clients' months too. Recorded here so the split is on the record.
        needsFromAj: 'Which month the $545 Worker Bee payment sits in, so only $123.06 is earned there.',
      },
    },
    confirmedBy: 'AJ',
    confirmedOn: '2026-07-28',
  },
];

/**
 * Clients Wix leaves unnamed on the transaction.
 *
 * These payments arrive with no billing name and land as "Unknown", which is
 * how two Google invoices sat unattributed for months. Naming them here means
 * they are attributed everywhere — revenue by client, reconciliation, the lot —
 * not just inside a prepayment row.
 */
export const CLIENT_ATTRIBUTION = [
  {
    client: 'Google DSBO Channel Team, Training & Advocacy Support',
    contact: 'Ayschia Ferguson',
    po: '9279014679',
    // Payments confirmed as theirs. Add to this as new ones are confirmed —
    // amounts are matched to the cent, so nothing else can be swept in.
    amounts: [5290.01, 13489.5],
    confirmedBy: 'AJ',
    confirmedOn: '2026-07-28',
  },
];

const money2 = (n) => Math.round(n * 100) / 100;

/** The confirmed entry for a payment, or null. Matched on amount + date. */
export function confirmedFor(amount, dateIso) {
  const day = String(dateIso || '').slice(0, 10);
  return (
    CONFIRMED_PREPAYMENTS.find(
      (c) => Math.abs(c.amount - amount) <= 0.01 && (!c.paidOn || !day || c.paidOn === day)
    ) || null
  );
}

/** A standing client attribution for an otherwise unnamed payment, or null. */
export function attributionFor(amount) {
  return (
    CLIENT_ATTRIBUTION.find((a) => a.amounts.some((x) => Math.abs(x - amount) <= 0.01)) || null
  );
}

/** Revenue recognised per covered month. Not always cash ÷ months — see Kristina. */
export function monthlyOf(entry) {
  return money2(entry.recognisePerMonth ?? entry.amount / entry.covers.length);
}
