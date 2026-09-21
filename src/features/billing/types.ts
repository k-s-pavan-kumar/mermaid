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
  quote_id: string | null;
  /** 'YYYY-MM' — set only on invoices made by the monthly-retainer flow, one per client per month. */
  period?: string | null;
  status: 'draft' | 'pending' | 'paid' | 'overdue';
  due_at: string | null;
  paid_at: string | null;
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
