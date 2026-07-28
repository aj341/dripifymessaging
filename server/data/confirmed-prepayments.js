// Prepayments AJ has confirmed, with the months they actually cover.
//
// Why this file exists: `reconcilePayments` infers a prepayment from the amount
// alone — it solves `amount ≈ price × months × (1 − discount)` and then assumes
// the cover starts at the payment date. That second half is a guess, and Google
// invoice #0000379 proves it can be wrong: $5,290.01 paid on 17 April covers
// February and April, not April and May. No arithmetic on the amount could ever
// have found that; it is only on the purchase order.
//
// So anything in here overrides the inference. An entry is a fact with a
// receipt attached. Anything not in here stays `inferred` and Fred is expected
// to say so rather than report it as settled.
//
// Adding an entry: match on `amount` (to the cent) plus `paidOn`, because the
// Wix transactions for these carry no customer name — that is exactly why they
// showed up as "Unknown" and started this whole thread.

export const CONFIRMED_PREPAYMENTS = [
  {
    // Invoice #0000379 — two separate Nectar months billed on one invoice.
    // Not a discounted block: $2,645.01/mo is the standard Nectar price. The
    // only unusual thing is that it skips March.
    amount: 5290.01,
    paidOn: '2026-04-17',
    client: 'Google DSBO Channel Team, Training & Advocacy Support',
    contact: 'Ayschia Ferguson',
    plan: 'Nectar',
    covers: ['2026-02', '2026-04'],
    discountPct: 0,
    evidence: {
      doc: 'Google PO — invoice #0000379',
      po: '9279014679',
      issued: '2026-03-17',
      lineItems: ['Invoice Nectar Plan Feb A$2,404.55', 'Invoice Nectar Plan April A$2,404.55'],
      exGst: 4809.1,
      gst: 480.91,
      paidBy: 'bank transfer',
    },
    confirmedBy: 'AJ',
    confirmedOn: '2026-07-28',
  },
  {
    // Invoice #0000432 — the six-month block at a reduced rate.
    // $13,489.50 / 6 = $2,248.25/mo against a $2,645 standard = exactly 15% off.
    amount: 13489.5,
    paidOn: '2026-06-12',
    client: 'Google DSBO Channel Team, Training & Advocacy Support',
    contact: 'Ayschia Ferguson',
    plan: 'Nectar',
    covers: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'],
    discountPct: 15,
    evidence: {
      doc: 'Google PO — invoice #0000432',
      po: '9279014679',
      issued: '2026-05-15',
      lineItems: ['Nectar Plan x 6 Mths — Nectar Plan Jun-Nov (6 Months) A$12,263.18'],
      exGst: 12263.18,
      gst: 1226.32,
      paidBy: 'bank transfer',
    },
    confirmedBy: 'AJ',
    confirmedOn: '2026-07-28',
  },
];

// Prepayments where AJ has confirmed the arrangement but something is still
// open. These deliberately do NOT get recognised into a month — Fred reports
// the structure and the open question instead of picking a number.
export const PENDING_PREPAYMENTS = [
  {
    amount: 2868,
    client: 'Kristina Charchalis-Rana',
    plan: 'Honeycomb Plus',
    soldBy: 'Alder',
    months: 2,
    relatedPayment: 545,
    known:
      'Two months of Honeycomb Plus, sold by Alder, at a reduced rate. She had ' +
      'already paid a month of a lower plan and the difference was taken off. ' +
      'AJ: allocate $1,645 to one month and $1,645 to the next; there is a ' +
      'second payment of $545 against her as well.',
    open: [
      // $1,645 × 2 = $3,290. Payments on record are $2,868 + $545 = $3,413.
      // That is $123 more than the allocation, and $2,868 is $123 more than
      // $3,290 − $545 = $2,745. Small, but it is real and unexplained.
      'The two payments total $3,413 against a $3,290 allocation — a $123 gap.',
      'Which two calendar months the $1,645 + $1,645 lands in.',
    ],
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
      (c) => Math.abs(c.amount - amount) <= 0.01 && (!day || !c.paidOn || c.paidOn === day)
    ) || null
  );
}

/** The pending entry for a payment, or null. Amount only — no date to match on. */
export function pendingFor(amount) {
  return PENDING_PREPAYMENTS.find((p) => Math.abs(p.amount - amount) <= 0.01) || null;
}

/** What one confirmed prepayment recognises per covered month (incl. GST). */
export function monthlyOf(entry) {
  return money2(entry.amount / entry.covers.length);
}
