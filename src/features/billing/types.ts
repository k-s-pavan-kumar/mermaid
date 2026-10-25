/**
 * Billing documents.
 *
 * Both quotes and invoices can hang off a project OR a client directly —
 * teaching income (a batch of Figma classes, a workshop) has a payer but
 * often no project, and forcing a dummy project just to raise an invoice is
 * the kind of friction that ends with invoices living in a spreadsheet
 * instead. At least one of project_id / client_id should be set.
 */
export type IncomeStream = 'freelance' | 'teaching' | 'product' | 'bounty' | 'other';

export const STREAM_LABEL: Record<IncomeStream, string> = {
  freelance: 'Freelance',
  teaching: 'Teaching',
  product: 'Product',
  bounty: 'Bug bounty',
  other: 'Other',
};

/** Line items are stored inline (jsonb in Postgres) rather than in their own
 *  table — they are never queried independently of their document. */
export interface LineItem {
  description: string;
  /** Hours, sessions, seats, units — whatever `unit` says. */
  qty: number;
  rate: number;
  unit: string;
}

interface BillingDoc {
  id: string;
  owner_id: string;
  project_id: string | null;
  client_id: string | null;
  stream: IncomeStream;
  number: string;
  description: string | null;
  items: LineItem[];
  /** Subtotal before tax; kept denormalised so list views don't re-sum. */
  amount: number;
  tax_pct: number;
  currency: string;
  notes: string | null;
  issued_at: string | null;
}

export interface Quote extends BillingDoc {
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  valid_until: string | null;
}

export interface Invoice extends BillingDoc {
  /** Subscription-style income (retainer or ticked 'recurring'); see isRecurringInvoice. */
  recurring?: boolean;
  quote_id: string | null;
  /** 'YYYY-MM' — set only on invoices made by the monthly-retainer flow, one per client per month. */
  period?: string | null;
  /** 'partial' = one or more payments recorded but not the full amount yet.
   *  Set automatically by recordInvoicePayment()/markInvoicePaid() in
   *  actions.ts as payments come in — never set by hand. */
  status: 'draft' | 'pending' | 'partial' | 'paid' | 'overdue';
  due_at: string | null;
  /** Set the moment the balance reaches 0 (recordInvoicePayment/markInvoicePaid);
   *  cleared again if a payment covering it is later deleted. */
  paid_at: string | null;
  /** Tax the client deducted at source (India: TDS), editable any time.
   *  Netted out of the amount posted to Daily Finance when paid — see
   *  markInvoicePaid() / setInvoiceTds() in actions.ts. */
  tds_amount: number;
}

export function lineTotal(item: LineItem): number {
  return Math.round(item.qty * item.rate * 100) / 100;
}

export function subtotal(doc: { items?: LineItem[]; amount: number }): number {
  if (doc.items && doc.items.length > 0) {
    return Math.round(doc.items.reduce((s, i) => s + lineTotal(i), 0) * 100) / 100;
  }
  return doc.amount;
}

export function taxAmount(doc: { items?: LineItem[]; amount: number; tax_pct?: number }): number {
  return Math.round(subtotal(doc) * ((doc.tax_pct ?? 0) / 100) * 100) / 100;
}

export function grandTotal(doc: { items?: LineItem[]; amount: number; tax_pct?: number }): number {
  return Math.round((subtotal(doc) + taxAmount(doc)) * 100) / 100;
}

/** What's still owed on this invoice after TDS and whatever's been paid so
 *  far. Never negative — a slightly over-collected invoice just reads as 0
 *  rather than a confusing negative balance. */
export function balanceDue(doc: Invoice, paidSoFar: number): number {
  return Math.max(0, Math.round((grandTotal(doc) - (doc.tds_amount ?? 0) - paidSoFar) * 100) / 100);
}

/**
 * THE one place that decides what an invoice contributes to "invoiced",
 * "paid" and "outstanding" — every page uses it, so they cannot disagree.
 *
 *  - draft:   nothing (an unsent invoice is an intention, not income).
 *  - paid:    cleared in full. Outstanding is 0 even if payments were never
 *             recorded (older invoices, or one marked paid by hand); in that
 *             case `unrecorded` says how much has not reached Daily Finance.
 *  - others:  outstanding = what is still owed after TDS and the payments on
 *             file (the same balanceDue the invoice page shows); cleared is
 *             the rest. So billed = cleared + outstanding, always.
 */
export interface InvoiceMoney {
  billed: number;
  cleared: number;
  outstanding: number;
  /** Marked paid, but payments on file don't cover it — so Daily Finance (and targets) are missing this money. */
  unrecorded: number;
}

export function invoiceMoney(inv: Invoice, paidSoFar: number): InvoiceMoney {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (inv.status === 'draft') return { billed: 0, cleared: 0, outstanding: 0, unrecorded: 0 };
  const billed = grandTotal(inv);
  const owed = balanceDue(inv, paidSoFar);
  if (inv.status === 'paid') return { billed, cleared: billed, outstanding: 0, unrecorded: owed };
  const outstanding = Math.min(billed, owed);
  return { billed, cleared: r2(billed - outstanding), outstanding, unrecorded: 0 };
}

/** Sum of invoiceMoney over many invoices. */
export function sumInvoiceMoney(invoices: Invoice[], paidTotals: Map<string, number>): InvoiceMoney {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const t: InvoiceMoney = { billed: 0, cleared: 0, outstanding: 0, unrecorded: 0 };
  for (const inv of invoices) {
    const m = invoiceMoney(inv, paidTotals.get(inv.id) ?? 0);
    t.billed += m.billed; t.cleared += m.cleared; t.outstanding += m.outstanding; t.unrecorded += m.unrecorded;
  }
  return { billed: r2(t.billed), cleared: r2(t.cleared), outstanding: r2(t.outstanding), unrecorded: r2(t.unrecorded) };
}

/** A subscription / retainer: made by the monthly-retainer flow (has a period) or ticked "recurring". */
export const isRecurringInvoice = (inv: Pick<Invoice, 'period'> & { recurring?: boolean }) => !!inv.period || inv.recurring === true;
